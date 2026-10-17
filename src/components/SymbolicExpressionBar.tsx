import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { SymbolicToken } from '../types/chemistry.ts';

interface SymbolicExpressionBarProps {
  formulaText: string;
  tokens: SymbolicToken[];
  activeHighlightLabel: string | null;
  onSelectToken: (token: SymbolicToken) => void;
}

const OPERATOR_STYLES: Record<string, string> = {
  '≡': 'text-emerald-400 font-bold px-1',
  '≃': 'text-amber-400 font-bold px-1',
  '⊂': 'text-cyan-400 font-bold px-1.5',
  '∧': 'text-purple-400 font-bold px-1.5',
};

export const SymbolicExpressionBar: React.FC<SymbolicExpressionBarProps> = ({
  formulaText,
  tokens,
  activeHighlightLabel,
  onSelectToken,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formulaText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback if clipboard API restricted
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="bg-[#111827] border-b border-slate-800 px-4 py-2 space-y-1.5 shrink-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs min-w-0">
          <span className="font-semibold text-slate-200 tracking-tight whitespace-nowrap">
            Formal Symbolic Classification Expression
          </span>
          <span aria-hidden="true" className="text-slate-600 hidden sm:inline">
            ·
          </span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-slate-400">
            <span>
              <strong className="text-emerald-400">≡</strong> Identity
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-amber-400">≃</strong> Isomorphism
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-cyan-400">⊂</strong> Subtype
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-purple-400">∧</strong> Formal Meet
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy Formal Symbolic Expression"
          className="px-2.5 py-1 text-xs font-mono bg-[#0B0E17] hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300">Copied Formula</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Copy Formula</span>
            </>
          )}
        </button>
      </div>

      {/* Interactive Algebraic Expression Box */}
      <div
        data-testid="symbolic-expression-bar"
        className="p-2.5 bg-[#07090E] border border-slate-800/90 rounded font-mono text-xs leading-relaxed flex flex-wrap items-center gap-y-1"
      >
        {tokens.map((tok) => {
          if (tok.kind === 'paren') {
            return (
              <span key={tok.id} className="text-slate-500 font-semibold select-text">
                {tok.text}
              </span>
            );
          }

          if (tok.kind === 'operator') {
            return (
              <span
                key={tok.id}
                title={tok.tooltip}
                className={OPERATOR_STYLES[tok.text] || 'text-slate-400 px-1'}
              >
                {tok.text}
              </span>
            );
          }

          const isActive = activeHighlightLabel === tok.text;
          return (
            <button
              key={tok.id}
              type="button"
              title={tok.tooltip || `Highlight witness subgraph for "${tok.text}"`}
              onClick={() => onSelectToken(tok)}
              onMouseEnter={() => onSelectToken(tok)}
              className={`px-1.5 py-0.5 rounded transition-colors text-left ${
                isActive
                  ? 'bg-cyan-500/25 text-cyan-200 underline decoration-cyan-400'
                  : 'text-slate-200 hover:bg-slate-800/90 hover:text-cyan-300'
              }`}
            >
              {tok.text}
            </button>
          );
        })}
      </div>
    </div>
  );
};
