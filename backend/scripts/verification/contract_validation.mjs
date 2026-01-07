/**
 * Backend Output Contract Validation
 *
 * Tests that the backend returns the correct response schema
 * that the frontend expects for rendering.
 *
 * Also saves full SSE streams and done payloads to /tmp/verification/
 * for debugging and regression testing.
 *
 * Usage: node scripts/verification/contract_validation.mjs
 */

import fs from 'fs';
import path from 'path';

const API_URL = process.env.API_URL || 'http://localhost:5001';
const OUTPUT_DIR = '/tmp/verification';

// Test user credentials
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

// Expected source schema for frontend DocumentSources component
const EXPECTED_SOURCE_FIELDS = [
  'documentId',
  'filename',     // or documentName
  'location',     // Page X, Section Y
  'mimeType',     // optional
  'relevanceScore', // optional, 0-100
  'folderPath',   // optional
];

// Test queries organized by expected behavior
const TEST_CASES = [
  // Conversation (no RAG)
  {
    name: 'Conversation - hello',
    query: 'hello',
    expect: {
      intent: 'conversation',
      hasRAG: false,
      hasSources: false,
    }
  },
  {
    name: 'Conversation - thanks',
    query: 'thanks',
    expect: {
      intent: 'conversation',
      hasRAG: false,
      hasSources: false,
    }
  },

  // Help (no RAG typically)
  {
    name: 'Help - how to upload',
    query: 'how do I upload files?',
    expect: {
      intent: 'help',
      hasRAG: false,
      hasSources: false,
    }
  },

  // Workspace summary (catalog mode, no content citations)
  {
    name: 'Workspace summary',
    query: 'summarize my documents',
    expect: {
      intent: 'documents',
      scope: 'workspace',
      hasSources: false, // Catalog mode has no citations
      answerContains: ['📁', 'summary of your'], // Should have folder emoji and catalog text
    }
  },

  // Document QnA (should have structured sources)
  {
    name: 'Document QnA',
    query: 'what are the profit totals in Rosewood Fund?',
    expect: {
      intent: 'documents',
      hasRAG: true,
      hasSources: true,
      sourcesHaveFields: EXPECTED_SOURCE_FIELDS.slice(0, 3), // At minimum: documentId, filename, location
    }
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

async function login() {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  const data = await response.json();
  return data.accessToken;
}

async function createConversation(token) {
  const response = await fetch(`${API_URL}/api/chat/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ title: 'Contract Test' }),
  });

  if (!response.ok) {
    throw new Error(`Create conversation failed: ${response.status}`);
  }

  const data = await response.json();
  return data.id;
}

async function querySSE(token, conversationId, query, testName) {
  const response = await fetch(`${API_URL}/api/rag/query/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ conversationId, query }),
  });

  if (!response.ok) {
    throw new Error(`Query failed: ${response.status}`);
  }

  // Read SSE stream and extract done event
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneEvent = null;
  const allEvents = []; // Collect all events for stream save

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const messages = buffer.split('\n\n');
    buffer = messages.pop() || '';

    for (const message of messages) {
      if (message.startsWith('data: ')) {
        try {
          const data = JSON.parse(message.slice(6));
          allEvents.push(data);
          if (data.type === 'done') {
            doneEvent = data;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }

  // Save stream and done payload for debugging
  if (testName) {
    const safeName = testName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const streamsDir = path.join(OUTPUT_DIR, 'streams');
    const doneDir = path.join(OUTPUT_DIR, 'done');

    if (!fs.existsSync(streamsDir)) fs.mkdirSync(streamsDir, { recursive: true });
    if (!fs.existsSync(doneDir)) fs.mkdirSync(doneDir, { recursive: true });

    // Save stream as JSONL (one event per line)
    const streamPath = path.join(streamsDir, `${safeName}.jsonl`);
    fs.writeFileSync(streamPath, allEvents.map(e => JSON.stringify(e)).join('\n'));

    // Save done payload
    if (doneEvent) {
      const donePath = path.join(doneDir, `${safeName}.json`);
      fs.writeFileSync(donePath, JSON.stringify(doneEvent, null, 2));
    }
  }

  return doneEvent;
}

function validateSourceSchema(sources) {
  if (!Array.isArray(sources)) {
    return { valid: false, error: 'sources is not an array' };
  }

  const errors = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];

    if (!source.documentId) {
      errors.push(`sources[${i}]: missing documentId`);
    }

    if (!source.filename && !source.documentName) {
      errors.push(`sources[${i}]: missing filename/documentName`);
    }

    if (!source.location) {
      errors.push(`sources[${i}]: missing location`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function runTests() {
  console.log('🧪 Backend Contract Validation\n');
  console.log('='.repeat(60));

  let token, conversationId;

  try {
    // Setup
    console.log('\n📋 Setup');
    token = await login();
    console.log('   ✅ Logged in');

    conversationId = await createConversation(token);
    console.log('   ✅ Created conversation:', conversationId);

  } catch (error) {
    console.error('   ❌ Setup failed:', error.message);
    process.exit(1);
  }

  console.log('\n📊 Test Results');
  console.log('-'.repeat(60));

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const testCase of TEST_CASES) {
    console.log(`\n🔍 ${testCase.name}`);
    console.log(`   Query: "${testCase.query}"`);

    try {
      const response = await querySSE(token, conversationId, testCase.query, testCase.name);

      if (!response) {
        console.log('   ❌ FAIL: No done event received');
        failed++;
        results.push({ ...testCase, status: 'FAIL', error: 'No done event' });
        continue;
      }

      const errors = [];

      // Check intent
      if (testCase.expect.intent && response.intent !== testCase.expect.intent) {
        errors.push(`intent: expected '${testCase.expect.intent}', got '${response.intent}'`);
      }

      // Check sources presence
      if (testCase.expect.hasSources) {
        if (!response.sources || response.sources.length === 0) {
          errors.push('expected sources but got none');
        } else {
          // Validate source schema
          const validation = validateSourceSchema(response.sources);
          if (!validation.valid) {
            errors.push(...validation.errors);
          } else {
            console.log(`   ✅ Sources schema valid (${response.sources.length} sources)`);
          }
        }
      } else if (testCase.expect.hasSources === false) {
        if (response.sources && response.sources.length > 0) {
          // This is acceptable - having sources when not expected is ok
          console.log(`   ℹ️  Sources present (${response.sources.length}) but not required`);
        }
      }

      // Check answer contains expected strings
      if (testCase.expect.answerContains) {
        const answer = response.fullAnswer || '';
        for (const expected of testCase.expect.answerContains) {
          if (!answer.includes(expected)) {
            errors.push(`answer missing expected content: '${expected}'`);
          }
        }
      }

      if (errors.length === 0) {
        console.log('   ✅ PASS');
        passed++;
        results.push({ ...testCase, status: 'PASS', response: summarizeResponse(response) });
      } else {
        console.log('   ❌ FAIL:');
        for (const error of errors) {
          console.log(`      - ${error}`);
        }
        failed++;
        results.push({ ...testCase, status: 'FAIL', errors, response: summarizeResponse(response) });
      }

    } catch (error) {
      console.log(`   ❌ FAIL: ${error.message}`);
      failed++;
      results.push({ ...testCase, status: 'FAIL', error: error.message });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log(`   Total: ${TEST_CASES.length}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log('='.repeat(60));

  // Save results to file
  const fs = await import('fs');
  const outputPath = '/tmp/contract_validation_results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Results saved to: ${outputPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

function summarizeResponse(response) {
  return {
    intent: response.intent,
    confidence: response.confidence,
    hasSources: response.sources?.length > 0,
    sourceCount: response.sources?.length || 0,
    sourceFields: response.sources?.[0] ? Object.keys(response.sources[0]) : [],
    documentsUsed: response.documentsUsed,
    answerLength: response.fullAnswer?.length || 0,
  };
}

runTests().catch(console.error);
