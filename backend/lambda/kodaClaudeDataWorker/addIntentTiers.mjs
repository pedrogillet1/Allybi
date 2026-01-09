/**
 * Add Tier Classification to Intent Keywords
 *
 * Transforms intent_patterns.json to add STRONG/MEDIUM/WEAK/NEGATIVE tiers
 * based on the existing 'layer' field using heuristic rules.
 */

import { readFileSync, writeFileSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

// ============================================================================
// TIER MAPPING RULES
// ============================================================================

const LAYER_TO_TIER = {
  // STRONG - High-signal, unambiguous intent indicators
  'actions': 'STRONG',
  'states': 'STRONG',
  'target': 'STRONG',

  // MEDIUM - Need context but reasonably specific
  'scope': 'MEDIUM',
  'depth': 'MEDIUM',
  'analyticalDepth': 'MEDIUM',
  'constraints': 'MEDIUM',
  'outputControl': 'MEDIUM',
  'evidenceAndTrust': 'MEDIUM',
  'validation': 'MEDIUM',
  'memory': 'MEDIUM',

  // WEAK - Ambient, contextual signals
  'sessionContext': 'WEAK',
  'temporalContext': 'WEAK',
  'consistency': 'WEAK',
  'failureModes': 'WEAK',
  'termination': 'WEAK',
  'terminationConditions': 'WEAK'
};

// Default tier if layer is unknown
const DEFAULT_TIER = 'MEDIUM';

// ============================================================================
// NEGATIVE KEYWORDS PER INTENT
// ============================================================================

const INTENT_NEGATIVES = {
  DOCUMENTS: {
    en: [
      "analyze deeply", "compare in detail", "extract specific value",
      "calculate total", "summarize implications", "give your opinion",
      "what do you think", "explain the reasoning", "why is this",
      "interpret this", "make changes", "edit this"
    ],
    pt: [
      "analisar profundamente", "comparar em detalhe", "extrair valor específico",
      "calcular total", "resumir implicações", "dê sua opinião",
      "o que você acha", "explique o raciocínio", "por que isso"
    ],
    es: [
      "analizar profundamente", "comparar en detalle", "extraer valor específico",
      "calcular total", "resumir implicaciones", "da tu opinión",
      "qué opinas", "explica el razonamiento", "por qué esto"
    ]
  },

  EXTRACTION: {
    en: [
      "explain why", "compare these", "analyze implications",
      "what do you think", "your opinion", "discuss this",
      "summarize the reasoning", "interpret", "what does this mean",
      "navigate to", "go to section", "show table of contents"
    ],
    pt: [
      "explique por quê", "compare estes", "analise implicações",
      "o que você acha", "sua opinião", "discuta isso",
      "resuma o raciocínio", "interprete", "o que isso significa"
    ],
    es: [
      "explica por qué", "compara estos", "analiza implicaciones",
      "qué opinas", "tu opinión", "discute esto",
      "resume el razonamiento", "interpreta", "qué significa esto"
    ]
  },

  REASONING: {
    en: [
      "just the value", "exact quote only", "copy paste",
      "raw data only", "no analysis", "don't explain",
      "just extract", "only the number", "verbatim",
      "word for word", "no interpretation"
    ],
    pt: [
      "apenas o valor", "citação exata apenas", "copiar e colar",
      "dados brutos apenas", "sem análise", "não explique",
      "apenas extraia", "apenas o número", "literalmente"
    ],
    es: [
      "solo el valor", "cita exacta solamente", "copiar y pegar",
      "datos crudos solo", "sin análisis", "no expliques",
      "solo extrae", "solo el número", "literalmente"
    ]
  },

  EDIT: {
    en: [
      "don't change anything", "read only", "just show me",
      "no modifications", "leave as is", "don't touch",
      "only read", "view only", "don't edit"
    ],
    pt: [
      "não mude nada", "somente leitura", "apenas me mostre",
      "sem modificações", "deixe como está", "não toque"
    ],
    es: [
      "no cambies nada", "solo lectura", "solo muéstrame",
      "sin modificaciones", "déjalo como está", "no toques"
    ]
  },

  HELP: {
    en: [
      "not about the product", "general knowledge question",
      "unrelated to koda", "off topic", "personal question",
      "about the document", "extract from file"
    ],
    pt: [
      "não é sobre o produto", "pergunta de conhecimento geral",
      "não relacionado ao koda", "fora do tópico"
    ],
    es: [
      "no es sobre el producto", "pregunta de conocimiento general",
      "no relacionado con koda", "fuera de tema"
    ]
  },

  CONVERSATION: {
    en: [
      "from the document", "in the file", "extract this",
      "analyze the contract", "find in document", "search document",
      "what does the document say", "according to the file"
    ],
    pt: [
      "do documento", "no arquivo", "extraia isso",
      "analise o contrato", "encontre no documento"
    ],
    es: [
      "del documento", "en el archivo", "extrae esto",
      "analiza el contrato", "encuentra en el documento"
    ]
  },

  MEMORY: {
    en: [
      "don't remember this", "new session", "forget everything",
      "clear history", "start fresh", "no context needed",
      "ignore previous", "fresh start"
    ],
    pt: [
      "não lembre disso", "nova sessão", "esqueça tudo",
      "limpar histórico", "começar do zero"
    ],
    es: [
      "no recuerdes esto", "nueva sesión", "olvida todo",
      "borrar historial", "empezar de nuevo"
    ]
  },

  PREFERENCES: {
    en: [
      "document setting", "file preference", "contract option",
      "extraction preference", "analysis setting",
      "about the document content", "in the file"
    ],
    pt: [
      "configuração do documento", "preferência de arquivo",
      "opção de contrato", "sobre o conteúdo do documento"
    ],
    es: [
      "configuración del documento", "preferencia de archivo",
      "opción de contrato", "sobre el contenido del documento"
    ]
  },

  FILE_ACTIONS: {
    en: [
      "don't upload", "keep local", "no file operation",
      "just read content", "analyze content only",
      "extract information", "about the text"
    ],
    pt: [
      "não faça upload", "mantenha local", "sem operação de arquivo",
      "apenas leia o conteúdo"
    ],
    es: [
      "no subas", "mantén local", "sin operación de archivo",
      "solo lee el contenido"
    ]
  },

  ERROR: {
    en: [
      "working fine", "no problem", "success", "everything ok",
      "all good", "completed successfully", "no issues",
      "functioning properly", "works correctly"
    ],
    pt: [
      "funcionando bem", "sem problema", "sucesso", "tudo ok",
      "tudo certo", "completado com sucesso"
    ],
    es: [
      "funcionando bien", "sin problema", "éxito", "todo bien",
      "todo correcto", "completado con éxito"
    ]
  }
};

// ============================================================================
// TRANSFORMATION
// ============================================================================

console.log('Loading intent_patterns.json...');
const data = JSON.parse(readFileSync(`${DATA_DIR}/intent_patterns.json`, 'utf-8'));

const stats = {
  totalTransformed: 0,
  tiersAdded: { STRONG: 0, MEDIUM: 0, WEAK: 0, NEGATIVE: 0 },
  negativesAdded: 0,
  byIntent: {}
};

console.log('Transforming keywords...');

for (const [intentName, intentData] of Object.entries(data.intents || {})) {
  stats.byIntent[intentName] = { STRONG: 0, MEDIUM: 0, WEAK: 0, NEGATIVE: 0 };

  for (const lang of ['en', 'pt', 'es']) {
    const keywords = intentData.keywords?.[lang] || [];

    // Transform existing keywords - add tier based on layer
    for (const kw of keywords) {
      const layer = kw.layer || 'unknown';
      const tier = LAYER_TO_TIER[layer] || DEFAULT_TIER;
      kw.tier = tier;

      stats.tiersAdded[tier]++;
      stats.byIntent[intentName][tier]++;
      stats.totalTransformed++;
    }

    // Add NEGATIVE keywords
    const negatives = INTENT_NEGATIVES[intentName]?.[lang] || [];
    for (const negText of negatives) {
      keywords.push({
        keyword: negText,
        layer: 'negative',
        target: 'EXCLUSION',
        tier: 'NEGATIVE',
        variants: []
      });
      stats.tiersAdded.NEGATIVE++;
      stats.byIntent[intentName].NEGATIVE++;
      stats.negativesAdded++;
    }
  }
}

// Update metadata
data.metadata.tiersAdded = new Date().toISOString();
data.metadata.tierDistribution = stats.tiersAdded;
data.metadata.totalKeywords = stats.totalTransformed + stats.negativesAdded;

console.log('Saving transformed file...');
writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(data, null, 2));

