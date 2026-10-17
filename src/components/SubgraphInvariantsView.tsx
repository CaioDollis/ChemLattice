import React from 'react';
import { CheckCircle2, Cpu, ExternalLink } from 'lucide-react';
import type {
  ChebiTermRecord,
  MolecularGraph,
  SubgraphMatch,
} from '../types/chemistry.ts';

interface SubgraphInvariantsViewProps {
  graph: MolecularGraph;
  chebiTerms: ChebiTermRecord[];
  activeHighlightLabel: string | null;
  onHighlightSubgraph: (atoms: number[], bonds: number[], label: string) => void;
}

export const SubgraphInvariantsView: React.FC<SubgraphInvariantsViewProps> = ({
  graph,
  chebiTerms,
  activeHighlightLabel,
  onHighlightSubgraph,
}) => {
  const { invariants, subgraphs } = graph;

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      {/* Section 1: Global Topological & Chemical Graph Invariants */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-200 tracking-wide flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>01. Global Graph Invariants on G = (V, E)</span>
          </h3>
          <span className="text-[11px] font-mono text-slate-400">
            Evaluated on Explicit-H Molecular Graph
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          <div className="p-3 bg-[#111827] border border-slate-800 rounded">
            <div className="text-[11px] font-mono text-slate-500">Cycle Topology</div>
            <div className="font-mono text-sm font-semibold text-slate-100 mt-0.5">
              {invariants.topology}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              SSSR Ring Count: {invariants.ringCount}
            </div>
          </div>

          <div className="p-3 bg-[#111827] border border-slate-800 rounded">
            <div className="text-[11px] font-mono text-slate-500">π-System / Aromaticity</div>
            <div className="font-mono text-sm font-semibold text-slate-100 mt-0.5">
              {invariants.aromaticity}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              Ring Composition: {invariants.ringComposition}
            </div>
          </div>

          <div className="p-3 bg-[#111827] border border-slate-800 rounded">
            <div className="text-[11px] font-mono text-slate-500">
              Carbon Skeleton Saturation
            </div>
            <div className="font-mono text-sm font-semibold text-slate-100 mt-0.5">
              {invariants.saturation}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              Total Unsaturation (IHD): {invariants.unsaturationDegree}
            </div>
          </div>

          <div className="p-3 bg-[#111827] border border-slate-800 rounded">
            <div className="text-[11px] font-mono text-slate-500">Vertex Partition |V(G)|</div>
            <div className="font-mono text-sm font-semibold text-slate-100 mt-0.5">
              {invariants.totalAtomCountWithH} total atoms
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              C: {invariants.carbonCount} · Hetero: {invariants.heteroAtomCount} · H:{' '}
              {invariants.hydrogenCount}
            </div>
          </div>

          <div className="p-3 bg-[#111827] border border-slate-800 rounded col-span-2">
            <div className="text-[11px] font-mono text-slate-500">
              Functional Group Multiplicity Vector
            </div>
            <div className="font-mono text-xs text-amber-300 mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {Object.values(invariants.functionalMultiplicity).length > 0 ? (
                Object.values(invariants.functionalMultiplicity).map((m) => (
                  <span key={m.label}>
                    {m.label} (count = {m.count}, prefix = {m.prefix}-)
                  </span>
                ))
              ) : (
                <span className="text-slate-400">Unsubstituted hydrocarbon skeleton</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Local SMARTS & Explicit-H Subgraph Witness Table */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-200 tracking-wide flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              02. Evaluated SMARTS / Substructure Predicates & Witness Embeddings
            </span>
          </h3>
          <span className="text-[11px] font-mono text-slate-400">
            Click any row to highlight witness atoms/bonds
          </span>
        </div>

        <div className="border border-slate-800 rounded overflow-hidden">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-[#111827] border-b border-slate-800 text-slate-400 text-[11px]">
                <th className="py-2 px-3">Subgraph Motif</th>
                <th className="py-2 px-3">SMARTS Pattern</th>
                <th className="py-2 px-3">Formal Graph Predicate</th>
                <th className="py-2 px-3">Explicit H</th>
                <th className="py-2 px-3 text-right">Witness Atoms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-[#0B0E17]">
              {subgraphs.map((sg: SubgraphMatch) => {
                const isSelected = activeHighlightLabel === sg.name;
                return (
                  <tr
                    key={sg.id}
                    onClick={() =>
                      onHighlightSubgraph(sg.atomIndices, sg.bondIndices, sg.name)
                    }
                    onMouseEnter={() =>
                      onHighlightSubgraph(sg.atomIndices, sg.bondIndices, sg.name)
                    }
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-cyan-950/40 text-cyan-200' : 'hover:bg-slate-900/90'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-100">
                      <div>{sg.name}</div>
                      {sg.note && (
                        <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                          {sg.note}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-amber-300">{sg.smartsPattern}</td>
                    <td className="py-2.5 px-3 text-cyan-300">{sg.formalPredicate}</td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {sg.includesExplicitH ? 'Yes ([#1])' : 'Heavy only'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      [{sg.atomIndices.map((a) => `${graph.atoms[a]?.symbol}${a + 1}`).join(', ')}]
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: EMBL-EBI OLS4 ChEBI Live Ontology Alignment */}
      {chebiTerms.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200 tracking-wide">
              03. EMBL-EBI OLS4 (ChEBI) Ontology Term Alignment
            </h3>
            <span className="text-[11px] font-mono text-slate-400">
              Live OLS4 REST Lookup
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {chebiTerms.map((term) => (
              <div
                key={term.oboId}
                className="p-3 bg-[#111827] border border-slate-800 rounded space-y-1 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-slate-100">
                    {term.label}
                  </span>
                  <a
                    href={`https://www.ebi.ac.uk/ols4/ontologies/chebi/classes?obo_id=${encodeURIComponent(
                      term.oboId
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] text-cyan-400 hover:underline flex items-center gap-1 shrink-0"
                  >
                    <span>{term.oboId}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                {term.description && (
                  <p className="text-slate-400 text-[11px] leading-relaxed line-clamp-2">
                    {term.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
