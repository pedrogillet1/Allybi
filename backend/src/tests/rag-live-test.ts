/**
 * RAG Live Test - Get ACTUAL answers from Koda
 *
 * This script calls the real RAG service and shows actual responses.
 * Usage: npx ts-node --transpile-only src/tests/rag-live-test.ts
 */

import { generateAnswer } from '../services/rag.service';
import prisma from '../config/database';

// Test queries
const testQueries = [
  'What is trabalho projeto about?',
  'Tell me about Scrum framework',
  'What project management files do I have?',
  'List files in trampo folder',
  'What does the budget report say about Q3 revenue?',
];

async function runLiveTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        KODA RAG LIVE TEST - ACTUAL ANSWERS                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Get the localhost user
  const user = await prisma.user.findFirst({
    where: { email: 'localhost@koda.com' },
    select: { id: true, email: true }
  });

  if (!user) {
    console.log('❌ User localhost@koda.com not found. Please create the user first.');
    return;
  }

  console.log(`Using user: ${user.email} (${user.id.substring(0, 8)}...)\n`);

  // Get document count for this user
  const docCount = await prisma.document.count({
    where: { userId: user.id, status: { not: 'deleted' } }
  });
  console.log(`Document count: ${docCount}\n`);

  for (let i = 0; i < testQueries.length; i++) {
    const query = testQueries[i];

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Question ${i + 1}/5: "${query}"`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      const startTime = Date.now();

      // Call RAG service - generateAnswer(userId, query, conversationId, answerLength, attachedDocId, history, isFirst)
      const result = await generateAnswer(
        user.id,
        query,
        `test-${Date.now()}`,
        'medium',
        undefined,
        [],
        true
      );

      const elapsed = Date.now() - startTime;

      console.log('ANSWER:');
      console.log('-------------------------------------------------------------');
      console.log(result.answer || '(No answer generated)');
      console.log('-------------------------------------------------------------\n');

      // Show sources
      if (result.sources && result.sources.length > 0) {
        console.log('SOURCES:');
        result.sources.forEach((src: any, idx: number) => {
          console.log(`   ${idx + 1}. ${src.filename || src.documentName || 'Unknown'} (score: ${src.score?.toFixed(2) || 'N/A'})`);
        });
        console.log('');
      } else {
        console.log('SOURCES: None\n');
      }

      console.log(`Response time: ${elapsed}ms\n`);

    } catch (error: any) {
      console.log(`ERROR: ${error.message}\n`);
    }
  }

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST COMPLETE                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  await prisma.$disconnect();
}

runLiveTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
