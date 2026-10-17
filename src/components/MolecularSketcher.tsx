import React, { useEffect, useRef, useState } from 'react';
import * as OCL from 'openchemlib';
import {
  Atom,
  Eraser,
  Eye,
  EyeOff,
  FileCode2,
  Hexagon,
  Layers,
  Maximize2,
  MousePointer,
  Plus,
  RotateCcw,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { MolecularGraph } from '../types/chemistry.ts';

export type SketchTool =
  | 'select'
  | 'bond-1'
  | 'bond-2'
  | 'bond-3'
  | 'bond-up'
  | 'bond-down'
  | 'atom-C'
  | 'atom-O'
  | 'atom-N'
  | 'atom-S'
  | 'atom-P'
  | 'atom-F'
  | 'atom-Cl'
  | 'atom-H'
  | 'fg-cooh'
  | 'fg-cho'
  | 'fg-oh'
  | 'fg-nh2'
  | 'ring-benzene'
  | 'ring-cyclohexane'
  | 'charge-plus'
  | 'charge-minus'
  | 'delete';

interface MolecularSketcherProps {
  graph: MolecularGraph;
  highlightedAtoms: number[];
  highlightedBonds: number[];
  highlightLabel: string | null;
  onStructureChange: (newInput: string, format: 'smiles' | 'molfile') => void;
  onSelectSubgraphWitness: (atoms: number[], bonds: number[], label: string) => void;
}

const ATOM_COLORS: Record<number, string> = {
  1: '#94A3B8', // H - Slate
  6: '#F1F5F9', // C - Crisp Light Slate
  7: '#38BDF8', // N - Sky Blue
  8: '#F43F5E', // O - Rose Red
  9: '#34D399', // F - Emerald
  15: '#FB923C', // P - Orange
  16: '#FACC15', // S - Yellow
  17: '#22C55E', // Cl - Green
  35: '#A855F7', // Br - Purple
};

const ELEMENT_ATOMIC_NO: Record<string, number> = {
  C: 6,
  N: 7,
  O: 8,
  S: 16,
  P: 15,
  F: 9,
  Cl: 17,
  H: 1,
};

export const MolecularSketcher: React.FC<MolecularSketcherProps> = ({
  graph,
  highlightedAtoms,
  highlightedBonds,
  highlightLabel,
  onStructureChange,
  onSelectSubgraphWitness,
}) => {
  const [activeTool, setActiveTool] = useState<SketchTool>('bond-1');
  const [showExplicitH, setShowExplicitH] = useState<boolean>(true);
  const [showAtomIndices, setShowAtomIndices] = useState<boolean>(true);
  const [editorMode, setEditorMode] = useState<'interactive-svg' | 'ocl-widget' | 'molfile'>(
    'interactive-svg'
  );
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredAtom, setHoveredAtom] = useState<number | null>(null);
  const [hoveredBond, setHoveredBond] = useState<number | null>(null);
  const [molfileDraft, setMolfileDraft] = useState<string>(graph.molfile);

  const oclContainerRef = useRef<HTMLDivElement | null>(null);
  const oclEditorRef = useRef<any>(null);

  useEffect(() => {
    setMolfileDraft(graph.molfile);
  }, [graph.molfile]);

  // Keyboard shortcuts for drawing when interactive canvas is active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'c') setActiveTool('atom-C');
      else if (key === 'o') setActiveTool('atom-O');
      else if (key === 'n') setActiveTool('atom-N');
      else if (key === 's') setActiveTool('atom-S');
      else if (key === 'p') setActiveTool('atom-P');
      else if (key === 'f') setActiveTool('atom-F');
      else if (key === 'h') setActiveTool('atom-H');
      else if (key === '1') setActiveTool('bond-1');
      else if (key === '2') setActiveTool('bond-2');
      else if (key === '3') setActiveTool('bond-3');
      else if (key === 'v' || key === 'escape') setActiveTool('select');
      else if (key === 'delete' || key === 'backspace') {
        if (hoveredAtom !== null) {
          handleAtomClick(hoveredAtom, 'delete');
        } else if (hoveredBond !== null) {
          handleBondClick(hoveredBond, 'delete');
        } else {
          setActiveTool('delete');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Mount OpenChemLib native editor when user switches to 'ocl-widget' tab
  useEffect(() => {
    if (editorMode !== 'ocl-widget' || !oclContainerRef.current) return;
    const container = oclContainerRef.current;
    container.innerHTML = '';

    try {
      const EditorClass =
        (OCL as any).StructureEditor || (OCL as any).CanvasEditorElement || null;
      if (EditorClass && typeof EditorClass.createSVGEditor === 'function') {
        const editor = EditorClass.createSVGEditor(container, 1);
        editor.setMolFile(graph.molfile);
        editor.setChangeListenerCallback(() => {
          const updatedMolfile = editor.getMolFile();
          if (updatedMolfile) {
            onStructureChange(updatedMolfile, 'molfile');
          }
        });
        oclEditorRef.current = editor;
      } else if ((OCL as any).StructureView) {
        // Fallback if createSVGEditor is not exposed on this build
        oclEditorRef.current = null;
      }
    } catch {
      oclEditorRef.current = null;
    }
  }, [editorMode]);

  /**
   * Applies an atomic or functional modification to the heavy-atom OCL.Molecule
   * and triggers real-time re-evaluation.
   */
  const mutateMolecule = (mutator: (mol: OCL.Molecule) => void) => {
    try {
      const mol = OCL.Molecule.fromMolfile(graph.molfile);
      mol.ensureHelperArrays(OCL.Molecule.cHelperRings);
      mutator(mol);
      mol.ensureHelperArrays(OCL.Molecule.cHelperRings);
      const newSmiles = mol.toIsomericSmiles();
      if (newSmiles) {
        onStructureChange(newSmiles, 'smiles');
      }
    } catch {
      // Ignore invalid valence mutations
    }
  };

  const handleAtomClick = (atomIdx: number, toolOverride?: SketchTool) => {
    const tool = toolOverride || activeTool;
    const targetAtom = graph.atoms[atomIdx];
    if (!targetAtom) return;

    // If user is in 'select' mode, clicking an atom highlights its local environment
    if (tool === 'select') {
      const connectedBonds = graph.bonds
        .filter((b) => b.atom1 === atomIdx || b.atom2 === atomIdx)
        .map((b) => b.index);
      onSelectSubgraphWitness(
        [atomIdx, ...targetAtom.explicitHIndices],
        connectedBonds,
        `Atom ${targetAtom.symbol}${atomIdx + 1} valence neighborhood`
      );
      return;
    }

    // If clicked atom is an explicit H, resolve its parent heavy atom for structural edits
    const heavyIdx = targetAtom.isExplicitH
      ? (targetAtom.parentHeavyAtom ?? 0)
      : targetAtom.index;

    if (tool === 'delete') {
      if (targetAtom.isExplicitH) return; // Explicit H is determined by valence
      mutateMolecule((mol) => {
        if (mol.getAllAtoms() > 1 && heavyIdx < mol.getAllAtoms()) {
          mol.deleteAtom(heavyIdx);
        }
      });
      return;
    }

    if (tool === 'charge-plus' || tool === 'charge-minus') {
      mutateMolecule((mol) => {
        if (heavyIdx < mol.getAllAtoms()) {
          const cur = mol.getAtomCharge(heavyIdx);
          mol.setAtomCharge(heavyIdx, tool === 'charge-plus' ? cur + 1 : cur - 1);
        }
      });
      return;
    }

    if (tool.startsWith('atom-')) {
      const sym = tool.replace('atom-', '');
      if (sym === 'H') {
        // Toggle explicit H visibility or highlight all H atoms
        setShowExplicitH(true);
        const hIndices = graph.atoms.filter((a) => a.atomicNo === 1).map((a) => a.index);
        const hBonds = graph.bonds.filter((b) => b.isExplicitHBond).map((b) => b.index);
        onSelectSubgraphWitness(hIndices, hBonds, 'All Explicit Hydrogen Atoms [H]');
        return;
      }
      const atomicNo = ELEMENT_ATOMIC_NO[sym] || 6;
      mutateMolecule((mol) => {
        if (heavyIdx < mol.getAllAtoms()) {
          if (mol.getAtomicNo(heavyIdx) === atomicNo) {
            // Sprout a new atom of this element bonded to heavyIdx
            const newIdx = mol.addAtom(atomicNo);
            const bIdx = mol.addBond(heavyIdx, newIdx);
            mol.setBondType(bIdx, OCL.Molecule.cBondTypeSingle);
            mol.inventCoordinates();
          } else {
            mol.setAtomicNo(heavyIdx, atomicNo);
          }
        }
      });
      return;
    }

    if (tool.startsWith('bond-')) {
      const order =
        tool === 'bond-2'
          ? OCL.Molecule.cBondTypeDouble
          : tool === 'bond-3'
            ? OCL.Molecule.cBondTypeTriple
            : tool === 'bond-up'
              ? OCL.Molecule.cBondTypeUp
              : tool === 'bond-down'
                ? OCL.Molecule.cBondTypeDown
                : OCL.Molecule.cBondTypeSingle;
      mutateMolecule((mol) => {
        if (heavyIdx < mol.getAllAtoms()) {
          const newIdx = mol.addAtom(6);
          const bIdx = mol.addBond(heavyIdx, newIdx);
          mol.setBondType(bIdx, order);
          mol.inventCoordinates();
        }
      });
      return;
    }

    if (tool === 'fg-cooh') {
      mutateMolecule((mol) => {
        const cIdx = mol.addAtom(6);
        const o1 = mol.addAtom(8);
        const o2 = mol.addAtom(8);
        mol.addBond(heavyIdx, cIdx);
        const bDouble = mol.addBond(cIdx, o1);
        mol.setBondType(bDouble, OCL.Molecule.cBondTypeDouble);
        mol.addBond(cIdx, o2);
        mol.inventCoordinates();
      });
      return;
    }

    if (tool === 'fg-cho') {
      mutateMolecule((mol) => {
        const cIdx = mol.addAtom(6);
        const o1 = mol.addAtom(8);
        mol.addBond(heavyIdx, cIdx);
        const bDouble = mol.addBond(cIdx, o1);
        mol.setBondType(bDouble, OCL.Molecule.cBondTypeDouble);
        mol.inventCoordinates();
      });
      return;
    }

    if (tool === 'fg-oh') {
      mutateMolecule((mol) => {
        const oIdx = mol.addAtom(8);
        mol.addBond(heavyIdx, oIdx);
        mol.inventCoordinates();
      });
      return;
    }

    if (tool === 'fg-nh2') {
      mutateMolecule((mol) => {
        const nIdx = mol.addAtom(7);
        mol.addBond(heavyIdx, nIdx);
        mol.inventCoordinates();
      });
      return;
    }

    if (tool === 'ring-benzene' || tool === 'ring-cyclohexane') {
      mutateMolecule((mol) => {
        const ringIds: number[] = [heavyIdx];
        for (let k = 0; k < 5; k++) {
          ringIds.push(mol.addAtom(6));
        }
        for (let k = 0; k < 6; k++) {
          const a = ringIds[k];
          const b = ringIds[(k + 1) % 6];
          const bType =
            tool === 'ring-benzene' && k % 2 === 1
              ? OCL.Molecule.cBondTypeDouble
              : OCL.Molecule.cBondTypeSingle;
          const bIdx = mol.addBond(a, b);
          mol.setBondType(bIdx, bType);
        }
        mol.inventCoordinates();
      });
    }
  };

  const handleBondClick = (bondIdx: number, toolOverride?: SketchTool) => {
    const tool = toolOverride || activeTool;
    const bond = graph.bonds[bondIdx];
    if (!bond) return;

    if (tool === 'select' || bond.isExplicitHBond) {
      onSelectSubgraphWitness(
        [bond.atom1, bond.atom2],
        [bond.index],
        `Bond ${graph.atoms[bond.atom1]?.symbol}${bond.atom1 + 1}–${graph.atoms[bond.atom2]?.symbol}${bond.atom2 + 1} (Order ${bond.order})`
      );
      return;
    }

    if (tool === 'delete') {
      mutateMolecule((mol) => {
        if (bondIdx < mol.getAllBonds() && mol.getAllBonds() > 1) {
          mol.deleteBond(bondIdx);
        }
      });
      return;
    }

    mutateMolecule((mol) => {
      if (bondIdx >= mol.getAllBonds()) return;
      if (tool === 'bond-1') {
        // Cycle bond order 1 -> 2 -> 3 -> 1 on click
        const currentOrder = mol.getBondOrder(bondIdx);
        const nextType =
          currentOrder === 1
            ? OCL.Molecule.cBondTypeDouble
            : currentOrder === 2
              ? OCL.Molecule.cBondTypeTriple
              : OCL.Molecule.cBondTypeSingle;
        mol.setBondType(bondIdx, nextType);
      } else if (tool === 'bond-2') {
        mol.setBondType(bondIdx, OCL.Molecule.cBondTypeDouble);
      } else if (tool === 'bond-3') {
        mol.setBondType(bondIdx, OCL.Molecule.cBondTypeTriple);
      } else if (tool === 'bond-up') {
        mol.setBondType(bondIdx, OCL.Molecule.cBondTypeUp);
      } else if (tool === 'bond-down') {
        mol.setBondType(bondIdx, OCL.Molecule.cBondTypeDown);
      }
    });
  };

  // Compute SVG viewport projection for the molecular graph
  const visibleAtoms = showExplicitH
    ? graph.atoms
    : graph.atoms.filter((a) => !a.isExplicitH);
  const visibleBonds = showExplicitH
    ? graph.bonds
    : graph.bonds.filter((b) => !b.isExplicitHBond);

  const svgWidth = 560;
  const svgHeight = 380;
  const pad = 64;

  const xs = (visibleAtoms.length > 0 ? visibleAtoms : graph.atoms).map((a) => a.x);
  const ys = (visibleAtoms.length > 0 ? visibleAtoms : graph.atoms).map((a) => a.y);
  const minX = Math.min(...xs, -1);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, -1);
  const maxY = Math.max(...ys, 1);
  const spanX = Math.max(maxX - minX, 1.8);
  const spanY = Math.max(maxY - minY, 1.8);
  const baseScale = Math.min(
    (svgWidth - 2 * pad) / spanX,
    (svgHeight - 2 * pad) / spanY,
    82
  );
  const scale = baseScale * zoom;

  const project = (x: number, y: number) => ({
    cx: svgWidth / 2 + (x - (minX + maxX) / 2) * scale + pan.x,
    cy: svgHeight / 2 - (y - (minY + maxY) / 2) * scale + pan.y,
  });

  const hiAtomSet = new Set(highlightedAtoms);
  const hiBondSet = new Set(highlightedBonds);

  return (
    <div className="flex flex-col h-full bg-[#0B0E17] select-none">
      {/* Sketcher Toolbar Row 1: Drawing & Bond Tools */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-2 bg-[#111827] border-b border-slate-800">
        <div className="flex items-center gap-1" role="toolbar" aria-label="Structure Drawing Tools">
          <button
            type="button"
            onClick={() => setActiveTool('select')}
            title="Select / Inspect Atom or Bond (Shortcut: V)"
            className={`px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
              activeTool === 'select'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent'
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Inspect</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-0.5" />

          {(
            [
              { id: 'bond-1', label: 'Single (1)', short: '—' },
              { id: 'bond-2', label: 'Double (2)', short: '=' },
              { id: 'bond-3', label: 'Triple (3)', short: '≡' },
              { id: 'bond-up', label: 'Wedge Up', short: '▲' },
              { id: 'bond-down', label: 'Dash Down', short: '⋯' },
            ] as const
          ).map((bTool) => (
            <button
              key={bTool.id}
              type="button"
              onClick={() => setActiveTool(bTool.id)}
              title={bTool.label}
              aria-label={bTool.label}
              className={`px-2 py-1 text-xs font-mono font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTool === bTool.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                  : 'text-slate-300 hover:bg-slate-800 border border-transparent'
              }`}
            >
              {bTool.short}
            </button>
          ))}

          <div className="h-4 w-px bg-slate-800 mx-0.5" />

          {/* Element Buttons */}
          {(['C', 'O', 'N', 'S', 'P', 'F', 'Cl', 'H'] as const).map((el) => {
            const toolId = `atom-${el}` as SketchTool;
            return (
              <button
                key={el}
                type="button"
                onClick={() => setActiveTool(toolId)}
                title={`Element ${el} (Shortcut: ${el[0]})`}
                aria-label={`Draw ${el} atom`}
                className={`px-2 py-1 text-xs font-mono font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                  activeTool === toolId
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-300 hover:bg-slate-800 border border-transparent'
                }`}
              >
                {el}
              </button>
            );
          })}

          <div className="h-4 w-px bg-slate-800 mx-0.5" />

          <button
            type="button"
            onClick={() => setActiveTool('delete')}
            title="Delete Atom or Bond (Shortcut: Del)"
            aria-label="Delete Atom or Bond"
            className={`px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
              activeTool === 'delete'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                : 'text-slate-400 hover:text-rose-300 hover:bg-slate-800 border border-transparent'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>Del</span>
          </button>
        </div>
      </div>

      {/* Sketcher Toolbar Row 2: Functional Group Stamps & View Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#0E131F] border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-1 overflow-x-auto">
          <span className="text-slate-500 font-mono text-[11px] mr-1 whitespace-nowrap shrink-0">
            Motifs:
          </span>
          {(
            [
              { id: 'fg-cooh', label: '–COOH' },
              { id: 'fg-cho', label: '–CH=O' },
              { id: 'fg-oh', label: '–OH' },
              { id: 'fg-nh2', label: '–NH2' },
              { id: 'ring-benzene', label: 'Ph Ring' },
              { id: 'ring-cyclohexane', label: 'Cy Ring' },
              { id: 'charge-plus', label: '+ Charge' },
              { id: 'charge-minus', label: '– Charge' },
            ] as const
          ).map((fg) => (
            <button
              key={fg.id}
              type="button"
              onClick={() => setActiveTool(fg.id)}
              className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTool === fg.id
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-900/80 border border-slate-800'
              }`}
            >
              {fg.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowExplicitH((v) => !v)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
              showExplicitH
                ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            {showExplicitH ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>Explicit [H]</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAtomIndices((v) => !v)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
              showAtomIndices
                ? 'bg-slate-800 text-slate-200 border-slate-700'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            #Idx
          </button>

          <div className="flex items-center bg-slate-900 rounded border border-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => setEditorMode('interactive-svg')}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors whitespace-nowrap shrink-0 ${
                editorMode === 'interactive-svg'
                  ? 'bg-slate-800 text-cyan-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2D Graph Canvas
            </button>
            <button
              type="button"
              onClick={() => setEditorMode('ocl-widget')}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors whitespace-nowrap shrink-0 ${
                editorMode === 'ocl-widget'
                  ? 'bg-slate-800 text-cyan-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              OCL Sketcher
            </button>
            <button
              type="button"
              onClick={() => setEditorMode('molfile')}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors whitespace-nowrap shrink-0 ${
                editorMode === 'molfile'
                  ? 'bg-slate-800 text-cyan-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Molfile V2000
            </button>
          </div>
        </div>
      </div>

      {/* Main 2D Molecular Canvas Area */}
      <div className="relative flex-1 min-h-[260px] bg-[#0B0E17] overflow-hidden flex flex-col">
        {editorMode === 'interactive-svg' && (
          <>
            {/* Subtle Coordinate Grid Backdrop */}
            <svg
              data-testid="molecular-graph-canvas"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-full flex-1 cursor-crosshair"
            >
              <defs>
                <pattern
                  id="chem-grid"
                  width="28"
                  height="28"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 28 0 L 0 0 0 28"
                    fill="none"
                    stroke="#1E293B"
                    strokeWidth="0.5"
                    strokeOpacity="0.45"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#chem-grid)" />

              {/* Render Bonds */}
              {visibleBonds.map((b) => {
                const a1 = graph.atoms[b.atom1];
                const a2 = graph.atoms[b.atom2];
                if (!a1 || !a2) return null;
                const p1 = project(a1.x, a1.y);
                const p2 = project(a2.x, a2.y);

                const isHighlighted = hiBondSet.has(b.index);
                const isHovered = hoveredBond === b.index;

                const dx = p2.cx - p1.cx;
                const dy = p2.cy - p1.cy;
                const len = Math.hypot(dx, dy) || 1;
                const nx = (-dy / len) * 4.2;
                const ny = (dx / len) * 4.2;

                const baseStroke = isHighlighted
                  ? '#06B6D4'
                  : isHovered
                    ? '#38BDF8'
                    : b.isExplicitHBond
                      ? '#475569'
                      : '#94A3B8';

                return (
                  <g
                    key={`bond-${b.index}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBondClick(b.index);
                    }}
                    onMouseEnter={() => setHoveredBond(b.index)}
                    onMouseLeave={() => setHoveredBond(null)}
                    className="cursor-pointer"
                  >
                    {/* Wide invisible hit target for easy bond clicking */}
                    <line
                      x1={p1.cx}
                      y1={p1.cy}
                      x2={p2.cx}
                      y2={p2.cy}
                      stroke="transparent"
                      strokeWidth={14}
                    />

                    {/* Highlight Halo */}
                    {isHighlighted && (
                      <line
                        x1={p1.cx}
                        y1={p1.cy}
                        x2={p2.cx}
                        y2={p2.cy}
                        stroke="#06B6D4"
                        strokeOpacity={0.28}
                        strokeWidth={12}
                        strokeLinecap="round"
                      />
                    )}

                    {/* Bond Lines by Order */}
                    {b.order === 1 && (
                      <line
                        x1={p1.cx}
                        y1={p1.cy}
                        x2={p2.cx}
                        y2={p2.cy}
                        stroke={baseStroke}
                        strokeWidth={isHighlighted ? 3.5 : b.isExplicitHBond ? 1.6 : 2.4}
                        strokeDasharray={
                          b.stereo === 'down'
                            ? '3,3'
                            : b.isExplicitHBond
                              ? '4,2'
                              : undefined
                        }
                        strokeLinecap="round"
                      />
                    )}

                    {b.order === 2 && (
                      <>
                        <line
                          x1={p1.cx + nx}
                          y1={p1.cy + ny}
                          x2={p2.cx + nx}
                          y2={p2.cy + ny}
                          stroke={baseStroke}
                          strokeWidth={isHighlighted ? 3 : 2.2}
                          strokeLinecap="round"
                        />
                        <line
                          x1={p1.cx - nx}
                          y1={p1.cy - ny}
                          x2={p2.cx - nx}
                          y2={p2.cy - ny}
                          stroke={baseStroke}
                          strokeWidth={isHighlighted ? 3 : 2.2}
                          strokeLinecap="round"
                        />
                      </>
                    )}

                    {b.order >= 3 && (
                      <>
                        <line
                          x1={p1.cx}
                          y1={p1.cy}
                          x2={p2.cx}
                          y2={p2.cy}
                          stroke={baseStroke}
                          strokeWidth={2.2}
                          strokeLinecap="round"
                        />
                        <line
                          x1={p1.cx + nx * 1.4}
                          y1={p1.cy + ny * 1.4}
                          x2={p2.cx + nx * 1.4}
                          y2={p2.cy + ny * 1.4}
                          stroke={baseStroke}
                          strokeWidth={2}
                          strokeLinecap="round"
                        />
                        <line
                          x1={p1.cx - nx * 1.4}
                          y1={p1.cy - ny * 1.4}
                          x2={p2.cx - nx * 1.4}
                          y2={p2.cy - ny * 1.4}
                          stroke={baseStroke}
                          strokeWidth={2}
                          strokeLinecap="round"
                        />
                      </>
                    )}
                  </g>
                );
              })}

              {/* Render Atoms */}
              {visibleAtoms.map((a) => {
                const { cx, cy } = project(a.x, a.y);
                const isHighlighted = hiAtomSet.has(a.index);
                const isHovered = hoveredAtom === a.index;
                const radius = a.isExplicitH ? 12.5 : 16.5;
                const color = ATOM_COLORS[a.atomicNo] || '#E2E8F0';

                return (
                  <g
                    key={`atom-${a.index}`}
                    transform={`translate(${cx}, ${cy})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAtomClick(a.index);
                    }}
                    onMouseEnter={() => setHoveredAtom(a.index)}
                    onMouseLeave={() => setHoveredAtom(null)}
                    className="cursor-pointer"
                  >
                    {isHighlighted && (
                      <circle
                        r={radius + 6}
                        fill="#06B6D4"
                        fillOpacity={0.2}
                        stroke="#06B6D4"
                        strokeWidth={1.5}
                      />
                    )}
                    <circle
                      r={radius}
                      fill={isHighlighted ? '#083344' : isHovered ? '#1E293B' : '#0B0E17'}
                      stroke={
                        isHighlighted
                          ? '#06B6D4'
                          : isHovered
                            ? '#38BDF8'
                            : a.isExplicitH
                              ? '#334155'
                              : '#475569'
                      }
                      strokeWidth={isHighlighted ? 2.4 : 1.4}
                    />
                    <text
                      x={0}
                      y={4}
                      textAnchor="middle"
                      fill={color}
                      className="font-mono font-semibold"
                      fontSize={a.isExplicitH ? 11 : 13.5}
                    >
                      {a.symbol}
                      {!showExplicitH && a.implicitH > 0
                        ? `H${a.implicitH > 1 ? a.implicitH : ''}`
                        : ''}
                      {a.charge !== 0
                        ? a.charge > 0
                          ? `+${a.charge > 1 ? a.charge : ''}`
                          : `-${Math.abs(a.charge) > 1 ? Math.abs(a.charge) : ''}`
                        : ''}
                    </text>
                    {showAtomIndices && (
                      <text
                        x={radius + 3}
                        y={-radius + 5}
                        fill={isHighlighted ? '#22D3EE' : '#94A3B8'}
                        className="font-mono font-semibold"
                        fontSize={10}
                      >
                        {a.index + 1}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Canvas HUD Overlay Controls */}
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded p-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(z + 0.2, 2.2))}
                aria-label="Zoom In Structure"
                title="Zoom In"
                className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(z - 0.2, 0.5))}
                aria-label="Zoom Out Structure"
                title="Zoom Out"
                className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                aria-label="Reset Structure Viewport"
                title="Reset View"
                className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Active Witness Subgraph Status Strip */}
            <div className="px-3 py-1.5 bg-[#0E131F] border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[11px] text-cyan-400 shrink-0">
                  Witness Subgraph:
                </span>
                <span className="font-mono text-slate-200 truncate">
                  {highlightLabel
                    ? `${highlightLabel} — Atoms [${highlightedAtoms
                        .map((i) => `${graph.atoms[i]?.symbol || ''}${i + 1}`)
                        .join(', ')}]`
                    : 'Hover or click any class node, symbolic term, or isomorph (≃) to highlight witness atoms/bonds'}
                </span>
              </div>
              {highlightedAtoms.length > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectSubgraphWitness([], [], '')}
                  className="text-[11px] font-mono text-slate-400 hover:text-slate-200 whitespace-nowrap shrink-0"
                >
                  Clear Highlight
                </button>
              )}
            </div>
          </>
        )}

        {editorMode === 'ocl-widget' && (
          <div className="flex-1 flex flex-col p-3 gap-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                OpenChemLib Native Structure Editor (synchronized with live SMILES & Ontology pipeline)
              </span>
              <button
                type="button"
                onClick={() => setEditorMode('interactive-svg')}
                className="px-2 py-0.5 text-cyan-400 hover:underline font-mono"
              >
                Return to Explicit-H Witness Canvas
              </button>
            </div>
            <div
              ref={oclContainerRef}
              className="flex-1 bg-slate-900 border border-slate-800 rounded min-h-[240px] flex items-center justify-center text-xs text-slate-400 p-2"
            >
              Interactive OpenChemLib Canvas Ready
            </div>
          </div>
        )}

        {editorMode === 'molfile' && (
          <div className="flex-1 flex flex-col p-3 gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400">
                MDL Molfile V2000 Connection Table (Editable)
              </span>
              <button
                type="button"
                onClick={() => onStructureChange(molfileDraft, 'molfile')}
                className="px-2.5 py-1 text-xs font-medium bg-cyan-500 text-slate-950 rounded hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0"
              >
                Apply Molfile
              </button>
            </div>
            <textarea
              aria-label="MDL Molfile V2000 Input"
              value={molfileDraft}
              onChange={(e) => setMolfileDraft(e.target.value)}
              className="flex-1 w-full bg-[#07090E] border border-slate-800 rounded p-2.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>
        )}
      </div>

      {/* Extracted Cheminformatics Descriptors & Global Graph Invariants Footer */}
      <div className="p-3 bg-[#111827] border-t border-slate-800 space-y-2.5 text-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-2 bg-[#0B0E17] border border-slate-800/90 rounded">
            <div className="text-[10px] font-mono text-slate-500">Molecular Formula</div>
            <div
              data-testid="descriptor-formula"
              className="font-mono text-sm font-semibold text-slate-100 mt-0.5"
            >
              {graph.molecularFormula}
            </div>
          </div>
          <div className="p-2 bg-[#0B0E17] border border-slate-800/90 rounded">
            <div className="text-[10px] font-mono text-slate-500">Exact Mass</div>
            <div className="font-mono text-sm font-semibold text-slate-100 mt-0.5">
              {graph.exactMass.toFixed(4)}
              <span className="text-[10px] text-slate-400 ml-1">Da</span>
            </div>
          </div>
          <div className="p-2 bg-[#0B0E17] border border-slate-800/90 rounded">
            <div className="text-[10px] font-mono text-slate-500">Explicit-H SMILES</div>
            <div
              data-testid="descriptor-explicit-smiles"
              className="font-mono text-xs font-medium text-cyan-300 mt-0.5 truncate"
              title={graph.explicitHSmiles}
            >
              {graph.explicitHSmiles}
            </div>
          </div>
          <div className="p-2 bg-[#0B0E17] border border-slate-800/90 rounded">
            <div className="text-[10px] font-mono text-slate-500">InChIKey</div>
            <div
              className="font-mono text-[11px] text-slate-300 mt-0.5 truncate"
              title={graph.inchiKey}
            >
              {graph.inchiKey}
            </div>
          </div>
        </div>

        {/* Global Invariants Strip (Unboxed clean metadata with · separators) */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-slate-400 pt-0.5">
          <span className="text-slate-500">Global Invariants:</span>
          <span className="text-slate-200">{graph.invariants.topology}</span>
          <span aria-hidden="true">·</span>
          <span className="text-slate-200">{graph.invariants.aromaticity}</span>
          <span aria-hidden="true">·</span>
          <span className="text-slate-200">{graph.invariants.saturation}</span>
          <span aria-hidden="true">·</span>
          <span>
            rings: {graph.invariants.ringCount} ({graph.invariants.ringComposition})
          </span>
          <span aria-hidden="true">·</span>
          <span>IHD: {graph.invariants.unsaturationDegree}</span>
          {Object.values(graph.invariants.functionalMultiplicity).map((m) => (
            <React.Fragment key={m.label}>
              <span aria-hidden="true">·</span>
              <span className="text-amber-300">{m.label}</span>
            </React.Fragment>
          ))}
        </div>

        {/* Matched Subgraph Quick-Highlight Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
          <span className="text-[11px] font-mono text-slate-500 mr-1">
            Witness Subgraphs ({graph.subgraphs.length}):
          </span>
          {graph.subgraphs.map((sg) => {
            const isSelected = highlightLabel === sg.name;
            return (
              <button
                key={sg.id}
                type="button"
                onClick={() =>
                  onSelectSubgraphWitness(sg.atomIndices, sg.bondIndices, sg.name)
                }
                onMouseEnter={() =>
                  onSelectSubgraphWitness(sg.atomIndices, sg.bondIndices, sg.name)
                }
                className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/60'
                    : 'bg-[#0B0E17] text-slate-300 border-slate-800 hover:border-cyan-500/40 hover:text-cyan-300'
                }`}
              >
                {sg.name} ({sg.count})
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
