import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMolecularGraph,
  compileDeterministicOntology,
  PRESET_MOLECULES,
} from './engine.ts';
import {
  exportOntologyToJson,
  exportOntologyToLatex,
  exportMoleculeToSvg,
} from './exporters.ts';

test('Formic acid (H-C(=O)OH) simultaneously matches carboxyl and formyl/aldehyde explicit-H subgraphs', () => {
  const graph = parseMolecularGraph('C(=O)O', 'smiles');

  assert.equal(graph.molecularFormula, 'CH2O2');
  assert.equal(graph.explicitHSmiles, '[H]C(=O)O[H]');
  assert.equal(graph.invariants.topology, 'acyclic');
  assert.equal(graph.invariants.aromaticity, 'aliphatic');
  assert.equal(graph.invariants.saturation, 'saturated');
  assert.equal(graph.invariants.carbonCount, 1);

  // Must have 3 heavy atoms + 2 explicit H atoms = 5 atoms in total
  assert.equal(graph.atoms.length, 5);
  // Must have 2 heavy-atom bonds + 2 explicit-H bonds = 4 bonds in total
  assert.equal(graph.bonds.length, 4);

  const carboxylMatch = graph.subgraphs.find((s) => s.id === 'carboxyl');
  const formylMatch = graph.subgraphs.find((s) => s.id === 'formyl_aldehyde_subgraph');

  assert.ok(carboxylMatch, 'Carboxyl subgraph [-C(=O)OH] must be detected');
  assert.ok(formylMatch, 'Formyl/aldehyde explicit-H subgraph [#1][CX3]=O must be detected');

  // Verify witness subgraph sizes
  assert.equal(carboxylMatch.atomIndices.length, 4); // C, =O, -O, -H
  assert.equal(formylMatch.atomIndices.length, 3); // H(formyl), C, =O
});

test('Formic acid ontology compiler produces exact symbolic expression, ≡/≃ isomorphs, and Hasse lattice', () => {
  const graph = parseMolecularGraph('C(=O)O', 'smiles');
  const ontology = compileDeterministicOntology(graph);

  assert.ok(ontology.symbolicFormulaText.includes('formic acid ≡'));
  assert.ok(ontology.symbolicFormulaText.includes('methanoic acid ≃ hydrogen methanoate ≃ formyl hydroxide'));
  assert.ok(ontology.symbolicFormulaText.includes('(aldehyde ≃ alkanal)'));

  const names = ontology.nomenclatureClass.map((n) => n.name);
  assert.ok(names.includes('methanoic acid'));
  assert.ok(names.includes('formic acid'));
  assert.ok(names.includes('hydrogen methanoate'));
  assert.ok(names.includes('formyl hydroxide'));

  // Concept lattice checks
  const botNode = ontology.conceptLattice.find((n) => n.level === 0);
  const topNode = ontology.conceptLattice.find((n) => n.id === 'node-top-entity');
  const alkanoicNode = ontology.conceptLattice.find((n) => n.id === 'node-alkanoic-acid');

  assert.ok(botNode);
  assert.ok(topNode);
  assert.ok(alkanoicNode?.boundaryAxiom, 'Alkanoic acid node must include C1 fatty acid boundary axiom');
});

test('Acetic acid (CC(=O)O) matches carboxyl and produces ethanoic/acetic nomenclature isomorphs', () => {
  const graph = parseMolecularGraph('CC(=O)O', 'smiles');
  const ontology = compileDeterministicOntology(graph);

  assert.equal(graph.molecularFormula, 'C2H4O2');
  const carboxylMatch = graph.subgraphs.find((s) => s.id === 'carboxyl');
  const formylMatch = graph.subgraphs.find((s) => s.id === 'formyl_aldehyde_subgraph');

  assert.ok(carboxylMatch, 'Acetic acid must match carboxyl');
  assert.equal(formylMatch, undefined, 'Acetic acid must NOT match formyl/aldehyde [#1][CX3]=O');

  const names = ontology.nomenclatureClass.map((n) => n.name);
  assert.ok(names.includes('ethanoic acid'));
  assert.ok(names.includes('acetic acid'));
});

test('All 8 preset molecules parse, compute non-empty lattices, and export to JSON/LaTeX/SVG cleanly', () => {
  for (const preset of PRESET_MOLECULES) {
    const graph = parseMolecularGraph(preset.smiles, 'smiles');
    assert.equal(graph.molecularFormula, preset.formula, `Formula mismatch for ${preset.name}`);
    const ontology = compileDeterministicOntology(graph);
    assert.ok(ontology.nomenclatureClass.length >= 2, `Nomenclature class too small for ${preset.name}`);
    assert.ok(ontology.conceptLattice.length >= 4, `Concept lattice too small for ${preset.name}`);

    const json = exportOntologyToJson(graph, ontology);
    assert.ok(json.includes(preset.formula));

    const latex = exportOntologyToLatex(graph, ontology);
    assert.ok(latex.includes('\\documentclass'));

    const svg = exportMoleculeToSvg(graph, [0, 1], [0]);
    assert.ok(svg.includes('<svg'));
  }
});
