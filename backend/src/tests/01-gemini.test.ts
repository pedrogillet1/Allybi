import * as geminiService from '../services/openai.service';

interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function test_sendMessageToGemini() {
  const start = Date.now();
  try {
    const response = await geminiService.sendMessageToGeminiWithoutFunctions(
      'What is 2+2?',
      []
    );

    const passed = Boolean(response.text && response.text.includes('4'));
    results.push({
      test: 'sendMessageToGemini',
      passed,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'sendMessageToGemini',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_generateDocumentTags() {
  const start = Date.now();
  try {
    const tags = await geminiService.generateDocumentTags(
      'This is a document about artificial intelligence and machine learning',
      'test-doc-id'
    );

    const passed = Array.isArray(tags) && tags.length > 0;
    results.push({
      test: 'generateDocumentTags',
      passed,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'generateDocumentTags',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_generateText() {
  const start = Date.now();
  try {
    const text = await geminiService.generateText({
      prompt: 'Write a one sentence summary of photosynthesis',
      temperature: 0.7,
      maxTokens: 100
    });

    const passed = text.length > 10;
    results.push({
      test: 'generateText',
      passed,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'generateText',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

async function test_generateConversationTitle() {
  const start = Date.now();
  try {
    const title = await geminiService.generateConversationTitle('What is the weather today?');

    const passed = title.length > 0 && title.length <= 100;
    results.push({
      test: 'generateConversationTitle',
      passed,
      duration: Date.now() - start
    });
  } catch (error: any) {
    results.push({
      test: 'generateConversationTitle',
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
  }
}

export async function runTests() {
  await test_sendMessageToGemini();
  await test_generateDocumentTags();
  await test_generateText();
  await test_generateConversationTitle();
  return results;
}
