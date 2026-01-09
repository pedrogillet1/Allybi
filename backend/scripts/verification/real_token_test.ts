/**
 * REAL TOKEN TEST
 *
 * Logs in with test credentials and runs actual queries
 * to measure real chunk counts and token usage.
 */

// Uses native fetch (Node 18+)

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
  };
}

interface QueryResponse {
  answer: string;
  conversationId: string;
  messageId?: string;
  metadata?: {
    primaryIntent: string;
    confidence: number;
    documentsUsed?: number;
    chunksUsed?: number;
    tokensUsed?: number;
    sourceDocumentIds?: string[];
    sources?: any[];
    processingTime?: number;
  };
}

interface ConversationResponse {
  id: string;
}

async function login(): Promise<string> {
  console.log(`\nLogging in as ${TEST_EMAIL}...`);

  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Login failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as LoginResponse;
  console.log(`✓ Logged in as ${data.user.email} (ID: ${data.user.id})`);
  return data.accessToken;
}

async function createConversation(token: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/chat/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ title: 'Token Test' }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.status}`);
  }

  const data = await response.json() as ConversationResponse;
  return data.id;
}

async function runQuery(token: string, conversationId: string, query: string): Promise<QueryResponse> {
  const response = await fetch(`${BASE_URL}/api/rag/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      conversationId,
      language: 'en',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Query failed: ${response.status} - ${error}`);
  }

  return await response.json() as QueryResponse;
}

// Test queries - relevant to trabalhos documents (LMR, Rosewood Fund, P&L)
const TEST_QUERIES = [
  // Finance/P&L queries
  { name: 'revenue_2024', query: 'what is the total revenue for Lone Mountain Ranch in 2024?' },
  { name: 'budget_2025', query: 'what is the 2025 budget for Lone Mountain Ranch?' },
  { name: 'improvement_plan', query: 'summarize the LMR improvement plan and the $63m PIP' },
  { name: 'rosewood_fund', query: 'what are the key metrics in the Rosewood Fund?' },
  { name: 'profit_margin', query: 'what is the profit margin?' },
  { name: 'expenses', query: 'what are the main expenses?' },
  // Comparison
  { name: 'compare_years', query: 'compare 2024 actual vs 2025 budget' },
  // Edge cases
  { name: 'greeting', query: 'hello' },
];

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('REAL TOKEN TEST - Live Backend Queries');
  console.log('='.repeat(70));

  try {
    // Login
    const token = await login();

    // Create conversation
    const conversationId = await createConversation(token);
    console.log(`✓ Created conversation: ${conversationId}\n`);

    console.log('─'.repeat(70));
    console.log('RUNNING QUERIES');
    console.log('─'.repeat(70) + '\n');

    for (const test of TEST_QUERIES) {
      console.log(`Query: "${test.query}"`);

      const startTime = Date.now();
      const result = await runQuery(token, conversationId, test.query);
      const duration = Date.now() - startTime;

      // Estimate answer tokens (rough: ~4 chars per token)
      const answerTokensEst = Math.round(result.answer.length / 4);

      console.log(`  Intent: ${result.metadata?.primaryIntent || 'unknown'}`);
      console.log(`  Confidence: ${((result.metadata?.confidence || 0) * 100).toFixed(0)}%`);
      console.log(`  ────────────────────────────────`);
      console.log(`  Chunks/Docs used: ${result.metadata?.documentsUsed || 0}`);
      console.log(`  Tokens used: ${result.metadata?.tokensUsed || 'N/A'}`);
      console.log(`  Sources: ${result.metadata?.sourceDocumentIds?.length || 0}`);
      console.log(`  ────────────────────────────────`);
      console.log(`  Answer length: ${result.answer.length} chars (~${answerTokensEst} tokens)`);
      console.log(`  Processing time: ${duration}ms`);
      console.log(`  Answer preview: "${result.answer.substring(0, 150).replace(/\n/g, ' ')}..."`);
      console.log('');
    }

    console.log('─'.repeat(70));
    console.log('✅ Real token test complete');
    console.log('─'.repeat(70) + '\n');

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);

    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n⚠️  Backend server is not running.');
      console.log('   Start it with: npm run dev');
    }

    process.exit(1);
  }
}

main();
