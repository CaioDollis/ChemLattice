import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  GitMerge,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { LatticeNode } from '../types/chemistry.ts';

interface ConceptLatticeViewProps {
  nodes: LatticeNode[];
  selectedNodeId: string | null;
  onSelectNode: (node: LatticeNode) => void;
}

interface PositionedNode {
  node: LatticeNode;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ConceptLatticeView: React.FC<ConceptLatticeViewProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [inspectBoundaryOnly, setInspectBoundaryOnly] = useState<boolean>(false);

  const maxLevel = useMemo(
    () => Math.max(...nodes.map((n) => n.level), 1),
    [nodes]
  );

  // Compute clean layered Hasse diagram coordinates (⊤ at top, ⊥ at bottom)
  const { positioned, edges, svgWidth, svgHeight } = useMemo(() => {
    const width = 820;
    const rowHeight = 74;
    const height = (maxLevel + 1) * rowHeight + 36;

    const byLevel = new Map<number, LatticeNode[]>();
    for (const n of nodes) {
      const arr = byLevel.get(n.level) || [];
      arr.push(n);
      byLevel.set(n.level, arr);
    }

    const posMap = new Map<string, PositionedNode>();
    for (let lvl = 0; lvl <= maxLevel; lvl++) {
      const rowNodes = byLevel.get(lvl) || [];
      // Render ⊤ (maxLevel) at top, ⊥ (level 0) at bottom
      const y = 36 + (maxLevel - lvl) * rowHeight;
      const count = rowNodes.length;
      rowNodes.forEach((node, idx) => {
        const x = ((idx + 1) * width) / (count + 1);
        const boxWidth = Math.min(
          305,
          Math.max(200, node.primaryLabel.length * 6.4 + 28)
        );
        posMap.set(node.id, {
          node,
          x,
          y,
          width: boxWidth,
          height: 50,
        });
      });
    }

    const edgeList: Array<{
      id: string;
      from: PositionedNode;
      to: PositionedNode;
      isMeetEdge: boolean;
    }> = [];

    for (const n of nodes) {
      const childPos = posMap.get(n.id);
      if (!childPos) continue;
      for (const pid of n.parentIds) {
        const parentPos = posMap.get(pid);
        if (parentPos) {
          edgeList.push({
            id: `${n.id}->${pid}`,
            from: childPos,
            to: parentPos,
            isMeetEdge: Boolean(n.isConjunctionNode || parentPos.node.isConjunctionNode),
          });
        }
      }
    }

    return {
      positioned: Array.from(posMap.values()),
      edges: edgeList,
      svgWidth: width,
      svgHeight: height,
    };
  }, [nodes, maxLevel]);

  const activeNode = useMemo(() => {
    if (selectedNodeId) {
      const found = nodes.find((n) => n.id === selectedNodeId);
      if (found) return found;
    }
    return (
      nodes.find((n) => Boolean(n.boundaryAxiom)) ||
      nodes.find((n) => n.level === 1) ||
      nodes[0]
    );
  }, [nodes, selectedNodeId]);

  const boundaryNodes = useMemo(
    () => nodes.filter((n) => Boolean(n.boundaryAxiom)),
    [nodes]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0B0E17]">
      {/* Lattice Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#111827] border-b border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-slate-200">
            Hasse Concept Lattice (⊥ Drawn Graph → ⊤ Chemical Entity)
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            Upward edges denote strict subtype inclusion (⊂); purple nodes denote formal meet (∧)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {boundaryNodes.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setInspectBoundaryOnly((v) => !v);
                onSelectNode(boundaryNodes[0]);
              }}
              className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                inspectBoundaryOnly
                  ? 'bg-amber-500/20 text-amber-200 border-amber-500/60'
                  : 'bg-[#0B0E17] text-amber-300 border-amber-500/40 hover:bg-amber-500/10'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Boundary Axioms ({boundaryNodes.length})</span>
            </button>
          )}

          <div className="flex items-center bg-[#0B0E17] border border-slate-800 rounded p-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(z + 0.15, 1.6))}
              aria-label="Zoom In Lattice"
              className="p-1 text-slate-400 hover:text-slate-200"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(z - 0.15, 0.65))}
              aria-label="Zoom Out Lattice"
              className="p-1 text-slate-400 hover:text-slate-200"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              aria-label="Reset Lattice Zoom"
              className="p-1 text-slate-400 hover:text-slate-200"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive SVG Hasse Diagram Canvas */}
      <div className="flex-1 min-h-[240px] overflow-auto bg-[#07090E] relative flex items-center justify-center p-2">
        <svg
          data-testid="hasse-lattice-svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="xMidYMid meet"
          style={
            zoom === 1
              ? { width: '100%', height: '100%', maxHeight: '100%' }
              : {
                  width: `${100 * zoom}%`,
                  minHeight: `${svgHeight * zoom}px`,
                }
          }
          className="mx-auto block select-none"
        >
          <defs>
            <marker
              id="arrow-subsumption"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38BDF8" />
            </marker>
            <marker
              id="arrow-meet"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#A855F7" />
            </marker>
          </defs>

