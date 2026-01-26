const fs = require('fs');

const json = JSON.parse(fs.readFileSync('C:/Users/pedro/Downloads/koda_production_orchestration_v2/koda_25_categories_implementation/categories_parsed.json', 'utf-8'));

console.log('=== CATEGORIES_PARSED.JSON KEYWORD ANALYSIS ===\n');

const categoryData = {};

Object.keys(json).forEach(key => {
  const category = json[key];
  const name = category.name.split(' ')[0];
  const keywordsRaw = category.keywords || '';

  // Clean up keywords
  const keywords = keywordsRaw
    .replace(/```/g, '')
    .replace(/```regex/g, '')
    .split(/[,\n]/)
    .map(k => k.trim().toLowerCase())
    .filter(k => k && k.length > 0 && !k.includes('---') && !k.startsWith('^'));

  categoryData[name] = keywords;
  console.log(`${name}: ${keywords.length} keywords`);
  console.log(`  First 15: ${keywords.slice(0, 15).join(', ')}`);
  console.log('');
});

// Now compare with kodaPatternClassification.service.ts keywords
console.log('\n=== COMPARING WITH kodaPatternClassification.service.ts ===\n');

const serviceFile = fs.readFileSync('C:/Users/pedro/Downloads/koda-implementation-v2-FOUNDATION/koda-new-implementation/services/kodaPatternClassification.service.ts', 'utf-8');

// Extract keywords arrays from the service file
const serviceKeywords = {
  DOC_QA: extractKeywords(serviceFile, 'DOC_QA_KEYWORDS'),
  DOC_ANALYTICS: extractKeywords(serviceFile, 'DOC_ANALYTICS_KEYWORDS'),
  DOC_MANAGEMENT: extractKeywords(serviceFile, 'DOC_MANAGEMENT_KEYWORDS'),
  PREFERENCE_UPDATE: extractKeywords(serviceFile, 'PREFERENCE_UPDATE_KEYWORDS'),
  ANSWER_REWRITE: extractKeywords(serviceFile, 'ANSWER_REWRITE_KEYWORDS'),
  FEEDBACK_POSITIVE: extractKeywords(serviceFile, 'FEEDBACK_POSITIVE_KEYWORDS'),
  FEEDBACK_NEGATIVE: extractKeywords(serviceFile, 'FEEDBACK_NEGATIVE_KEYWORDS'),
  PRODUCT_HELP: extractKeywords(serviceFile, 'PRODUCT_HELP_KEYWORDS'),
  ONBOARDING_HELP: extractKeywords(serviceFile, 'ONBOARDING_HELP_KEYWORDS'),
  GENERIC_KNOWLEDGE: extractKeywords(serviceFile, 'GENERIC_KNOWLEDGE_KEYWORDS'),
  REASONING_TASK: extractKeywords(serviceFile, 'REASONING_TASK_KEYWORDS'),
  TEXT_TRANSFORM: extractKeywords(serviceFile, 'TEXT_TRANSFORM_KEYWORDS'),
  CHITCHAT: extractKeywords(serviceFile, 'CHITCHAT_KEYWORDS'),
  META_AI: extractKeywords(serviceFile, 'META_AI_KEYWORDS'),
  OUT_OF_SCOPE: extractKeywords(serviceFile, 'OUT_OF_SCOPE_KEYWORDS'),
  AMBIGUOUS: extractKeywords(serviceFile, 'AMBIGUOUS_KEYWORDS')
};

function extractKeywords(content, arrayName) {
  const regex = new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\];`, 'm');
  const match = content.match(regex);
  if (!match) return [];

  const arrayContent = match[1];
  const keywords = arrayContent
    .split(',')
    .map(k => k.replace(/['"]/g, '').trim().toLowerCase())
    .filter(k => k && k.length > 0);

  return keywords;
}

// Compare each category
const issues = [];

Object.keys(categoryData).forEach(category => {
  const jsonKeywords = categoryData[category];
  const tsKeywords = serviceKeywords[category] || [];

  const jsonSet = new Set(jsonKeywords);
  const tsSet = new Set(tsKeywords);

  // Find missing keywords (in JSON but not in TS)
  const missingInTS = jsonKeywords.filter(k => !tsSet.has(k)).slice(0, 20);

  console.log(`\n${category}:`);
  console.log(`  JSON: ${jsonKeywords.length} keywords`);
  console.log(`  TS:   ${tsKeywords.length} keywords`);
  console.log(`  Coverage: ${((tsKeywords.filter(k => jsonSet.has(k)).length / jsonKeywords.length) * 100).toFixed(1)}%`);

  if (missingInTS.length > 0) {
    console.log(`  Missing in TS (sample of 20): ${missingInTS.join(', ')}`);
    issues.push({
      category,
      missing: missingInTS.length,
      totalJson: jsonKeywords.length,
      totalTs: tsKeywords.length
    });
  }
});

console.log('\n\n=== SUMMARY ===\n');
console.log(`Categories analyzed: ${Object.keys(categoryData).length}`);
console.log(`Categories with missing keywords: ${issues.length}`);

if (issues.length > 0) {
  console.log('\nCategories needing keyword updates:');
  issues.forEach(i => {
    console.log(`  - ${i.category}: ${i.totalTs}/${i.totalJson} keywords (${((i.totalTs/i.totalJson)*100).toFixed(0)}% coverage)`);
  });
}
