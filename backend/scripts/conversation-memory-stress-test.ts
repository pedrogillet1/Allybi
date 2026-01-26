/**
 * Conversation Memory Stress Test
 *
 * PURPOSE: Test if Koda can remember conversations like Manus (95%+ retention)
 * WHY: Validate infinite memory system with 50+ messages
 * HOW: Send sequential messages, test recall from early messages
 *
 * USAGE:
 *   npx ts-node src/scripts/conversation-memory-stress-test.ts
 *   npx ts-node src/scripts/conversation-memory-stress-test.ts --messages=30
 *   npx ts-node src/scripts/conversation-memory-stress-test.ts --api-url=http://localhost:5000
 *
 * OPTIONS:
 *   --messages=N      Number of messages to send (default: 50)
 *   --api-url=URL     API base URL (default: http://localhost:5000)
 *   --email=EMAIL     Test user email (default: localhost@koda.com)
 *   --password=PASS   Test user password (default: localhost123)
 *   --verbose         Show detailed output
 */

import axios from 'axios';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  messageCount: parseInt(args.find(a => a.startsWith('--messages='))?.split('=')[1] || '50'),
  apiUrl: args.find(a => a.startsWith('--api-url='))?.split('=')[1] || 'http://localhost:5000',
  email: args.find(a => a.startsWith('--email='))?.split('=')[1] || 'localhost@koda.com',
  password: args.find(a => a.startsWith('--password='))?.split('=')[1] || 'localhost123',
  verbose: args.includes('--verbose')
};

// Test messages - designed to establish facts that can be recalled later
const TEST_FACTS = [
  { query: "Remember this: My favorite color is blue.", key: "blue", category: "preference" },
  { query: "Important: The project deadline is December 15th.", key: "december 15", category: "date" },
  { query: "Note: Our budget for Q4 is $50,000.", key: "50,000", category: "number" },
  { query: "Remember: The CEO's name is Sarah Johnson.", key: "sarah johnson", category: "name" },
  { query: "Key fact: We have 150 employees.", key: "150", category: "number" },
  { query: "Important date: Company was founded in 2019.", key: "2019", category: "date" },
  { query: "Remember: Our main product is CloudSync.", key: "cloudsync", category: "product" },
  { query: "Note: The office is in San Francisco.", key: "san francisco", category: "location" },
  { query: "Key metric: Our revenue last year was $2.5 million.", key: "2.5 million", category: "number" },
  { query: "Remember: My assistant's name is Michael.", key: "michael", category: "name" }
];

// Follow-up queries that should recall the facts
const RECALL_QUERIES = [
  { query: "What is my favorite color?", expectedKey: "blue", factIndex: 0 },
  { query: "When is the project deadline?", expectedKey: "december 15", factIndex: 1 },
  { query: "What's our Q4 budget?", expectedKey: "50,000", factIndex: 2 },
  { query: "Who is the CEO?", expectedKey: "sarah johnson", factIndex: 3 },
  { query: "How many employees do we have?", expectedKey: "150", factIndex: 4 },
  { query: "When was the company founded?", expectedKey: "2019", factIndex: 5 },
  { query: "What's our main product called?", expectedKey: "cloudsync", factIndex: 6 },
  { query: "Where is the office located?", expectedKey: "san francisco", factIndex: 7 },
  { query: "What was our revenue last year?", expectedKey: "2.5 million", factIndex: 8 },
  { query: "What's my assistant's name?", expectedKey: "michael", factIndex: 9 }
];

// Filler messages to test context retention with many messages
const FILLER_MESSAGES = [
  "What's the weather like today?",
  "Can you summarize the news?",
  "Tell me a joke.",
  "What time is it?",
  "Explain quantum computing briefly.",
  "What's the capital of France?",
  "How do I make coffee?",
  "What's 15% of 200?",
  "Translate 'hello' to Spanish.",
  "What's the meaning of life?"
];

interface TestResult {
  phase: string;
  messageIndex: number;
  query: string;
  response: string;
  responseTime: number;
  passed: boolean;
  expectedKey?: string;
  foundKey?: boolean;
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ♾️  INFINITE CONVERSATION MEMORY STRESS TEST');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('📋 Configuration:');
  console.log(`   API URL: ${options.apiUrl}`);
  console.log(`   Test user: ${options.email}`);
  console.log(`   Messages to send: ${options.messageCount}`);
  console.log('');

