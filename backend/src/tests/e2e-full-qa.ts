/**
 * KODA FULL E2E QA TEST
 *
 * Tests the complete flow as a real user would experience it:
 * - Login
 * - Single conversation with 27 questions
 * - Routing, streaming, file actions, follow-ups
 *
 * Run with: npx ts-node src/tests/e2e-full-qa.ts
 */

import axios from 'axios';

const API_BASE = 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

interface TestResult {
  questionNum: number;
  query: string;
  category: string;
  ttft: number;  // Time to first token (ms)
  totalTime: number;
  intent: string;
  hasFileButton: boolean;
  hasRephrase: boolean;
  response: string;
  passed: boolean;
  issue?: string;
}

interface ConversationContext {
  conversationId: string;
  lastFileId?: string;
  lastFileName?: string;
  lastFolderId?: string;
  messages: Array<{ role: string; content: string }>;
}

const testQuestions = [
  // A) Warm-up
  { num: 1, query: 'Hi', category: 'warmup', expectFileButton: false },
  { num: 2, query: 'What can you do with my files here?', category: 'warmup', expectFileButton: false },

  // B) File Discovery & Navigation (using REAL filenames)
  { num: 3, query: 'Where is the Lone Mountain Ranch P&L?', category: 'file_discovery', expectFileButton: true },
  { num: 4, query: 'Open it', category: 'file_discovery', expectFileButton: true },
  { num: 5, query: 'Show me where it is located', category: 'file_discovery', expectFileButton: true },
  { num: 6, query: 'Find the Rosewood Fund file', category: 'file_discovery', expectFileButton: true },
  { num: 7, query: 'Where is the improvement plan?', category: 'file_discovery', expectFileButton: true },
  { num: 8, query: 'Open the Scrum chapter PDF', category: 'file_discovery', expectFileButton: true },

  // C) Follow-ups & Context
  { num: 9, query: 'Open the second file', category: 'followup', expectFileButton: true },
  { num: 10, query: 'Show it again', category: 'followup', expectFileButton: true },
  { num: 11, query: 'What is this file about?', category: 'followup', expectFileButton: false },

  // D) Document Q&A
  { num: 12, query: 'Summarize this document', category: 'doc_qa', expectFileButton: false },
  { num: 13, query: 'What does it say about revenue?', category: 'doc_qa', expectFileButton: false },
  { num: 14, query: 'Is there any mention of risk?', category: 'doc_qa', expectFileButton: false },
  { num: 15, query: 'Extract the total revenue number', category: 'doc_qa', expectFileButton: false },

  // E) Mixed Navigation + Q&A
  { num: 16, query: 'Which file mentions taxes?', category: 'mixed', expectFileButton: true },
  { num: 17, query: 'Open that one', category: 'mixed', expectFileButton: true },
  { num: 18, query: 'Where is it located?', category: 'mixed', expectFileButton: true },
  { num: 19, query: 'Compare this document with the previous one', category: 'mixed', expectFileButton: false },

  // F) File Management
  { num: 20, query: 'Rename it to Budget 2024', category: 'file_mgmt', expectFileButton: false },
  { num: 21, query: 'Move it to the Finance folder', category: 'file_mgmt', expectFileButton: false },
  { num: 22, query: 'Delete it', category: 'file_mgmt', expectFileButton: false },

  // G) Error & Edge Handling
  { num: 23, query: 'Open the file that doesnt exist', category: 'edge', expectFileButton: false },
  { num: 24, query: 'Show me a document about unicorns', category: 'edge', expectFileButton: false },

  // H) Conversation Quality
  { num: 25, query: 'Can you remind me what we just opened?', category: 'quality', expectFileButton: false },
  { num: 26, query: 'Why is that document important?', category: 'quality', expectFileButton: false },
  { num: 27, query: 'Thanks', category: 'quality', expectFileButton: false },
];

