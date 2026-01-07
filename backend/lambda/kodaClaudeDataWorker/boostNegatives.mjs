/**
 * Boost NEGATIVE Tier Keywords
 *
 * Adds cross-intent exclusion keywords to improve routing accuracy.
 * Strategy: STRONG keywords from intent A become NEGATIVE keywords for intent B.
 */

import { readFileSync, writeFileSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

// ============================================================================
// CROSS-INTENT NEGATIVE MAPPING
// ============================================================================

// Define which intents' STRONG keywords should become NEGATIVE for each intent
const CROSS_INTENT_NEGATIVES = {
  DOCUMENTS: {
    sourceIntents: ['EXTRACTION', 'REASONING', 'EDIT'],
    additionalNegatives: {
      en: [
        "extract the value", "pull the data", "get the number",
        "analyze this", "compare these", "explain why",
        "change this", "modify", "rewrite", "edit this",
        "what do you think", "your analysis", "interpret"
      ],
      pt: [
        "extraia o valor", "puxe os dados", "obtenha o número",
        "analise isso", "compare estes", "explique por quê",
        "mude isso", "modifique", "reescreva"
      ],
      es: [
        "extrae el valor", "obtén los datos", "obtén el número",
        "analiza esto", "compara estos", "explica por qué",
        "cambia esto", "modifica", "reescribe"
      ]
    }
  },

  EXTRACTION: {
    sourceIntents: ['REASONING', 'DOCUMENTS', 'CONVERSATION'],
    additionalNegatives: {
      en: [
        "analyze implications", "what does this mean", "interpret",
        "go to page", "show table of contents", "navigate to",
        "just chatting", "hello", "thank you", "how are you",
        "explain the reasoning", "compare and contrast"
      ],
      pt: [
        "analise implicações", "o que isso significa", "interprete",
        "vá para página", "mostre sumário", "navegue para",
        "apenas conversando", "olá", "obrigado"
      ],
      es: [
        "analiza implicaciones", "qué significa esto", "interpreta",
        "ve a página", "muestra índice", "navega a",
        "solo charlando", "hola", "gracias"
      ]
    }
  },

  REASONING: {
    sourceIntents: ['EXTRACTION', 'DOCUMENTS', 'EDIT'],
    additionalNegatives: {
      en: [
        "just the value", "exact quote", "verbatim", "copy exactly",
        "show me page", "go to section", "table of contents",
        "rewrite this", "change the wording", "edit",
        "raw data only", "no interpretation", "just extract"
      ],
      pt: [
        "apenas o valor", "citação exata", "literalmente",
        "mostre-me página", "vá para seção", "sumário",
        "reescreva isso", "mude as palavras"
      ],
      es: [
        "solo el valor", "cita exacta", "literalmente",
        "muéstrame página", "ve a sección", "índice",
        "reescribe esto", "cambia las palabras"
      ]
    }
  },

  EDIT: {
    sourceIntents: ['EXTRACTION', 'DOCUMENTS', 'REASONING'],
    additionalNegatives: {
      en: [
        "don't change", "read only", "just show", "extract value",
        "analyze without changing", "what is the value",
        "navigate to", "go to page", "table of contents",
        "keep original", "preserve as is", "no modifications"
      ],
      pt: [
        "não mude", "somente leitura", "apenas mostre",
        "analise sem mudar", "qual é o valor",
        "navegue para", "vá para página"
      ],
      es: [
        "no cambies", "solo lectura", "solo muestra",
        "analiza sin cambiar", "cuál es el valor",
        "navega a", "ve a página"
      ]
    }
  },

  HELP: {
    sourceIntents: ['EXTRACTION', 'REASONING', 'DOCUMENTS'],
    additionalNegatives: {
      en: [
        "from the document", "in this contract", "extract from file",
        "analyze the text", "compare sections", "what does clause say",
        "about the content", "in the pdf", "from the spreadsheet",
        "not about koda", "general question"
      ],
      pt: [
        "do documento", "neste contrato", "extraia do arquivo",
        "analise o texto", "compare seções",
        "sobre o conteúdo", "no pdf"
      ],
      es: [
        "del documento", "en este contrato", "extrae del archivo",
        "analiza el texto", "compara secciones",
        "sobre el contenido", "en el pdf"
      ]
    }
  },

  CONVERSATION: {
    sourceIntents: ['EXTRACTION', 'REASONING', 'DOCUMENTS', 'EDIT'],
    additionalNegatives: {
      en: [
        "extract value", "pull data", "get the number from document",
        "analyze the contract", "compare clauses", "what does section say",
        "go to page", "show toc", "navigate document",
        "edit this", "change the text", "rewrite section",
        "from the file", "in the document", "according to"
      ],
      pt: [
        "extraia valor", "puxe dados", "obtenha número do documento",
        "analise o contrato", "compare cláusulas",
        "vá para página", "mostre sumário",
        "edite isso", "mude o texto"
      ],
      es: [
        "extrae valor", "obtén datos", "obtén número del documento",
        "analiza el contrato", "compara cláusulas",
        "ve a página", "muestra índice",
        "edita esto", "cambia el texto"
      ]
    }
  },

  MEMORY: {
    sourceIntents: ['EXTRACTION', 'DOCUMENTS', 'PREFERENCES'],
    additionalNegatives: {
      en: [
        "extract value", "get data from document", "pull information",
        "go to page", "navigate", "show contents",
        "change my settings", "update preferences", "set language",
        "forget this", "don't save", "no memory needed", "new context"
      ],
      pt: [
        "extraia valor", "obtenha dados do documento",
        "vá para página", "navegue", "mostre conteúdo",
        "mude minhas configurações", "atualize preferências"
      ],
      es: [
        "extrae valor", "obtén datos del documento",
        "ve a página", "navega", "muestra contenido",
        "cambia mis configuraciones", "actualiza preferencias"
      ]
    }
  },

  PREFERENCES: {
    sourceIntents: ['EXTRACTION', 'DOCUMENTS', 'MEMORY'],
    additionalNegatives: {
      en: [
        "extract from document", "get value from file", "pull data",
        "go to section", "navigate to page", "show toc",
        "remember this", "recall what I said", "what did we discuss",
        "document settings", "file options", "contract preferences"
      ],
      pt: [
        "extraia do documento", "obtenha valor do arquivo",
        "vá para seção", "navegue para página",
        "lembre disso", "recorde o que eu disse"
      ],
      es: [
        "extrae del documento", "obtén valor del archivo",
        "ve a sección", "navega a página",
        "recuerda esto", "recuerda lo que dije"
      ]
    }
  },

  FILE_ACTIONS: {
    sourceIntents: ['EXTRACTION', 'REASONING', 'DOCUMENTS'],
    additionalNegatives: {
      en: [
        "analyze content", "extract information", "what does it say",
        "compare documents", "interpret the text", "reasoning about",
        "navigate within", "go to section", "show page",
        "about the content", "from the text", "in the document"
      ],
      pt: [
        "analise conteúdo", "extraia informação", "o que diz",
        "compare documentos", "interprete o texto",
        "navegue dentro", "vá para seção"
      ],
      es: [
        "analiza contenido", "extrae información", "qué dice",
        "compara documentos", "interpreta el texto",
        "navega dentro", "ve a sección"
      ]
    }
  },

  ERROR: {
    sourceIntents: ['EXTRACTION', 'HELP', 'CONVERSATION'],
    additionalNegatives: {
      en: [
        "working correctly", "success", "completed", "all good",
        "no issues", "everything fine", "works great",
        "extract value", "get data", "analyze this",
        "how do I", "help me with", "what can you do",
        "hello", "thanks", "good morning"
      ],
      pt: [
        "funcionando corretamente", "sucesso", "completado", "tudo bem",
        "sem problemas", "tudo certo", "funciona bem",
        "extraia valor", "obtenha dados", "analise isso"
      ],
      es: [
        "funcionando correctamente", "éxito", "completado", "todo bien",
        "sin problemas", "todo correcto", "funciona bien",
        "extrae valor", "obtén datos", "analiza esto"
      ]
    }
  }
};

// ============================================================================
// LOAD AND TRANSFORM
// ============================================================================

console.log('Loading intent_patterns.json...');
const data = JSON.parse(readFileSync(`${DATA_DIR}/intent_patterns.json`, 'utf-8'));

let totalNegativesAdded = 0;
const stats = {};

console.log('Adding cross-intent NEGATIVE keywords...');

for (const [intentName, config] of Object.entries(CROSS_INTENT_NEGATIVES)) {
  if (!data.intents[intentName]) continue;

  stats[intentName] = { before: 0, added: 0 };

  for (const lang of ['en', 'pt', 'es']) {
    const keywords = data.intents[intentName].keywords?.[lang] || [];

    // Count existing negatives
    const existingNegatives = keywords.filter(k => k.tier === 'NEGATIVE').length;
    stats[intentName].before = existingNegatives;

    // Get existing keyword texts to avoid duplicates
    const existingTexts = new Set(keywords.map(k => (k.keyword || '').toLowerCase()));

    // Add additional negatives from config
    const additionalNegs = config.additionalNegatives?.[lang] || [];
    for (const negText of additionalNegs) {
      if (!existingTexts.has(negText.toLowerCase())) {
        keywords.push({
          keyword: negText,
          layer: 'negative_cross_intent',
          target: 'EXCLUSION',
          tier: 'NEGATIVE',
          variants: []
        });
        existingTexts.add(negText.toLowerCase());
        stats[intentName].added++;
        totalNegativesAdded++;
      }
    }

    // Pull some STRONG keywords from source intents as negatives
    for (const sourceIntent of config.sourceIntents) {
      const sourceKeywords = data.intents[sourceIntent]?.keywords?.[lang] || [];
      const strongKeywords = sourceKeywords
        .filter(k => k.tier === 'STRONG')
        .slice(0, 50); // Take top 50 STRONG from each source

      for (const srcKw of strongKeywords) {
        const text = (srcKw.keyword || '').toLowerCase();
        if (text && !existingTexts.has(text) && text.length > 3) {
          keywords.push({
            keyword: srcKw.keyword,
            layer: 'negative_from_' + sourceIntent.toLowerCase(),
            target: 'EXCLUSION',
            tier: 'NEGATIVE',
            variants: []
          });
          existingTexts.add(text);
          stats[intentName].added++;
          totalNegativesAdded++;
        }
      }
    }
  }
}

// Update metadata
data.metadata.negativesBoostAt = new Date().toISOString();

// Recalculate total keywords
let totalKeywords = 0;
for (const intentData of Object.values(data.intents)) {
  for (const lang of ['en', 'pt', 'es']) {
    totalKeywords += (intentData.keywords?.[lang] || []).length;
  }
}
data.metadata.totalKeywords = totalKeywords;

console.log('Saving...');
writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(data, null, 2));

// Print summary
console.log('\n' + '='.repeat(60));
console.log('NEGATIVE BOOST COMPLETE');
console.log('='.repeat(60));
console.log(`\nTotal NEGATIVE keywords added: ${totalNegativesAdded.toLocaleString()}`);
console.log(`New total keywords: ${totalKeywords.toLocaleString()}`);

console.log('\nPer Intent:');
console.log('Intent'.padEnd(15) + 'Before'.padStart(10) + 'Added'.padStart(10) + 'Total'.padStart(10));
console.log('-'.repeat(45));
for (const [intent, s] of Object.entries(stats)) {
  console.log(
    intent.padEnd(15) +
    s.before.toString().padStart(10) +
    s.added.toString().padStart(10) +
    (s.before + s.added).toString().padStart(10)
  );
}

console.log('\n✓ Saved to intent_patterns.json');