// Print summary
console.log('\n' + '='.repeat(60));
console.log('TRANSFORMATION COMPLETE');
console.log('='.repeat(60));
console.log(`\nTotal keywords transformed: ${stats.totalTransformed.toLocaleString()}`);
console.log(`Negative keywords added: ${stats.negativesAdded.toLocaleString()}`);
console.log(`\nTier Distribution:`);
console.log(`  STRONG:   ${stats.tiersAdded.STRONG.toLocaleString()}`);
console.log(`  MEDIUM:   ${stats.tiersAdded.MEDIUM.toLocaleString()}`);
console.log(`  WEAK:     ${stats.tiersAdded.WEAK.toLocaleString()}`);
console.log(`  NEGATIVE: ${stats.tiersAdded.NEGATIVE.toLocaleString()}`);

console.log('\nPer Intent:');
console.log('Intent'.padEnd(15) + 'STRONG'.padStart(10) + 'MEDIUM'.padStart(10) + 'WEAK'.padStart(10) + 'NEG'.padStart(10));
console.log('-'.repeat(55));
for (const [intent, tiers] of Object.entries(stats.byIntent)) {
  console.log(
    intent.padEnd(15) +
    tiers.STRONG.toLocaleString().padStart(10) +
    tiers.MEDIUM.toLocaleString().padStart(10) +
    tiers.WEAK.toLocaleString().padStart(10) +
    tiers.NEGATIVE.toLocaleString().padStart(10)
  );
}

console.log('\n✓ Saved to intent_patterns.json');
