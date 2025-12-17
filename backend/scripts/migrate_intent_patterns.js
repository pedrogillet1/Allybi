/**
 * Script to migrate intent_patterns.json to new V4 intent names
 */
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'src', 'data', 'intent_patterns.json');
const outputPath = path.join(__dirname, '..', 'src', 'data', 'intent_patterns.json');

// Read current patterns
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

// Mapping from old to new
const intentMapping = {
  // Document intents → documents (merge all)
  'DOC_QA': 'documents',
  'DOC_ANALYTICS': 'documents',
  'DOC_MANAGEMENT': 'documents',
  'DOC_SEARCH': 'documents',
  'DOC_SUMMARIZE': 'documents',
  // Preferences
  'PREFERENCE_UPDATE': 'preferences',
  // Memory (merge both)
  'MEMORY_STORE': 'memory',
  'MEMORY_RECALL': 'memory',
  // Edit (merge all)
  'ANSWER_REWRITE': 'edit',
  'ANSWER_EXPAND': 'edit',
  'ANSWER_SIMPLIFY': 'edit',
  'TEXT_TRANSFORM': 'edit',
  // Conversation (merge all)
  'FEEDBACK_POSITIVE': 'conversation',
  'FEEDBACK_NEGATIVE': 'conversation',
  'CHITCHAT': 'conversation',
  // Help (merge all)
  'PRODUCT_HELP': 'help',
  'ONBOARDING_HELP': 'help',
  'FEATURE_REQUEST': 'help',
  // Reasoning (merge both)
  'GENERIC_KNOWLEDGE': 'reasoning',
  'REASONING_TASK': 'reasoning',
  // Extraction
  'META_AI': 'extraction',
  // Error (merge all)
  'OUT_OF_SCOPE': 'error',
  'AMBIGUOUS': 'error',
  'SAFETY_CONCERN': 'error',
  'MULTI_INTENT': 'error',
  'UNKNOWN': 'error',
};

// Helper to merge keywords/patterns arrays
function mergeArrays(target, source) {
  if (!source) return target || [];
  if (!target) return source;
  return [...new Set([...target, ...source])];
}

// Helper to merge language objects
function mergeLangObjects(target, source) {
  if (!source) return target || {};
  if (!target) return source;

  const result = { ...target };
  for (const [lang, items] of Object.entries(source)) {
    result[lang] = mergeArrays(result[lang], items);
  }
  return result;
}

// Build new structure
const newData = {
  version: '4.0.0',
  lastUpdated: new Date().toISOString().split('T')[0],
  description: 'Intent classification patterns V4 - 15 intents (9 core + 6 domain-specific)',
};

// Initialize new intents
const newIntents = {};

// Process old intents and merge into new
for (const [oldName, pattern] of Object.entries(data)) {
  if (['version', 'lastUpdated', 'description'].includes(oldName)) continue;

  const newName = intentMapping[oldName];
  if (!newName) {
    console.log(`Skipping unknown intent: ${oldName}`);
    continue;
  }

  if (!newIntents[newName]) {
    newIntents[newName] = {
      priority: pattern.priority || 50,
      description: '',
      keywords: { en: [], pt: [], es: [] },
      patterns: { en: [], pt: [], es: [] },
    };
  }

  // Merge keywords
  newIntents[newName].keywords = mergeLangObjects(newIntents[newName].keywords, pattern.keywords);

  // Merge patterns
  newIntents[newName].patterns = mergeLangObjects(newIntents[newName].patterns, pattern.patterns);

  // Use highest priority
  if (pattern.priority && pattern.priority > newIntents[newName].priority) {
    newIntents[newName].priority = pattern.priority;
  }

  console.log(`Merged ${oldName} → ${newName}`);
}

// Set descriptions for new intents
const descriptions = {
  documents: 'All document queries (QA, search, summarize, analytics, management)',
  help: 'Product help, onboarding, feature requests',
  conversation: 'Chitchat, feedback, greetings',
  edit: 'Answer rewrite/expand/simplify, text transforms',
  reasoning: 'Math, logic, calculations, general knowledge',
  memory: 'Store and recall user information',
  error: 'Out of scope, ambiguous, safety, unknown',
  preferences: 'User settings, language, tone, role',
  extraction: 'Data extraction, meta-AI queries',
  excel: 'Excel/spreadsheet specific queries',
  accounting: 'Accounting-specific document queries',
  engineering: 'Engineering-specific document queries',
  finance: 'Finance-specific document queries',
  legal: 'Legal-specific document queries',
  medical: 'Medical-specific document queries',
};

// Add domain-specific placeholders
const domainIntents = ['excel', 'accounting', 'engineering', 'finance', 'legal', 'medical'];
for (const domain of domainIntents) {
  if (!newIntents[domain]) {
    newIntents[domain] = {
      priority: 85, // High priority for domain-specific
      description: descriptions[domain],
      keywords: { en: [], pt: [], es: [] },
      patterns: { en: [], pt: [], es: [] },
    };
    console.log(`Created placeholder for ${domain}`);
  }
}

// Apply descriptions
for (const [name, intent] of Object.entries(newIntents)) {
  intent.description = descriptions[name] || intent.description;
}

// Build final structure
Object.assign(newData, newIntents);

// Write output
fs.writeFileSync(outputPath, JSON.stringify(newData, null, 2) + '\n', 'utf8');
console.log('\nMigration complete! New intent_patterns.json written.');
console.log(`Total intents: ${Object.keys(newIntents).length}`);
