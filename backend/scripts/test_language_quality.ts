/**
 * Test Script: Language Quality & Cultural Profile Verification
 *
 * Tests the cultural profile system by verifying that KODA responds
 * with appropriate language, tone, and currency based on detected language.
 *
 * This script includes built-in cultural profiles to test the concept
 * before/after the database-driven implementation is complete.
 *
 * Run with: npx ts-node src/scripts/test_language_quality.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { GoogleGenerativeAI } from '@google/generative-ai';
import * as languageService from '../services/languageDetection.service';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 500,
  },
});

// ============================================================================
// Cultural Profile System (built-in for testing)
// This mirrors what the database-driven system should provide
// ============================================================================

interface CulturalContext {
  languageCode: string;
  systemPrompt: string;
  tone: string;
  currency: string | null;
}

const CULTURAL_PROFILES: Record<string, CulturalContext> = {
  en: {
    languageCode: 'en',
    systemPrompt:
      'You are Koda, a helpful and efficient AI assistant. Your tone should be professional yet friendly.',
    tone: 'friendly',
    currency: 'USD',
  },
  pt: {
    languageCode: 'pt',
    systemPrompt:
      'Você é a KODA, uma assistente de IA prestativa e eficiente. Seu tom deve ser formal e respeitoso. Use a moeda BRL para exemplos financeiros.',
    tone: 'formal',
    currency: 'BRL',
  },
  es: {
    languageCode: 'es',
    systemPrompt:
      'Eres KODA, un asistente de IA servicial y eficiente. Tu tono debe ser amigable. Utiliza la moneda EUR para ejemplos financieros.',
    tone: 'friendly',
    currency: 'EUR',
  },
  fr: {
    languageCode: 'fr',
    systemPrompt:
      'Vous êtes KODA, un assistant IA serviable et efficace. Votre ton doit être poli et professionnel. Utilisez la monnaie EUR pour les exemples financiers.',
    tone: 'formal',
    currency: 'EUR',
  },
};

/**
 * Get cultural profile for a language
 */
function getCulturalProfile(languageCode: string): CulturalContext {
  return CULTURAL_PROFILES[languageCode] || CULTURAL_PROFILES.en;
}

/**
 * Build a culturally-aware system prompt
 */
function buildCulturalSystemPrompt(languageCode: string, additionalContext?: string): string {
  const profile = getCulturalProfile(languageCode);

  let systemPrompt = profile.systemPrompt;

  // Add tone guidance
  if (profile.tone === 'formal') {
    systemPrompt += ' Maintain a formal and respectful tone throughout the conversation.';
  } else if (profile.tone === 'friendly') {
    systemPrompt += ' Keep your responses warm and approachable.';
  }

  // Add currency context if available
  if (profile.currency) {
    systemPrompt += ` When discussing monetary values, use ${profile.currency} as the default currency.`;
  }

  // Add any additional context
  if (additionalContext) {
    systemPrompt += ` ${additionalContext}`;
  }

  return systemPrompt;
}

// ============================================================================
// Test Cases
// ============================================================================

interface TestCase {
  lang: string;
  query: string;
  expectedCurrency: string;
  description: string;
}

const testCases: TestCase[] = [
  {
    lang: 'pt',
    query: 'Quanto custaria um café? Dê um exemplo.',
    expectedCurrency: 'BRL',
    description: 'Portuguese - Brazilian Real currency',
  },
  {
    lang: 'es',
    query: '¿Cuánto costaría un café? Dame un ejemplo.',
    expectedCurrency: 'EUR',
    description: 'Spanish - Euro currency',
  },
  {
    lang: 'en',
    query: 'How much would a coffee cost? Give an example.',
    expectedCurrency: 'USD',
    description: 'English - US Dollar currency',
  },
  {
    lang: 'fr',
    query: 'Combien coûterait un café? Donnez-moi un exemple.',
    expectedCurrency: 'EUR',
    description: 'French - Euro currency',
  },
];

// ============================================================================
// Test Functions
// ============================================================================