          {/* Render Subsumption Edges (⊂) from Child (lower) up to Parent (higher) */}
          {edges.map((e) => {
            const x1 = e.from.x;
            const y1 = e.from.y - e.from.height / 2;
            const x2 = e.to.x;
            const y2 = e.to.y + e.to.height / 2 + 4;
            const midY = (y1 + y2) / 2;
            const isSelectedEdge =
              activeNode?.id === e.from.node.id || activeNode?.id === e.to.node.id;

            return (
              <g key={e.id}>
                <path
                  d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                  fill="none"
                  stroke={
                    isSelectedEdge
                      ? e.isMeetEdge
                        ? '#A855F7'
                        : '#06B6D4'
                      : '#334155'
                  }
                  strokeWidth={isSelectedEdge ? 2.2 : 1.4}
                  strokeDasharray={e.isMeetEdge ? '4,3' : undefined}
                  markerEnd={
                    isSelectedEdge
                      ? e.isMeetEdge
                        ? 'url(#arrow-meet)'
                        : 'url(#arrow-subsumption)'
                      : undefined
                  }
                />
                {/* Relational ⊂ symbol on edge */}
                <text
                  x={(x1 + x2) / 2 + 8}
                  y={midY + 3}
                  fill={isSelectedEdge ? '#38BDF8' : '#64748B'}
                  fontSize={10}
                  className="font-mono"
                >
                  ⊂
                </text>
              </g>
            );
          })}

