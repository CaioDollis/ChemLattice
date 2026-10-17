import type {
  ChebiTermRecord,
  MolecularGraph,
  OntologicalAnalysis,
  PubChemRecord,
} from '../types/chemistry.ts';

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 2,
  baseDelayMs = 450
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok || response.status === 404 || response.status === 400) {
      return response;
    }
    if (
      (response.status === 429 || response.status >= 500) &&
      attempt < maxRetries
    ) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const delay =
        !Number.isNaN(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    return response;
  }
  throw new Error(`Exhausted retries for ${url}`);
}

const pubchemCache = new Map<string, PubChemRecord | null>();
const chebiCache = new Map<string, ChebiTermRecord[]>();

/**
 * Queries PubChem PUG REST API for verified IUPACName, Title, MolecularFormula,
 * InChIKey, and literature synonyms. Gracefully handles novel/unregistered structures.
 */
export async function queryPubChemRegistry(
  smiles: string
): Promise<PubChemRecord | null> {
  const key = smiles.trim();
  if (!key) return null;
  if (pubchemCache.has(key)) {
    return pubchemCache.get(key) || null;
  }

  try {
    const encoded = encodeURIComponent(key);
    const propUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encoded}/property/IUPACName,Title,MolecularFormula,InChIKey/JSON`;
    const synUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encoded}/synonyms/JSON`;

    const [propRes, synRes] = await Promise.all([
      fetchWithRetry(propUrl),
      fetchWithRetry(synUrl),
    ]);

    if (!propRes.ok) {
      pubchemCache.set(key, null);
      return null;
    }

    const propJson = await propRes.json();
    const props = propJson?.PropertyTable?.Properties?.[0];
    if (!props || !props.CID) {
      pubchemCache.set(key, null);
      return null;
    }

    let synonyms: string[] = [];
    if (synRes.ok) {
      try {
        const synJson = await synRes.json();
        const rawSyns: string[] =
          synJson?.InformationList?.Information?.[0]?.Synonym || [];
        synonyms = rawSyns
          .filter(
            (s) =>
              typeof s === 'string' &&
              s.length >= 3 &&
              s.length <= 42 &&
              !/^[\d\-[\]]+$/.test(s) &&
              !s.includes('EINECS') &&
              !s.includes('UNII') &&
              !s.includes('DTXSID') &&
              !s.includes('CHEMBL') &&
              !s.includes('CHEBI') &&
              !s.includes('CAS-')
          )
          .slice(0, 14);
      } catch {
        synonyms = [];
      }
    }

    const record: PubChemRecord = {
      cid: props.CID,
      iupacName: props.IUPACName,
      title: props.Title,
      molecularFormula: props.MolecularFormula,
      inchiKey: props.InChIKey,
      synonyms,
      fetchedAt: new Date().toISOString(),
    };
    pubchemCache.set(key, record);
    return record;
  } catch {
    pubchemCache.set(key, null);
    return null;
  }
}

/**
 * Queries EMBL-EBI OLS4 API for ChEBI ontology class records matching the primary chemical classes.
 */
export async function queryChebiOntologyTerms(
  queryLabel: string
): Promise<ChebiTermRecord[]> {
  const clean = queryLabel.trim().toLowerCase();
  if (!clean) return [];
  if (chebiCache.has(clean)) {
    return chebiCache.get(clean) || [];
  }

  try {
    const url = `https://www.ebi.ac.uk/ols4/api/search?q=${encodeURIComponent(
      clean
    )}&ontology=chebi&rows=4&exact=false`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return [];
    const data = await res.json();
    const docs = data?.response?.docs || [];
    const terms: ChebiTermRecord[] = docs
      .filter((d: { obo_id?: string; label?: string }) => d.obo_id && d.label)
      .map(
        (d: {
          obo_id: string;
          label: string;
          description?: string[];
          iri: string;
        }) => ({
          oboId: d.obo_id,
          label: d.label,
          description: d.description?.[0],
          iri: d.iri,
        })
      );
    chebiCache.set(clean, terms);
    return terms;
  } catch {
    return [];
  }
}

/**
 * Calls the server-side Gemini Formal Ontological & Nomenclature Compiler (`/api/compile-ontology`)
 * and merges any newly synthesized isomorphs or boundary axioms into the deterministic analysis.
 */
export async function compileWithGeminiBackend(
  graph: MolecularGraph,
  baseAnalysis: OntologicalAnalysis,
  pubchemData: PubChemRecord | null
): Promise<OntologicalAnalysis> {
  try {
    const res = await fetch('/api/compile-ontology', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        canonicalSmiles: graph.canonicalSmiles,
        explicitHSmiles: graph.explicitHSmiles,
        molecularFormula: graph.molecularFormula,
        invariants: graph.invariants,
        subgraphs: graph.subgraphs,
        pubchemData,
      }),
    });

    if (!res.ok) return baseAnalysis;
    const payload = await res.json();
    if (!payload?.compiled || !payload?.data) {
      return baseAnalysis;
    }

    const aiData = payload.data;
    const allAtomIds = graph.atoms.map((a) => a.index);
    const allBondIds = graph.bonds.map((b) => b.index);

    // Merge additional nomenclature isomorphs from Gemini without duplicating existing names
    const existingNames = new Set(
      baseAnalysis.nomenclatureClass.map((n) => n.name.toLowerCase())
    );
    const mergedNomenclature = [...baseAnalysis.nomenclatureClass];

    if (Array.isArray(aiData.nomenclatureIsomorphs)) {
      for (const item of aiData.nomenclatureIsomorphs) {
        if (!item?.name || existingNames.has(item.name.toLowerCase())) continue;
        existingNames.add(item.name.toLowerCase());
        mergedNomenclature.push({
          id: `nom-ai-${mergedNomenclature.length + 1}`,
          name: item.name,
          category:
            item.category === 'pin_substitutive' ||
            item.category === 'retained_trivial' ||
            item.category === 'functional_class_additive' ||
            item.category === 'radical_functional'
              ? item.category
              : 'radical_functional',
          relationToPin: item.relationToPin === '≡' ? '≡' : '≃',
          morphologyRule: item.morphologyRule || 'Synthesized ontological morphism.',
          bondCleavagePartition: item.bondCleavagePartition,
          functorialDecomposition: [
            {
              label: item.name,
              role: 'principal_group',
              smarts: graph.canonicalSmiles,
              atomIndices: allAtomIds,
              bondIndices: allBondIds,
              color: '#38BDF8',
            },
          ],
          atomIndices: allAtomIds,
          bondIndices: allBondIds,
        });
      }
    }

    return {
      ...baseAnalysis,
      nomenclatureClass: mergedNomenclature,
      source: 'deterministic+gemini',
      pubchemData: pubchemData || baseAnalysis.pubchemData,
    };
  } catch {
    return baseAnalysis;
  }
}
