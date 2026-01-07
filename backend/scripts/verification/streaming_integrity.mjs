/**
 * Streaming Integrity Test
 * Verifies stream output has no corruption:
 * - No dangling bullets
 * - No unclosed code blocks
 * - No partial markdown
 * - Clean stream completion
 */

const API_URL = process.env.API_URL || 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

const TEST_QUERIES = [
  { query: 'summarize Rosewood Fund v3.xlsx', name: 'Single doc summary' },
  { query: 'compare revenue between Baxter Hotel and Lone Mountain Ranch', name: 'Comparison' },
  { query: 'what are the profit totals?', name: 'Doc QnA' },
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
    body: JSON.stringify({ title: 'Streaming Test' }),
  });
  const data = await response.json();
  return data.id;
}

function checkMarkdownIntegrity(text) {
  const issues = [];

  // Check for unclosed code blocks
  const codeBlockCount = (text.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    issues.push('Unclosed code block (odd number of ```)');
  }

  // Check for dangling bullets (bullet at end with no content)
  if (/[-*]\s*$/.test(text)) {
    issues.push('Dangling bullet at end');
  }

  // Check for unclosed bold/italic
  const boldCount = (text.match(/\*\*/g) || []).length;
  if (boldCount % 2 !== 0) {
    issues.push('Unclosed bold markers');
  }

  // Check for truncated sentences (ends mid-word)
  const lastChar = text.trim().slice(-1);
  if (/[a-zA-Z]/.test(lastChar) && !/[.!?:)\]"]/.test(lastChar)) {
    // Allow if it ends with a word that could be a proper ending
    const lastWord = text.trim().split(/\s+/).pop();
    if (lastWord && lastWord.length < 3) {
      issues.push(`Possible truncation: ends with "${lastWord}"`);
    }
  }

  // Check for partial JSON
  if (text.includes('{') && !text.includes('}')) {
    issues.push('Unclosed JSON object');
  }

  // Check for internal markers leaked
  if (/\{\{(?!DOC|LOAD_MORE)[A-Z_]+::/.test(text)) {
    issues.push('Internal marker leaked');
  }

  return issues;
}

async function testStreamIntegrity(token, conversationId, query, name) {
  const response = await fetch(`${API_URL}/api/rag/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ conversationId, query }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let gotDone = false;
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
          if (data.type === 'content') {
            fullContent += data.content;
          }
          if (data.type === 'done') {
            gotDone = true;
            donePayload = data;
          }
        } catch (e) {}
      }
    }
  }

  const issues = [];

  // Check 1: Got done event
  if (!gotDone) {
    issues.push('No done event received');
  }

  // Check 2: Full answer matches streamed content (approximately)
  if (donePayload?.fullAnswer) {
    const streamedLen = fullContent.length;
    const finalLen = donePayload.fullAnswer.length;
    // Allow some difference due to formatting
    if (Math.abs(streamedLen - finalLen) > finalLen * 0.5) {
      issues.push(`Stream/final mismatch: streamed=${streamedLen}, final=${finalLen}`);
    }
  }

  // Check 3: Markdown integrity
  const textToCheck = donePayload?.formatted || donePayload?.fullAnswer || fullContent;
  const markdownIssues = checkMarkdownIntegrity(textToCheck);
  issues.push(...markdownIssues);

  return {
    name,
    query,
    contentLength: fullContent.length,
    gotDone,
    issues,
    passed: issues.length === 0,
  };
}

async function runTests() {
  console.log('🔄 Streaming Integrity Test\n');
  console.log('='.repeat(60));

  const token = await login();
  const conversationId = await createConversation(token);
  console.log('✅ Setup complete\n');

  let passCount = 0;
  let failCount = 0;

  for (const { query, name } of TEST_QUERIES) {
    console.log(`🔍 ${name}`);
    console.log(`   Query: "${query}"`);

    const result = await testStreamIntegrity(token, conversationId, query, name);

    if (result.passed) {
      console.log(`   ✅ PASS - ${result.contentLength} chars, done=${result.gotDone}`);
      passCount++;
    } else {
      console.log(`   ❌ FAIL - Issues:`);
      for (const issue of result.issues) {
        console.log(`      - ${issue}`);
      }
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Summary: ${passCount}/${TEST_QUERIES.length} passed`);
  console.log('='.repeat(60));

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(console.error);
