/**
 * Test Intent Loader
 *
 * Tests that IntentConfigService loads patterns cleanly
 *
 * Usage: npx ts-node --transpile-only scripts/test_intent_loader.ts
 */

import * as path from 'path';

// Import the IntentConfigService
import { IntentConfigService } from '../src/services/core/intentConfig.service';

async function main() {
  console.log('🔄 Testing IntentConfigService pattern loading...\n');

  const configPath = path.join(__dirname, '../src/data/intent_patterns.json');
  const service = new IntentConfigService(configPath, console);

  try {
    // Load patterns
    await service.loadPatterns();

    // Check if ready
    if (!service.isReady()) {
      console.error('❌ Service not ready after loadPatterns()');
      process.exit(1);
    }

    // Get statistics
    const stats = service.getStatistics();
    console.log('\n📊 Loader Statistics:');
    console.log(`   Total intents loaded: ${stats.totalIntents}`);
    console.log(`   Total keywords: ${stats.totalKeywords}`);
    console.log(`   Total compiled patterns: ${stats.totalPatterns}`);
    console.log('\n   By language:');
    for (const [lang, langStats] of Object.entries(stats.byLanguage)) {
      console.log(`     ${lang}: ${langStats.keywords} keywords, ${langStats.patterns} patterns`);
    }

    // Test getting specific patterns
    console.log('\n🧪 Testing pattern retrieval:');

    const testCases: Array<{ intent: string; lang: string }> = [
      { intent: 'DOC_QA', lang: 'en' },
      { intent: 'DOC_QA', lang: 'pt' },
      { intent: 'DOC_QA', lang: 'es' },
      { intent: 'CHITCHAT', lang: 'en' },
      { intent: 'META_AI', lang: 'en' },
      { intent: 'DOC_SEARCH', lang: 'pt' },
    ];

    for (const { intent, lang } of testCases) {
      const keywords = service.getKeywords(intent as any, lang as any);
      const patterns = service.getRegexPatterns(intent as any, lang as any);
      console.log(`   ${intent}/${lang}: ${keywords.length} keywords, ${patterns.length} patterns`);
    }

    // Test pattern matching
    console.log('\n🧪 Testing pattern matching:');

    const matchTests = [
      { query: 'what does the contract say about payment?', expectedIntent: 'DOC_QA', lang: 'en' },
      { query: 'hello, how are you?', expectedIntent: 'CHITCHAT', lang: 'en' },
      { query: 'how many documents do I have?', expectedIntent: 'DOC_ANALYTICS', lang: 'en' },
      { query: 'o que o documento diz sobre o prazo?', expectedIntent: 'DOC_QA', lang: 'pt' },
      { query: 'olá, tudo bem?', expectedIntent: 'CHITCHAT', lang: 'pt' },
    ];

    for (const { query, expectedIntent, lang } of matchTests) {
      const patterns = service.getRegexPatterns(expectedIntent as any, lang as any);
      const keywords = service.getKeywords(expectedIntent as any, lang as any);

      // Check keyword match
      const queryLower = query.toLowerCase();
      const keywordMatch = keywords.some(kw => queryLower.includes(kw.toLowerCase()));

      // Check pattern match
      const patternMatch = patterns.some(p => p.test(query));

      const matched = keywordMatch || patternMatch;
      const symbol = matched ? '✅' : '⚠️';
      console.log(`   ${symbol} "${query.substring(0, 40)}..." → ${expectedIntent} (${matched ? 'matched' : 'no match'})`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Intent loader test PASSED');

  } catch (error: any) {
    console.error('❌ Intent loader test FAILED:', error.message);
    process.exit(1);
  }
}

main();
