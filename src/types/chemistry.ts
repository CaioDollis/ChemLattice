export interface AtomNode {
  index: number;
  atomicNo: number;
  symbol: string;
  x: number;
  y: number;
  charge: number;
  implicitH: number;
  explicitHIndices: number[];
  isAromatic: boolean;
  isInRing: boolean;
  isExplicitH: boolean;
  parentHeavyAtom?: number;
  hybridization?: 'sp' | 'sp2' | 'sp3' | 'other';
}

export interface BondEdge {
  index: number;
  atom1: number;
  atom2: number;
  order: 1 | 2 | 3 | 4;
  stereo: 'none' | 'up' | 'down' | 'wavy';
  isAromatic: boolean;
  isInRing: boolean;
  isExplicitHBond: boolean;
}

export interface GlobalInvariants {
  topology: 'acyclic' | 'cyclic';
  ringCount: number;
  aromaticity: 'aliphatic' | 'aromatic' | 'mixed-aromatic-aliphatic' | 'inorganic';
  saturation: 'saturated' | 'unsaturated';
  unsaturationDegree: number; // Index of Hydrogen Deficiency (IHD / DBE)
  carbonSkeletonSaturation: 'saturated' | 'unsaturated'; // C-C multiple bonds only
  ringComposition: 'none' | 'homocyclic' | 'heterocyclic' | 'both';
  carbonCount: number;
  heavyAtomCount: number;
  heteroAtomCount: number;
  totalAtomCountWithH: number;
  hydrogenCount: number;
  netCharge: number;
  functionalMultiplicity: Record<
    string,
    {
      count: number;
      prefix: 'mono' | 'di' | 'tri' | 'tetra' | 'poly';
      label: string;
    }
  >;
}

export interface SubgraphInstance {
  atomIndices: number[];
  bondIndices: number[];
  description: string;
}

export interface SubgraphMatch {
  id: string;
  name: string;
  smartsPattern: string;
  formalPredicate: string;
  category:
    | 'functional_group'
    | 'explicit_h_motif'
    | 'acyl_carbonyl'
    | 'skeleton'
    | 'ring_system';
  atomIndices: number[];
  bondIndices: number[];
  count: number;
  instances: SubgraphInstance[];
  includesExplicitH: boolean;
  note?: string;
}

export interface SymbolicToken {
  id: string;
  text: string;
  kind: 'term' | 'operator' | 'paren';
  operator?: '≡' | '≃' | '⊂' | '∧';
  nodeId?: string;
  nomenclatureId?: string;
  atomIndices?: number[];
  bondIndices?: number[];
  tooltip?: string;
}

export interface DecompositionPart {
  label: string;
  role:
    | 'parent'
    | 'principal_group'
    | 'substituent'
    | 'radical'
    | 'anion_class'
    | 'hydride'
    | 'additive_fragment';
  smarts: string;
  atomIndices: number[];
  bondIndices: number[];
  color: string;
}

export interface NomenclatureIsomorph {
  id: string;
  name: string;
  category:
    | 'pin_substitutive'
    | 'retained_trivial'
    | 'functional_class_additive'
    | 'radical_functional'
    | 'registry_synonym';
  relationToPin: '≡' | '≃';
  morphologyRule: string;
  bondCleavagePartition?: string;
  functorialDecomposition: DecompositionPart[];
  atomIndices: number[];
  bondIndices: number[];
  isPreferred?: boolean;
}

export interface BoundaryAxiom {
  id: string;
  title: string;
  divergentOntologies: string[];
  inclusionAxiom: string;
  exclusionAxiom: string;
  formalResolution: string;
}

export interface LatticeNode {
  id: string;
  level: number; // 0 = ⊥ (molecule), ..., max = ⊤ (Chemical Entity)
  primaryLabel: string;
  chebiId?: string;
  extensionalEquivalents: string[]; // ≡ equivalents
  intensionalIsomorphs: string[]; // ≃ structural isomorphs
  formalPredicate: string;
  parentIds: string[]; // ⊂ supersets
  isConjunctionNode?: boolean; // ∧ formal meet node
  atomIndices: number[];
  bondIndices: number[];
  boundaryAxiom?: BoundaryAxiom;
}

export interface PubChemRecord {
  cid?: number;
  iupacName?: string;
  title?: string;
  molecularFormula?: string;
  inchiKey?: string;
  synonyms: string[];
  fetchedAt: string;
}

export interface ChebiTermRecord {
  oboId: string;
  label: string;
  description?: string;
  iri: string;
}

export interface MolecularGraph {
  canonicalSmiles: string;
  explicitHSmiles: string;
  molfile: string;
  molecularFormula: string;
  exactMass: number;
  molecularWeight: number;
  inchi: string;
  inchiKey: string;
  atoms: AtomNode[];
  bonds: BondEdge[];
  invariants: GlobalInvariants;
  subgraphs: SubgraphMatch[];
}

export interface OntologicalAnalysis {
  symbolicFormulaText: string;
  symbolicTokens: SymbolicToken[];
  nomenclatureClass: NomenclatureIsomorph[];
  conceptLattice: LatticeNode[];
  source: 'deterministic+gemini' | 'deterministic';
  pubchemData?: PubChemRecord | null;
  chebiTerms?: ChebiTermRecord[];
}

export interface PresetMolecule {
  id: string;
  name: string;
  trivialName: string;
  smiles: string;
  formula: string;
  subtitle: string;
  highlightNote: string;
}
