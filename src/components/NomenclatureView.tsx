import React, { useState } from 'react';
import { ExternalLink, GitBranch, Layers, Scissors } from 'lucide-react';
import type {
  DecompositionPart,
  NomenclatureIsomorph,
  PubChemRecord,
} from '../types/chemistry.ts';

interface NomenclatureViewProps {
  nomenclatureClass: NomenclatureIsomorph[];
  pubchemData?: PubChemRecord | null;
  isLoadingPubchem?: boolean;
  activeHighlightLabel: string | null;
  onHighlightSubgraph: (atoms: number[], bonds: number[], label: string) => void;
}

export const NomenclatureView: React.FC<NomenclatureViewProps> = ({
  nomenclatureClass,
  pubchemData,
  isLoadingPubchem,
  activeHighlightLabel,
  onHighlightSubgraph,
}) => {
  const [filterCategory, setFilterCategory] = useState<
    'all' | 'pin_substitutive' | 'retained_trivial' | 'isomorphs'
  >('all');

  const pinEntries = nomenclatureClass.filter((n) => n.category === 'pin_substitutive');
  const trivialEntries = nomenclatureClass.filter(
    (n) => n.category === 'retained_trivial' || n.category === 'registry_synonym'
  );
  const isomorphEntries = nomenclatureClass.filter(
    (n) =>
      n.category === 'functional_class_additive' || n.category === 'radical_functional'
  );

  const renderDecompositionButtons = (parts: DecompositionPart[], parentName: string) => {
    if (!parts || parts.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-800/80">
        <span className="text-[11px] font-mono text-slate-500 mr-1">
          Functorial Partition Fragments:
        </span>
        {parts.map((part, idx) => {
          const fragLabel = `${parentName} :: ${part.label}`;
          const isSelected = activeHighlightLabel === fragLabel;
          return (
            <React.Fragment key={`${part.label}-${idx}`}>
              {idx > 0 && (
                <span className="font-mono text-xs text-slate-500" aria-hidden="true">
                  ⊕
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onHighlightSubgraph(part.atomIndices, part.bondIndices, fragLabel);
                }}
                onMouseEnter={() =>
                  onHighlightSubgraph(part.atomIndices, part.bondIndices, fragLabel)
                }
                className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400'
                    : 'bg-[#07090E] text-slate-300 border-slate-800 hover:border-cyan-500/50 hover:text-cyan-300'
                }`}
              >
                <span>{part.label}</span>
                <span className="text-slate-500 ml-1.5">[{part.role}]</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const renderCard = (item: NomenclatureIsomorph) => {
    const isCardActive = activeHighlightLabel === item.name;
    return (
      <div
        key={item.id}
        onClick={() =>
          onHighlightSubgraph(item.atomIndices, item.bondIndices, item.name)
        }
        onMouseEnter={() =>
          onHighlightSubgraph(item.atomIndices, item.bondIndices, item.name)
        }
        className={`p-3.5 rounded border transition-colors cursor-pointer ${
          isCardActive
            ? 'bg-slate-900/95 border-cyan-500/60'
            : 'bg-[#111827] border-slate-800 hover:border-slate-700'
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span
              className={`font-mono text-sm font-bold ${
                item.relationToPin === '≡' ? 'text-emerald-400' : 'text-amber-400'
              }`}
              title={
                item.relationToPin === '≡'
                  ? 'Extensional Identity (≡)'
                  : 'Intensional / Functorial Decomposition Isomorph (≃)'
              }
            >
              {item.relationToPin}
            </span>
            <h4 className="font-mono text-sm font-semibold text-slate-100">
              {item.name}
            </h4>
          </div>

          {/* Unboxed clean metadata with · separators */}
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
            {item.isPreferred && (
              <>
                <span className="text-cyan-400 font-medium">IUPAC PIN</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>
              {item.category === 'pin_substitutive'
                ? 'Substitutive Morphism'
                : item.category === 'retained_trivial'
                  ? 'Retained / Trivial'
                  : item.category === 'functional_class_additive'
                    ? 'Functional Class / Additive'
                    : item.category === 'radical_functional'
                      ? 'Radical-Functional Cleavage'
                      : 'Literature Registry'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{item.atomIndices.length} atoms</span>
          </div>
        </div>

        <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
          {item.morphologyRule}
        </p>

        {item.bondCleavagePartition && (
          <div className="mt-2 px-2.5 py-1.5 bg-[#0B0E17] border border-slate-800/90 rounded flex items-center gap-2 font-mono text-xs text-amber-200/90">
            <Scissors className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate" title={item.bondCleavagePartition}>
              {item.bondCleavagePartition}
            </span>
          </div>
        )}

        {renderDecompositionButtons(item.functorialDecomposition, item.name)}
      </div>
    );
  };

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      {/* Filter Bar & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded">
          {(
            [
              { id: 'all', label: `All Morphisms (${nomenclatureClass.length})` },
              { id: 'pin_substitutive', label: `Systematic PIN (${pinEntries.length})` },
              { id: 'retained_trivial', label: `Retained / Registry (${trivialEntries.length})` },
              { id: 'isomorphs', label: `Functorial Isomorphs ≃ (${isomorphEntries.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterCategory(tab.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                filterCategory === tab.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs font-mono text-slate-400">
          Click any fragment to highlight its bond-cleavage witness on G
        </div>
      </div>

      {/* Section 1: Preferred IUPAC Name (PIN) & Systematic Substitutive */}
      {(filterCategory === 'all' || filterCategory === 'pin_substitutive') &&
        pinEntries.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-200 tracking-wide flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>01. Preferred IUPAC Name (PIN) & Systematic Substitutive (≡)</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                Extensional Equivalence Root
              </span>
            </div>
            <div className="space-y-2.5">{pinEntries.map(renderCard)}</div>
          </section>
        )}

      {/* Section 2: Functional Class, Additive & Radical-Functional Isomorphs (≃) */}
      {(filterCategory === 'all' || filterCategory === 'isomorphs') &&
        isomorphEntries.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-200 tracking-wide flex items-center gap-2">
                <GitBranch className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  02. Functional Class, Additive & Radical-Functional Isomorphs (≃)
                </span>
              </h3>
              <span className="text-[11px] font-mono text-amber-400/90">
                Intensional Bond-Cleavage Decompositions
              </span>
            </div>
            <div className="space-y-2.5">{isomorphEntries.map(renderCard)}</div>
          </section>
        )}

      {/* Section 3: Retained, Trivial & Historical Registry Names */}
      {(filterCategory === 'all' || filterCategory === 'retained_trivial') &&
        trivialEntries.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-200 tracking-wide">
                03. Retained, Trivial & Historical Names (≡)
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                Literature & Registry Equivalence Class
              </span>
            </div>
            <div className="space-y-2.5">{trivialEntries.map(renderCard)}</div>
          </section>
        )}

      {/* Section 4: Live PubChem PUG REST Registry Verification */}
      <section className="p-3.5 bg-[#111827] border border-slate-800 rounded space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-200">
              PubChem PUG REST Registry Grounding
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              {isLoadingPubchem
                ? 'Querying NCBI PubChem PUG REST...'
                : pubchemData?.cid
                  ? `Verified Compound CID ${pubchemData.cid} · Curated Record`
                  : 'Novel / Unregistered Graph (Local Deterministic Resolution Active)'}
            </span>
          </div>

          {pubchemData?.cid && (
            <a
              href={`https://pubchem.ncbi.nlm.nih.gov/compound/${pubchemData.cid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>PubChem CID {pubchemData.cid}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {pubchemData && (
          <div className="space-y-1.5 pt-1 text-xs font-mono">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-300">
              <span>
                <span className="text-slate-500">Registry Title:</span>{' '}
                {pubchemData.title || '—'}
              </span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span>
                <span className="text-slate-500">Registry IUPAC:</span>{' '}
                {pubchemData.iupacName || '—'}
              </span>
            </div>
            {pubchemData.synonyms.length > 0 && (
              <div className="text-[11px] text-slate-400 leading-relaxed pt-1">
                <span className="text-slate-500 mr-1.5">Verified Synonyms:</span>
                {pubchemData.synonyms.join(' · ')}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
