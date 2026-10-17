import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    symbolicFormulaText: {
      type: Type.STRING,
      description:
        'Complete algebraic classification formula using ≡ (extensional identity), ≃ (intensional/decompositional isomorphism), ⊂ (strict ontological subtype), and ∧ (formal meet of co-instantiated motifs).',
    },
    nomenclatureIsomorphs: {
      type: Type.ARRAY,
      description:
        'Exhaustive nomenclature equivalence class items (PIN, retained/trivial, and functional/radical-functional bond-cleavage isomorphs).',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          category: {
            type: Type.STRING,
            description:
              'One of: pin_substitutive, retained_trivial, functional_class_additive, radical_functional',
          },
          relationToPin: {
            type: Type.STRING,
            description: 'Either ≡ or ≃',
          },
          morphologyRule: { type: Type.STRING },
          bondCleavagePartition: { type: Type.STRING },
        },
        required: ['name', 'category', 'relationToPin', 'morphologyRule'],
      },
    },
    latticeNodes: {
      type: Type.ARRAY,
      description:
        'Additional or refined formal ontological supertypes in the Hasse diagram from ⊥ to ⊤.',
      items: {
        type: Type.OBJECT,
        properties: {
          level: { type: Type.INTEGER },
          primaryLabel: { type: Type.STRING },
          chebiId: { type: Type.STRING },
          extensionalEquivalents: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          intensionalIsomorphs: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          formalPredicate: { type: Type.STRING },
          boundaryAxiomTitle: { type: Type.STRING },
          boundaryAxiomInclusion: { type: Type.STRING },
          boundaryAxiomExclusion: { type: Type.STRING },
          boundaryAxiomResolution: { type: Type.STRING },
        },
        required: [
          'level',
          'primaryLabel',
          'extensionalEquivalents',
          'intensionalIsomorphs',
          'formalPredicate',
        ],
      },
    },
  },
  required: ['symbolicFormulaText', 'nomenclatureIsomorphs', 'latticeNodes'],
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.post('/api/compile-ontology', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
      return res.json({
        compiled: false,
        reason: 'deterministic_engine_active',
      });
    }

    try {
      const {
        canonicalSmiles,
        explicitHSmiles,
        molecularFormula,
        invariants,
        subgraphs,
        pubchemData,
      } = req.body || {};

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `You are a Formal Chemical Ontologist and IUPAC Nomenclature Compiler.
Analyze the following molecular graph G with explicit hydrogen connectivity:
- Canonical SMILES: ${canonicalSmiles}
- Explicit-H SMILES: ${explicitHSmiles}
- Molecular Formula: ${molecularFormula}
- Global Invariants: ${JSON.stringify(invariants)}
- Matched Local Subgraphs: ${JSON.stringify(
        (subgraphs || []).map((s: { name: string; smartsPattern: string; formalPredicate: string; count: number }) => ({
          name: s.name,
          smarts: s.smartsPattern,
          predicate: s.formalPredicate,
          count: s.count,
        }))
      )}
- PubChem Registry Data: ${JSON.stringify(pubchemData || null)}

Synthesize:
1. A formal symbolic classification expression using:
   - ≡ for strict extensional/definitional identity
   - ≃ for intensional/decompositional structural isomorphisms (functorial bond-cleavage or substituent/parent readings of the same graph)
   - ⊂ for strict subtype/subsumption inclusion
   - ∧ for the formal meet (conjunction) of co-instantiated structural motifs
2. Exhaustive nomenclature equivalence class entries (especially functional class, additive, and radical-functional isomorphs ≃ with explicit bond-cleavage partitions).
3. Concept lattice nodes with formal predicates and any boundary axioms where chemical taxonomies diverge.`;

      const modelsToTry = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];
      let responseText: string | undefined;

      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
              temperature: 0.1,
            },
          });
          if (response.text) {
            responseText = response.text;
            break;
          }
        } catch {
          // Try next fallback model alias
        }
      }

      if (!responseText) {
        return res.json({
          compiled: false,
          reason: 'fallback_to_deterministic',
        });
      }

      const parsed = JSON.parse(responseText.trim());
      return res.json({
        compiled: true,
        data: parsed,
      });
    } catch (err) {
      return res.json({
        compiled: false,
        reason: err instanceof Error ? err.message : 'compiler_fallback',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ChemLattice IDE server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
