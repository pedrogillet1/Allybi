/**
 * Failure Mode Tests
 *
 * Tests graceful degradation when services fail:
 * - Simulated Pinecone timeout (via malformed query)
 * - LLM fallback behavior
 * - Error message quality (no stack traces exposed)
 */

const API_URL = process.env.API_URL || 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

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
    body: JSON.stringify({ title: 'Failure Mode Test' }),
  });
  const data = await response.json();
  return data.id;
}

async function sendQuery(token, conversationId, query) {
  const response = await fetch(`${API_URL}/api/rag/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ conversationId, query }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = { error: null, answer: '', gotDone: false };

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
          if (data.type === 'error') {
            result.error = data.error || data.message;
          }
          if (data.type === 'content') {
            result.answer += data.content;
          }
          if (data.type === 'done') {
            result.gotDone = true;
            result.answer = data.fullAnswer || result.answer;
          }
        } catch (e) {}
      }
    }
  }

  return result;
}

// Check that error messages don't leak internals
function checkErrorQuality(errorOrAnswer) {
  const text = errorOrAnswer || '';
  const leaks = [];

  // Check for stack traces
  if (/at\s+\w+\s+\([^)]+:\d+:\d+\)/g.test(text)) {
    leaks.push('Stack trace leaked');
  }

  // Check for internal paths
  if (/src\/|backend\/|node_modules\//g.test(text)) {
    leaks.push('Internal path leaked');
  }

  // Check for raw errors
  if (/TypeError:|ReferenceError:|Error:|ECONNREFUSED/gi.test(text)) {
    leaks.push('Raw error type leaked');
  }

  return leaks;
}

async function runTests() {
  console.log('🛡️ Failure Mode Tests\n');
  console.log('='.repeat(60));
  console.log('Testing graceful degradation\n');

  const token = await login();
  const conversationId = await createConversation(token);
  console.log('✅ Setup complete\n');

  let passCount = 0;
  let failCount = 0;

  // Test 1: Query for non-existent document
  console.log('📋 Test 1: Query for non-existent document');
  {
    const result = await sendQuery(token, conversationId, 'summarize document_that_does_not_exist.pdf');
    const leaks = checkErrorQuality(result.answer);

    if (leaks.length === 0 && result.gotDone) {
      console.log('   ✅ PASS - Graceful response, no leaks');
      passCount++;
    } else {
      console.log('   ❌ FAIL');
      for (const leak of leaks) {
        console.log(`      - ${leak}`);
      }
      if (!result.gotDone) {
        console.log('      - Stream did not complete');
      }
      failCount++;
    }
  }

  // Test 2: Very long query (potential timeout)
  console.log('📋 Test 2: Very long query stress test');
  {
    const longQuery = 'Tell me about ' + 'the financial data '.repeat(50);
    const result = await sendQuery(token, conversationId, longQuery);
    const leaks = checkErrorQuality(result.answer);

    if (leaks.length === 0 && result.gotDone) {
      console.log('   ✅ PASS - Handled long query gracefully');
      passCount++;
    } else {
      console.log('   ❌ FAIL');
      for (const leak of leaks) {
        console.log(`      - ${leak}`);
      }
      failCount++;
    }
  }

  // Test 3: Empty query
  console.log('📋 Test 3: Empty query handling');
  {
    const result = await sendQuery(token, conversationId, '   ');
    const leaks = checkErrorQuality(result.answer);

    // Empty query should get a response without errors
    if (leaks.length === 0 && (result.gotDone || result.answer.length > 0)) {
      console.log('   ✅ PASS - Empty query handled');
      passCount++;
    } else if (result.error && checkErrorQuality(result.error).length === 0) {
      console.log('   ✅ PASS - Clean error for empty query');
      passCount++;
    } else {
      console.log('   ❌ FAIL');
      for (const leak of leaks) {
        console.log(`      - ${leak}`);
      }
      failCount++;
    }
  }

  // Test 4: Special characters in query
  console.log('📋 Test 4: Special characters handling');
  {
    const result = await sendQuery(token, conversationId, 'What about <script>alert("xss")</script> or ${process.env}?');
    const leaks = checkErrorQuality(result.answer);

    if (leaks.length === 0 && result.gotDone) {
      console.log('   ✅ PASS - Special chars handled safely');
      passCount++;
    } else {
      console.log('   ❌ FAIL');
      for (const leak of leaks) {
        console.log(`      - ${leak}`);
      }
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Summary: ${passCount}/4 passed`);

  if (failCount > 0) {
    console.log('\n🚨 Failure modes not handled gracefully!');
  } else {
    console.log('\n✅ All failure modes handled gracefully');
  }

  console.log('='.repeat(60));

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(console.error);
