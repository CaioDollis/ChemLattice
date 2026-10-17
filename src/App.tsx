import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Cpu,
  Download,
  FlaskConical,
  GitFork,
  Search,
} from 'lucide-react';
import {
  compileDeterministicOntology,
   parseMolecularGraph,
  PRESET_MOLECULES,
} from './chem/engine.ts';
import {
  compileWithGeminiBackend,
  queryChebiOntologyTerms,
  queryPubChemRegistry,
} from './services/registryClient.ts';
import type {
  ChebiTermRecord,
  LatticeNode,
  MolecularGraph,
  OntologicalAnalysis,
  PubChemRecord,
  SymbolicToken,
} from './types/chemistry.ts';
import { MolecularSketcher } from './components/MolecularSketcher.tsx';
import { SymbolicExpressionBar } from './components/SymbolicExpressionBar.tsx';
import { NomenclatureView } from './components/NomenclatureView.tsx';
import { ConceptLatticeView } from './components/ConceptLatticeView.tsx';
import { SubgraphInvariantsView } from './components/SubgraphInvariantsView.tsx';
import { ExportModal } from './components/ExportModal.tsx';

export default function App() {
  // Default to Formic Acid / Methanoic Acid: H-C(=O)OH ('C(=O)O')
  const [smilesInput, setSmilesInput] = useState<string>('C(=O)O');
  const [parseError, setParseError] = useState<string | null>(null);

  const [graph, setGraph] = useState<MolecularGraph>(() =>
    parseMolecularGraph('C(=O)O', 'smiles')
  );
  const [ontology, setOntology] = useState<OntologicalAnalysis>(() =>
    compileDeterministicOntology(parseMolecularGraph('C(=O)O', 'smiles'))
  );

  const [activeTab, setActiveTab] = useState<'nomenclature' | 'lattice' | 'invariants'>(
    'nomenclature'
  );
  const [highlightedAtoms, setHighlightedAtoms] = useState<number[]>([]);
  const [highlightedBonds, setHighlightedBonds] = useState<number[]>([]);
  const [highlightLabel, setHighlightLabel] = useState<string | null>(null);
  const [selectedLatticeNodeId, setSelectedLatticeNodeId] = useState<string | null>(null);

  const [pubchemData, setPubchemData] = useState<PubChemRecord | null>(null);
  const [isLoadingPubchem, setIsLoadingPubchem] = useState<boolean>(false);
  const [chebiTerms, setChebiTerms] = useState<ChebiTermRecord[]>([]);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);

  // Split pane width percentage on desktop
  const [leftPaneWidthPct, setLeftPaneWidthPct] = useState<number>(44);
  const isDraggingSplit = useRef<boolean>(false);

  // Core Dual-Engine Resolution Pipeline (Deterministic + PubChem PUG REST + ChEBI OLS4 + Gemini Compiler)
  const executeDualEnginePipeline = useCallback(
    async (nextGraph: MolecularGraph) => {
      // 1. Instant deterministic resolution
      const baseOntology = compileDeterministicOntology(nextGraph, null);
      setOntology(baseOntology);

      // Default highlight to the first explicit-H or functional subgraph so witness highlighting is immediately visible
      const formylSg = nextGraph.subgraphs.find(
        (s) => s.id === 'formyl_aldehyde_subgraph'
      );
      const primarySg = formylSg || nextGraph.subgraphs[0];
      if (primarySg) {
        setHighlightedAtoms(primarySg.atomIndices);
        setHighlightedBonds(primarySg.bondIndices);
        setHighlightLabel(primarySg.name);
      } else {
        setHighlightedAtoms([]);
        setHighlightedBonds([]);
        setHighlightLabel(null);
      }

      // 2. Parallel async registry + Gemini formal compiler resolution
      setIsLoadingPubchem(true);
      try {
        const primaryClassQuery =
          baseOntology.conceptLattice.find((n) => n.level === 1 && !n.isConjunctionNode)
            ?.extensionalEquivalents[0] ||
          baseOntology.nomenclatureClass[0]?.name ||
          'carboxylic acid';

        const [fetchedPubchem, fetchedChebi] = await Promise.all([
          queryPubChemRegistry(nextGraph.canonicalSmiles),
          queryChebiOntologyTerms(primaryClassQuery),
        ]);

        setPubchemData(fetchedPubchem);
        setChebiTerms(fetchedChebi);
        setIsLoadingPubchem(false);

        const enrichedDeterministic = compileDeterministicOntology(
          nextGraph,
          fetchedPubchem
        );
        enrichedDeterministic.chebiTerms = fetchedChebi;
        setOntology(enrichedDeterministic);

        // Call server-side Gemini ontological compiler
        const finalOntology = await compileWithGeminiBackend(
          nextGraph,
          enrichedDeterministic,
          fetchedPubchem
        );
        finalOntology.chebiTerms = fetchedChebi;
        setOntology(finalOntology);
      } catch {
        setIsLoadingPubchem(false);
      }
    },
    []
  );

  // Run pipeline on initial mount
  useEffect(() => {
    executeDualEnginePipeline(graph);
  }, []);

  // Debounced (350ms) SMILES input handler
  const debounceTimerRef = useRef<number | null>(null);

  const handleStructureChange = useCallback(
    (rawInput: string, format: 'smiles' | 'molfile' = 'smiles', immediate = false) => {
      if (format === 'smiles') {
        setSmilesInput(rawInput);
      }

      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }

      const runResolution = () => {
        const trimmed = rawInput.trim();
        if (!trimmed) {
          setParseError('Enter a non-empty SMILES or Molfile structure.');
          return;
        }
        try {
          const nextGraph = parseMolecularGraph(trimmed, format);
          if (nextGraph.atoms.length === 0) {
            setParseError('Unable to parse chemical structure: zero atoms resolved.');
            return;
          }
          setParseError(null);
          setGraph(nextGraph);
          if (format === 'molfile') {
            setSmilesInput(nextGraph.canonicalSmiles);
          }
          executeDualEnginePipeline(nextGraph);
        } catch (err) {
          setParseError(
            err instanceof Error
              ? `Invalid chemical structure syntax: ${err.message}`
              : 'Invalid SMILES or Molfile syntax.'
          );
        }
      };

      if (immediate) {
        runResolution();
      } else {
        debounceTimerRef.current = window.setTimeout(runResolution, 350);
      }
    },
    [executeDualEnginePipeline]
  );

  // Split pane drag handlers
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplit.current) return;
      const pct = (e.clientX / window.innerWidth) * 100;
      setLeftPaneWidthPct(Math.min(62, Math.max(32, pct)));
    };
    const onMouseUp = () => {
      isDraggingSplit.current = false;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleSelectWitness = useCallback(
    (atoms: number[], bonds: number[], label: string) => {
      setHighlightedAtoms(atoms);
      setHighlightedBonds(bonds);
      setHighlightLabel(label || null);
    },
    []
  );

  const handleSelectSymbolicToken = useCallback((token: SymbolicToken) => {
    if (token.atomIndices && token.bondIndices) {
      setHighlightedAtoms(token.atomIndices);
      setHighlightedBonds(token.bondIndices);
      setHighlightLabel(token.text);
    }
    if (token.nodeId) {
      setSelectedLatticeNodeId(token.nodeId);
    }
  }, []);

  const handleSelectLatticeNode = useCallback((node: LatticeNode) => {
    setSelectedLatticeNodeId(node.id);
    setHighlightedAtoms(node.atomIndices);
    setHighlightedBonds(node.bondIndices);
    setHighlightLabel(node.primaryLabel);
  }, []);

  return (
    <div className="min-h-screen lg:h-screen w-full flex flex-col bg-[#0B0E17] text-slate-100 lg:overflow-hidden">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-5 py-2.5 bg-[#07090E] border-b border-slate-800 shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleStructureChange('C(=O)O', 'smiles', true);
          }}
          className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          ChemLattice
        </a>

        {/* Zone 2: 4 clean single-line text navigation links */}
        <nav
          aria-label="Primary Workspace Views"
          className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400"
        >
          <a
            href="#nomenclature"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('nomenclature');
            }}
            className={`hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'nomenclature' ? 'text-cyan-400 underline' : ''
            }`}
          >
            Nomenclature Equivalence
          </a>
          <a
            href="#lattice"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('lattice');
            }}
            className={`hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'lattice' ? 'text-cyan-400 underline' : ''
            }`}
          >
            Concept Lattice
          </a>
          <a
            href="#invariants"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('invariants');
            }}
            className={`hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'invariants' ? 'text-cyan-400 underline' : ''
            }`}
          >
            Subgraph Predicates
          </a>
          <a
            href="#boundary-axiom"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('lattice');
              const boundaryNode = ontology.conceptLattice.find((n) =>
                Boolean(n.boundaryAxiom)
              );
              if (boundaryNode) handleSelectLatticeNode(boundaryNode);
            }}
            className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Boundary Axioms
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setIsExportOpen(true)}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Lattice</span>
          </button>
        </div>
      </header>

      {/* Workspace Input & Preset Molecules Control Bar */}
      <div className="px-4 py-2 bg-[#111827] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Live SMILES / SMARTS Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleStructureChange(smilesInput, 'smiles', true);
          }}
          className="flex items-center gap-2 flex-1 min-w-[260px] max-w-xl"
        >
          <label
            htmlFor="smiles-input"
            className="text-xs font-mono text-slate-400 whitespace-nowrap shrink-0"
          >
            SMILES / Graph:
          </label>
          <div className="relative flex-1">
            <input
              id="smiles-input"
              type="text"
              value={smilesInput}
              onChange={(e) => handleStructureChange(e.target.value, 'smiles', false)}
              placeholder="Enter SMILES (e.g. C(=O)O, CC(=O)O, NCC(=O)O)..."
              className="w-full bg-[#07090E] border border-slate-700/90 focus:border-cyan-400 rounded px-2.5 py-1 text-xs font-mono text-slate-100 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-2.5 py-1 text-xs font-mono font-medium bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <Search className="w-3 h-3" />
            <span>Compile</span>
          </button>
        </form>

        {/* Quick-Try Benchmark Molecules */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0">
          <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap shrink-0">
            Benchmarks:
          </span>
          {PRESET_MOLECULES.map((preset) => {
            const isCurrent = graph.molecularFormula === preset.formula;
            return (
              <button
                key={preset.id}
                type="button"
                title={`${preset.name} (${preset.smiles}) — ${preset.highlightNote}`}
                onClick={() => handleStructureChange(preset.smiles, 'smiles', true)}
                className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
                  isCurrent
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/60 font-semibold'
                    : 'bg-[#0B0E17] text-slate-300 border-slate-800 hover:border-slate-700 hover:text-slate-100'
                }`}
              >
                {preset.trivialName} ({preset.formula})
              </button>
            );
          })}
        </div>
      </div>

      {/* Validation Error Alert Banner if invalid SMILES entered */}
      {parseError && (
        <div
          role="alert"
          className="px-4 py-1.5 bg-rose-950/60 border-b border-rose-500/40 text-rose-200 text-xs font-mono flex items-center justify-between gap-2 shrink-0"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>{parseError}</span>
          </div>
          <button
            type="button"
            onClick={() => handleStructureChange('C(=O)O', 'smiles', true)}
            className="text-xs underline text-rose-300 hover:text-white whitespace-nowrap shrink-0"
          >
            Reset to Formic Acid (C(=O)O)
          </button>
        </div>
      )}

      {/* Main Split-Pane Desktop Workspace */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden min-h-0">
        {/* Left Pane: 2D Molecular Sketcher & Subgraph Witness Canvas */}
        <section
          aria-label="2D Molecular Structure Sketcher"
          style={{ width: undefined }}
          className="w-full lg:h-full flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0 lg:w-[var(--left-pane-w)]"
          ref={(el) => {
            if (el) {
              el.style.setProperty('--left-pane-w', `${leftPaneWidthPct}%`);
            }
          }}
        >
          <MolecularSketcher
            graph={graph}
            highlightedAtoms={highlightedAtoms}
            highlightedBonds={highlightedBonds}
            highlightLabel={highlightLabel}
            onStructureChange={(input, fmt) => handleStructureChange(input, fmt, false)}
            onSelectSubgraphWitness={handleSelectWitness}
          />
        </section>

        {/* Resizable Split Handle (Desktop) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Molecular Sketcher and Ontology Inspector Panes"
          onMouseDown={() => {
            isDraggingSplit.current = true;
          }}
          className="hidden lg:flex w-1.5 bg-[#07090E] hover:bg-cyan-500/40 cursor-col-resize items-center justify-center transition-colors shrink-0"
        >
          <div className="w-0.5 h-8 bg-slate-700 rounded" />
        </div>

        {/* Right Pane: Symbolic Expression Bar + Synchronized Nomenclature & Concept Lattice Tabs */}
        <section
          aria-label="Formal Ontological and Nomenclature Analysis"
          className="flex-1 flex flex-col min-w-0 lg:h-full overflow-hidden bg-[#0B0E17]"
        >
          {/* 1. Formal Symbolic Expression Bar (Top Banner) */}
          <SymbolicExpressionBar
            formulaText={ontology.symbolicFormulaText}
            tokens={ontology.symbolicTokens}
            activeHighlightLabel={highlightLabel}
            onSelectToken={handleSelectSymbolicToken}
          />

          {/* Synchronized View Switcher Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-[#0E131F] border-b border-slate-800 shrink-0">
            <div
              role="tablist"
              aria-label="Ontology Views"
              className="flex flex-wrap items-center gap-1.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'nomenclature'}
                onClick={() => setActiveTab('nomenclature')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'nomenclature'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>
                  1. Nomenclature Class ({ontology.nomenclatureClass.length})
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'lattice'}
                onClick={() => setActiveTab('lattice')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'lattice'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent'
                }`}
              >
                <GitFork className="w-3.5 h-3.5" />
                <span>
                  2. Concept Lattice ({ontology.conceptLattice.length})
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'invariants'}
                onClick={() => setActiveTab('invariants')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'invariants'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>
                  3. Subgraph Predicates ({graph.subgraphs.length})
                </span>
              </button>
            </div>

            <div className="hidden 2xl:flex items-center gap-1.5 text-[11px] font-mono text-slate-400 shrink-0">
              <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {ontology.source === 'deterministic+gemini'
                  ? 'OCL + Gemini Compiler'
                  : 'OCL + PubChem Registry'}
              </span>
            </div>
          </div>

          {/* Active Tab Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === 'nomenclature' && (
              <NomenclatureView
                nomenclatureClass={ontology.nomenclatureClass}
                pubchemData={pubchemData}
                isLoadingPubchem={isLoadingPubchem}
                activeHighlightLabel={highlightLabel}
                onHighlightSubgraph={handleSelectWitness}
              />
            )}

            {activeTab === 'lattice' && (
              <ConceptLatticeView
                nodes={ontology.conceptLattice}
                selectedNodeId={selectedLatticeNodeId}
                onSelectNode={handleSelectLatticeNode}
              />
            )}

            {activeTab === 'invariants' && (
              <SubgraphInvariantsView
                graph={graph}
                chebiTerms={chebiTerms}
                activeHighlightLabel={highlightLabel}
                onHighlightSubgraph={handleSelectWitness}
              />
            )}
          </div>
        </section>
      </main>

      {/* Export JSON / LaTeX / SVG Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        graph={graph}
        ontology={ontology}
        highlightedAtoms={highlightedAtoms}
        highlightedBonds={highlightedBonds}
      />
    </div>
  );
}