          {/* Render Concept Nodes */}
          {positioned.map(({ node, x, y, width, height }) => {
            const isSelected = activeNode?.id === node.id;
            const hasBoundary = Boolean(node.boundaryAxiom);
            const isBot = node.level === 0;
            const isTop = node.level === maxLevel;

            const strokeColor = isSelected
              ? '#06B6D4'
              : hasBoundary
                ? '#F59E0B'
                : node.isConjunctionNode
                  ? '#A855F7'
                  : isBot || isTop
                    ? '#10B981'
                    : '#1E293B';

            const fillBg = isSelected
              ? '#083344'
              : node.isConjunctionNode
                ? '#1E1030'
                : '#111827';

            return (
              <g
                key={node.id}
                transform={`translate(${x - width / 2}, ${y - height / 2})`}
                onClick={() => onSelectNode(node)}
                onMouseEnter={() => onSelectNode(node)}
                className="cursor-pointer"
              >
                <rect
                  width={width}
                  height={height}
                  rx={6}
                  fill={fillBg}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 2.2 : 1.3}
                />

                {/* Top Line: Rank + Primary Class Equivalence Label */}
                <text
                  x={10}
                  y={16.5}
                  fill="#F8FAFC"
                  fontSize={11}
                  fontWeight="600"
                  className="font-mono"
                >
                  {node.primaryLabel.length > 40
                    ? node.primaryLabel.slice(0, 38) + '…'
                    : node.primaryLabel}
                </text>

                {/* Second Line: Formal Graph Predicate */}
                <text
                  x={10}
                  y={31}
                  fill="#94A3B8"
                  fontSize={9.2}
                  className="font-mono"
                >
                  {node.formalPredicate.length > 46
                    ? node.formalPredicate.slice(0, 44) + '…'
                    : node.formalPredicate}
                </text>

                {/* Third Line: ChEBI ID & Boundary Axiom Indicator */}
                <text
                  x={10}
                  y={44}
                  fill={hasBoundary ? '#FBBF24' : '#38BDF8'}
                  fontSize={8.8}
                  className="font-mono"
                >
                  {node.chebiId ? `${node.chebiId} · ` : ''}
                  {node.isConjunctionNode ? '∧ Formal Meet · ' : ''}
                  {hasBoundary
                    ? '▲ Boundary Axiom Inspector'
                    : `${node.atomIndices.length} witness atoms`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Synchronized Node & Boundary Axiom Inspector Panel (Bottom Split) */}
      {activeNode && (
        <div
          data-testid="lattice-node-inspector"
          className="p-3 bg-[#111827] border-t border-slate-800 space-y-2 max-h-[195px] overflow-y-auto shrink-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-cyan-400 shrink-0" />
              <h3 className="font-mono text-sm font-semibold text-slate-100">
                {activeNode.primaryLabel}
              </h3>
              <span className="text-xs font-mono text-slate-400">
                · Lattice Rank L{activeNode.level}
              </span>
            </div>

            {activeNode.chebiId && (
              <a
                href={`https://www.ebi.ac.uk/chebi/searchId.do?chebiId=${activeNode.chebiId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span>{activeNode.chebiId}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Equivalence Classes (≡ and ≃) + Defining Structural Predicate */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-2.5 bg-[#0B0E17] border border-slate-800 rounded space-y-1">
              <div className="text-[10px] text-slate-500">
                Class Equivalence Set (≡ Extensional / ≃ Intensional)
              </div>
              <div className="text-slate-200 leading-relaxed">
                <span className="text-emerald-400 font-bold mr-1">≡</span>
                {activeNode.extensionalEquivalents.join(' ≡ ')}
              </div>
              {activeNode.intensionalIsomorphs.length > 0 && (
                <div className="text-amber-300/90 leading-relaxed">
                  <span className="text-amber-400 font-bold mr-1">≃</span>
                  {activeNode.intensionalIsomorphs.join(' ≃ ')}
                </div>
              )}
            </div>

            <div className="p-2.5 bg-[#0B0E17] border border-slate-800 rounded space-y-1">
              <div className="text-[10px] text-slate-500">
                Defining Structural Graph Predicate
              </div>
              <div className="text-cyan-300 leading-relaxed break-words">
                {activeNode.formalPredicate}
              </div>
              <div className="text-[11px] text-slate-400 pt-0.5">
                Witness Atoms: [{activeNode.atomIndices.map((i) => i + 1).join(', ')}] ·
                Witness Bonds: [{activeNode.bondIndices.map((i) => i + 1).join(', ')}]
              </div>
            </div>
          </div>

          {/* Boundary Axiom Inspector Card (when taxonomy boundary divergence exists) */}
          {activeNode.boundaryAxiom && (
            <div
              data-testid="boundary-axiom-inspector"
              className="p-3 bg-amber-950/20 border border-amber-500/40 rounded space-y-1.5 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-mono font-semibold text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{activeNode.boundaryAxiom.title}</span>
                </div>
                <div className="font-mono text-[11px] text-amber-200/80">
                  {activeNode.boundaryAxiom.divergentOntologies.join(' · ')}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1 text-slate-300 leading-relaxed">
                <div>
                  <span className="font-mono text-[11px] text-emerald-400 font-semibold block">
                    Inclusion Axiom (+):
                  </span>
                  {activeNode.boundaryAxiom.inclusionAxiom}
                </div>
                <div>
                  <span className="font-mono text-[11px] text-rose-400 font-semibold block">
                    Exclusion Axiom (–):
                  </span>
                  {activeNode.boundaryAxiom.exclusionAxiom}
                </div>
              </div>
              <div className="pt-1 font-mono text-[11px] text-cyan-200 border-t border-amber-500/20">
                <strong className="text-amber-300">Formal Resolution: </strong>
                {activeNode.boundaryAxiom.formalResolution}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
