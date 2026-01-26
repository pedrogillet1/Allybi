/**
 * Test Script: Conversation Memory & Summarization
 *
 * This script tests the ConversationManager service to verify:
 * 1. Redis caching is working
 * 2. Conversation history is properly maintained
 * 3. Auto-summarization triggers after threshold
 *
 * Run: npx ts-node src/scripts/test_conversation_memory.ts
 */

import { conversationManager } from '../services/conversationManager.service';
import { redisConnection } from '../config/redis';
import prisma from '../config/database';

async function runTest() {
  console.log('--- Testing Conversation Memory & Summarization ---\n');

  // Create a temporary test user or use existing one
  let userId: string;
  let createdTestUser = false;

  try {
    // Try to find an existing user first
    const existingUser = await prisma.user.findFirst();

    if (existingUser) {
      userId = existingUser.id;
      console.log(`Using existing user: ${existingUser.email}`);
    } else {
      // Create a temporary test user
      const testUser = await prisma.user.create({
        data: {
          email: `test-${Date.now()}@test.com`,
          isEmailVerified: true,
        },
      });
      userId = testUser.id;
      createdTestUser = true;
      console.log(`Created temporary test user: ${testUser.email}`);
    }
  } catch (error) {
    console.error('Failed to get/create test user:', error);
    throw error;
  }

  try {
    // 1. Start a new conversation
    console.log('Step 1: Creating new conversation...');
    const firstQuery = 'My favorite color is blue.';
    let conversation = await conversationManager.createConversation(userId, firstQuery);
    const conversationId = conversation.id;
    console.log(`✅ Conversation created with ID: ${conversationId}`);

    // 2. Check Redis Cache
    console.log('\nStep 2: Checking Redis cache...');
    if (redisConnection) {
      const cached = await redisConnection.get(`conversation:${conversationId}`);
      if (cached) {
        console.log('✅ SUCCESS: Conversation is in Redis cache.');
      } else {
        console.log('⚠️ WARNING: Conversation not found in Redis cache (may be disabled).');
      }
    } else {
      console.log('⚠️ WARNING: Redis is not connected. Caching is disabled.');
    }

    // 3. Continue conversation - add AI response
    console.log('\nStep 3: Continuing conversation with AI response...');
    await conversationManager.addMessage(conversationId, 'assistant', 'Noted. Your favorite color is blue.');
    console.log('✅ Added assistant message');

    // 4. Add another user message
    console.log('\nStep 4: Adding follow-up user message...');
    await conversationManager.addMessage(conversationId, 'user', 'What is my favorite color?');
    console.log('✅ Added user follow-up question');

    // 5. Test prompt building with context
    console.log('\nStep 5: Testing prompt building with context...');
    const state = await conversationManager.getConversationState(conversationId);
    const prompt = conversationManager.buildPromptWithContext('You are a helpful assistant.', state);
    console.log('Generated prompt includes history:');
    console.log(JSON.stringify(prompt, null, 2));

    // 6. Verify message count
    if (state) {
      console.log(`\n📊 Current message count: ${state.messages.length}`);
    }

    // 7. Trigger summarization (add more messages to cross threshold)
    console.log('\nStep 6: Adding more messages to trigger summarization...');
    console.log('(Summarization threshold is 8 messages)');

    // Add messages to cross the threshold (we have 3 already, need 5 more to hit 8)
    for (let i = 0; i < 6; i++) {
      const role = i % 2 === 0 ? 'user' : 'assistant';
      const content = role === 'user'
        ? `User message ${i + 1}: Tell me something interesting.`
        : `Assistant response ${i + 1}: Here's something interesting!`;

      await conversationManager.addMessage(conversationId, role as 'user' | 'assistant', content);
      console.log(`  Added ${role} message ${i + 1}`);
    }

    // Wait a moment for async summarization to complete
    console.log('\n⏳ Waiting for summarization to complete...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 8. Check if summarization occurred
    console.log('\nStep 7: Checking summarization result...');
    const finalConversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (finalConversation?.contextMeta) {
      const contextMeta = finalConversation.contextMeta as { summary?: string; summarizedAt?: string };
      if (contextMeta.summary) {
        console.log('✅ SUCCESS: Conversation has been summarized.');
        console.log('Summary:', contextMeta.summary);
        console.log('Summarized at:', contextMeta.summarizedAt);
      } else {
        console.log('❌ FAILED: contextMeta exists but no summary found.');
      }
    } else {
      console.log('⚠️ WARNING: Conversation was not summarized (may need GEMINI_API_KEY).');
    }

    // 9. Test context retrieval for RAG
    console.log('\nStep 8: Testing conversation context for RAG...');
    const ragContext = await conversationManager.getConversationContext(conversationId);
    console.log('RAG Context:');
    console.log(ragContext.substring(0, 500) + (ragContext.length > 500 ? '...' : ''));

    // 10. Test recent messages retrieval
    console.log('\nStep 9: Testing recent messages retrieval...');
    const recentMessages = await conversationManager.getRecentMessages(conversationId, 5);
    console.log(`Retrieved ${recentMessages.length} recent messages:`);
    recentMessages.forEach((msg, idx) => {
      console.log(`  ${idx + 1}. [${msg.role}]: ${msg.content.substring(0, 50)}...`);
    });

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await prisma.message.deleteMany({ where: { conversationId } });
    await prisma.conversation.delete({ where: { id: conversationId } });

    if (redisConnection) {
      await redisConnection.del(`conversation:${conversationId}`);
    }

    // Clean up test user if we created one
    if (createdTestUser) {
      await prisma.user.delete({ where: { id: userId } });
      console.log('✅ Test user cleaned up');
    }

    console.log('✅ Test data cleaned up successfully');
    console.log('\n--- Test Complete ---');

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);

    // Clean up test user even on failure
    if (createdTestUser) {
      try {
        await prisma.user.delete({ where: { id: userId } });
        console.log('✅ Test user cleaned up after failure');
      } catch {
        // Ignore cleanup errors
      }
    }

    throw error;
  } finally {
    // Disconnect
    await prisma.$disconnect();
  }
}

// Run the test
runTest()
  .then(() => {
    console.log('\n🎉 All tests completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  });
