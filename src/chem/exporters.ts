import type { MolecularGraph, OntologicalAnalysis } from '../types/chemistry.ts';

export function exportOntologyToJson(
  graph: MolecularGraph,
  ontology: OntologicalAnalysis
): string {
  return JSON.stringify(
    {
      schema: 'https://chemlattice.org/schema/v1/molecular-ontology.json',
      exportedAt: new Date().toISOString(),
      molecule: {
        canonicalSmiles: graph.canonicalSmiles,
        explicitHSmiles: graph.explicitHSmiles,
        molecularFormula: graph.molecularFormula,
        exactMassDa: graph.exactMass,
        molecularWeight: graph.molecularWeight,
        inchi: graph.inchi,
        inchiKey: graph.inchiKey,
        globalInvariants: graph.invariants,
        subgraphMatches: graph.subgraphs,
      },
      formalOntology: {
        symbolicExpression: ontology.symbolicFormulaText,
        nomenclatureEquivalenceClass: ontology.nomenclatureClass,
        conceptLatticeHasseDiagram: ontology.conceptLattice,
        pubchemRegistry: ontology.pubchemData || null,
        chebiTerms: ontology.chebiTerms || [],
      },
    },
    null,
    2
  );
}

export function exportOntologyToLatex(
  graph: MolecularGraph,
  ontology: OntologicalAnalysis
): string {
  const esc = (s: string) =>
    s
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/([&_#%$])/g, '\\$1')
      .replace(/≡/g, '$\\equiv$')
      .replace(/≃/g, '$\\simeq$')
      .replace(/⊂/g, '$\\subset$')
      .replace(/∧/g, '$\\wedge$')
      .replace(/⊥/g, '$\\bot$')
      .replace(/⊤/g, '$\\top$')
      .replace(/≥/g, '$\\ge$');

  const nomRows = ontology.nomenclatureClass
    .map(
      (n) =>
        `  \\texttt{${esc(n.name)}} & $${n.relationToPin === '≡' ? '\\equiv' : '\\simeq'}$ & ${esc(
          n.category.replace(/_/g, ' ')
        )} & ${esc(n.bondCleavagePartition || n.morphologyRule)} \\\\`
    )
    .join('\n');

  const latticeRows = ontology.conceptLattice
    .map(
      (node) =>
        `  $L_{${node.level}}$ & \\textbf{${esc(node.primaryLabel)}} & \\texttt{${esc(
          node.formalPredicate
        )}} \\\\`
    )
    .join('\n');

  return `% ChemLattice — Formal Molecular Ontology & Nomenclature Equivalence Export
% Molecule: ${graph.molecularFormula} (${graph.canonicalSmiles})
\\documentclass[11pt,a4paper]{article}
\\usepackage{amsmath,amssymb,booktabs,longtable}
\\begin{document}

\\section*{Formal Ontological Analysis: $\\mathrm{${graph.molecularFormula}}$ (\\texttt{${graph.canonicalSmiles}})}
\\begin{itemize}
  \\item \\textbf{Canonical SMILES}: \\texttt{${graph.canonicalSmiles}}
  \\item \\textbf{Explicit-H SMILES}: \\texttt{${graph.explicitHSmiles}}
  \\item \\textbf{Exact Mass}: ${graph.exactMass}\\text{ Da} \\quad | \\quad \\textbf{InChIKey}: \\texttt{${graph.inchiKey}}
  \\item \\textbf{Global Graph Invariants}: \\texttt{${graph.invariants.topology}}, \\texttt{${graph.invariants.aromaticity}}, \\texttt{${graph.invariants.saturation}} (IHD = ${graph.invariants.unsaturationDegree})
\\end{itemize}

\\subsection*{1. Algebraic Classification Formula ($\\equiv, \\simeq, \\subset, \\wedge$)}
\\begin{quote}
\\ttfamily
${esc(ontology.symbolicFormulaText)}
\\end{quote}

\\subsection*{2. Exhaustive Nomenclature Equivalence Class}
\\begin{longtable}{p{3.8cm}cp{2.8cm}p{6.5cm}}
\\toprule
\\textbf{Nomenclature Term} & \\textbf{Rel} & \\textbf{Morphism Class} & \\textbf{Functorial Bond Partition / Rule} \\\\
\\midrule
${nomRows}
\\bottomrule
\\end{longtable}

\\subsection*{3. Concept Lattice (Hasse Diagram $\\bot \\to \\top$)}
\\begin{longtable}{cp{5.5cm}p{7.5cm}}
\\toprule
\\textbf{Rank} & \\textbf{Concept Class ($\\equiv / \\simeq$)} & \\textbf{Defining Graph Predicate} \\\\
\\midrule
${latticeRows}
\\bottomrule
\\end{longtable}

\\end{document}
`;
}

export function exportMoleculeToSvg(
  graph: MolecularGraph,
  highlightedAtoms: number[] = [],
  highlightedBonds: number[] = []
): string {
  const width = 640;
  const height = 460;
  const padding = 65;

  const xs = graph.atoms.map((a) => a.x);
  const ys = graph.atoms.map((a) => a.y);
  const minX = Math.min(...xs, -1);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, -1);
  const maxY = Math.max(...ys, 1);

  const spanX = Math.max(maxX - minX, 1.5);
  const spanY = Math.max(maxY - minY, 1.5);
  const scale = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY, 85);

  const project = (x: number, y: number) => ({
    cx: width / 2 + (x - (minX + maxX) / 2) * scale,
    cy: height / 2 - (y - (minY + maxY) / 2) * scale,
  });

  const hAtomSet = new Set(highlightedAtoms);
  const hBondSet = new Set(highlightedBonds);

  const bondLines = graph.bonds
    .map((b) => {
      const a1 = graph.atoms[b.atom1];
      const a2 = graph.atoms[b.atom2];
      if (!a1 || !a2) return '';
      const p1 = project(a1.x, a1.y);
      const p2 = project(a2.x, a2.y);
      const isHi = hBondSet.has(b.index);
      const stroke = isHi ? '#06B6D4' : b.isExplicitHBond ? '#475569' : '#94A3B8';
      const sw = isHi ? 4 : b.isExplicitHBond ? 1.5 : 2.5;
      return `<line x1="${p1.cx.toFixed(1)}" y1="${p1.cy.toFixed(1)}" x2="${p2.cx.toFixed(1)}" y2="${p2.cy.toFixed(1)}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" />`;
    })
    .join('\n  ');

  const atomNodes = graph.atoms
    .map((a) => {
      const { cx, cy } = project(a.x, a.y);
      const isHi = hAtomSet.has(a.index);
      const color =
        a.atomicNo === 8
          ? '#F43F5E'
          : a.atomicNo === 7
            ? '#38BDF8'
            : a.atomicNo === 1
              ? '#94A3B8'
              : '#E2E8F0';
      return `<g transform="translate(${cx.toFixed(1)}, ${cy.toFixed(1)})">
    <circle r="${a.isExplicitH ? 11 : 15}" fill="${isHi ? '#083344' : '#0B0E17'}" stroke="${isHi ? '#06B6D4' : '#1E293B'}" stroke-width="${isHi ? 2.5 : 1.2}" />
    <text x="0" y="4" text-anchor="middle" fill="${color}" font-family="JetBrains Mono, monospace" font-size="${a.isExplicitH ? 11 : 13}" font-weight="600">${a.symbol}<tspan font-size="9" dy="-5" fill="#64748B">${a.index + 1}</tspan></text>
  </g>`;
    })
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#0B0E17" />
  <text x="20" y="28" fill="#E2E8F0" font-family="JetBrains Mono, monospace" font-size="13" font-weight="600">ChemLattice — ${graph.molecularFormula} (${graph.explicitHSmiles})</text>
  ${bondLines}
  ${atomNodes}
</svg>`;
}
