/**
 * Test Script for File Creation Service
 * Run: npx ts-node src/scripts/testFileCreation.ts [USER_ID] [CONVERSATION_ID]
 */

import fileCreationService from '../services/fileCreation.service';
import prisma from '../config/database';

// ════════════════════════════════════════════════════════════════════════════════
// TEST CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════════

let TEST_USER_ID: string;
let TEST_CONVERSATION_ID: string;

// ════════════════════════════════════════════════════════════════════════════════
// TEST CASES
// ════════════════════════════════════════════════════════════════════════════════

function getTestCases(userId: string, conversationId: string) {
  return [
    {
      name: 'Test 1: Markdown File',
      params: {
        userId,
        conversationId,
        topic: 'Getting Started with Koda',
        fileType: 'md' as const,
        query: 'Create a markdown file about Getting Started with Koda',
        language: 'en'
      }
    },
    {
      name: 'Test 2: PDF Report',
      params: {
        userId,
        conversationId,
        topic: 'Remote Work Best Practices',
        fileType: 'pdf' as const,
        query: 'Generate a PDF report on Remote Work Best Practices',
        language: 'en'
      }
    },
    {
      name: 'Test 3: DOCX Document',
      params: {
        userId,
        conversationId,
        topic: 'Project Management Fundamentals',
        fileType: 'docx' as const,
        query: 'Make a document about Project Management Fundamentals',
        language: 'en'
      }
    }
  ];
}

// ════════════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ════════════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('🧪 Starting File Creation Tests...\n');

  // Get IDs from command line or show error
  TEST_USER_ID = process.argv[2];
  TEST_CONVERSATION_ID = process.argv[3];

  if (!TEST_USER_ID || !TEST_CONVERSATION_ID) {
    console.error('❌ Error: USER_ID and CONVERSATION_ID are required\n');
    console.log('Usage:');
    console.log('  npx ts-node src/scripts/testFileCreation.ts <USER_ID> <CONVERSATION_ID>\n');
    console.log('Example:');
    console.log('  npx ts-node src/scripts/testFileCreation.ts clx123abc456 conv789xyz123\n');
    console.log('To get these IDs:');
    console.log('  1. Run: npx ts-node src/scripts/createTestUser.ts');
    console.log('  2. Run: npx ts-node src/scripts/createTestConversation.ts <USER_ID>\n');
    process.exit(1);
  }

  // Verify user exists
  const user = await prisma.user.findUnique({ where: { id: TEST_USER_ID } });
  if (!user) {
    console.error(`❌ Error: User "${TEST_USER_ID}" not found\n`);
    process.exit(1);
  }

  // Verify conversation exists
  const conversation = await prisma.conversation.findUnique({
    where: { id: TEST_CONVERSATION_ID }
  });
  if (!conversation) {
    console.error(`❌ Error: Conversation "${TEST_CONVERSATION_ID}" not found\n`);
    process.exit(1);
  }

  console.log(`✅ User verified: ${user.email}`);
  console.log(`✅ Conversation verified: ${conversation.title}\n`);

  const testCases = getTestCases(TEST_USER_ID, TEST_CONVERSATION_ID);
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📝 ${testCase.name}`);
    console.log(`${'='.repeat(80)}\n`);

    try {
      const startTime = Date.now();

      // Run file creation
      console.log(`📄 Creating ${testCase.params.fileType.toUpperCase()} file: "${testCase.params.topic}"...`);
      const result = await fileCreationService.createFile(testCase.params);

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      // Check result
      if (result.success) {
        console.log(`\n✅ PASSED (${duration}s)`);
        console.log(`   File: ${result.file?.name}`);
        console.log(`   Size: ${result.file?.size} bytes`);
        console.log(`   Type: ${result.file?.type}`);
        console.log(`   URL: ${result.file?.url}`);
        passed++;
      } else {
        console.log(`\n❌ FAILED (${duration}s)`);
        console.log(`   File Name: ${result.fileName}`);
        console.log(`   Success: ${result.success}`);
        failed++;
      }

    } catch (error: any) {
      console.log(`\n❌ EXCEPTION`);
      console.log(`   Error: ${error.message}`);
      if (error.stack) {
        console.log(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
      failed++;
    }
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 TEST SUMMARY`);
  console.log(`${'='.repeat(80)}\n`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📝 Total: ${testCases.length}`);

  if (passed === testCases.length) {
    console.log(`\n🎉 All tests passed!\n`);
  } else if (failed === testCases.length) {
    console.log(`\n⚠️  All tests failed - check the errors above\n`);
  } else {
    console.log(`\n⚠️  Some tests failed - check the errors above\n`);
  }

  // Cleanup
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

// ════════════════════════════════════════════════════════════════════════════════
// RUN
// ════════════════════════════════════════════════════════════════════════════════

runTests().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