  try {
    // Step 1: Login
    console.log('🔐 Logging in...');
    const { token, userId } = await login();
    console.log(`   ✅ Logged in as ${userId}`);
    console.log('');

    // Step 2: Create conversation
    console.log('💬 Creating test conversation...');
    const conversationId = await createConversation(token);
    console.log(`   ✅ Conversation: ${conversationId}`);
    console.log('');

    const results: TestResult[] = [];
    let messageIndex = 0;

    // Phase 1: Establish facts
    console.log('📝 PHASE 1: Establishing facts...');
    console.log('─'.repeat(60));
    for (const fact of TEST_FACTS) {
      messageIndex++;
      const startTime = Date.now();

      if (options.verbose) {
        console.log(`   [${messageIndex}] ${fact.query}`);
      }

      const response = await sendQuery(token, conversationId, fact.query);
      const responseTime = Date.now() - startTime;

      results.push({
        phase: 'establish',
        messageIndex,
        query: fact.query,
        response,
        responseTime,
        passed: true // Establishment always passes
      });

      if (options.verbose) {
        console.log(`       Response (${responseTime}ms): ${response.substring(0, 100)}...`);
      }

      await sleep(500); // Small delay between messages
    }
    console.log(`   ✅ Established ${TEST_FACTS.length} facts`);
    console.log('');

    // Phase 2: Send filler messages
    const fillerCount = Math.max(0, options.messageCount - TEST_FACTS.length - RECALL_QUERIES.length);
    if (fillerCount > 0) {
      console.log(`📝 PHASE 2: Sending ${fillerCount} filler messages...`);
      console.log('─'.repeat(60));

      for (let i = 0; i < fillerCount; i++) {
        messageIndex++;
        const fillerQuery = FILLER_MESSAGES[i % FILLER_MESSAGES.length];
        const startTime = Date.now();

        if (options.verbose || i % 10 === 0) {
          console.log(`   [${messageIndex}] ${fillerQuery}`);
        }

        const response = await sendQuery(token, conversationId, fillerQuery);
        const responseTime = Date.now() - startTime;

        results.push({
          phase: 'filler',
          messageIndex,
          query: fillerQuery,
          response,
          responseTime,
          passed: true
        });

        await sleep(300);
      }
      console.log(`   ✅ Sent ${fillerCount} filler messages`);
      console.log('');
    }

    // Phase 3: Test recall
    console.log('🧠 PHASE 3: Testing recall of facts...');
    console.log('─'.repeat(60));

    let recallPassed = 0;
    let recallFailed = 0;

    for (const recall of RECALL_QUERIES) {
      messageIndex++;
      const startTime = Date.now();

      console.log(`   [${messageIndex}] ${recall.query}`);

      const response = await sendQuery(token, conversationId, recall.query);
      const responseTime = Date.now() - startTime;

      // Check if response contains the expected key
      const foundKey = response.toLowerCase().includes(recall.expectedKey.toLowerCase());
      const passed = foundKey;

      if (passed) {
        recallPassed++;
        console.log(`       ✅ Found "${recall.expectedKey}" (${responseTime}ms)`);
      } else {
        recallFailed++;
        console.log(`       ❌ Missing "${recall.expectedKey}" (${responseTime}ms)`);
        if (options.verbose) {
          console.log(`       Response: ${response.substring(0, 200)}...`);
        }
      }

      results.push({
        phase: 'recall',
        messageIndex,
        query: recall.query,
        response,
        responseTime,
        passed,
        expectedKey: recall.expectedKey,
        foundKey
      });

      await sleep(500);
    }
    console.log('');

    // Summary
    const recallResults = results.filter(r => r.phase === 'recall');
    const retentionRate = (recallPassed / recallResults.length) * 100;
    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  📊 STRESS TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`   Total messages sent: ${messageIndex}`);
    console.log(`   Facts established: ${TEST_FACTS.length}`);
    console.log(`   Filler messages: ${fillerCount}`);
    console.log(`   Recall tests: ${RECALL_QUERIES.length}`);
    console.log('');
    console.log(`   ✅ Recall passed: ${recallPassed}/${RECALL_QUERIES.length}`);
    console.log(`   ❌ Recall failed: ${recallFailed}/${RECALL_QUERIES.length}`);
    console.log(`   📈 Context retention: ${retentionRate.toFixed(1)}%`);
    console.log(`   ⏱️  Avg response time: ${avgResponseTime.toFixed(0)}ms`);
    console.log('');

    // Grade
    let grade = 'F';
    let status = '❌ FAILED';

    if (retentionRate >= 95) {
      grade = 'A+';
      status = '🎉 EXCELLENT - Works like Manus!';
    } else if (retentionRate >= 90) {
      grade = 'A';
      status = '✅ GREAT - Nearly perfect memory';
    } else if (retentionRate >= 80) {
      grade = 'B';
      status = '⚠️  GOOD - Some memory issues';
    } else if (retentionRate >= 70) {
      grade = 'C';
      status = '⚠️  FAIR - Significant memory loss';
    } else if (retentionRate >= 60) {
      grade = 'D';
      status = '❌ POOR - Frequent forgetting';
    }

    console.log(`   🎓 Grade: ${grade}`);
    console.log(`   📊 Status: ${status}`);
    console.log('');

    if (retentionRate < 95) {
      console.log('💡 Recommendations:');
      console.log('   1. Check if database tables exist (ConversationChunk, etc.)');
      console.log('   2. Verify chunking is triggered (check logs for ♾️ messages)');
      console.log('   3. Run backfill script if needed');
      console.log('   4. Check Pinecone for embeddings');
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Helper functions
async function login(): Promise<{ token: string; userId: string }> {
  const response = await axios.post(`${options.apiUrl}/api/auth/login`, {
    email: options.email,
    password: options.password
  });
  return {
    token: response.data.accessToken || response.data.token,
    userId: response.data.userId || response.data.user?.id
  };
}

async function createConversation(token: string): Promise<string> {
  const response = await axios.post(
    `${options.apiUrl}/api/chat/conversations`,
    { title: `Stress Test - ${new Date().toISOString()}` },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data.conversationId || response.data.id;
}

async function sendQuery(token: string, conversationId: string, query: string): Promise<string> {
  const response = await axios.post(
    `${options.apiUrl}/api/rag/query`,
    { query, conversationId },
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 60000 // 60 second timeout
    }
  );
  return response.data.answer || response.data.response || '';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
