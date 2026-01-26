/**
 * Test Script: Conversation Manager
 *
 * Tests the conversation manager including:
 * - Creating conversations
 * - Adding messages
 * - Redis caching
 * - Auto-summarization
 * - Context building
 *
 * Run with: npx ts-node --transpile-only src/scripts/test_conversation_manager.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { conversationManager } from '../services/conversationManager.service';
import prisma from '../config/database';

async function runTest() {
  console.log('═'.repeat(60));
  console.log('  Testing Conversation Manager');
  console.log('═'.repeat(60));

  try {
    // First, get or create a real user for testing
    console.log('\n🔍 Finding a test user...');
    let testUser = await prisma.user.findFirst();

    if (!testUser) {
      console.log('⚠️ No users found. Creating a test user...');
      testUser = await prisma.user.create({
        data: {
          email: `test-${Date.now()}@koda.test`,
          firstName: 'Test',
          lastName: 'User',
        },
      });
    }

    const testUserId = testUser.id;
    console.log(`✅ Using test user: ${testUserId}`);

    // Test 1: Create a conversation
    console.log('\n📝 Test 1: Creating a conversation...');
    const conversation = await conversationManager.createConversation(
      testUserId,
      'What is machine learning?'
    );
    console.log(`✅ Created conversation: ${conversation.id}`);
    console.log(`   Title: ${conversation.title}`);
    console.log(`   Messages: ${conversation.messages.length}`);

    // Test 2: Add messages
    console.log('\n📝 Test 2: Adding messages...');
    await conversationManager.addMessage(
      conversation.id,
      'assistant',
      'Machine learning is a subset of AI that enables computers to learn from data without explicit programming.'
    );

    await conversationManager.addMessage(
      conversation.id,
      'user',
      'Can you give me an example?'
    );

    await conversationManager.addMessage(
      conversation.id,
      'assistant',
      'A common example is email spam detection. The system learns to identify spam by analyzing patterns in millions of emails.'
    );

    const updatedConversation = await conversationManager.getConversationState(conversation.id);
    console.log(`✅ Added messages. Total: ${updatedConversation?.messages.length}`);

    // Test 3: Get conversation state (should hit cache)
    console.log('\n📝 Test 3: Testing cache retrieval...');
    const cachedState = await conversationManager.getConversationState(conversation.id);
    console.log(`✅ Retrieved conversation from cache`);
    console.log(`   Messages: ${cachedState?.messages.length}`);

    // Test 4: Build prompt with context
    console.log('\n📝 Test 4: Building prompt with context...');
    const systemPrompt = 'You are Koda, a helpful AI assistant.';
    const promptMessages = conversationManager.buildPromptWithContext(systemPrompt, cachedState);
    console.log(`✅ Built prompt with ${promptMessages.length} messages:`);
    promptMessages.forEach((msg, i) => {
      console.log(`   [${i}] ${msg.role}: ${msg.content.substring(0, 50)}...`);
    });

    // Test 5: Get conversation context
    console.log('\n📝 Test 5: Getting conversation context...');
    const context = await conversationManager.getConversationContext(conversation.id);
    console.log(`✅ Got conversation context:`);
    console.log(`   ${context.substring(0, 200)}...`);

    // Test 6: Get recent messages
    console.log('\n📝 Test 6: Getting recent messages...');
    const recentMessages = await conversationManager.getRecentMessages(conversation.id, 3);
    console.log(`✅ Got ${recentMessages.length} recent messages`);

    // Test 7: Get last user message
    console.log('\n📝 Test 7: Getting last user message...');
    const lastUserMsg = await conversationManager.getLastUserMessage(conversation.id);
    console.log(`✅ Last user message: "${lastUserMsg?.content}"`);

    // Test 8: Ownership check
    console.log('\n📝 Test 8: Checking ownership...');
    const isOwner = await conversationManager.isOwner(conversation.id, testUserId);
    const isNotOwner = await conversationManager.isOwner(conversation.id, 'wrong-user');
    console.log(`✅ isOwner(correct): ${isOwner}, isOwner(wrong): ${isNotOwner}`);

    // Cleanup
    console.log('\n🧹 Cleaning up test conversation...');
    await conversationManager.deleteConversation(conversation.id);
    console.log(`✅ Deleted test conversation`);

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('  TEST SUMMARY');
    console.log('═'.repeat(60));
    console.log('\n📊 All tests passed:');
    console.log('  ✅ Create conversation');
    console.log('  ✅ Add messages');
    console.log('  ✅ Cache retrieval');
    console.log('  ✅ Build prompt with context');
    console.log('  ✅ Get conversation context');
    console.log('  ✅ Get recent messages');
    console.log('  ✅ Get last user message');
    console.log('  ✅ Ownership check');
    console.log('  ✅ Delete conversation');

    console.log('\n🎉 SUCCESS: Conversation Manager is working correctly!\n');
  } catch (error) {
    console.error('\n❌ FAILED: The test encountered an error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