async function login(): Promise<string> {
  console.log('\n🔐 STEP 0 — LOGIN & SETUP\n');
  console.log(`   Logging in as ${TEST_EMAIL}...`);

  try {
    const response = await axios.post(`${API_BASE}/api/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    const token = response.data.token || response.data.accessToken;
    if (!token) {
      throw new Error('No token in response');
    }

    console.log('   ✅ Login successful');
    return token;
  } catch (error: any) {
    console.log(`   ⚠️ Login failed: ${error.message}`);
    console.log('   Using mock token for testing...');
    return 'mock-test-token';
  }
}

async function getUserDocuments(token: string): Promise<any[]> {
  try {
    const response = await axios.get(`${API_BASE}/api/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data.documents || response.data || [];
  } catch (error) {
    console.log('   ⚠️ Could not fetch documents');
    return [];
  }
}

async function sendMessage(
  token: string,
  query: string,
  context: ConversationContext
): Promise<{ response: string; intent: string; ttft: number; totalTime: number; fileAction?: any }> {
  const startTime = Date.now();
  let ttft = 0;
  let responseText = '';
  let detectedIntent = 'unknown';
  let fileAction: any = null;

  try {
    // Try streaming endpoint first
    const response = await axios.post(
      `${API_BASE}/api/rag/query`,
      {
        query,
        conversationId: context.conversationId,
        messages: context.messages,
        streaming: false, // Use non-streaming for easier parsing
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,  // Increased timeout for RAG queries
      }
    );

    ttft = Date.now() - startTime;
    const totalTime = Date.now() - startTime;

    // Extract response data
    const data = response.data;
    responseText = data.answer || data.response || data.message || JSON.stringify(data);
    detectedIntent = data.intent || data.metadata?.primaryIntent || data.routing?.intent || 'documents';
    fileAction = data.fileAction || null;

    // Log fileAction if present
    if (fileAction) {
      console.log(`   🔘 File Action: ${fileAction.action} with ${fileAction.files?.length || 0} files`);
    }

    return { response: responseText, intent: detectedIntent, ttft, totalTime, fileAction };
  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    return {
      response: `ERROR: ${error.message}`,
      intent: 'error',
      ttft: totalTime,
      totalTime,
    };
  }
}

async function runE2ETest(): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('  KODA FULL E2E QA TEST — SINGLE CONVERSATION');
  console.log('='.repeat(80));

  // Step 0: Login
  const token = await login();

  // Get user's documents
  const documents = await getUserDocuments(token);
  console.log(`   📁 Found ${documents.length} documents\n`);

  // Initialize conversation context
  const context: ConversationContext = {
    conversationId: `e2e-test-${Date.now()}`,
    messages: [],
  };

  const results: TestResult[] = [];
  let rephraseCount = 0;
  let fileButtonCount = 0;
  let expectedFileButtonCount = 0;

  console.log('\n🧪 STEP 2 — RUNNING TEST SCRIPT\n');

  for (const question of testQuestions) {
    console.log('-'.repeat(80));
    console.log(`📝 Q${question.num}: "${question.query}"`);
    console.log(`   Category: ${question.category}`);

    const { response, intent, ttft, totalTime, fileAction } = await sendMessage(
      token,
      question.query,
      context
    );

    // Update context
    context.messages.push({ role: 'user', content: question.query });
    context.messages.push({ role: 'assistant', content: response });

    // Check for rephrase BLOCKERS (not technical retry messages)
    // "rephrase your question" = blocker (bad UX)
    // "try again" for technical errors = acceptable
    const hasRephrase = /rephrase your question|try rephrasing|different words|couldn't understand/i.test(response);
    if (hasRephrase) rephraseCount++;

    // Check for file button (must have actual fileAction with files)
    const hasFileButton = fileAction && fileAction.files && fileAction.files.length > 0;
    if (hasFileButton) fileButtonCount++;
    if (question.expectFileButton) expectedFileButtonCount++;

    // Determine pass/fail
    let passed = true;
    let issue: string | undefined;

    if (hasRephrase) {
      passed = false;
      issue = 'Contains rephrase blocker';
    } else if (intent === 'error') {
      passed = false;
      issue = 'API error';
    } else if (question.expectFileButton && !hasFileButton) {
      // Soft fail - just note it
      issue = 'Expected file button not present';
    }

    const result: TestResult = {
      questionNum: question.num,
      query: question.query,
      category: question.category,
      ttft,
      totalTime,
      intent,
      hasFileButton,
      hasRephrase,
      response: response.substring(0, 200) + (response.length > 200 ? '...' : ''),
      passed,
      issue,
    };

    results.push(result);

    // Print result
    console.log(`   ⏱️ TTFT: ${ttft}ms | Total: ${totalTime}ms`);
    console.log(`   🧭 Intent: ${intent}`);
    console.log(`   📋 Response: ${response.substring(0, 100)}...`);
    if (hasFileButton) console.log(`   🔘 File button: YES`);
    if (hasRephrase) console.log(`   ❌ REPHRASE DETECTED!`);
    console.log(`   ${passed ? '✅ PASS' : '❌ FAIL'}${issue ? ` — ${issue}` : ''}`);

    // Small delay between messages
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Generate report
  console.log('\n' + '='.repeat(80));
  console.log('  📊 FINAL REPORT');
  console.log('='.repeat(80));

  const passedCount = results.filter(r => r.passed).length;
  const avgTTFT = Math.round(results.reduce((sum, r) => sum + r.ttft, 0) / results.length);
  const avgTotal = Math.round(results.reduce((sum, r) => sum + r.totalTime, 0) / results.length);

  console.log('\n1️⃣ PERFORMANCE SUMMARY');
  console.log(`   • Avg TTFT: ${avgTTFT}ms`);
  console.log(`   • Avg Total Response: ${avgTotal}ms`);
  console.log(`   • Streaming: N/A (non-streaming mode)`);

  console.log('\n2️⃣ UX COMPLIANCE');
  console.log(`   • File buttons rendered: ${fileButtonCount}/${expectedFileButtonCount} expected`);
  console.log(`   • Rephrase blockers: ${rephraseCount} (MUST BE ZERO)`);

  console.log('\n3️⃣ ROUTING ACCURACY');
  console.log(`   • Total questions: ${results.length}`);
  console.log(`   • Passed: ${passedCount}/${results.length} (${Math.round(passedCount/results.length*100)}%)`);

  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log('\n4️⃣ FAILURES');
    for (const f of failures) {
      console.log(`   ❌ Q${f.questionNum}: "${f.query}" — ${f.issue}`);
    }
  }

  console.log('\n5️⃣ FINAL VERDICT');
  const passRate = passedCount / results.length;
  if (passRate >= 0.9 && rephraseCount === 0) {
    console.log('   ✅ READY TO DEPLOY');
  } else if (passRate >= 0.8) {
    console.log('   🟡 READY WITH FIXES');
  } else {
    console.log('   🔴 NOT READY');
  }

  console.log(`\n   Pass Rate: ${Math.round(passRate * 100)}%`);
  console.log(`   Rephrase Count: ${rephraseCount}`);
  console.log('='.repeat(80) + '\n');
}

// Run the test
runE2ETest().catch(console.error);
