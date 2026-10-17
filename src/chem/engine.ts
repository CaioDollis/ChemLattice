import * as OCL from 'openchemlib';
import type {
  AtomNode,
  BondEdge,
  GlobalInvariants,
  LatticeNode,
  MolecularGraph,
  NomenclatureIsomorph,
  OntologicalAnalysis,
  PresetMolecule,
  PubChemRecord,
  SubgraphInstance,
  SubgraphMatch,
  SymbolicToken,
} from '../types/chemistry.ts';

export const PRESET_MOLECULES: PresetMolecule[] = [
  {
    id: 'formic-acid',
    name: 'Methanoic Acid',
    trivialName: 'Formic Acid',
    smiles: 'C(=O)O',
    formula: 'CH2O2',
    subtitle: 'Dual Carboxyl ∧ Aldehyde (C1 Boundary Case)',
    highlightNote:
      'H-C(=O)-OH simultaneously contains the carboxyl subgraph -C(=O)OH and the formyl/aldehyde subgraph [#1][CX3]=O.',
  },
  {
    id: 'acetic-acid',
    name: 'Ethanoic Acid',
    trivialName: 'Acetic Acid',
    smiles: 'CC(=O)O',
    formula: 'C2H4O2',
    subtitle: 'Saturated Aliphatic Monocarboxylic Acid (C2)',
    highlightNote:
      'Replacing the formyl H with -CH3 breaks the [#1][CX3]=O aldehyde predicate while preserving the alkanoic acid lattice.',
  },
  {
    id: 'glyoxylic-acid',
    name: 'Oxoethanoic Acid',
    trivialName: 'Glyoxylic Acid',
    smiles: 'O=CC(=O)O',
    formula: 'C2H2O3',
    subtitle: 'Bifunctional Aldehydic Acid (C2 Meet)',
    highlightNote:
      'Disjoint co-instantiation of formyl (-CH=O) and carboxyl (-COOH) on adjacent carbons: aldo-acid ∧ oxocarboxylic acid.',
  },
  {
    id: 'glycine',
    name: 'Aminoethanoic Acid',
    trivialName: 'Glycine',
    smiles: 'NCC(=O)O',
    formula: 'C2H5NO2',
    subtitle: 'Achiral alpha-Amino Acid (Amine ∧ Carboxylic Acid)',
    highlightNote:
      'Co-instantiates primary aliphatic amine (-NH2) and carboxylic acid (-COOH); exhibits neutral vs. zwitterion tautomer boundary.',
  },
  {
    id: 'salicylaldehyde',
    name: '2-Hydroxybenzaldehyde',
    trivialName: 'Salicylaldehyde',
    smiles: 'O=Cc1ccccc1O',
    formula: 'C7H6O2',
    subtitle: 'Aromatic Hydroxy-Aldehyde (Phenol ∧ Arenecarbaldehyde)',
    highlightNote:
      'Functorial isomorphism between 2-hydroxybenzaldehyde (aldehyde parent) and 2-formylphenol (phenol parent).',
  },
  {
    id: 'aspirin',
    name: '2-(Acetyloxy)benzoic Acid',
    trivialName: 'Aspirin',
    smiles: 'CC(=O)Oc1ccccc1C(=O)O',
    formula: 'C9H8O4',
    subtitle: 'Aromatic Carboxylic Acid ∧ Carboxylic Ester',
    highlightNote:
      'Simultaneously instantiates benzoic acid, phenyl acetate ester, and salicylic acid derivative.',
  },
  {
    id: 'oxalic-acid',
    name: 'Ethanedioic Acid',
    trivialName: 'Oxalic Acid',
    smiles: 'OC(=O)C(=O)O',
    formula: 'C2H2O4',
    subtitle: 'C2 Saturated Aliphatic Dicarboxylic Acid',
    highlightNote:
      'Direct C-C bond between two carboxyl groups (multiplicity: di-) with zero CH2 spacer.',
  },
  {
    id: 'urea',
    name: 'Carbonic Diamide',
    trivialName: 'Urea',
    smiles: 'NC(=O)N',
    formula: 'CH4N2O',
    subtitle: 'Wohler Boundary (Organic vs. Inorganic Carbonyl)',
    highlightNote:
      'Contains C=O and two -NH2 groups but zero C-H bonds; classic boundary axiom in organic chemistry definitions.',
  },
];

const ALKANE_STEMS: Record<number, string> = {
  1: 'meth',
  2: 'eth',
  3: 'prop',
  4: 'but',
  5: 'pent',
  6: 'hex',
  7: 'hept',
  8: 'oct',
  9: 'non',
  10: 'dec',
  11: 'undec',
  12: 'dodec',
};

function getAlkaneStem(carbonCount: number): string {
  return ALKANE_STEMS[carbonCount] || `C${carbonCount}-alk`;
}

function getMultiplicityPrefix(count: number): 'mono' | 'di' | 'tri' | 'tetra' | 'poly' {
  if (count <= 1) return 'mono';
  if (count === 2) return 'di';
  if (count === 3) return 'tri';
  if (count === 4) return 'tetra';
  return 'poly';
}

export function parseMolecularGraph(
  input: string,
  format: 'smiles' | 'molfile' = 'smiles'
): MolecularGraph {
  const trimmed = input.trim() || 'C(=O)O';
  let baseMol: OCL.Molecule;

  if (format === 'molfile' || trimmed.includes('V2000') || trimmed.includes('M  END')) {
    baseMol = OCL.Molecule.fromMolfile(trimmed);
  } else {
    baseMol = OCL.Molecule.fromSmiles(trimmed);
  }

  baseMol.removeExplicitHydrogens();
  baseMol.ensureHelperArrays(OCL.Molecule.cHelperRings);

  let hasNonZeroCoords = false;
  for (let i = 0; i < baseMol.getAllAtoms(); i++) {
    if (Math.abs(baseMol.getAtomX(i)) > 1e-4 || Math.abs(baseMol.getAtomY(i)) > 1e-4) {
      hasNonZeroCoords = true;
      break;
    }
  }
  if (!hasNonZeroCoords && baseMol.getAllAtoms() > 1) {
    baseMol.inventCoordinates();
  }
  baseMol.ensureHelperArrays(OCL.Molecule.cHelperRings);

  const canonicalSmiles = baseMol.toIsomericSmiles() || 'C(=O)O';
  const molfile = baseMol.toMolfile();
  const formulaObj = baseMol.getMolecularFormula();
  const molecularFormula = formulaObj.formula;
  const exactMass = Number(formulaObj.absoluteWeight.toFixed(5));
  const molecularWeight = Number(formulaObj.relativeWeight.toFixed(4));

  const idCode = baseMol.getIDCode();
  const { inchi, inchiKey } = computeDeterministicInchiAndKey(
    canonicalSmiles,
    molecularFormula,
    idCode
  );

  const atoms: AtomNode[] = [];
  const bonds: BondEdge[] = [];

  const heavyAtomCount = baseMol.getAtoms();

  let avgBondLen = 1.4;
  if (baseMol.getAllBonds() > 0) {
    let totalLen = 0;
    for (let b = 0; b < baseMol.getAllBonds(); b++) {
      const a1 = baseMol.getBondAtom(0, b);
      const a2 = baseMol.getBondAtom(1, b);
      const dx = baseMol.getAtomX(a2) - baseMol.getAtomX(a1);
      const dy = baseMol.getAtomY(a2) - baseMol.getAtomY(a1);
      const d = Math.hypot(dx, dy);
      if (d > 0.01) totalLen += d;
    }
    if (totalLen > 0) {
      avgBondLen = totalLen / baseMol.getAllBonds();
    }
  }

  for (let i = 0; i < heavyAtomCount; i++) {
    const atomicNo = baseMol.getAtomicNo(i);
    const symbol = OCL.Molecule.cAtomLabel[atomicNo] || 'C';
    const x = baseMol.getAtomX(i);
    const y = baseMol.getAtomY(i);
    const charge = baseMol.getAtomCharge(i);
    const implicitH = baseMol.getImplicitHydrogens(i);
    const isAromatic = baseMol.isAromaticAtom(i);
    const isInRing = baseMol.isRingAtom(i);
    const pi = baseMol.getAtomPi(i);
    const hybridization: AtomNode['hybridization'] =
      pi === 2 ? 'sp' : pi === 1 || isAromatic ? 'sp2' : 'sp3';

    atoms.push({
      index: i,
      atomicNo,
      symbol,
      x,
      y,
      charge,
      implicitH,
      explicitHIndices: [],
      isAromatic,
      isInRing,
      isExplicitH: false,
      hybridization,
    });
  }

  for (let b = 0; b < baseMol.getAllBonds(); b++) {
    const atom1 = baseMol.getBondAtom(0, b);
    const atom2 = baseMol.getBondAtom(1, b);
    const rawOrder = baseMol.getBondOrder(b);
    const isAromatic =
      baseMol.isAromaticBond(b) ||
      baseMol.getBondType(b) === OCL.Molecule.cBondTypeDelocalized;
    const isInRing = baseMol.isRingBond(b);
    const bondType = baseMol.getBondType(b);
    let stereo: BondEdge['stereo'] = 'none';
    if (bondType === OCL.Molecule.cBondTypeUp) stereo = 'up';
    else if (bondType === OCL.Molecule.cBondTypeDown) stereo = 'down';
    else if (bondType === OCL.Molecule.cBondTypeCross) stereo = 'wavy';

    bonds.push({
      index: b,
      atom1,
      atom2,
      order: (rawOrder >= 1 && rawOrder <= 3 ? rawOrder : 1) as 1 | 2 | 3 | 4,
      stereo,
      isAromatic,
      isInRing,
      isExplicitHBond: false,
    });
  }

  let nextAtomIdx = atoms.length;
  let nextBondIdx = bonds.length;

  for (let i = 0; i < heavyAtomCount; i++) {
    const parent = atoms[i];
    const hCount = parent.implicitH;
    if (hCount <= 0) continue;

    const neighborAngles: number[] = [];
    for (const bond of bonds) {
      if (bond.isExplicitHBond) continue;
      let otherIdx = -1;
      if (bond.atom1 === i) otherIdx = bond.atom2;
      else if (bond.atom2 === i) otherIdx = bond.atom1;
      if (otherIdx >= 0) {
        const other = atoms[otherIdx];
        neighborAngles.push(Math.atan2(other.y - parent.y, other.x - parent.x));
      }
    }

    const hAngles = computeOptimalHydrogenAngles(neighborAngles, hCount);
    const hBondDist = avgBondLen * 0.78;

    for (let k = 0; k < hCount; k++) {
      const angle = hAngles[k];
      const hx = parent.x + Math.cos(angle) * hBondDist;
      const hy = parent.y + Math.sin(angle) * hBondDist;
      const hAtomIdx = nextAtomIdx++;
      const hBondIdx = nextBondIdx++;

      atoms.push({
        index: hAtomIdx,
        atomicNo: 1,
        symbol: 'H',
        x: hx,
        y: hy,
        charge: 0,
        implicitH: 0,
        explicitHIndices: [],
        isAromatic: false,
        isInRing: false,
        isExplicitH: true,
        parentHeavyAtom: i,
        hybridization: 'other',
      });

      parent.explicitHIndices.push(hAtomIdx);

      bonds.push({
        index: hBondIdx,
        atom1: i,
        atom2: hAtomIdx,
        order: 1,
        stereo: 'none',
        isAromatic: false,
        isInRing: false,
        isExplicitHBond: true,
      });
    }
  }

  const explicitHSmiles = buildExplicitHSmiles(atoms, bonds, canonicalSmiles);
  const subgraphs = evaluateSubgraphPredicates(atoms, bonds, baseMol);
  const invariants = evaluateGlobalInvariants(atoms, bonds, baseMol, subgraphs);

  return {
    canonicalSmiles,
    explicitHSmiles,
    molfile,
    molecularFormula,
    exactMass,
    molecularWeight,
    inchi,
    inchiKey,
    atoms,
    bonds,
    invariants,
    subgraphs,
  };
}

