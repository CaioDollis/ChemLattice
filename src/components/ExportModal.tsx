import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import type { MolecularGraph, OntologicalAnalysis } from '../types/chemistry.ts';
import {
  exportMoleculeToSvg,
  exportOntologyToJson,
  exportOntologyToLatex,
} from '../chem/exporters.ts';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  graph: MolecularGraph;
  ontology: OntologicalAnalysis;
  highlightedAtoms: number[];
  highlightedBonds: number[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  graph,
  ontology,
  highlightedAtoms,
  highlightedBonds,
}) => {
  const [format, setFormat] = useState<'json' | 'latex' | 'svg'>('json');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const content = useMemo(() => {
    if (!isOpen) return '';
    if (format === 'json') return exportOntologyToJson(graph, ontology);
    if (format === 'latex') return exportOntologyToLatex(graph, ontology);
    return exportMoleculeToSvg(graph, highlightedAtoms, highlightedBonds);
  }, [isOpen, format, graph, ontology, highlightedAtoms, highlightedBonds]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleDownload = () => {
    const ext = format === 'json' ? 'json' : format === 'latex' ? 'tex' : 'svg';
    const mime =
      format === 'json'
        ? 'application/json'
        : format === 'latex'
          ? 'text/plain'
          : 'image/svg+xml';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chemlattice-${graph.molecularFormula.toLowerCase()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="bg-[#111827] border border-slate-700 rounded-lg w-full max-w-3xl flex flex-col max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <h2 id="export-modal-title" className="text-sm font-semibold text-slate-100">
            Export Structure & Formal Classification Lattice ({graph.molecularFormula})
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Export Modal"
            className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#0B0E17] border-b border-slate-800">
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'json', label: 'JSON Ontology Schema' },
                { id: 'latex', label: 'LaTeX (≡ / ≃ / ⊂ / ∧)' },
                { id: 'svg', label: 'SVG 2D Molecular Graph' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFormat(tab.id)}
                className={`px-3 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 ${
                  format === tab.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy to Clipboard</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1 text-xs font-mono bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .{format === 'latex' ? 'tex' : format}</span>
            </button>
          </div>
        </div>

        <div className="p-4 flex-1 overflow-auto bg-[#07090E]">
          <pre
            data-testid="export-preview-content"
            className="font-mono text-xs text-slate-300 whitespace-pre-wrap break-all leading-relaxed"
          >
            {content}
          </pre>
        </div>
      </div>
    </div>
  );
};
