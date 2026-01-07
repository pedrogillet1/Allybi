/**
 * Answer Structure Contract Test
 *
 * Hard assertions that FAIL FAST if answer structure is broken:
 * - No internal service names (.service.ts)
 * - No raw file paths (src/, backend/)
 * - No JSON blobs in answers
 * - Inline citations exist if sources > 0
 * - No stack traces
 */

const API_URL = process.env.API_URL || 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

// FORBIDDEN patterns that should NEVER appear in answers
const FORBIDDEN_PATTERNS = [
  { pattern: /\.service\.ts/gi, name: 'Service file reference' },
  { pattern: /\.controller\.ts/gi, name: 'Controller file reference' },
  { pattern: /src\/services\//gi, name: 'Source path' },
  { pattern: /backend\/src\//gi, name: 'Backend path' },
  { pattern: /node_modules\//gi, name: 'Node modules path' },
  { pattern: /at\s+\w+\s+\([^)]+:\d+:\d+\)/g, name: 'Stack trace' },
  { pattern: /TypeError:|ReferenceError:|SyntaxError:/gi, name: 'JS Error' },
  { pattern: /\{\s*"[^"]+"\s*:\s*[{\[]/g, name: 'Raw JSON blob' },
  { pattern: /\\n\\n|\\t/g, name: 'Escaped newlines' },
  { pattern: /undefined|null(?=\s|$|,)/gi, name: 'Undefined/null values' },
];

const TEST_QUERIES = [
  { query: 'hello', name: 'Greeting', expectSources: false },
  { query: 'how do I upload files?', name: 'Help', expectSources: false },
  { query: 'summarize my documents', name: 'Workspace summary', expectSources: false },
  { query: 'what are the profit totals in Rosewood Fund?', name: 'Doc QnA', expectSources: true },
  { query: 'summarize Rosewood Fund v3.xlsx', name: 'Single doc', expectSources: true },
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
    body: JSON.stringify({ title: 'Structure Test' }),
  });
  const data = await response.json();
  return data.id;
}

async function queryAndCheck(token, conversationId, query) {
  const response = await fetch(`${API_URL}/api/rag/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ conversationId, query }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let donePayload = null;

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
          if (data.type === 'done') {
            donePayload = data;
          }
        } catch (e) {}
      }
    }
  }

  return donePayload;
}

function checkStructure(answer, sources, expectSources) {
  const violations = [];

  // Check forbidden patterns
  for (const { pattern, name } of FORBIDDEN_PATTERNS) {
    const match = answer.match(pattern);
    if (match) {
      violations.push(`FORBIDDEN: ${name} - "${match[0].slice(0, 50)}"`);
    }
  }

  // Check citation requirement
  if (expectSources && sources && sources.length > 0) {
    // Should have DOC markers or (Source: X) references
    const hasDocMarkers = /\{\{DOC::/g.test(answer);
    const hasSourceRefs = /\(Source:/gi.test(answer);

    if (!hasDocMarkers && !hasSourceRefs) {
      violations.push(`CITATION: ${sources.length} sources but no inline citations`);
    }
  }

  // Check for empty answer
  if (!answer || answer.trim().length < 10) {
    violations.push('EMPTY: Answer too short (<10 chars)');
  }

  return violations;
}

async function runTests() {
  console.log('📋 Answer Structure Contract Test\n');
  console.log('='.repeat(60));
  console.log('FAIL FAST if structure is broken\n');

  const token = await login();
  const conversationId = await createConversation(token);
  console.log('✅ Setup complete\n');

  let passCount = 0;
  let failCount = 0;
  const allViolations = [];

  for (const { query, name, expectSources } of TEST_QUERIES) {
    console.log(`🔍 ${name}`);
    console.log(`   Query: "${query}"`);

    try {
      const result = await queryAndCheck(token, conversationId, query);

      const answer = result?.formatted || result?.fullAnswer || '';
      const sources = result?.sources || [];

      const violations = checkStructure(answer, sources, expectSources);

      if (violations.length === 0) {
        console.log(`   ✅ PASS - ${answer.length} chars, ${sources.length} sources`);
        passCount++;
      } else {
        console.log(`   ❌ FAIL - ${violations.length} violation(s):`);
        for (const v of violations) {
          console.log(`      - ${v}`);
        }
        failCount++;
        allViolations.push({ name, violations });
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Summary: ${passCount}/${TEST_QUERIES.length} passed`);

  if (failCount > 0) {
    console.log('\n🚨 FAIL FAST: Structure violations detected!');
    console.log('   Fix these before deploying to VPS.');
  } else {
    console.log('\n✅ All structure contracts satisfied');
  }

  console.log('='.repeat(60));

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(console.error);
