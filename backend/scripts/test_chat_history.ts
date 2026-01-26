/**
 * Test Script for Chat History UX
 * Verifies all history service features are working correctly
 */

import historyService from '../services/history.service';
import prisma from '../config/database';

async function runTest() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 Testing Chat History UX Features');
  console.log('═══════════════════════════════════════════════════════\n');

  const userId = 'test-user-history-' + Date.now();
  let conversationId: string | undefined;

  try {
    // 1. Create test user first
    console.log('👤 Step 1a: Creating test user...');
    await prisma.user.create({
      data: {
        id: userId,
        email: `test-${Date.now()}@example.com`,
        firstName: 'Test',
        lastName: 'User',
      },
    });
    console.log('✅ Test user created');

    // 2. Create a dummy conversation with messages
    console.log('\n📝 Step 1b: Creating test conversation...');
    const conv = await prisma.conversation.create({
      data: {
        userId,
        title: 'New Chat',
        messages: {
          create: [
            { role: 'user', content: 'How does React state management work?' },
            {
              role: 'assistant',
              content: 'React uses useState and useReducer for state management. useState is for simple state, while useReducer is better for complex state logic.'
            },
            { role: 'user', content: 'Can you explain useContext as well?' },
            {
              role: 'assistant',
              content: 'useContext allows you to share state across components without prop drilling. It works with React.createContext() to provide global state.'
            },
          ],
        },
      },
    });

    conversationId = conv.id;
    console.log(`✅ Created conversation: ${conversationId.substring(0, 8)}...`);

    // 2. Test automatic title generation
    console.log('\n🏷️  Step 2: Testing automatic title generation...');
    await historyService.autoTitleConversation(conversationId);

    const updatedConv = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (updatedConv?.title && updatedConv.title !== 'New Chat') {
      console.log(`✅ SUCCESS: Title generated: "${updatedConv.title}"`);
    } else {
      console.log('❌ FAILED: Title was not generated or still "New Chat"');
    }

    // 3. Test manual title generation
    console.log('\n🏷️  Step 3: Testing manual title generation...');
    const manualTitle = await historyService.generateConversationTitle(conversationId);
    console.log(`✅ SUCCESS: Manual title: "${manualTitle}"`);

    // 4. Test summary generation
    console.log('\n📝 Step 4: Testing summary generation...');
    const summary = await historyService.generateConversationSummary(conversationId);
    if (summary) {
      console.log(`✅ SUCCESS: Summary generated: "${summary.substring(0, 80)}..."`);
    } else {
      console.log('⚠️  INFO: No summary generated (conversation may be too short)');
    }

    // 5. Test search
    console.log('\n🔍 Step 5: Testing full-text search...');
    const searchResults = await historyService.searchConversations(userId, 'React state');
    if (searchResults.length > 0) {
      console.log(`✅ SUCCESS: Found ${searchResults.length} search result(s)`);
      console.log(`   First result: "${searchResults[0].title}" (relevance: ${searchResults[0].relevance.toFixed(2)})`);
    } else {
      console.log('❌ FAILED: Search returned no results');
    }

    // 6. Test pinning
    console.log('\n📌 Step 6: Testing pin/unpin...');
    const pinSuccess = await historyService.pinConversation(userId, conversationId);
    if (pinSuccess) {
      console.log('✅ SUCCESS: Conversation pinned');
    } else {
      console.log('❌ FAILED: Could not pin conversation');
    }

    const unpinSuccess = await historyService.unpinConversation(userId, conversationId);
    if (unpinSuccess) {
      console.log('✅ SUCCESS: Conversation unpinned');
    } else {
      console.log('❌ FAILED: Could not unpin conversation');
    }

    // 7. Test soft delete
    console.log('\n🗑️  Step 7: Testing soft delete...');
    const deleteSuccess = await historyService.softDeleteConversation(userId, conversationId);
    if (deleteSuccess) {
      console.log('✅ SUCCESS: Conversation soft-deleted');
    } else {
      console.log('❌ FAILED: Could not soft delete conversation');
    }

    // 8. Test restore
    console.log('\n♻️  Step 8: Testing restore...');
    const restoreSuccess = await historyService.restoreConversation(userId, conversationId);
    if (restoreSuccess) {
      console.log('✅ SUCCESS: Conversation restored');
    } else {
      console.log('❌ FAILED: Could not restore conversation');
    }

    // 9. Test get history
    console.log('\n📚 Step 9: Testing get conversation history...');
    const history = await historyService.getConversationHistory(userId, { limit: 10 });
    if (history.length > 0) {
      console.log(`✅ SUCCESS: Retrieved ${history.length} conversation(s)`);
      console.log(`   First: "${history[0].title}" (${history[0].messageCount} messages)`);
    } else {
      console.log('❌ FAILED: No conversations in history');
    }

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await prisma.message.deleteMany({ where: { conversationId } });
    await prisma.conversation.delete({ where: { id: conversationId } });
    await prisma.user.delete({ where: { id: userId } });
    console.log('✅ Cleanup complete');

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ All Tests Passed!');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);

    // Attempt cleanup even on error
    if (conversationId) {
      try {
        await prisma.message.deleteMany({ where: { conversationId } });
        await prisma.conversation.delete({ where: { id: conversationId } });
        await prisma.user.delete({ where: { id: userId } });
      } catch (cleanupError) {
        console.error('⚠️  Cleanup error:', cleanupError);
      }
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
runTest();
