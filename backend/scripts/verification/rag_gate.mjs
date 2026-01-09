/**
 * RAG Gate Verification Test
 *
 * Verifies that non-RAG intents DON'T hit Pinecone:
 * - Greetings should NOT trigger retrieval
 * - Help queries should NOT trigger retrieval
 * - Chitchat should NOT trigger retrieval
 * - Only doc_qa, summarize, compare should trigger RAG
 */

const API_URL = process.env.API_URL || 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

// Queries that should NOT trigger RAG
const NO_RAG_QUERIES = [
  { query: 'hello', name: 'Greeting', expectedIntent: 'greeting' },
  { query: 'how do I upload files?', name: 'Help', expectedIntent: 'help' },
  { query: 'what can you do?', name: 'Capabilities', expectedIntent: 'help' },
  { query: 'thank you', name: 'Thanks', expectedIntent: 'chitchat' },
  { query: 'summarize my documents', name: 'Workspace List', expectedIntent: 'documents' }, // Lists docs from DB, no RAG
];

// Queries that SHOULD trigger RAG
const RAG_QUERIES = [
  { query: 'what are the profit totals in Rosewood Fund?', name: 'Doc QnA', expectedIntent: 'doc_qa' },
  { query: 'summarize Rosewood Fund v3.xlsx', name: 'Single Doc Summary', expectedIntent: 'summarize' },
];

async function login() {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const data = await response.json();
  return data.accessToken;
}

async function createConversation(token) {
  const response = await fetch(`${API_URL}/api/chat/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ title: 'RAG Gate Test' }),
  });
  const data = await response.json();
  return data.id;
}

async function queryAndTrackEvents(token, conversationId, query) {
  const response = await fetch(`${API_URL}/api/rag/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ conversationId, query }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const events = {
    intent: null,
    retrieving: false,
    sources: [],
    done: false,
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const messages = buffer.split('\n\n');
    buffer = messages.pop() || '';

    for (const msg of messages) {
      if (msg.startsWith('data: ')) {
        try {
          const data = JSON.parse(msg.slice(6));

          if (data.type === 'intent') {
            events.intent = data.intent;
          }
          if (data.type === 'retrieving') {
            events.retrieving = true;
          }
          if (data.type === 'done') {
            events.done = true;
            events.sources = data.sources || [];
          }
        } catch (e) {}
      }
    }
  }

  return events;
}

async function runTests() {
  console.log('🚪 RAG Gate Verification Test\n');
  console.log('='.repeat(60));
  console.log('Verifies non-RAG intents do NOT hit Pinecone\n');

  const token = await login();
  const conversationId = await createConversation(token);
  console.log('✅ Setup complete\n');

  let passCount = 0;
  let failCount = 0;

  // Test NO-RAG queries
  console.log('--- NO-RAG Queries (should NOT trigger retrieval) ---\n');
  for (const { query, name, expectedIntent } of NO_RAG_QUERIES) {
    console.log(`🔍 ${name}`);
    console.log(`   Query: "${query}"`);

    const events = await queryAndTrackEvents(token, conversationId, query);

    const triggeredRAG = events.retrieving || events.sources.length > 0;

    if (!triggeredRAG) {
      console.log(`   ✅ PASS - No RAG triggered (intent: ${events.intent || 'unknown'})`);
      passCount++;
    } else {
      console.log(`   ❌ FAIL - RAG was triggered!`);
      console.log(`      - Retrieving event: ${events.retrieving}`);
      console.log(`      - Sources: ${events.sources.length}`);
      failCount++;
    }
  }

  console.log('\n--- RAG Queries (should trigger retrieval) ---\n');
  for (const { query, name, expectedIntent } of RAG_QUERIES) {
    console.log(`🔍 ${name}`);
    console.log(`   Query: "${query}"`);

    const events = await queryAndTrackEvents(token, conversationId, query);

    const triggeredRAG = events.retrieving || events.sources.length > 0;

    if (triggeredRAG) {
      console.log(`   ✅ PASS - RAG triggered correctly (${events.sources.length} sources)`);
      passCount++;
    } else {
      console.log(`   ❌ FAIL - RAG should have been triggered!`);
      console.log(`      - Intent: ${events.intent || 'unknown'}`);
      failCount++;
    }
  }

  const total = NO_RAG_QUERIES.length + RAG_QUERIES.length;
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Summary: ${passCount}/${total} passed`);

  if (failCount > 0) {
    console.log('\n🚨 RAG gate leaking! Check intent routing.');
  } else {
    console.log('\n✅ RAG gate working correctly');
  }

  console.log('='.repeat(60));

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(console.error);
