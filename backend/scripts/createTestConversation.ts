/**
 * Create Test Conversation Script
 * Run: npx ts-node src/scripts/createTestConversation.ts [USER_ID]
 */

import prisma from '../config/database';

async function createTestConversation() {
  console.log('💬 Creating test conversation...\n');

  // Get user ID from command line argument or use default
  const userId = process.argv[2];

  if (!userId) {
    console.error('❌ Error: User ID is required');
    console.log('\nUsage:');
    console.log('  npx ts-node src/scripts/createTestConversation.ts <USER_ID>');
    console.log('\nExample:');
    console.log('  npx ts-node src/scripts/createTestConversation.ts clx123abc456\n');
    process.exit(1);
  }

  try {
    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      console.error(`❌ Error: User with ID "${userId}" not found`);
      console.log('\nPlease run createTestUser.ts first to create a test user.\n');
      process.exit(1);
    }

    // Create conversation
    const conversation = await prisma.conversation.create({
      data: {
        userId: userId,
        title: 'Test Conversation for File Creation',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.log('✅ Test conversation created successfully!');
    console.log(`   ID: ${conversation.id}`);
    console.log(`   User ID: ${conversation.userId}`);
    console.log(`   Title: ${conversation.title}`);
    console.log('\nCopy the Conversation ID above to use in test scripts.\n');

  } catch (error: any) {
    console.error('❌ Error creating test conversation:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createTestConversation();