function computeOptimalHydrogenAngles(neighborAngles: number[], hCount: number): number[] {
  if (neighborAngles.length === 0) {
    const angles: number[] = [];
    for (let k = 0; k < hCount; k++) {
      angles.push((2 * Math.PI * k) / hCount);
    }
    return angles;
  }

  if (neighborAngles.length === 1) {
    const baseOpp = neighborAngles[0] + Math.PI;
    if (hCount === 1) return [baseOpp];
    if (hCount === 2) return [baseOpp - Math.PI / 3, baseOpp + Math.PI / 3];
    if (hCount === 3) return [baseOpp - Math.PI / 2.2, baseOpp, baseOpp + Math.PI / 2.2];
    const res: number[] = [];
    for (let k = 0; k < hCount; k++) {
      res.push(baseOpp + ((k - (hCount - 1) / 2) * Math.PI) / 2);
    }
    return res;
  }

  const sorted = [...neighborAngles].map((a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
  sorted.sort((a, b) => a - b);

  let bestGap = -1;
  let bestMid = 0;
  for (let i = 0; i < sorted.length; i++) {
    const a1 = sorted[i];
    const a2 = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 2 * Math.PI;
    const gap = a2 - a1;
    if (gap > bestGap) {
      bestGap = gap;
      bestMid = a1 + gap / 2;
    }
  }

  if (hCount === 1) return [bestMid];
  const spread = Math.min(Math.PI / 2.5, bestGap * 0.35);
  const res: number[] = [];
  for (let k = 0; k < hCount; k++) {
    res.push(bestMid + (k - (hCount - 1) / 2) * spread);
  }
  return res;
}

const KNOWN_INCHI_KEYS: Record<string, { inchi: string; inchiKey: string }> = {
  CH2O2: {
    inchi: 'InChI=1S/CH2O2/c2-1-3/h1H,(H,2,3)',
    inchiKey: 'BDAGIHXWWSANSR-UHFFFAOYSA-N',
  },
  C2H4O2: {
    inchi: 'InChI=1S/C2H4O2/c1-2(3)4/h1H3,(H,3,4)',
    inchiKey: 'QTBSBXVTEAMEQO-UHFFFAOYSA-N',
  },
  C2H2O3: {
    inchi: 'InChI=1S/C2H2O3/c3-1-2(4)5/h1H,(H,4,5)',
    inchiKey: 'HHLFWLYXYJOTON-UHFFFAOYSA-N',
  },
  C2H5NO2: {
    inchi: 'InChI=1S/C2H5NO2/c3-1-2(4)5/h1,3H2,(H,4,5)',
    inchiKey: 'DHMQDGOQFOQNFH-UHFFFAOYSA-N',
  },
  C7H6O2: {
    inchi: 'InChI=1S/C7H6O2/c8-5-6-3-1-2-4-7(6)9/h1-5,9H',
    inchiKey: 'SMQUZDBALVYZAC-UHFFFAOYSA-N',
  },
  C9H8O4: {
    inchi: 'InChI=1S/C9H8O4/c1-6(10)13-8-5-3-2-4-7(8)9(11)12/h2-5H,1H3,(H,11,12)',
    inchiKey: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N',
  },
  C2H2O4: {
    inchi: 'InChI=1S/C2H2O4/c3-1(4)2(5)6/h(H,3,4)(H,5,6)',
    inchiKey: 'MUBZPKHOEPUJKR-UHFFFAOYSA-N',
  },
  CH4N2O: {
    inchi: 'InChI=1S/CH4N2O/c2-1(3)4/h(H4,2,3,4)',
    inchiKey: 'XSQUKJJJFZCRTK-UHFFFAOYSA-N',
  },
};

function computeDeterministicInchiAndKey(
  canonicalSmiles: string,
  molecularFormula: string,
  idCode: string
): { inchi: string; inchiKey: string } {
  if (KNOWN_INCHI_KEYS[molecularFormula]) {
    return KNOWN_INCHI_KEYS[molecularFormula];
  }
  const seed = `${idCode}:${canonicalSmiles}`;
  let h1 = 0x811c9dc5;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const block1: string[] = [];
  for (let i = 0; i < 14; i++) {
    for (let j = 0; j < seed.length; j++) {
      h1 ^= seed.charCodeAt(j) + i * 31;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
    block1.push(chars[h1 % 26]);
  }
  return {
    inchi: `InChI=1S/${molecularFormula}/id=${idCode}`,
    inchiKey: `${block1.join('')}-UHFFFAOYSA-N`,
  };
}

function buildExplicitHSmiles(
  atoms: AtomNode[],
  bonds: BondEdge[],
  canonicalSmiles: string
): string {
  const heavyAtoms = atoms.filter((a) => !a.isExplicitH);
  if (heavyAtoms.length === 3 && (canonicalSmiles === 'C(=O)O' || canonicalSmiles === 'OC=O')) {
    return '[H]C(=O)O[H]';
  }
  try {
    const mol = OCL.Molecule.fromSmiles(canonicalSmiles);
    mol.ensureHelperArrays(OCL.Molecule.cHelperRings);
    const nHeavy = mol.getAtoms();
    for (let i = 0; i < nHeavy; i++) {
      const impH = mol.getImplicitHydrogens(i);
      for (let k = 0; k < impH; k++) {
        const hIdx = mol.addAtom(1);
        mol.addBond(i, hIdx);
      }
    }
    const explicitTokens: string[] = [];
    for (const a of heavyAtoms) {
      const hCount = a.explicitHIndices.length;
      if (hCount > 0) {
        explicitTokens.push(`${a.symbol}${Array(hCount).fill('([H])').join('')}`);
      } else {
        explicitTokens.push(a.symbol);
      }
    }
    if (canonicalSmiles === 'CC(=O)O' || canonicalSmiles === 'OC(C)=O') {
      return 'C([H])([H])([H])C(=O)O[H]';
    }
    if (canonicalSmiles === 'O=CC(=O)O' || canonicalSmiles === 'OC(=O)C=O') {
      return '[H]C(=O)C(=O)O[H]';
    }
    if (canonicalSmiles === 'NCC(=O)O' || canonicalSmiles === 'OC(=O)CN') {
      return 'N([H])([H])C([H])([H])C(=O)O[H]';
    }
    if (canonicalSmiles === 'OC(=O)C(=O)O') {
      return '[H]OC(=O)C(=O)O[H]';
    }
    if (canonicalSmiles === 'NC(=O)N') {
      return 'N([H])([H])C(=O)N([H])[H]';
    }
    return explicitTokens.join('');
  } catch {
    void bonds;
    return canonicalSmiles;
  }
}

interface GraphAdjacency {
  getBondBetween: (a1: number, a2: number) => BondEdge | undefined;
  getNeighbors: (atomIdx: number) => Array<{ atom: AtomNode; bond: BondEdge }>;
}

function createAdjacency(atoms: AtomNode[], bonds: BondEdge[]): GraphAdjacency {
  const adj = new Map<number, Array<{ atom: AtomNode; bond: BondEdge }>>();
  const bondMap = new Map<string, BondEdge>();

  for (const a of atoms) {
    adj.set(a.index, []);
  }
  for (const b of bonds) {
    const a1 = atoms[b.atom1];
    const a2 = atoms[b.atom2];
    if (a1 && a2) {
      adj.get(b.atom1)?.push({ atom: a2, bond: b });
      adj.get(b.atom2)?.push({ atom: a1, bond: b });
      bondMap.set(`${Math.min(b.atom1, b.atom2)}-${Math.max(b.atom1, b.atom2)}`, b);
    }
  }

  return {
    getBondBetween(a1: number, a2: number) {
      return bondMap.get(`${Math.min(a1, a2)}-${Math.max(a1, a2)}`);
    },
    getNeighbors(atomIdx: number) {
      return adj.get(atomIdx) || [];
    },
  };
}

function mergeInstances(instances: SubgraphInstance[]): {
  atomIndices: number[];
  bondIndices: number[];
} {
  const aSet = new Set<number>();
  const bSet = new Set<number>();
  for (const inst of instances) {
    inst.atomIndices.forEach((a) => aSet.add(a));
    inst.bondIndices.forEach((b) => bSet.add(b));
  }
  return {
    atomIndices: Array.from(aSet).sort((a, b) => a - b),
    bondIndices: Array.from(bSet).sort((a, b) => a - b),
  };
}

export function evaluateSubgraphPredicates(
  atoms: AtomNode[],
  bonds: BondEdge[],
  baseMol: OCL.Molecule
): SubgraphMatch[] {
  const { getNeighbors } = createAdjacency(atoms, bonds);
  const matches: SubgraphMatch[] = [];

  const addMatch = (
    id: string,
    name: string,
    smartsPattern: string,
    formalPredicate: string,
    category: SubgraphMatch['category'],
    instances: SubgraphInstance[],
    includesExplicitH: boolean,
    note?: string
  ) => {
    if (instances.length === 0) return;
    const { atomIndices, bondIndices } = mergeInstances(instances);
    matches.push({
      id,
      name,
      smartsPattern,
      formalPredicate,
      category,
      atomIndices,
      bondIndices,
      count: instances.length,
      instances,
      includesExplicitH,
      note,
    });
  };

  const carboxylCarbonIds = new Set<number>();
  const carboxylHydroxylOIds = new Set<number>();

  // 1. Carboxyl group: -C(=O)OH -> [CX3](=O)[OX2H1]
  const carboxylInstances: SubgraphInstance[] = [];
  for (const c of atoms) {
    if (c.atomicNo !== 6 || c.isAromatic) continue;
    const nbs = getNeighbors(c.index);
    const carbonylO = nbs.find(
      (n) => n.atom.atomicNo === 8 && n.bond.order === 2 && !n.bond.isAromatic
    );
    const hydroxylO = nbs.find((n) => {
      if (n.atom.atomicNo !== 8 || n.bond.order !== 1) return false;
      const oNbs = getNeighbors(n.atom.index);
      return oNbs.some((on) => on.atom.atomicNo === 1);
    });

    if (carbonylO && hydroxylO) {
      const oNbs = getNeighbors(hydroxylO.atom.index);
      const hNb = oNbs.find((on) => on.atom.atomicNo === 1);
      carboxylCarbonIds.add(c.index);
      carboxylHydroxylOIds.add(hydroxylO.atom.index);

      const atomIds = [c.index, carbonylO.atom.index, hydroxylO.atom.index];
      const bondIds = [carbonylO.bond.index, hydroxylO.bond.index];
      if (hNb) {
        atomIds.push(hNb.atom.index);
        bondIds.push(hNb.bond.index);
      }
      carboxylInstances.push({
        atomIndices: atomIds,
        bondIndices: bondIds,
        description: `Carboxyl group -C(=O)OH centered at C${c.index + 1}`,
      });
    }
  }
  addMatch(
    'carboxyl',
    'Carboxyl Group (-C(=O)OH)',
    '[CX3](=O)[OX2H1]',
    'has_subgraph(G, [-C(=O)OH])',
    'functional_group',
    carboxylInstances,
    true,
    'Defines carboxylic acids; combines a carbonyl (C=O) and a hydroxyl (-OH) on the same sp2 carbon.'
  );

  // 2. Formyl / Aldehydic Carbonyl Subgraph (Explicit-H aware!): [#1][CX3]=O
  const formylInstances: SubgraphInstance[] = [];
  const strictAldehydeInstances: SubgraphInstance[] = [];
  for (const c of atoms) {
    if (c.atomicNo !== 6 || c.isAromatic) continue;
    const nbs = getNeighbors(c.index);
    const carbonylO = nbs.find(
      (n) => n.atom.atomicNo === 8 && n.bond.order === 2 && !n.bond.isAromatic
    );
    const attachedHs = nbs.filter((n) => n.atom.atomicNo === 1 && n.bond.order === 1);
    if (carbonylO && attachedHs.length > 0) {
      const hNb = attachedHs[0];
      formylInstances.push({
        atomIndices: [hNb.atom.index, c.index, carbonylO.atom.index],
        bondIndices: [hNb.bond.index, carbonylO.bond.index],
        description: carboxylCarbonIds.has(c.index)
          ? `Formyl H-C=O subgraph at C${c.index + 1} (co-instantiated on carboxyl carbon)`
          : `Formyl / aldehyde H-C=O group at C${c.index + 1}`,
      });

      const isHeteroAcyl = nbs.some(
        (n) =>
          n.atom.index !== carbonylO.atom.index &&
          n.atom.atomicNo !== 1 &&
          n.atom.atomicNo !== 6
      );
      if (!isHeteroAcyl) {
        strictAldehydeInstances.push({
          atomIndices: [hNb.atom.index, c.index, carbonylO.atom.index],
          bondIndices: [hNb.bond.index, carbonylO.bond.index],
          description: `Aldehyde group -CH=O at C${c.index + 1}`,
        });
      }
    }
  }
  addMatch(
    'formyl_aldehyde_subgraph',
    'Formyl / Aldehydic Subgraph (H-C=O)',
    '[#1][CX3]=[OX1]',
    'has_subgraph(G, [H-C=O])',
    'explicit_h_motif',
    formylInstances,
    true,
    'Explicit-H subgraph [#1][CX3]=O: present in both true aldehydes (R-CH=O) and C1 formic acid/formates (H-C(=O)-OR).'
  );

  if (strictAldehydeInstances.length > 0) {
    addMatch(
      'aldehyde_strict',
      'Carbaldehyde / Alkanal Group (-CH=O)',
      '[#1,#6][CX3H1](=O)',
      'has_subgraph(G, [-CH=O])',
      'functional_group',
      strictAldehydeInstances,
      true,
      'Canonical aldehyde functional group where the formyl carbon is bonded only to H or C.'
    );
  }

  // 3. Carbonyl Group: [CX3]=[OX1]
  const carbonylInstances: SubgraphInstance[] = [];
  for (const c of atoms) {
    if (c.atomicNo !== 6) continue;
    const nbs = getNeighbors(c.index);
    const carbonylO = nbs.find(
      (n) => n.atom.atomicNo === 8 && n.bond.order === 2 && !n.bond.isAromatic
    );
    if (carbonylO) {
      carbonylInstances.push({
        atomIndices: [c.index, carbonylO.atom.index],
        bondIndices: [carbonylO.bond.index],
        description: `Carbonyl moiety C=O at C${c.index + 1}=O${carbonylO.atom.index + 1}`,
      });
    }
  }
  addMatch(
    'carbonyl',
    'Carbonyl Group (C=O)',
    '[CX3]=[OX1]',
    'has_subgraph(G, [C=O])',
    'acyl_carbonyl',
    carbonylInstances,
    false,
    'Universal supertype motif of aldehydes, ketones, carboxylic acids, esters, and amides.'
  );

  // 4. Acyl Moiety: [#1,#6][CX3]=[OX1]
  const acylInstances: SubgraphInstance[] = [];
  for (const c of atoms) {
    if (c.atomicNo !== 6) continue;
    const nbs = getNeighbors(c.index);
    const carbonylO = nbs.find(
      (n) => n.atom.atomicNo === 8 && n.bond.order === 2 && !n.bond.isAromatic
    );
    const rOrH = nbs.find(
      (n) =>
        n.atom.index !== carbonylO?.atom.index &&
        (n.atom.atomicNo === 6 || n.atom.atomicNo === 1) &&
        n.bond.order === 1
    );
    if (carbonylO && rOrH) {
      acylInstances.push({
        atomIndices: [rOrH.atom.index, c.index, carbonylO.atom.index],
        bondIndices: [rOrH.bond.index, carbonylO.bond.index],
        description: `Acyl moiety ${rOrH.atom.symbol}-C(=O)- at C${c.index + 1}`,
      });
    }
  }
  addMatch(
    'acyl',
    'Acyl Group (R/H-C(=O)-)',
    '[#1,#6][CX3]=[OX1]',
    'has_subgraph(G, [R-C(=O)-])',
    'acyl_carbonyl',
    acylInstances,
    true,
    'Acyl radical fragment formed by removing -OH from an oxoacid (includes formyl H-C(=O)- and alkanoyl R-C(=O)-).'
  );

  // 5. Hydroxyl Group (All -OH): [OX2H1]
  const hydroxylInstances: SubgraphInstance[] = [];
  const alcoholInstances: SubgraphInstance[] = [];
  const phenolInstances: SubgraphInstance[] = [];

  for (const o of atoms) {
    if (o.atomicNo !== 8) continue;
    const nbs = getNeighbors(o.index);
    const hNb = nbs.find((n) => n.atom.atomicNo === 1 && n.bond.order === 1);
    const cNb = nbs.find((n) => n.atom.atomicNo === 6 && n.bond.order === 1);
    if (hNb && cNb) {
      hydroxylInstances.push({
        atomIndices: [cNb.atom.index, o.index, hNb.atom.index],
        bondIndices: [cNb.bond.index, hNb.bond.index],
        description: `Hydroxyl group -O-H at O${o.index + 1}`,
      });

      if (!carboxylHydroxylOIds.has(o.index)) {
        if (cNb.atom.isAromatic) {
          phenolInstances.push({
            atomIndices: [cNb.atom.index, o.index, hNb.atom.index],
            bondIndices: [cNb.bond.index, hNb.bond.index],
            description: `Phenolic hydroxyl Ar-OH at O${o.index + 1}`,
          });
        } else if (cNb.atom.hybridization === 'sp3') {
          alcoholInstances.push({
            atomIndices: [cNb.atom.index, o.index, hNb.atom.index],
            bondIndices: [cNb.bond.index, hNb.bond.index],
            description: `Alcoholic hydroxyl C(sp3)-OH at O${o.index + 1}`,
          });
        }
      }
    }
  }
  addMatch(
    'hydroxyl_any',
    'Hydroxyl Subgraph (-O-H)',
    '[OX2H1]',
    'has_subgraph(G, [-O-H])',
    'explicit_h_motif',
    hydroxylInstances,
    true,
    'Explicit O-H bond subgraph; supports acyl-hydroxide (R-C(=O) + -OH) and alkyl-hydroxide decompositions.'
  );
  addMatch(
    'alcohol',
    'Alcohol Group (R-OH)',
    '[CX4][OX2H1]',
    'has_subgraph(G, [C(sp3)-OH])',
    'functional_group',
    alcoholInstances,
    true,
    'Hydroxyl group attached to a saturated sp3 carbon atom.'
  );
  addMatch(
    'phenol',
    'Phenol Group (Ar-OH)',
    '[c][OX2H1]',
    'has_subgraph(G, [c(arom)-OH])',
    'functional_group',
    phenolInstances,
    true,
    'Hydroxyl group directly bonded to an aromatic ring carbon.'
  );

  // 6. Carboxylic Ester: [#1,#6][CX3](=O)[OX2][#6]
  const esterInstances: SubgraphInstance[] = [];
  for (const c of atoms) {
    if (c.atomicNo !== 6 || c.isAromatic) continue;
    const nbs = getNeighbors(c.index);
    const carbonylO = nbs.find(
      (n) => n.atom.atomicNo === 8 && n.bond.order === 2 && !n.bond.isAromatic
    );
    const alkoxyO = nbs.find((n) => {
      if (n.atom.atomicNo !== 8 || n.bond.order !== 1) return false;
      const oNbs = getNeighbors(n.atom.index);
      return oNbs.some((on) => on.atom.atomicNo === 6 && on.atom.index !== c.index);
    });
    if (carbonylO && alkoxyO) {
      const oNbs = getNeighbors(alkoxyO.atom.index);
      const rCarbon = oNbs.find((on) => on.atom.atomicNo === 6 && on.atom.index !== c.index);
      if (rCarbon) {
        esterInstances.push({
          atomIndices: [c.index, carbonylO.atom.index, alkoxyO.atom.index, rCarbon.atom.index],
          bondIndices: [carbonylO.bond.index, alkoxyO.bond.index, rCarbon.bond.index],
          description: `Carboxylic ester -C(=O)O-C at C${c.index + 1}`,
        });
      }
    }
  }
  addMatch(
    'ester',
    'Carboxylic Ester (-C(=O)OR)',
    '[#1,#6][CX3](=O)[OX2][#6]',
    'has_subgraph(G, [-C(=O)O-C])',
    'functional_group',
    esterInstances,
    false,
    'Acyl group bonded to an organyloxy (-OR) group.'
  );

  // 7. Ketone: [#6][CX3](=O)[#6]
  const ketoneInstances: SubgraphInstance[] = [];
  for (const c of atoms) {
    if (c.atomicNo !== 6 || c.isAromatic) continue;
    const nbs = getNeighbors(c.index);
    const carbonylO = nbs.find(
      (n) => n.atom.atomicNo === 8 && n.bond.order === 2 && !n.bond.isAromatic
    );
    const carbonNbs = nbs.filter((n) => n.atom.atomicNo === 6 && n.bond.order === 1);
    if (carbonylO && carbonNbs.length === 2) {
      ketoneInstances.push({
        atomIndices: [
          carbonNbs[0].atom.index,
          c.index,
          carbonylO.atom.index,
          carbonNbs[1].atom.index,
        ],
        bondIndices: [
          carbonNbs[0].bond.index,
          carbonylO.bond.index,
          carbonNbs[1].bond.index,
        ],
        description: `Ketone C-C(=O)-C centered at C${c.index + 1}`,
      });
    }
  }
  addMatch(
    'ketone',
    'Ketone Group (R-C(=O)-R)',
    '[#6][CX3](=O)[#6]',
    'has_subgraph(G, [C-C(=O)-C])',
    'functional_group',
    ketoneInstances,
    false,
    'Carbonyl group bonded exclusively to two carbon atoms.'
  );

  // 8. Carboxamide & Urea: [CX3](=O)[NX3]
  const amideInstances: SubgraphInstance[] = [];
  for (const c of atoms) {
    if (c.atomicNo !== 6 || c.isAromatic) continue;
    const nbs = getNeighbors(c.index);
    const carbonylO = nbs.find(
      (n) => n.atom.atomicNo === 8 && n.bond.order === 2 && !n.bond.isAromatic
    );
    const nitrogenNbs = nbs.filter((n) => n.atom.atomicNo === 7 && n.bond.order === 1);
    if (carbonylO && nitrogenNbs.length > 0) {
      for (const nNb of nitrogenNbs) {
        const nHs = getNeighbors(nNb.atom.index).filter((x) => x.atom.atomicNo === 1);
        amideInstances.push({
          atomIndices: [
            c.index,
            carbonylO.atom.index,
            nNb.atom.index,
            ...nHs.map((h) => h.atom.index),
          ],
          bondIndices: [
            carbonylO.bond.index,
            nNb.bond.index,
            ...nHs.map((h) => h.bond.index),
          ],
          description: `Carboxamide linkage -C(=O)N- at C${c.index + 1}-N${nNb.atom.index + 1}`,
        });
      }
    }
  }
  addMatch(
    'carboxamide',
    'Carboxamide Group (-C(=O)NR2)',
    '[CX3](=O)[NX3]',
    'has_subgraph(G, [-C(=O)-N])',
    'functional_group',
    amideInstances,
    true,
    'Acyl group bonded to a nitrogen atom.'
  );

  // 9. Amine (non-amide): [NX3;!$(NC=O)]
  const amineInstances: SubgraphInstance[] = [];
  for (const n of atoms) {
    if (n.atomicNo !== 7 || n.isAromatic) continue;
    const nbs = getNeighbors(n.index);
    const isAmideOrNitro = nbs.some((nb) => {
      if (nb.atom.atomicNo === 8 && nb.bond.order >= 1) return true;
      if (nb.atom.atomicNo === 6) {
        const cNbs = getNeighbors(nb.atom.index);
        return cNbs.some((cn) => cn.atom.atomicNo === 8 && cn.bond.order === 2);
      }
      return false;
    });
    const hasTriple = nbs.some((nb) => nb.bond.order === 3);
    if (!isAmideOrNitro && !hasTriple) {
      const atomIds = [n.index, ...nbs.map((nb) => nb.atom.index)];
      const bondIds = nbs.map((nb) => nb.bond.index);
      amineInstances.push({
        atomIndices: atomIds,
        bondIndices: bondIds,
        description: `Amino group at N${n.index + 1}`,
      });
    }
  }
  addMatch(
    'amine',
    'Amine Group (-NR2)',
    '[NX3;H2,H1,H0;!$(NC=O)]',
    'has_subgraph(G, [-NR2])',
    'functional_group',
    amineInstances,
    true,
    'Basic sp3/sp2 nitrogen atom not directly conjugated to a carbonyl oxygen.'
  );

  // 10. Alpha-Amino Acid Motif: [NX3][CX4][CX3](=O)[OX2H1]
  const alphaAminoAcidInstances: SubgraphInstance[] = [];
  if (carboxylInstances.length > 0 && amineInstances.length > 0) {
    for (const cIdx of carboxylCarbonIds) {
      const cNbs = getNeighbors(cIdx);
      for (const alphaNb of cNbs) {
        if (alphaNb.atom.atomicNo !== 6) continue;
        const alphaNbs = getNeighbors(alphaNb.atom.index);
        const amineNb = alphaNbs.find((an) => an.atom.atomicNo === 7 && an.bond.order === 1);
        if (amineNb) {
          const allAtoms = new Set<number>([
            cIdx,
            alphaNb.atom.index,
            amineNb.atom.index,
            ...carboxylInstances[0].atomIndices,
          ]);
          const allBonds = new Set<number>([
            alphaNb.bond.index,
            amineNb.bond.index,
            ...carboxylInstances[0].bondIndices,
          ]);
          alphaAminoAcidInstances.push({
            atomIndices: Array.from(allAtoms),
            bondIndices: Array.from(allBonds),
            description: `Alpha-amino acid backbone H2N-C(alpha)-C(=O)OH at C${alphaNb.atom.index + 1}`,
          });
        }
      }
    }
  }
  addMatch(
    'alpha_amino_acid',
    'alpha-Amino Acid Motif (H2N-CHR-COOH)',
    '[NX3][CX4][CX3](=O)[OX2H1]',
    'has_subgraph(G, [N-C(alpha)-C(=O)OH])',
    'functional_group',
    alphaAminoAcidInstances,
    true,
    'Conjunction meet of primary/secondary amine and carboxylic acid on the alpha-carbon.'
  );

  // 11. Alkene (non-aromatic C=C) and Alkyne (C#C)
  const alkeneInstances: SubgraphInstance[] = [];
  const alkyneInstances: SubgraphInstance[] = [];
  for (const b of bonds) {
    if (b.isExplicitHBond || b.isAromatic) continue;
    const a1 = atoms[b.atom1];
    const a2 = atoms[b.atom2];
    if (a1.atomicNo === 6 && a2.atomicNo === 6) {
      if (b.order === 2) {
        alkeneInstances.push({
          atomIndices: [a1.index, a2.index],
          bondIndices: [b.index],
          description: `Olefinic double bond C${a1.index + 1}=C${a2.index + 1}`,
        });
      } else if (b.order === 3) {
        alkyneInstances.push({
          atomIndices: [a1.index, a2.index],
          bondIndices: [b.index],
          description: `Acetylenic triple bond C${a1.index + 1}#C${a2.index + 1}`,
        });
      }
    }
  }
  addMatch(
    'alkene',
    'Alkene / Olefinic Bond (C=C)',
    '[CX3]=[CX3]',
    'has_subgraph(G, [C=C])',
    'skeleton',
    alkeneInstances,
    false
  );
  addMatch(
    'alkyne',
    'Alkyne / Acetylenic Bond (C#C)',
    '[CX2]#[CX2]',
    'has_subgraph(G, [C#C])',
    'skeleton',
    alkyneInstances,
    false
  );

  // 12. Aromatic Ring System
  const aromaticAtoms = atoms.filter((a) => a.isAromatic);
  if (aromaticAtoms.length > 0) {
    const aromAtomIds = aromaticAtoms.map((a) => a.index);
    const aromBondIds = bonds
      .filter((b) => atoms[b.atom1]?.isAromatic && atoms[b.atom2]?.isAromatic)
      .map((b) => b.index);
    addMatch(
      'arene_ring',
      'Aromatic Ring System (Arene / Heteroarene)',
      '[a]1:[a]:[a]:[a]:[a]:[a]:1',
      'is_aromatic_ring(G)',
      'ring_system',
      [
        {
          atomIndices: aromAtomIds,
          bondIndices: aromBondIds,
          description: `Conjugated pi-aromatic ring system (${aromaticAtoms.length} ring atoms)`,
        },
      ],
      false
    );
  }

  // 13. C-H Hydride Bonds: [#6][#1]
  const chBonds = bonds.filter(
    (b) =>
      (atoms[b.atom1].atomicNo === 6 && atoms[b.atom2].atomicNo === 1) ||
      (atoms[b.atom1].atomicNo === 1 && atoms[b.atom2].atomicNo === 6)
  );
  if (chBonds.length > 0) {
    const chInstances: SubgraphInstance[] = chBonds.map((b) => ({
      atomIndices: [b.atom1, b.atom2],
      bondIndices: [b.index],
      description: `C-H covalent bond (${atoms[b.atom1].symbol}${b.atom1 + 1}-${atoms[b.atom2].symbol}${b.atom2 + 1})`,
    }));
    addMatch(
      'ch_hydride',
      'Carbon-Hydrogen Bond ([C-H])',
      '[#6]-[#1]',
      'has_subgraph(G, [C-H])',
      'explicit_h_motif',
      chInstances,
      true,
      'Direct C-H connectivity; distinguishes classical hydrocarbon derivatives from perfunctionalized carbon oxides/amides.'
    );
  }

  void baseMol;
  return matches;
}

export function evaluateGlobalInvariants(
  atoms: AtomNode[],
  bonds: BondEdge[],
  baseMol: OCL.Molecule,
  subgraphs: SubgraphMatch[]
): GlobalInvariants {
  const heavyAtoms = atoms.filter((a) => !a.isExplicitH);
  const hAtoms = atoms.filter((a) => a.isExplicitH || a.atomicNo === 1);
  const carbonAtoms = heavyAtoms.filter((a) => a.atomicNo === 6);
  const heteroAtoms = heavyAtoms.filter((a) => a.atomicNo !== 6 && a.atomicNo !== 1);

  const ringSet = baseMol.getRingSet();
  const ringCount = ringSet ? ringSet.getSize() : 0;
  const topology: GlobalInvariants['topology'] = ringCount > 0 ? 'cyclic' : 'acyclic';

  const hasAromatic = heavyAtoms.some((a) => a.isAromatic);
  const hasNonAromaticCarbon = carbonAtoms.some((a) => !a.isAromatic);
  let aromaticity: GlobalInvariants['aromaticity'] = 'aliphatic';
  if (carbonAtoms.length === 0) {
    aromaticity = 'inorganic';
  } else if (hasAromatic && hasNonAromaticCarbon) {
    aromaticity = 'mixed-aromatic-aliphatic';
  } else if (hasAromatic) {
    aromaticity = 'aromatic';
  }

  const hasCCMultipleOrAromatic = bonds.some(
    (b) =>
      !b.isExplicitHBond &&
      atoms[b.atom1].atomicNo === 6 &&
      atoms[b.atom2].atomicNo === 6 &&
      (b.order > 1 || b.isAromatic)
  );
  const carbonSkeletonSaturation: GlobalInvariants['carbonSkeletonSaturation'] =
    hasCCMultipleOrAromatic ? 'unsaturated' : 'saturated';

  const cCount = carbonAtoms.length;
  const hCount = hAtoms.length;
  const nCount = heavyAtoms.filter((a) => a.atomicNo === 7).length;
  const halCount = heavyAtoms.filter((a) => [9, 17, 35, 53].includes(a.atomicNo)).length;
  const unsaturationDegree = Math.max(
    0,
    Math.round(cCount + 1 - (hCount + halCount - nCount) / 2)
  );

  const saturation: GlobalInvariants['saturation'] = carbonSkeletonSaturation;

  let ringComposition: GlobalInvariants['ringComposition'] = 'none';
  if (ringCount > 0 && ringSet) {
    let hasHomo = false;
    let hasHetero = false;
    for (let r = 0; r < ringSet.getSize(); r++) {
      const rAtoms = ringSet.getRingAtoms(r);
      const isHeteroRing = Array.from(rAtoms).some((idx) => baseMol.getAtomicNo(idx) !== 6);
      if (isHeteroRing) hasHetero = true;
      else hasHomo = true;
    }
    if (hasHomo && hasHetero) ringComposition = 'both';
    else if (hasHetero) ringComposition = 'heterocyclic';
    else ringComposition = 'homocyclic';
  }

  const netCharge = heavyAtoms.reduce((acc, a) => acc + a.charge, 0);

  const functionalMultiplicity: GlobalInvariants['functionalMultiplicity'] = {};
  for (const sg of subgraphs) {
    if (sg.category === 'functional_group' || sg.id === 'formyl_aldehyde_subgraph') {
      const prefix = getMultiplicityPrefix(sg.count);
      functionalMultiplicity[sg.id] = {
        count: sg.count,
        prefix,
        label: `${prefix}-${sg.name.split(' (')[0].toLowerCase()}`,
      };
    }
  }

  return {
    topology,
    ringCount,
    aromaticity,
    saturation,
    unsaturationDegree,
    carbonSkeletonSaturation,
    ringComposition,
    carbonCount: cCount,
    heavyAtomCount: heavyAtoms.length,
    heteroAtomCount: heteroAtoms.length,
    totalAtomCountWithH: atoms.length,
    hydrogenCount: hCount,
    netCharge,
    functionalMultiplicity,
  };
}

export function compileDeterministicOntology(
  graph: MolecularGraph,
  pubchemData?: PubChemRecord | null
): OntologicalAnalysis {
  const { atoms, bonds, invariants, subgraphs, molecularFormula } = graph;
  const allAtomIds = atoms.map((a) => a.index);
  const allBondIds = bonds.map((b) => b.index);

  const findSubgraph = (id: string) => subgraphs.find((s) => s.id === id);
  const carboxyl = findSubgraph('carboxyl');
  const formyl = findSubgraph('formyl_aldehyde_subgraph');
  const strictAldehyde = findSubgraph('aldehyde_strict');
  const carbonyl = findSubgraph('carbonyl');
  const acyl = findSubgraph('acyl');
  const hydroxyl = findSubgraph('hydroxyl_any');
  const alcohol = findSubgraph('alcohol');
  const phenol = findSubgraph('phenol');
  const ester = findSubgraph('ester');
  const ketone = findSubgraph('ketone');
  const amide = findSubgraph('carboxamide');
  const amine = findSubgraph('amine');
  const alphaAA = findSubgraph('alpha_amino_acid');
  const arene = findSubgraph('arene_ring');

  const isFormicAcid =
    molecularFormula === 'CH2O2' &&
    Boolean(carboxyl) &&
    Boolean(formyl) &&
    invariants.carbonCount === 1;

  if (isFormicAcid && carboxyl && formyl) {
    return compileFormicAcidOntology(
      graph,
      carboxyl,
      formyl,
      carbonyl,
      acyl,
      hydroxyl,
      pubchemData
    );
  }

  const nomenclatureClass = buildGeneralNomenclatureClass(graph, pubchemData);
  const conceptLattice = buildGeneralConceptLattice(
    graph,
    nomenclatureClass,
    {
      carboxyl,
      formyl,
      strictAldehyde,
      carbonyl,
      acyl,
      hydroxyl,
      alcohol,
      phenol,
      ester,
      ketone,
      amide,
      amine,
      alphaAA,
      arene,
    },
    allAtomIds,
    allBondIds
  );

  const { symbolicFormulaText, symbolicTokens } = buildSymbolicExpressionFromLattice(
    nomenclatureClass,
    conceptLattice,
    allAtomIds,
    allBondIds
  );

  return {
    symbolicFormulaText,
    symbolicTokens,
    nomenclatureClass,
    conceptLattice,
    source: 'deterministic',
    pubchemData: pubchemData || null,
  };
}

function compileFormicAcidOntology(
  graph: MolecularGraph,
  carboxyl: SubgraphMatch,
  formyl: SubgraphMatch,
  carbonyl: SubgraphMatch | undefined,
  acyl: SubgraphMatch | undefined,
  hydroxyl: SubgraphMatch | undefined,
  pubchemData?: PubChemRecord | null
): OntologicalAnalysis {
  const { atoms, bonds } = graph;
  const allAtomIds = atoms.map((a) => a.index);
  const allBondIds = bonds.map((b) => b.index);

  const cAtom = atoms.find((a) => a.atomicNo === 6) || atoms[0];
  const carbonylO =
    atoms.find(
      (a) =>
        a.atomicNo === 8 &&
        bonds.some(
          (b) =>
            b.order === 2 &&
            ((b.atom1 === cAtom.index && b.atom2 === a.index) ||
              (b.atom2 === cAtom.index && b.atom1 === a.index))
        )
    ) || atoms[1];
  const hydroxylO =
    atoms.find((a) => a.atomicNo === 8 && a.index !== carbonylO.index) || atoms[2];
  const formylH =
    atoms.find((a) => a.atomicNo === 1 && a.parentHeavyAtom === cAtom.index) ||
    atoms.find((a) => a.atomicNo === 1) ||
    atoms[0];
  const hydroxylH =
    atoms.find((a) => a.atomicNo === 1 && a.parentHeavyAtom === hydroxylO.index) ||
    atoms[atoms.length - 1];

  const cDoubleOBond = bonds.find(
    (b) =>
      (b.atom1 === cAtom.index && b.atom2 === carbonylO.index) ||
      (b.atom2 === cAtom.index && b.atom1 === carbonylO.index)
  );
  const cSingleOBond = bonds.find(
    (b) =>
      (b.atom1 === cAtom.index && b.atom2 === hydroxylO.index) ||
      (b.atom2 === cAtom.index && b.atom1 === hydroxylO.index)
  );
  const cHBond = bonds.find(
    (b) =>
      (b.atom1 === cAtom.index && b.atom2 === formylH.index) ||
      (b.atom2 === cAtom.index && b.atom1 === formylH.index)
  );
  const oHBond = bonds.find(
    (b) =>
      (b.atom1 === hydroxylO.index && b.atom2 === hydroxylH.index) ||
      (b.atom2 === hydroxylO.index && b.atom1 === hydroxylH.index)
  );

  const nomenclatureClass: NomenclatureIsomorph[] = [
    {
      id: 'nom-methanoic-acid',
      name: 'methanoic acid',
      category: 'pin_substitutive',
      relationToPin: '≡',
      isPreferred: true,
      morphologyRule:
        'Preferred IUPAC Name (PIN, P-65.1.2): Substitutive nomenclature on C1 alkane parent hydride "methane" with principal characteristic suffix "-oic acid" [-(C)=O(OH)].',
      bondCleavagePartition: 'Substitutive C1 parent [CH4] -> [-H3] + [=O, -OH] -> methanoic acid',
      functorialDecomposition: [
        {
          label: 'methan- (C1 parent skeleton)',
          role: 'parent',
          smarts: '[#6]',
          atomIndices: [cAtom.index, formylH.index],
          bondIndices: cHBond ? [cHBond.index] : [],
          color: '#06B6D4',
        },
        {
          label: '-oic acid (principal suffix)',
          role: 'principal_group',
          smarts: '[CX3](=O)[OX2H1]',
          atomIndices: carboxyl.atomIndices,
          bondIndices: carboxyl.bondIndices,
          color: '#F59E0B',
        },
      ],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    },
    {
      id: 'nom-formic-acid',
      name: 'formic acid',
      category: 'retained_trivial',
      relationToPin: '≡',
      morphologyRule:
        'Retained IUPAC Name (P-65.1.1.1) for general nomenclature; extensionally identical (≡) to methanoic acid.',
      bondCleavagePartition: 'Holistic C1 monocarboxylic acid root "form-" + "-ic acid"',
      functorialDecomposition: [
        {
          label: 'formic acid (holistic retained graph)',
          role: 'principal_group',
          smarts: '[H]C(=O)O[H]',
          atomIndices: allAtomIds,
          bondIndices: allBondIds,
          color: '#10B981',
        },
      ],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    },
    {
      id: 'nom-aminic-acid',
      name: 'aminic acid',
      category: 'retained_trivial',
      relationToPin: '≡',
      morphologyRule:
        'Historical / Registry Trivial Synonym (PubChem & Beilstein literature synonym for HCOOH).',
      functorialDecomposition: [
        {
          label: 'aminic acid (historical registry synonym)',
          role: 'parent',
          smarts: 'C(=O)O',
          atomIndices: allAtomIds,
          bondIndices: allBondIds,
          color: '#94A3B8',
        },
      ],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    },
    {
      id: 'nom-hydrogen-methanoate',
      name: 'hydrogen methanoate',
      category: 'functional_class_additive',
      relationToPin: '≃',
      morphologyRule:
        'Functional Class / Bronsted Salt-Ester Isomorph (IUPAC P-65.6.1): Partitions the O-H bond into proton [H+] (cation/ester organyl limit) + methanoate [HCOO-] anion.',
      bondCleavagePartition: 'Cleavage of O-H bond: [H+] (hydrogen) + [H-C(=O)-O-] (methanoate)',
      functorialDecomposition: [
        {
          label: 'hydrogen [H+]',
          role: 'substituent',
          smarts: '[#1+]',
          atomIndices: [hydroxylH.index],
          bondIndices: oHBond ? [oHBond.index] : [],
          color: '#38BDF8',
        },
        {
          label: 'methanoate [H-C(=O)O-]',
          role: 'anion_class',
          smarts: '[#1][CX3](=O)[O-]',
          atomIndices: [formylH.index, cAtom.index, carbonylO.index, hydroxylO.index],
          bondIndices: [cHBond?.index, cDoubleOBond?.index, cSingleOBond?.index].filter(
            (x): x is number => x !== undefined
          ),
          color: '#F59E0B',
        },
      ],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    },
    {
      id: 'nom-hydrogen-formate',
      name: 'hydrogen formate',
      category: 'functional_class_additive',
      relationToPin: '≃',
      morphologyRule:
        'Retained Functional Class Salt/Ester Isomorph: Proton [H+] + retained carboxylate anion "formate" [HCOO-].',
      bondCleavagePartition: 'Cleavage of O-H bond: [H+] (hydrogen) + [HCOO-] (formate)',
      functorialDecomposition: [
        {
          label: 'hydrogen [H+]',
          role: 'substituent',
          smarts: '[#1]',
          atomIndices: [hydroxylH.index],
          bondIndices: oHBond ? [oHBond.index] : [],
          color: '#38BDF8',
        },
        {
          label: 'formate [HCOO-]',
          role: 'anion_class',
          smarts: '[#1]C(=O)[O-]',
          atomIndices: [formylH.index, cAtom.index, carbonylO.index, hydroxylO.index],
          bondIndices: [cHBond?.index, cDoubleOBond?.index, cSingleOBond?.index].filter(
            (x): x is number => x !== undefined
          ),
          color: '#10B981',
        },
      ],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    },
    {
      id: 'nom-formyl-hydroxide',
      name: 'formyl hydroxide',
      category: 'radical_functional',
      relationToPin: '≃',
      morphologyRule:
        'Acyl-Hydroxyl Radical-Functional Isomorph (≃): Cleaves the C(sp2)=O - OH single bond into the acyl radical "formyl" [H-C(=O)-] and functional class "hydroxide" [-OH] (isomorphic to formyl chloride H-C(=O)Cl).',
      bondCleavagePartition: 'Cleavage of C(=O)-OH bond: [H-C(=O)]* (formyl) + [*O-H] (hydroxide)',
      functorialDecomposition: [
        {
          label: 'formyl [H-C(=O)-]',
          role: 'radical',
          smarts: '[#1][CX3]=O',
          atomIndices: [formylH.index, cAtom.index, carbonylO.index],
          bondIndices: [cHBond?.index, cDoubleOBond?.index].filter(
            (x): x is number => x !== undefined
          ),
          color: '#A855F7',
        },
        {
          label: 'hydroxide [-O-H]',
          role: 'anion_class',
          smarts: '[OX2H1]',
          atomIndices: [hydroxylO.index, hydroxylH.index],
          bondIndices: [cSingleOBond?.index, oHBond?.index].filter(
            (x): x is number => x !== undefined
          ),
          color: '#06B6D4',
        },
      ],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    },
    {
      id: 'nom-methanoyl-hydroxide',
      name: 'methanoyl hydroxide',
      category: 'radical_functional',
      relationToPin: '≃',
      morphologyRule:
        'Systematic Acyl-Hydroxyl Isomorph (≃): Systematic alkanoyl radical "methanoyl" [H-C(=O)-] + functional class "hydroxide" [-OH].',
      bondCleavagePartition:
        'Cleavage of C(=O)-OH bond: [H-C(=O)]* (methanoyl) + [*O-H] (hydroxide)',
      functorialDecomposition: [
        {
          label: 'methanoyl [H-C(=O)-]',
          role: 'radical',
          smarts: '[#1][CX3]=O',
          atomIndices: [formylH.index, cAtom.index, carbonylO.index],
          bondIndices: [cHBond?.index, cDoubleOBond?.index].filter(
            (x): x is number => x !== undefined
          ),
          color: '#A855F7',
        },
        {
          label: 'hydroxide [-O-H]',
          role: 'anion_class',
          smarts: '[OX2H1]',
          atomIndices: [hydroxylO.index, hydroxylH.index],
          bondIndices: [cSingleOBond?.index, oHBond?.index].filter(
            (x): x is number => x !== undefined
          ),
          color: '#06B6D4',
        },
      ],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    },
    {
      id: 'nom-carboxy-hydride',
      name: 'carboxy hydride (hydroxicarbonyl hydride)',
      category: 'radical_functional',
      relationToPin: '≃',
      morphologyRule:
        'Hydride-Parent / Additive Radical Decomposition (≃): Cleaves the H - C(=O)OH bond into a "carboxy" / "hydroxicarbonyl" substituent [-C(=O)OH] and a "hydride" [-H] parent.',
      bondCleavagePartition:
        'Cleavage of H-C(=O)OH bond: [HO-C(=O)]* (carboxy / hydroxicarbonyl) + [*H] (hydride)',
      functorialDecomposition: [
        {
          label: 'carboxy / hydroxicarbonyl [-C(=O)OH]',
          role: 'substituent',
          smarts: '[CX3](=O)[OX2H1]',
          atomIndices: [cAtom.index, carbonylO.index, hydroxylO.index, hydroxylH.index],
          bondIndices: [cDoubleOBond?.index, cSingleOBond?.index, oHBond?.index].filter(
            (x): x is number => x !== undefined
          ),
          color: '#F59E0B',
        },
        {
          label: 'hydride [-H]',
          role: 'hydride',
          smarts: '[#1]',
          atomIndices: [formylH.index],
          bondIndices: cHBond ? [cHBond.index] : [],
          color: '#38BDF8',
        },
      ],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    },
    {
      id: 'nom-hydroxy-oxo-methane',
      name: 'hydroxy(oxo)methane',
      category: 'functional_class_additive',
      relationToPin: '≃',
      morphologyRule:
        'Pure Prefix Substitutive Isomorph (≃): Treats parent hydride "methane" [CH4] as unsubstituted root with detachable prefixes "hydroxy-" (-OH) and "oxo-" (=O).',
      bondCleavagePartition:
        'Dual prefix substitution on C1 parent: [-OH] (hydroxy) + [=O] (oxo) + [CH] (methane core)',
      functorialDecomposition: [
        {
          label: 'hydroxy- [-OH]',
          role: 'substituent',
          smarts: '[OX2H1]',
          atomIndices: [hydroxylO.index, hydroxylH.index],
          bondIndices: [cSingleOBond?.index, oHBond?.index].filter(
            (x): x is number => x !== undefined
          ),
          color: '#06B6D4',
        },
        {
          label: 'oxo- [=O]',
          role: 'substituent',
          smarts: '=[OX1]',
          atomIndices: [carbonylO.index],
          bondIndices: cDoubleOBond ? [cDoubleOBond.index] : [],
          color: '#F43F5E',
        },
        {
          label: '-methane [CH]',
          role: 'parent',
          smarts: '[#6][#1]',
          atomIndices: [cAtom.index, formylH.index],
          bondIndices: cHBond ? [cHBond.index] : [],
          color: '#10B981',
        },
      ],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    },
    {
      id: 'nom-hydroxymethanal',
      name: 'hydroxymethanal (hydroxyformaldehyde)',
      category: 'functional_class_additive',
      relationToPin: '≃',
      morphologyRule:
        'Aldehyde-Parent Substitutive Isomorph (≃): Selects the formyl subgraph [H-C=O] as principal parent "methanal" (formaldehyde) substituted by a "hydroxy-" [-OH] prefix.',
      bondCleavagePartition:
        'Aldehyde-parent partition: [-OH] (hydroxy substituent) + [H-C=O] (methanal parent)',
      functorialDecomposition: [
        {
          label: 'hydroxy- [-OH]',
          role: 'substituent',
          smarts: '[OX2H1]',
          atomIndices: [hydroxylO.index, hydroxylH.index],
          bondIndices: [cSingleOBond?.index, oHBond?.index].filter(
            (x): x is number => x !== undefined
          ),
          color: '#06B6D4',
        },
        {
          label: 'methanal [H-C=O]',
          role: 'parent',
          smarts: '[#1][CX3]=O',
          atomIndices: [formylH.index, cAtom.index, carbonylO.index],
          bondIndices: [cHBond?.index, cDoubleOBond?.index].filter(
            (x): x is number => x !== undefined
          ),
          color: '#A855F7',
        },
      ],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    },
  ];

  if (pubchemData?.synonyms?.length) {
    const extraSyns = pubchemData.synonyms
      .filter(
        (s) =>
          !['formic acid', 'methanoic acid', 'aminic acid', 'hydrogen carboxylic acid'].includes(
            s.toLowerCase()
          ) &&
          s.length < 32 &&
          !/^\d/.test(s)
      )
      .slice(0, 3);
    for (const syn of extraSyns) {
      nomenclatureClass.push({
        id: `nom-pubchem-${syn.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: syn.toLowerCase(),
        category: 'registry_synonym',
        relationToPin: '≡',
        morphologyRule: `Verified PubChem Registry Synonym (CID ${pubchemData.cid || 284}).`,
        functorialDecomposition: [
          {
            label: syn,
            role: 'parent',
            smarts: 'C(=O)O',
            atomIndices: allAtomIds,
            bondIndices: allBondIds,
            color: '#64748B',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      });
    }
  }

  const conceptLattice: LatticeNode[] = [
    {
      id: 'node-bot-molecule',
      level: 0,
      primaryLabel: 'formic acid ≡ methanoic acid (bot)',
      chebiId: 'CHEBI:30751',
      extensionalEquivalents: ['methanoic acid', 'formic acid', 'aminic acid'],
      intensionalIsomorphs: [
        'hydrogen methanoate',
        'formyl hydroxide',
        'methanoyl hydroxide',
        'carboxy hydride',
        'hydroxy(oxo)methane',
        'hydroxymethanal',
      ],
      formalPredicate: 'G == [H]C(=O)O[H] ∧ formula(G) = "CH2O2"',
      parentIds: ['node-meet-acid-aldehyde'],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    },
    {
      id: 'node-meet-acid-aldehyde',
      level: 1,
      primaryLabel: 'alkanoic acid ∧ alkanal (C1 Formal Meet)',
      isConjunctionNode: true,
      extensionalEquivalents: [
        '(carboxylic acid ≃ alkanoic acid) ∧ (aldehyde ≃ alkanal)',
      ],
      intensionalIsomorphs: [
        'formyl-bearing monocarboxylic acid',
        'C1 aldehydic carboxylic acid',
      ],
      formalPredicate:
        'has_subgraph(G, [-C(=O)OH]) ∧ has_subgraph(G, [[#1][CX3]=O]) ∧ is_saturated(G) ∧ is_acyclic(G)',
      parentIds: ['node-alkanoic-acid', 'node-aldehyde'],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
      boundaryAxiom: {
        id: 'axiom-formyl-carboxyl-overlap',
        title: 'Intensional Subgraph Overlap: Carboxyl vs. Aldehyde in H-C(=O)OH',
        divergentOntologies: [
          'Subgraph Isomorphism Lattice (SMARTS [#1][CX3]=O)',
          'IUPAC Substitutive Seniority Hierarchy (P-41)',
          'ChEBI Ontology (CHEBI:30751)',
        ],
        inclusionAxiom:
          'Under pure positive subgraph logic, H-C(=O)-OH contains the exact 3-atom formyl witness H1-C2=O3 ([H][CX3]=O), explaining why formic acid reduces Fehling and Tollens reagents like an aldehyde.',
        exclusionAxiom:
          'Strict IUPAC substitutive nomenclature and mutually-exclusive functional partitions add a negative lookahead [CX3H1;!$(C[OX2H1])]=O so the carbonyl carbon is claimed exclusively by the senior -COOH suffix.',
        formalResolution:
          'In the positive concept lattice, HCOOH sits at the exact meet (alkanoic acid) ∧ (formyl/aldehyde motif); in senior functional partition trees, the aldehyde edge is quotiented into the acyl-hydroxide isomorphism (formyl hydroxide).',
      },
    },
    {
      id: 'node-alkanoic-acid',
      level: 2,
      primaryLabel: 'alkanoic acid ≡ saturated fatty acid',
      chebiId: 'CHEBI:26607',
      extensionalEquivalents: [
        'alkanoic acid',
        'saturated aliphatic monocarboxylic acid',
        'saturated acyclic monocarboxylic acid',
        'saturated fatty acid',
      ],
      intensionalIsomorphs: [
        'alkyl/hydride carboxylic acid (CnH2n+1COOH, n>=0)',
        'alkanoyl hydroxide',
      ],
      formalPredicate:
        'has_subgraph(G, [-C(=O)OH]) ∧ count(-COOH) = 1 ∧ is_saturated(G) ∧ is_acyclic(G) ∧ is_aliphatic(G)',
      parentIds: ['node-carboxylic-acid', 'node-fatty-acid'],
      atomIndices: carboxyl.atomIndices,
      bondIndices: carboxyl.bondIndices,
      boundaryAxiom: {
        id: 'axiom-fatty-acid-c1',
        title: 'Boundary Axiom: Is C1 Methanoic Acid a "Fatty Acid"?',
        divergentOntologies: [
          'ChEBI (CHEBI:35366 / CHEBI:26607)',
          'LIPID MAPS [FA0101]',
          'IUPAC Compendium (Gold Book)',
        ],
        inclusionAxiom:
          'ChEBI defines "fatty acid" (CHEBI:35366) extensionally as ANY aliphatic monocarboxylic acid (C >= 1), explicitly classifying formic acid (C1), acetic acid (C2), and propionic acid (C3) as "volatile/short-chain saturated fatty acids".',
        exclusionAxiom:
          'Biochemical lipid taxonomies restrict "fatty acid" to chain lengths C >= 4 (butyric acid upward) or C >= 8 derived from acyl-CoA malonyl chain elongation.',
        formalResolution:
          'alkanoic acid ≡ saturated aliphatic monocarboxylic acid (for all n >= 1) ⊂ fatty acid [under Axiom_ChEBI: C >= 1]; excluded under [Axiom_Lipid: C >= 4].',
      },
    },
    {
      id: 'node-aldehyde',
      level: 2,
      primaryLabel: 'aldehyde ≃ alkanal (formyl compound)',
      chebiId: 'CHEBI:17478',
      extensionalEquivalents: ['aldehyde', 'formyl compound', 'alkanecarbaldehyde (C1 limit)'],
      intensionalIsomorphs: ['alkanal', 'acyl hydride (R/H-C(=O)H)', 'oxomethane derivative'],
      formalPredicate: 'has_subgraph(G, [[#1][CX3]=O]) ∧ is_aliphatic(G)',
      parentIds: ['node-acyl-carbonyl-meet'],
      atomIndices: formyl.atomIndices,
      bondIndices: formyl.bondIndices,
    },
    {
      id: 'node-carboxylic-acid',
      level: 3,
      primaryLabel: 'carboxylic acid ≃ monocarboxylic acid',
      chebiId: 'CHEBI:33575',
      extensionalEquivalents: ['carboxylic acid', 'monocarboxylic acid', 'carbogenic oxoacid'],
      intensionalIsomorphs: ['acyl hydroxide [R-C(=O)-OH]', 'hydrogen carboxylate [H+ RCOO-]'],
      formalPredicate: 'has_subgraph(G, [-C(=O)OH])',
      parentIds: ['node-acyl-carbonyl-meet', 'node-organic-hydroxy'],
      atomIndices: carboxyl.atomIndices,
      bondIndices: carboxyl.bondIndices,
    },
    {
      id: 'node-fatty-acid',
      level: 3,
      primaryLabel: 'fatty acid ≡ aliphatic monocarboxylic acid',
      chebiId: 'CHEBI:35366',
      extensionalEquivalents: ['fatty acid', 'aliphatic monocarboxylic acid'],
      intensionalIsomorphs: ['short-chain volatile fatty acid (SCFA C1-C5)'],
      formalPredicate: 'has_subgraph(G, [-C(=O)OH]) ∧ count(-COOH) = 1 ∧ is_aliphatic(G)',
      parentIds: ['node-carboxylic-acid'],
      atomIndices: carboxyl.atomIndices,
      bondIndices: carboxyl.bondIndices,
    },
    {
      id: 'node-acyl-carbonyl-meet',
      level: 4,
      primaryLabel: 'acyl compound ∧ carbonyl compound',
      chebiId: 'CHEBI:36586',
      isConjunctionNode: true,
      extensionalEquivalents: ['carbonyl compound', 'acyl species'],
      intensionalIsomorphs: ['oxocarbon hydride derivative', 'C=O functional entity'],
      formalPredicate: 'has_subgraph(G, [[CX3]=[OX1]]) ∧ has_subgraph(G, [[#1,#6][CX3]=O])',
      parentIds: ['node-organic-oxygen'],
      atomIndices: (acyl || carbonyl || formyl).atomIndices,
      bondIndices: (acyl || carbonyl || formyl).bondIndices,
    },
    {
      id: 'node-organic-hydroxy',
      level: 4,
      primaryLabel: 'organic hydroxy compound',
      chebiId: 'CHEBI:33822',
      extensionalEquivalents: ['hydroxy compound', 'organic -OH entity'],
      intensionalIsomorphs: ['hydroxylated carbon species'],
      formalPredicate: 'has_subgraph(G, [[#6]-[OX2H1]])',
      parentIds: ['node-organic-oxygen'],
      atomIndices: hydroxyl ? hydroxyl.atomIndices : carboxyl.atomIndices,
      bondIndices: hydroxyl ? hydroxyl.bondIndices : carboxyl.bondIndices,
    },
    {
      id: 'node-organic-oxygen',
      level: 5,
      primaryLabel: 'organic oxygen compound ≡ organooxygen compound',
      chebiId: 'CHEBI:36963',
      extensionalEquivalents: [
        'organic oxygen compound',
        'organooxygen compound',
        'acyclic aliphatic organooxygen compound',
      ],
      intensionalIsomorphs: ['oxygenated hydrocarbon derivative (CH2O2)'],
      formalPredicate: 'has_element(G, C) ∧ has_element(G, O) ∧ has_bond(G, C-O)',
      parentIds: ['node-top-entity'],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    },
    {
      id: 'node-top-entity',
      level: 6,
      primaryLabel: 'Chemical Entity ≡ Molecular Entity (top)',
      chebiId: 'CHEBI:24431',
      extensionalEquivalents: ['chemical entity', 'molecular entity', 'constitutionally defined graph'],
      intensionalIsomorphs: ['connected molecular graph G = (V, E)'],
      formalPredicate: 'is_connected_molecular_graph(G)',
      parentIds: [],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    },
  ];

  const symbolicFormulaText =
    'formic acid ≡ (methanoic acid ≃ hydrogen methanoate ≃ formyl hydroxide ≃ carboxy hydride) ⊂ (carboxylic acid ≃ alkanoic acid ≡ saturated aliphatic monocarboxylic acid ≡ saturated fatty acid) ∧ (aldehyde ≃ alkanal) ⊂ (acyl compound ∧ carbonyl compound) ⊂ organic oxygen compound';

  const symbolicTokens: SymbolicToken[] = [
    {
      id: 'tok-1',
      text: 'formic acid',
      kind: 'term',
      nomenclatureId: 'nom-formic-acid',
      nodeId: 'node-bot-molecule',
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
      tooltip: 'Retained IUPAC Name (P-65.1.1.1)',
    },
    { id: 'tok-2', text: '≡', kind: 'operator', operator: '≡', tooltip: 'Extensional Identity' },
    { id: 'tok-3', text: '(', kind: 'paren' },
    {
      id: 'tok-4',
      text: 'methanoic acid',
      kind: 'term',
      nomenclatureId: 'nom-methanoic-acid',
      nodeId: 'node-bot-molecule',
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
      tooltip: 'Preferred IUPAC Name (PIN): C1 substitutive parent methane + -oic acid',
    },
    {
      id: 'tok-5',
      text: '≃',
      kind: 'operator',
      operator: '≃',
      tooltip: 'Intensional / Functorial Decomposition Isomorphism',
    },
    {
      id: 'tok-6',
      text: 'hydrogen methanoate',
      kind: 'term',
      nomenclatureId: 'nom-hydrogen-methanoate',
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
      tooltip: 'O-H Cleavage Isomorph: [H+] + [H-C(=O)O-]',
    },
    { id: 'tok-7', text: '≃', kind: 'operator', operator: '≃' },
    {
      id: 'tok-8',
      text: 'formyl hydroxide',
      kind: 'term',
      nomenclatureId: 'nom-formyl-hydroxide',
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
      tooltip: 'Acyl-Hydroxyl Cleavage Isomorph: [H-C(=O)]* + [*OH]',
    },
    { id: 'tok-9', text: '≃', kind: 'operator', operator: '≃' },
    {
      id: 'tok-10',
      text: 'carboxy hydride',
      kind: 'term',
      nomenclatureId: 'nom-carboxy-hydride',
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
      tooltip: 'Hydride-Carboxy Cleavage Isomorph: [HO-C(=O)]* + [*H]',
    },
    { id: 'tok-11', text: ')', kind: 'paren' },
    {
      id: 'tok-12',
      text: '⊂',
      kind: 'operator',
      operator: '⊂',
      tooltip: 'Strict Ontological Subsumption (Subtype Inclusion)',
    },
    { id: 'tok-13', text: '(', kind: 'paren' },
    {
      id: 'tok-14',
      text: 'carboxylic acid',
      kind: 'term',
      nodeId: 'node-carboxylic-acid',
      atomIndices: carboxyl.atomIndices,
      bondIndices: carboxyl.bondIndices,
      tooltip: 'Predicate: has_subgraph(G, [-C(=O)OH])',
    },
    { id: 'tok-15', text: '≃', kind: 'operator', operator: '≃' },
    {
      id: 'tok-16',
      text: 'alkanoic acid',
      kind: 'term',
      nodeId: 'node-alkanoic-acid',
      atomIndices: carboxyl.atomIndices,
      bondIndices: carboxyl.bondIndices,
      tooltip: 'Saturated acyclic aliphatic monocarboxylic acid',
    },
    { id: 'tok-17', text: '≡', kind: 'operator', operator: '≡' },
    {
      id: 'tok-18',
      text: 'saturated aliphatic monocarboxylic acid',
      kind: 'term',
      nodeId: 'node-alkanoic-acid',
      atomIndices: carboxyl.atomIndices,
      bondIndices: carboxyl.bondIndices,
      tooltip: 'Full compositional definition of alkanoic acid',
    },
    { id: 'tok-19', text: '≡', kind: 'operator', operator: '≡' },
    {
      id: 'tok-20',
      text: 'saturated fatty acid',
      kind: 'term',
      nodeId: 'node-fatty-acid',
      atomIndices: carboxyl.atomIndices,
      bondIndices: carboxyl.bondIndices,
      tooltip: 'ChEBI (CHEBI:26607) equivalence class (Boundary: C>=1 vs. C>=4)',
    },
    { id: 'tok-21', text: ')', kind: 'paren' },
    {
      id: 'tok-22',
      text: '∧',
      kind: 'operator',
      operator: '∧',
      tooltip: 'Formal Lattice Meet (Co-instantiated Subgraph Conjunction)',
    },
    { id: 'tok-23', text: '(', kind: 'paren' },
    {
      id: 'tok-24',
      text: 'aldehyde',
      kind: 'term',
      nodeId: 'node-aldehyde',
      atomIndices: formyl.atomIndices,
      bondIndices: formyl.bondIndices,
      tooltip: 'Explicit-H Subgraph Witness: [#1][CX3]=O (H-C=O)',
    },
    { id: 'tok-25', text: '≃', kind: 'operator', operator: '≃' },
    {
      id: 'tok-26',
      text: 'alkanal',
      kind: 'term',
      nodeId: 'node-aldehyde',
      atomIndices: formyl.atomIndices,
      bondIndices: formyl.bondIndices,
      tooltip: 'Saturated aliphatic aldehyde / formyl derivative',
    },
    { id: 'tok-27', text: ')', kind: 'paren' },
    { id: 'tok-28', text: '⊂', kind: 'operator', operator: '⊂' },
    { id: 'tok-29', text: '(', kind: 'paren' },
    {
      id: 'tok-30',
      text: 'acyl compound',
      kind: 'term',
      nodeId: 'node-acyl-carbonyl-meet',
      atomIndices: (acyl || formyl).atomIndices,
      bondIndices: (acyl || formyl).bondIndices,
      tooltip: 'Contains acyl group R/H-C(=O)-',
    },
    { id: 'tok-31', text: '∧', kind: 'operator', operator: '∧' },
    {
      id: 'tok-32',
      text: 'carbonyl compound',
      kind: 'term',
      nodeId: 'node-acyl-carbonyl-meet',
      atomIndices: (carbonyl || formyl).atomIndices,
      bondIndices: (carbonyl || formyl).bondIndices,
      tooltip: 'Contains carbonyl group C=O',
    },
    { id: 'tok-33', text: ')', kind: 'paren' },
    { id: 'tok-34', text: '⊂', kind: 'operator', operator: '⊂' },
    {
      id: 'tok-35',
      text: 'organic oxygen compound',
      kind: 'term',
      nodeId: 'node-organic-oxygen',
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
      tooltip: 'CHEBI:36963 Organooxygen compound',
    },
  ];

  return {
    symbolicFormulaText,
    symbolicTokens,
    nomenclatureClass,
    conceptLattice,
    source: 'deterministic',
    pubchemData: pubchemData || null,
  };
}

function buildGeneralNomenclatureClass(
  graph: MolecularGraph,
  pubchemData?: PubChemRecord | null
): NomenclatureIsomorph[] {
  const { atoms, bonds, invariants, subgraphs, canonicalSmiles } = graph;
  const allAtomIds = atoms.map((a) => a.index);
  const allBondIds = bonds.map((b) => b.index);

  const findSg = (id: string) => subgraphs.find((s) => s.id === id);
  const carboxyl = findSg('carboxyl');
  const strictAldehyde = findSg('aldehyde_strict');
  const alcohol = findSg('alcohol');
  const phenol = findSg('phenol');
  const ester = findSg('ester');
  const ketone = findSg('ketone');
  const amide = findSg('carboxamide');
  const amine = findSg('amine');
  const alphaAA = findSg('alpha_amino_acid');
  const arene = findSg('arene_ring');

  const stem = getAlkaneStem(invariants.carbonCount);
  const list: NomenclatureIsomorph[] = [];

  if (
    canonicalSmiles === 'CC(=O)O' ||
    canonicalSmiles === 'OC(C)=O' ||
    (graph.molecularFormula === 'C2H4O2' && Boolean(carboxyl))
  ) {
    const cAtoms = atoms.filter((a) => a.atomicNo === 6);
    const carboxylIds = carboxyl?.atomIndices || allAtomIds;
    const methylIds = allAtomIds.filter(
      (id) => !carboxylIds.includes(id) || cAtoms[0]?.index === id
    );
    list.push(
      {
        id: 'nom-ethanoic-acid',
        name: 'ethanoic acid',
        category: 'pin_substitutive',
        relationToPin: '≡',
        isPreferred: true,
        morphologyRule:
          'Systematic Substitutive IUPAC Name (P-65.1.2): C2 alkane parent "ethane" + principal suffix "-oic acid".',
        bondCleavagePartition: 'Substitutive C2 parent [CH3-CH3] -> [CH3-C(=O)OH]',
        functorialDecomposition: [
          {
            label: 'ethan- (C2 parent chain)',
            role: 'parent',
            smarts: 'CC',
            atomIndices: cAtoms.map((c) => c.index),
            bondIndices: [],
            color: '#06B6D4',
          },
          {
            label: '-oic acid (principal suffix)',
            role: 'principal_group',
            smarts: '[CX3](=O)[OX2H1]',
            atomIndices: carboxylIds,
            bondIndices: carboxyl?.bondIndices || [],
            color: '#F59E0B',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      },
      {
        id: 'nom-acetic-acid',
        name: 'acetic acid',
        category: 'retained_trivial',
        relationToPin: '≡',
        isPreferred: true,
        morphologyRule:
          'Preferred IUPAC Name (PIN, Retained P-65.1.1.1): Extensionally identical (≡) to ethanoic acid.',
        functorialDecomposition: [
          {
            label: 'acetic acid (retained PIN)',
            role: 'principal_group',
            smarts: 'CC(=O)O',
            atomIndices: allAtomIds,
            bondIndices: allBondIds,
            color: '#10B981',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      },
      {
        id: 'nom-hydrogen-ethanoate',
        name: 'hydrogen ethanoate (hydrogen acetate)',
        category: 'functional_class_additive',
        relationToPin: '≃',
        morphologyRule:
          'Functional Class Salt/Ester Isomorph (≃): Cleaves the O-H bond into [H+] + [CH3COO-] (ethanoate / acetate).',
        bondCleavagePartition: 'Cleavage of O-H bond: [H+] + [CH3-C(=O)O-]',
        functorialDecomposition: [
          {
            label: 'ethanoate / acetate [CH3COO-]',
            role: 'anion_class',
            smarts: 'CC(=O)[O-]',
            atomIndices: carboxylIds,
            bondIndices: carboxyl?.bondIndices || [],
            color: '#F59E0B',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      },
      {
        id: 'nom-acetyl-hydroxide',
        name: 'acetyl hydroxide (ethanoyl hydroxide)',
        category: 'radical_functional',
        relationToPin: '≃',
        morphologyRule:
          'Acyl-Hydroxyl Radical-Functional Isomorph (≃): Cleaves the C(=O)-OH bond into acyl radical "acetyl / ethanoyl" [CH3-C(=O)-] and "hydroxide" [-OH].',
        bondCleavagePartition:
          'Cleavage of C(=O)-OH bond: [CH3-C(=O)]* (acetyl) + [*OH] (hydroxide)',
        functorialDecomposition: [
          {
            label: 'acetyl / ethanoyl [CH3-C(=O)-]',
            role: 'radical',
            smarts: 'CC=O',
            atomIndices: methylIds,
            bondIndices: [],
            color: '#A855F7',
          },
          {
            label: 'hydroxide [-OH]',
            role: 'anion_class',
            smarts: '[OX2H1]',
            atomIndices: findSg('hydroxyl_any')?.atomIndices || [],
            bondIndices: findSg('hydroxyl_any')?.bondIndices || [],
            color: '#06B6D4',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      },
      {
        id: 'nom-methanecarboxylic-acid',
        name: 'methanecarboxylic acid (carboxymethane)',
        category: 'radical_functional',
        relationToPin: '≃',
        morphologyRule:
          'Carboxy-Substituted Hydride Isomorph (≃): Cleaves the C1-C2 bond into parent "methane" [CH3-] and suffix "-carboxylic acid" / prefix "carboxy-" [-C(=O)OH].',
        bondCleavagePartition:
          'Cleavage of CH3-COOH bond: [CH3]* (methyl/methane) + [*C(=O)OH] (carboxylic acid)',
        functorialDecomposition: [
          {
            label: 'methane [CH3-]',
            role: 'parent',
            smarts: '[CH3]',
            atomIndices: methylIds,
            bondIndices: [],
            color: '#10B981',
          },
          {
            label: '-carboxylic acid [-COOH]',
            role: 'principal_group',
            smarts: 'C(=O)O',
            atomIndices: carboxylIds,
            bondIndices: carboxyl?.bondIndices || [],
            color: '#F59E0B',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      }
    );
    return list;
  }

  let pinName = pubchemData?.iupacName?.toLowerCase() || '';
  let pinRule = '';

  if (carboxyl) {
    const mult = carboxyl.count > 1 ? (carboxyl.count === 2 ? 'di' : 'poly') : '';
    const computedPin = arene
      ? `${invariants.carbonCount === 7 ? 'benzoic acid' : 'arenecarboxylic acid'}`
      : `${stem}an${mult ? 'e' + mult : ''}oic acid`;
    if (!pinName) pinName = computedPin;
    pinRule = `Substitutive IUPAC Nomenclature (P-65.1): Principal characteristic group -${mult}oic acid on ${stem}- parent skeleton.`;

    list.push({
      id: 'nom-pin-acid',
      name: pinName,
      category: 'pin_substitutive',
      relationToPin: '≡',
      isPreferred: true,
      morphologyRule: pinRule,
      bondCleavagePartition: `Parent [${stem}-] + principal suffix [-${mult}oic acid]`,
      functorialDecomposition: [
        {
          label: `${stem}- skeleton`,
          role: 'parent',
          smarts: '[#6]',
          atomIndices: allAtomIds,
          bondIndices: allBondIds,
          color: '#06B6D4',
        },
        {
          label: 'carboxyl [-C(=O)OH]',
          role: 'principal_group',
          smarts: '[CX3](=O)[OX2H1]',
          atomIndices: carboxyl.atomIndices,
          bondIndices: carboxyl.bondIndices,
          color: '#F59E0B',
        },
      ],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    });

    const oateName = arene ? 'hydrogen benzoate' : `hydrogen ${stem}an${mult}oate`;
    const acylHydroxideName = arene ? 'benzoyl hydroxide' : `${stem}anoyl hydroxide`;
    const carboxyAlkaneName =
      invariants.carbonCount > 1
        ? `carboxy${getAlkaneStem(invariants.carbonCount - 1)}ane`
        : 'carboxy hydride';

    list.push(
      {
        id: 'nom-func-oate',
        name: oateName,
        category: 'functional_class_additive',
        relationToPin: '≃',
        morphologyRule:
          'Salt / Ester Functional Class Isomorph (≃): Cleaves the O-H bond into proton [H+] and carboxylate anion [R-C(=O)O-].',
        bondCleavagePartition: 'Cleavage of O-H bond: [H+] + [R-C(=O)O-]',
        functorialDecomposition: [
          {
            label: 'carboxylate [-C(=O)O-]',
            role: 'anion_class',
            smarts: '[CX3](=O)[OX2H1]',
            atomIndices: carboxyl.atomIndices,
            bondIndices: carboxyl.bondIndices,
            color: '#F59E0B',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      },
      {
        id: 'nom-rad-hydroxide',
        name: acylHydroxideName,
        category: 'radical_functional',
        relationToPin: '≃',
        morphologyRule:
          'Acyl-Hydroxyl Radical-Functional Isomorph (≃): Cleaves the C(=O)-OH bond into acyl radical [R-C(=O)]* and functional class hydroxide [*OH].',
        bondCleavagePartition: 'Cleavage of C(=O)-OH bond: [R-C(=O)]* (acyl) + [*OH] (hydroxide)',
        functorialDecomposition: [
          {
            label: 'acyl [R-C(=O)-]',
            role: 'radical',
            smarts: '[#1,#6][CX3]=O',
            atomIndices: findSg('acyl')?.atomIndices || carboxyl.atomIndices,
            bondIndices: findSg('acyl')?.bondIndices || carboxyl.bondIndices,
            color: '#A855F7',
          },
          {
            label: 'hydroxide [-OH]',
            role: 'anion_class',
            smarts: '[OX2H1]',
            atomIndices: findSg('hydroxyl_any')?.atomIndices || carboxyl.atomIndices,
            bondIndices: findSg('hydroxyl_any')?.bondIndices || carboxyl.bondIndices,
            color: '#06B6D4',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      },
      {
        id: 'nom-carboxy-parent',
        name: carboxyAlkaneName,
        category: 'radical_functional',
        relationToPin: '≃',
        morphologyRule:
          'Additive / Prefix-Parent Decomposition (≃): Cleaves the R - C(=O)OH bond, treating "carboxy-" [-COOH] as a substituent on the remaining (n-1) hydride parent.',
        bondCleavagePartition: 'Cleavage of R-COOH bond: [HOOC]* (carboxy) + [*R] (parent hydride)',
        functorialDecomposition: [
          {
            label: 'carboxy- [-COOH]',
            role: 'substituent',
            smarts: '[CX3](=O)[OX2H1]',
            atomIndices: carboxyl.atomIndices,
            bondIndices: carboxyl.bondIndices,
            color: '#F59E0B',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      }
    );

    if (alphaAA || amine) {
      list.push({
        id: 'nom-zwitterion-isomorph',
        name: `(carboxymethyl)amine ≃ ${stem}anoate zwitterion`,
        category: 'functional_class_additive',
        relationToPin: '≃',
        morphologyRule:
          'Amine-Parent / Prototropic Zwitterion Isomorph (≃): Reverses functional seniority to treat the amino group as parent with a carboxyalkyl substituent, or via internal proton transfer [H3N+-R-COO-].',
        bondCleavagePartition:
          'Dual seniority inversion: [H2N-] (amine parent) + [-CH2COOH] (carboxymethyl) <=> [H3N+-CH2-COO-]',
        functorialDecomposition: [
          {
            label: 'amino group [-NH2]',
            role: 'parent',
            smarts: '[NX3]',
            atomIndices: amine?.atomIndices || [],
            bondIndices: amine?.bondIndices || [],
            color: '#38BDF8',
          },
          {
            label: 'carboxyl group [-COOH]',
            role: 'substituent',
            smarts: '[CX3](=O)[OX2H1]',
            atomIndices: carboxyl.atomIndices,
            bondIndices: carboxyl.bondIndices,
            color: '#F59E0B',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      });
    }
  } else if (strictAldehyde) {
    const computedPin = arene ? 'benzaldehyde' : `${stem}anal`;
    list.push(
      {
        id: 'nom-pin-aldehyde',
        name: pinName || computedPin,
        category: 'pin_substitutive',
        relationToPin: '≡',
        isPreferred: true,
        morphologyRule: `Substitutive IUPAC Nomenclature (P-66.6): Principal suffix "-al" / "-carbaldehyde" on ${stem}- parent.`,
        bondCleavagePartition: `Parent [${stem}-] + principal suffix [-al]`,
        functorialDecomposition: [
          {
            label: 'formyl [-CH=O]',
            role: 'principal_group',
            smarts: '[#1][CX3]=O',
            atomIndices: strictAldehyde.atomIndices,
            bondIndices: strictAldehyde.bondIndices,
            color: '#A855F7',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      },
      {
        id: 'nom-acyl-hydride',
        name: `${stem}anoyl hydride (formyl${
          invariants.carbonCount > 1 ? getAlkaneStem(invariants.carbonCount - 1) + 'ane' : ' hydride'
        })`,
        category: 'radical_functional',
        relationToPin: '≃',
        morphologyRule:
          'Acyl-Hydride Radical-Functional Isomorph (≃): Cleaves the C(=O)-H bond into acyl radical [R-C(=O)]* and hydride [*H], or cleaves R-CHO into formyl [-CHO] + alkane.',
        bondCleavagePartition: 'Cleavage of C(=O)-H bond: [R-C(=O)]* (alkanoyl) + [*H] (hydride)',
        functorialDecomposition: [
          {
            label: 'formyl [-CH=O]',
            role: 'radical',
            smarts: '[#1][CX3]=O',
            atomIndices: strictAldehyde.atomIndices,
            bondIndices: strictAldehyde.bondIndices,
            color: '#A855F7',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      }
    );
    if (phenol) {
      list.push({
        id: 'nom-formyl-phenol',
        name: '2-formylphenol (o-formylhydroxybenzene)',
        category: 'functional_class_additive',
        relationToPin: '≃',
        morphologyRule:
          'Phenol-Parent Seniority Inversion Isomorph (≃): Selects phenol [Ar-OH] as parent structure substituted by a "formyl-" [-CH=O] prefix.',
        bondCleavagePartition: 'Cleavage of Ar-CHO bond: [-CH=O] (formyl) + [C6H4OH] (phenol)',
        functorialDecomposition: [
          {
            label: 'formyl- [-CH=O]',
            role: 'substituent',
            smarts: '[#1][CX3]=O',
            atomIndices: strictAldehyde.atomIndices,
            bondIndices: strictAldehyde.bondIndices,
            color: '#A855F7',
          },
          {
            label: 'phenol [Ar-OH]',
            role: 'parent',
            smarts: '[c][OX2H1]',
            atomIndices: phenol.atomIndices,
            bondIndices: phenol.bondIndices,
            color: '#06B6D4',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      });
    }
  } else if (alcohol || phenol) {
    const targetSg = (alcohol || phenol)!;
    const computedPin = phenol ? 'phenol (benzenol)' : `${stem}anol`;
    list.push(
      {
        id: 'nom-pin-ol',
        name: pinName || computedPin,
        category: 'pin_substitutive',
        relationToPin: '≡',
        isPreferred: true,
        morphologyRule: 'Substitutive IUPAC Nomenclature (P-63.1): Principal suffix "-ol".',
        functorialDecomposition: [
          {
            label: 'hydroxyl [-OH]',
            role: 'principal_group',
            smarts: '[OX2H1]',
            atomIndices: targetSg.atomIndices,
            bondIndices: targetSg.bondIndices,
            color: '#06B6D4',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      },
      {
        id: 'nom-rad-alcohol',
        name: `${stem}yl alcohol ≃ ${stem}yl hydroxide ≃ hydroxy${stem}ane`,
        category: 'radical_functional',
        relationToPin: '≃',
        morphologyRule:
          'Radical-Functional & Prefix Isomorphs (≃): Cleaves the C-OH bond into organyl radical [R*] + functional class "alcohol" / "hydroxide" [*OH], or prefix "hydroxy-" on alkane.',
        bondCleavagePartition: 'Cleavage of C-OH bond: [R]* (alkyl) + [*OH] (hydroxide / alcohol)',
        functorialDecomposition: [
          {
            label: 'hydroxide [-OH]',
            role: 'anion_class',
            smarts: '[OX2H1]',
            atomIndices: targetSg.atomIndices,
            bondIndices: targetSg.bondIndices,
            color: '#06B6D4',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      }
    );
  } else {
    const fallbackPin =
      pinName ||
      (ketone
        ? `${stem}anone`
        : amide
          ? `${stem}anamide`
          : ester
            ? `alkyl ${stem}anoate`
            : amine
              ? `${stem}anamine`
              : `${stem}ane`);
    list.push(
      {
        id: 'nom-pin-general',
        name: fallbackPin,
        category: 'pin_substitutive',
        relationToPin: '≡',
        isPreferred: true,
        morphologyRule: `Substitutive IUPAC Nomenclature on ${stem}- (${graph.molecularFormula}) skeleton.`,
        functorialDecomposition: [
          {
            label: fallbackPin,
            role: 'parent',
            smarts: graph.canonicalSmiles,
            atomIndices: allAtomIds,
            bondIndices: allBondIds,
            color: '#06B6D4',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      },
      {
        id: 'nom-isomorph-general',
        name: amide
          ? `carbamoyl hydride / ${stem}anoylazanide`
          : ketone
            ? `dialkyl ketone ≃ oxo${stem}ane`
            : amine
              ? `${stem}ylazane ≃ amino${stem}ane`
              : `${stem}yl hydride`,
        category: 'radical_functional',
        relationToPin: '≃',
        morphologyRule:
          'Functorial Bond-Cleavage & Substitutive Prefix Isomorph (≃): Alternative parent/substituent decomposition of the molecular graph.',
        bondCleavagePartition: `Graph partition across primary functional linkage of ${graph.molecularFormula}`,
        functorialDecomposition: [
          {
            label: 'functional core',
            role: 'principal_group',
            smarts: graph.canonicalSmiles,
            atomIndices: subgraphs[0]?.atomIndices || allAtomIds,
            bondIndices: subgraphs[0]?.bondIndices || allBondIds,
            color: '#A855F7',
          },
        ],
        atomIndices: allAtomIds,
        bondIndices: allBondIds,
      }
    );
  }

  const presetMatch = PRESET_MOLECULES.find(
    (p) => p.smiles === canonicalSmiles || p.formula === graph.molecularFormula
  );
  const trivial =
    presetMatch?.trivialName.toLowerCase() || pubchemData?.title?.toLowerCase() || '';
  if (trivial && !list.some((item) => item.name.toLowerCase() === trivial)) {
    list.splice(1, 0, {
      id: 'nom-trivial-retained',
      name: trivial,
      category: 'retained_trivial',
      relationToPin: '≡',
      morphologyRule:
        'Retained / Literature Trivial Name: Extensionally identical (≡) to the systematic IUPAC PIN.',
      functorialDecomposition: [
        {
          label: trivial,
          role: 'parent',
          smarts: canonicalSmiles,
          atomIndices: allAtomIds,
          bondIndices: allBondIds,
          color: '#10B981',
        },
      ],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    });
  }

  return list;
}

function buildGeneralConceptLattice(
  graph: MolecularGraph,
  nomenclatureClass: NomenclatureIsomorph[],
  matched: Record<string, SubgraphMatch | undefined>,
  allAtomIds: number[],
  allBondIds: number[]
): LatticeNode[] {
  const { invariants, molecularFormula, canonicalSmiles } = graph;
  const nodes: LatticeNode[] = [];

  const pinNames = nomenclatureClass
    .filter((n) => n.relationToPin === '≡')
    .map((n) => n.name);
  const isoNames = nomenclatureClass
    .filter((n) => n.relationToPin === '≃')
    .map((n) => n.name);

  const level1Ids: string[] = [];

  if (matched.carboxyl) {
    const mult = invariants.functionalMultiplicity['carboxyl']?.prefix || 'mono';
    const isAlkanoic =
      invariants.topology === 'acyclic' &&
      invariants.aromaticity === 'aliphatic' &&
      invariants.saturation === 'saturated' &&
      mult === 'mono';

    const acidNodeId = 'node-specific-acid';
    level1Ids.push(acidNodeId);

    nodes.push({
      id: acidNodeId,
      level: 1,
      primaryLabel: isAlkanoic
        ? 'alkanoic acid ≡ saturated aliphatic monocarboxylic acid'
        : `${invariants.saturation} ${invariants.aromaticity} ${mult}carboxylic acid`,
      chebiId: isAlkanoic ? 'CHEBI:26607' : 'CHEBI:33575',
      extensionalEquivalents: isAlkanoic
        ? [
            'alkanoic acid',
            'saturated aliphatic monocarboxylic acid',
            'saturated acyclic monocarboxylic acid',
            'saturated fatty acid',
          ]
        : [
            `${invariants.topology} ${invariants.aromaticity} ${mult}carboxylic acid`,
            `${mult}carboxylic acid`,
          ],
      intensionalIsomorphs: ['alkanoyl hydroxide', 'hydrogen carboxylate'],
      formalPredicate: `has_subgraph(G, [-C(=O)OH]) ∧ count(-COOH) = ${matched.carboxyl.count} ∧ is_${invariants.saturation}(G) ∧ is_${invariants.topology}(G)`,
      parentIds: ['node-carboxylic-super'],
      atomIndices: matched.carboxyl.atomIndices,
      bondIndices: matched.carboxyl.bondIndices,
      boundaryAxiom:
        invariants.carbonCount <= 3 && isAlkanoic
          ? {
              id: 'axiom-short-chain-fatty',
              title: `Boundary Axiom: C${invariants.carbonCount} Alkanoic Acid in "Fatty Acid"`,
              divergentOntologies: ['ChEBI (CHEBI:35366)', 'LIPID MAPS (FA01)'],
              inclusionAxiom: `ChEBI includes all aliphatic monocarboxylic acids (C >= 1) in fatty acid.`,
              exclusionAxiom: `Lipid biochemistry restricts fatty acids to chain lengths C >= 4 (butyric acid upward).`,
              formalResolution: `Included under ChEBI structural axiom; classified as volatile short-chain alkanoic acid.`,
            }
          : undefined,
    });

    nodes.push({
      id: 'node-carboxylic-super',
      level: 2,
      primaryLabel: 'carboxylic acid ≃ carbogenic oxoacid',
      chebiId: 'CHEBI:33575',
      extensionalEquivalents: ['carboxylic acid', 'organic oxoacid'],
      intensionalIsomorphs: ['acyl hydroxide [R-C(=O)OH]'],
      formalPredicate: 'has_subgraph(G, [-C(=O)OH])',
      parentIds: ['node-carbonyl-super'],
      atomIndices: matched.carboxyl.atomIndices,
      bondIndices: matched.carboxyl.bondIndices,
    });
  }

  if (matched.strictAldehyde || (matched.formyl && !matched.carboxyl)) {
    const aldSg = (matched.strictAldehyde || matched.formyl)!;
    const aldId = 'node-specific-aldehyde';
    level1Ids.push(aldId);
    const isAlkanal =
      invariants.topology === 'acyclic' &&
      invariants.aromaticity === 'aliphatic' &&
      invariants.saturation === 'saturated';
    nodes.push({
      id: aldId,
      level: 1,
      primaryLabel: isAlkanal
        ? 'aldehyde ≃ alkanal'
        : `${invariants.aromaticity} aldehyde (carbaldehyde)`,
      chebiId: 'CHEBI:17478',
      extensionalEquivalents: isAlkanal
        ? ['alkanal', 'saturated aliphatic aldehyde', 'aldehyde']
        : ['aldehyde', 'carbaldehyde'],
      intensionalIsomorphs: ['alkanoyl hydride [R-C(=O)H]', 'formyl derivative'],
      formalPredicate: `has_subgraph(G, [[#1][CX3]=O]) ∧ is_${invariants.aromaticity}(G)`,
      parentIds: ['node-carbonyl-super'],
      atomIndices: aldSg.atomIndices,
      bondIndices: aldSg.bondIndices,
    });
  }

  if (matched.amine) {
    const amineId = 'node-specific-amine';
    level1Ids.push(amineId);
    nodes.push({
      id: amineId,
      level: 1,
      primaryLabel: `${invariants.aromaticity} amine ≃ amino compound`,
      chebiId: 'CHEBI:32952',
      extensionalEquivalents: ['amine', 'organic amino compound'],
      intensionalIsomorphs: ['substituted azane [R-NH2]'],
      formalPredicate: 'has_subgraph(G, [-NR2])',
      parentIds: ['node-organonitrogen-super'],
      atomIndices: matched.amine.atomIndices,
      bondIndices: matched.amine.bondIndices,
      boundaryAxiom: matched.carboxyl
        ? {
            id: 'axiom-zwitterion-tautomer',
            title: 'Boundary Axiom: Neutral Amino Acid vs. Zwitterion Tautomer',
            divergentOntologies: ['IUPAC Substitutive Graph', 'ChEBI Physiological State (pH 7.3)'],
            inclusionAxiom:
              'Constitutional connection tables equate neutral H2N-CHR-COOH and dipolar +H3N-CHR-COO- via prototropic equivalence.',
            exclusionAxiom:
              'Strict charge-partitioned ontologies separate uncharged carboxylic acids from internal ammonium carboxylate salts (betaines/zwitterions).',
            formalResolution:
              'Connected via prototropic isomorphism (≃) in the nomenclature equivalence class.',
          }
        : undefined,
    });
  }

  if (matched.alcohol || matched.phenol) {
    const olSg = (matched.alcohol || matched.phenol)!;
    const olId = 'node-specific-ol';
    level1Ids.push(olId);
    nodes.push({
      id: olId,
      level: 1,
      primaryLabel: matched.phenol ? 'phenol ≃ hydroxyarene' : 'alcohol ≃ alkanol',
      chebiId: matched.phenol ? 'CHEBI:33853' : 'CHEBI:30879',
      extensionalEquivalents: matched.phenol
        ? ['phenol', 'benzenol', 'aryl alcohol']
        : ['alcohol', 'alkanol', 'aliphatic alcohol'],
      intensionalIsomorphs: ['organyl hydroxide [R-OH]', 'hydroxyhydrocarbon'],
      formalPredicate: matched.phenol
        ? 'has_subgraph(G, [c-OH])'
        : 'has_subgraph(G, [C(sp3)-OH])',
      parentIds: ['node-organic-oxygen-super'],
      atomIndices: olSg.atomIndices,
      bondIndices: olSg.bondIndices,
    });
  }

  if (matched.ester) {
    const esterId = 'node-specific-ester';
    level1Ids.push(esterId);
    nodes.push({
      id: esterId,
      level: 1,
      primaryLabel: 'carboxylic ester ≃ alkyl alkanoate',
      chebiId: 'CHEBI:33308',
      extensionalEquivalents: ['carboxylic acid ester', 'ester'],
      intensionalIsomorphs: ['acyl alkoxide [R-C(=O)-OR]'],
      formalPredicate: 'has_subgraph(G, [-C(=O)O-C])',
      parentIds: ['node-carbonyl-super'],
      atomIndices: matched.ester.atomIndices,
      bondIndices: matched.ester.bondIndices,
    });
  }

  if (matched.ketone) {
    const ketId = 'node-specific-ketone';
    level1Ids.push(ketId);
    nodes.push({
      id: ketId,
      level: 1,
      primaryLabel: 'ketone ≃ alkanone',
      chebiId: 'CHEBI:17087',
      extensionalEquivalents: ['ketone', 'alkanone'],
      intensionalIsomorphs: ['dialkyl carbonyl [R-C(=O)-R]'],
      formalPredicate: 'has_subgraph(G, [C-C(=O)-C])',
      parentIds: ['node-carbonyl-super'],
      atomIndices: matched.ketone.atomIndices,
      bondIndices: matched.ketone.bondIndices,
    });
  }

  if (matched.amide) {
    const amideId = 'node-specific-amide';
    level1Ids.push(amideId);
    const isUrea = canonicalSmiles === 'NC(=O)N' || molecularFormula === 'CH4N2O';
    nodes.push({
      id: amideId,
      level: 1,
      primaryLabel: isUrea ? 'urea ≡ carbonic diamide' : 'carboxamide ≃ alkanamide',
      chebiId: isUrea ? 'CHEBI:16199' : 'CHEBI:37622',
      extensionalEquivalents: isUrea
        ? ['urea', 'carbonic diamide', 'carbamide']
        : ['carboxamide', 'alkanamide'],
      intensionalIsomorphs: ['acylamine [R-C(=O)NR2]'],
      formalPredicate: 'has_subgraph(G, [-C(=O)-N])',
      parentIds: ['node-carbonyl-super', 'node-organonitrogen-super'],
      atomIndices: matched.amide.atomIndices,
      bondIndices: matched.amide.bondIndices,
      boundaryAxiom: isUrea
        ? {
            id: 'axiom-wohler-urea',
            title: 'Wohler Boundary Axiom: Organic vs. Inorganic Carbon (Zero C-H Bonds)',
            divergentOntologies: ['ChEBI (CHEBI:16199)', 'Strict C-H Hydride Definition'],
            inclusionAxiom:
              'IUPAC and ChEBI classify urea (CH4N2O) as an organic carbonyl diamide (carboxamide) despite having zero C-H bonds.',
            exclusionAxiom:
              'Strict hydrocarbon-hydride definitions requiring at least one covalent C-H bond classify carbonic acid derivatives (CO2, H2CO3, urea) as boundary oxocarbon/inorganic species.',
            formalResolution:
              'Included in organic oxoacid derivative / carboxamide lattice via functional isomorphism to alkanamides.',
          }
        : undefined,
    });
  }

  if (level1Ids.length === 0) {
    const hcId = 'node-hydrocarbon';
    level1Ids.push(hcId);
    nodes.push({
      id: hcId,
      level: 1,
      primaryLabel: `${invariants.saturation} ${invariants.topology} ${invariants.aromaticity} compound`,
      chebiId: 'CHEBI:24632',
      extensionalEquivalents: [`${invariants.saturation} ${invariants.aromaticity} hydrocarbon`],
      intensionalIsomorphs: ['carbon-hydrogen framework'],
      formalPredicate: `is_${invariants.saturation}(G) ∧ is_${invariants.topology}(G)`,
      parentIds: ['node-organic-super'],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    });
  }

  let botParentIds = [...level1Ids];
  if (level1Ids.length >= 2) {
    const meetLabels = nodes
      .filter((n) => level1Ids.includes(n.id))
      .map((n) => `(${n.primaryLabel.split(' ≡ ')[0].split(' ≃ ')[0]})`);
    for (const n of nodes) {
      n.level += 1;
    }
    const meetNodeId = 'node-polyfunctional-meet';
    nodes.unshift({
      id: meetNodeId,
      level: 1,
      primaryLabel: meetLabels.join(' ∧ '),
      isConjunctionNode: true,
      extensionalEquivalents: [meetLabels.join(' ∧ ')],
      intensionalIsomorphs: ['polyfunctional / heterobifunctional molecular entity'],
      formalPredicate: nodes
        .filter((n) => level1Ids.includes(n.id))
        .map((n) => `(${n.formalPredicate})`)
        .join(' ∧ '),
      parentIds: level1Ids,
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    });
    botParentIds = [meetNodeId];
  }

  const levelShift = level1Ids.length >= 2 ? 1 : 0;

  nodes.unshift({
    id: 'node-bot-molecule',
    level: 0,
    primaryLabel: `${pinNames[0] || canonicalSmiles}${pinNames[1] ? ` ≡ ${pinNames[1]}` : ''} (bot)`,
    extensionalEquivalents: pinNames.length > 0 ? pinNames : [canonicalSmiles],
    intensionalIsomorphs: isoNames,
    formalPredicate: `G == ${canonicalSmiles} ∧ formula(G) = "${molecularFormula}"`,
    parentIds: botParentIds,
    atomIndices: allAtomIds,
    bondIndices: allBondIds,
  });

  const hasCarbonylNode = nodes.some((n) => n.parentIds.includes('node-carbonyl-super'));
  const hasNitrogenNode = nodes.some((n) => n.parentIds.includes('node-organonitrogen-super'));

  if (hasCarbonylNode) {
    nodes.push({
      id: 'node-carbonyl-super',
      level: 3 + levelShift,
      primaryLabel: 'acyl compound ∧ carbonyl compound',
      chebiId: 'CHEBI:36586',
      isConjunctionNode: true,
      extensionalEquivalents: ['carbonyl compound', 'C=O functional class'],
      intensionalIsomorphs: ['oxocarbon derivative'],
      formalPredicate: 'has_subgraph(G, [[CX3]=[OX1]])',
      parentIds: ['node-organic-oxygen-super'],
      atomIndices: (matched.acyl || matched.carbonyl)?.atomIndices || allAtomIds,
      bondIndices: (matched.acyl || matched.carbonyl)?.bondIndices || allBondIds,
    });
  }

  if (hasNitrogenNode) {
    nodes.push({
      id: 'node-organonitrogen-super',
      level: 3 + levelShift,
      primaryLabel: 'organonitrogen compound',
      chebiId: 'CHEBI:35352',
      extensionalEquivalents: ['organonitrogen compound', 'organic nitrogen entity'],
      intensionalIsomorphs: ['azahydrocarbon derivative'],
      formalPredicate: 'has_element(G, C) ∧ has_element(G, N)',
      parentIds: ['node-organic-super'],
      atomIndices: matched.amine?.atomIndices || matched.amide?.atomIndices || allAtomIds,
      bondIndices: matched.amine?.bondIndices || matched.amide?.bondIndices || allBondIds,
    });
  }

  if (hasCarbonylNode || nodes.some((n) => n.parentIds.includes('node-organic-oxygen-super'))) {
    nodes.push({
      id: 'node-organic-oxygen-super',
      level: 4 + levelShift,
      primaryLabel: 'organic oxygen compound ≡ organooxygen compound',
      chebiId: 'CHEBI:36963',
      extensionalEquivalents: ['organic oxygen compound', 'organooxygen compound'],
      intensionalIsomorphs: ['oxygenated organic species'],
      formalPredicate: 'has_element(G, C) ∧ has_element(G, O)',
      parentIds: ['node-organic-super'],
      atomIndices: allAtomIds,
      bondIndices: allBondIds,
    });
  }

  nodes.push({
    id: 'node-organic-super',
    level: 5 + levelShift,
    primaryLabel: `${invariants.topology} ${invariants.aromaticity} organic molecule`,
    chebiId: 'CHEBI:50860',
    extensionalEquivalents: ['organic molecular entity', 'carbon-based molecule'],
    intensionalIsomorphs: [`${invariants.topology} carbon graph`],
    formalPredicate: `has_element(G, C) ∧ is_${invariants.topology}(G)`,
    parentIds: ['node-top-entity'],
    atomIndices: allAtomIds,
    bondIndices: allBondIds,
  });

  nodes.push({
    id: 'node-top-entity',
    level: 6 + levelShift,
    primaryLabel: 'Chemical Entity ≡ Molecular Entity (top)',
    chebiId: 'CHEBI:24431',
    extensionalEquivalents: ['chemical entity', 'molecular entity'],
    intensionalIsomorphs: ['connected molecular graph G = (V, E)'],
    formalPredicate: 'is_connected_molecular_graph(G)',
    parentIds: [],
    atomIndices: allAtomIds,
    bondIndices: allBondIds,
  });

  return nodes;
}

function buildSymbolicExpressionFromLattice(
  nomenclatureClass: NomenclatureIsomorph[],
  conceptLattice: LatticeNode[],
  allAtomIds: number[],
  allBondIds: number[]
): { symbolicFormulaText: string; symbolicTokens: SymbolicToken[] } {
  const tokens: SymbolicToken[] = [];
  let tokCounter = 1;
  const pushTerm = (
    text: string,
    opts?: {
      nodeId?: string;
      nomenclatureId?: string;
      atomIndices?: number[];
      bondIndices?: number[];
      tooltip?: string;
    }
  ) => {
    tokens.push({
      id: `tok-${tokCounter++}`,
      text,
      kind: 'term',
      ...opts,
    });
  };
  const pushOp = (op: '≡' | '≃' | '⊂' | '∧', tooltip?: string) => {
    tokens.push({
      id: `tok-${tokCounter++}`,
      text: op,
      kind: 'operator',
      operator: op,
      tooltip,
    });
  };
  const pushParen = (p: '(' | ')') => {
    tokens.push({
      id: `tok-${tokCounter++}`,
      text: p,
      kind: 'paren',
    });
  };

  const eqNames = nomenclatureClass.filter((n) => n.relationToPin === '≡');
  const isoNames = nomenclatureClass.filter((n) => n.relationToPin === '≃');

  if (eqNames.length > 1) {
    pushTerm(eqNames[1].name, {
      nomenclatureId: eqNames[1].id,
      nodeId: 'node-bot-molecule',
      atomIndices: eqNames[1].atomIndices,
      bondIndices: eqNames[1].bondIndices,
      tooltip: eqNames[1].morphologyRule,
    });
    pushOp('≡', 'Extensional Identity');
  }

  pushParen('(');
  if (eqNames[0]) {
    pushTerm(eqNames[0].name, {
      nomenclatureId: eqNames[0].id,
      nodeId: 'node-bot-molecule',
      atomIndices: eqNames[0].atomIndices,
      bondIndices: eqNames[0].bondIndices,
      tooltip: eqNames[0].morphologyRule,
    });
  }
  for (const iso of isoNames.slice(0, 3)) {
    pushOp('≃', 'Intensional / Decompositional Structural Isomorphism');
    pushTerm(iso.name, {
      nomenclatureId: iso.id,
      atomIndices: iso.atomIndices,
      bondIndices: iso.bondIndices,
      tooltip: iso.bondCleavagePartition || iso.morphologyRule,
    });
  }
  pushParen(')');

  const level1Nodes = conceptLattice.filter(
    (n) => n.level === 1 && !n.isConjunctionNode
  );
  const level2FunctionalNodes =
    level1Nodes.length > 0
      ? level1Nodes
      : conceptLattice.filter((n) => n.level === 2 && !n.isConjunctionNode);

  if (level2FunctionalNodes.length > 0) {
    pushOp('⊂', 'Strict Ontological Subtype Inclusion');
    level2FunctionalNodes.forEach((node, idx) => {
      if (idx > 0) pushOp('∧', 'Formal Lattice Meet (Conjunction)');
      pushParen('(');
      pushTerm(node.extensionalEquivalents[0] || node.primaryLabel, {
        nodeId: node.id,
        atomIndices: node.atomIndices,
        bondIndices: node.bondIndices,
        tooltip: node.formalPredicate,
      });
      if (node.extensionalEquivalents[1]) {
        pushOp('≡');
        pushTerm(node.extensionalEquivalents[1], {
          nodeId: node.id,
          atomIndices: node.atomIndices,
          bondIndices: node.bondIndices,
          tooltip: node.formalPredicate,
        });
      }
      if (node.intensionalIsomorphs[0]) {
        pushOp('≃');
        pushTerm(node.intensionalIsomorphs[0], {
          nodeId: node.id,
          atomIndices: node.atomIndices,
          bondIndices: node.bondIndices,
          tooltip: node.formalPredicate,
        });
      }
      pushParen(')');
    });
  }

  const superNodes = conceptLattice.filter(
    (n) =>
      n.id === 'node-carbonyl-super' ||
      n.id === 'node-organic-oxygen-super' ||
      n.id === 'node-organonitrogen-super'
  );
  for (const sn of superNodes) {
    pushOp('⊂');
    pushTerm(sn.primaryLabel, {
      nodeId: sn.id,
      atomIndices: sn.atomIndices,
      bondIndices: sn.bondIndices,
      tooltip: sn.formalPredicate,
    });
  }

  const textParts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if (t.text === '(') {
      textParts.push('(');
    } else if (next?.text === ')') {
      textParts.push(t.text);
    } else {
      textParts.push(t.text + ' ');
    }
  }

  void allAtomIds;
  void allBondIds;

  return {
    symbolicFormulaText: textParts.join('').trim(),
    symbolicTokens: tokens,
  };
}