async function testLanguage(testCase: TestCase): Promise<{
  passed: boolean;
  response: string;
  error?: string;
}> {
  const { lang, query, expectedCurrency, description } = testCase;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Testing: ${description}`);
  console.log(`Language: ${lang.toUpperCase()}`);
  console.log(`Query: "${query}"`);
  console.log(`Expected Currency: ${expectedCurrency}`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // Build the cultural system prompt
    const systemPrompt = buildCulturalSystemPrompt(lang);
    console.log('\nSystem Prompt:');
    console.log(systemPrompt);

    // Get the cultural profile for inspection
    const profile = getCulturalProfile(lang);
    console.log(`\nCultural Profile - Tone: ${profile.tone}, Currency: ${profile.currency}`);

    // Make the LLM call
    const fullPrompt = `${systemPrompt}\n\nUser: ${query}`;

    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const content = response.text() || '';

    console.log('\nKODA Response:');
    console.log(content);

    // Check for expected currency in response
    const hasCurrency =
      content.includes(expectedCurrency) ||
      content.includes(expectedCurrency.toLowerCase()) ||
      // Also check for currency symbols
      (expectedCurrency === 'BRL' && content.includes('R$')) ||
      (expectedCurrency === 'USD' && content.includes('$')) ||
      (expectedCurrency === 'EUR' && content.includes('€'));

    if (hasCurrency) {
      console.log(`\n✅ SUCCESS: Found expected currency '${expectedCurrency}' or its symbol.`);
      return { passed: true, response: content };
    } else {
      console.log(`\n❌ FAILED: Did not find expected currency '${expectedCurrency}'.`);
      return { passed: false, response: content };
    }
  } catch (error: any) {
    console.log(`\n❌ ERROR: ${error.message}`);
    return { passed: false, response: '', error: error.message };
  }
}

async function testLanguageDetection(): Promise<{ passed: number; total: number }> {
  console.log('\n' + '═'.repeat(60));
  console.log('Testing Language Detection');
  console.log('═'.repeat(60));

  const detectionTests = [
    { input: 'Olá, como você está?', expected: 'pt' },
    { input: 'Hola, ¿cómo estás?', expected: 'es' },
    { input: 'Hello, how are you?', expected: 'en' },
    { input: 'Bonjour, comment allez-vous?', expected: 'fr' },
  ];

  let passed = 0;
  for (const test of detectionTests) {
    const detected = languageService.detectLanguage(test.input);
    const success = detected === test.expected;
    if (success) passed++;

    console.log(
      `${success ? '✅' : '❌'} "${test.input}" => ${detected} (expected: ${test.expected})`
    );
  }

  console.log(`\nLanguage Detection: ${passed}/${detectionTests.length} passed`);
  return { passed, total: detectionTests.length };
}

async function testGreetingDetection(): Promise<{ passed: number; total: number }> {
  console.log('\n' + '═'.repeat(60));
  console.log('Testing Greeting Detection');
  console.log('═'.repeat(60));

  const greetingTests = [
    { input: 'Hello', expected: true },
    { input: 'Hi!', expected: true },
    { input: 'Olá', expected: true },
    { input: 'Hola', expected: true },
    { input: 'Bonjour', expected: true },
    { input: 'What is the capital of France?', expected: false },
    { input: 'Quanto custa isso?', expected: false },
  ];

  let passed = 0;
  for (const test of greetingTests) {
    const isGreeting = languageService.isGreeting(test.input);
    const success = isGreeting === test.expected;
    if (success) passed++;

    console.log(
      `${success ? '✅' : '❌'} "${test.input}" => ${isGreeting} (expected: ${test.expected})`
    );
  }

  console.log(`\nGreeting Detection: ${passed}/${greetingTests.length} passed`);
  return { passed, total: greetingTests.length };
}

async function testLocalizedGreetings(): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log('Testing Localized Greetings');
  console.log('═'.repeat(60));

  const languages = ['en', 'pt', 'es', 'fr'];

  for (const lang of languages) {
    const greeting = languageService.getLocalizedGreeting(lang);
    console.log(`\n${lang.toUpperCase()}: ${greeting}`);
  }
}

async function testLocalizedErrors(): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log('Testing Localized Error Messages');
  console.log('═'.repeat(60));

  const errorTypes = ['no_documents', 'general_error', 'file_not_found'];
  const languages = ['en', 'pt', 'es', 'fr'];

  for (const errorType of errorTypes) {
    console.log(`\n${errorType}:`);
    for (const lang of languages) {
      const error = languageService.getLocalizedError(errorType, lang);
      console.log(`  ${lang.toUpperCase()}: ${error}`);
    }
  }
}

async function testCulturalProfiles(): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log('Testing Cultural Profiles');
  console.log('═'.repeat(60));

  const languages = ['en', 'pt', 'es', 'fr'];

  for (const lang of languages) {
    const profile = getCulturalProfile(lang);
    console.log(`\n${lang.toUpperCase()}:`);
    console.log(`  Tone: ${profile.tone}`);
    console.log(`  Currency: ${profile.currency}`);
    console.log(`  System Prompt: ${profile.systemPrompt.substring(0, 80)}...`);
  }
}

async function runTests(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('  KODA Language Quality & Cultural Profile Tests');
  console.log('═'.repeat(60));

  let totalPassed = 0;
  let totalTests = 0;

  // Test language detection (no LLM needed)
  const langDetection = await testLanguageDetection();
  totalPassed += langDetection.passed;
  totalTests += langDetection.total;

  // Test greeting detection (no LLM needed)
  const greetingDetection = await testGreetingDetection();
  totalPassed += greetingDetection.passed;
  totalTests += greetingDetection.total;

  // Test localized greetings (no LLM needed)
  await testLocalizedGreetings();

  // Test localized errors (no LLM needed)
  await testLocalizedErrors();

  // Test cultural profiles (no LLM needed)
  await testCulturalProfiles();

  // Test LLM responses with cultural context
  console.log('\n' + '═'.repeat(60));
  console.log('Testing LLM Responses with Cultural Context');
  console.log('═'.repeat(60));

  let llmPassed = 0;
  let llmFailed = 0;

  for (const testCase of testCases) {
    const result = await testLanguage(testCase);

    if (result.passed) {
      llmPassed++;
    } else {
      llmFailed++;
    }

    // Add delay between API calls to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  totalPassed += llmPassed;
  totalTests += testCases.length;

  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('  TEST SUMMARY');
  console.log('═'.repeat(60));

  console.log('\nUnit Tests (Language Detection + Greeting Detection):');
  console.log(
    `  ✅ Passed: ${langDetection.passed + greetingDetection.passed}/${langDetection.total + greetingDetection.total}`
  );

  console.log('\nLLM Integration Tests (Cultural Context):');
  console.log(`  ✅ Passed: ${llmPassed}/${testCases.length}`);
  console.log(`  ❌ Failed: ${llmFailed}/${testCases.length}`);

  console.log('\nOverall Results:');
  console.log(`  ✅ Total Passed: ${totalPassed}/${totalTests}`);

  const successRate = (totalPassed / totalTests) * 100;
  console.log(`  📊 Success Rate: ${successRate.toFixed(1)}%`);

  const llmSuccessRate = (llmPassed / testCases.length) * 100;
  console.log(`  🤖 LLM Success Rate: ${llmSuccessRate.toFixed(1)}%`);

  if (successRate >= 75 && llmSuccessRate >= 50) {
    console.log('\n🎉 SUCCESS! Cultural profile system is working correctly.\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️  WARNING: Some tests failed.`);
    if (llmSuccessRate < 50) {
      console.log('   LLM may not be respecting cultural currency preferences.');
      console.log('   Consider strengthening the system prompt instructions.');
    }
    console.log('   Review the cultural profiles and system prompts.\n');
    process.exit(1);
  }
}

// Run all tests
runTests().catch((error) => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});
