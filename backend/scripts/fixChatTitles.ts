/**
 * Script to fix all conversations with "New Chat" title
 * Generates AI-powered titles for existing conversations that have messages
 */

import prisma from '../config/database';
import { generateConversationTitle } from '../services/openai.service';

async function fixChatTitles() {
  console.log('🔧 Starting chat title fix...');

  try {
    // Find all conversations with "New Chat" title that have messages
    const conversationsToFix = await prisma.conversation.findMany({
      where: {
        title: 'New Chat',
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 2, // Get first 2 messages (user + assistant)
        },
      },
    });

    console.log(`📊 Found ${conversationsToFix.length} conversations with "New Chat" title`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const conversation of conversationsToFix) {
      // Skip conversations with no messages
      if (conversation.messages.length === 0) {
        console.log(`⏭️  Skipping conversation ${conversation.id} (no messages)`);
        skippedCount++;
        continue;
      }

      // Get first user message and first assistant response
      const userMessage = conversation.messages.find(m => m.role === 'user');
      const assistantMessage = conversation.messages.find(m => m.role === 'assistant');

      if (!userMessage) {
        console.log(`⏭️  Skipping conversation ${conversation.id} (no user message)`);
        skippedCount++;
        continue;
      }

      console.log(`\n🔄 Processing conversation ${conversation.id}...`);
      console.log(`   User message: ${userMessage.content.substring(0, 100)}...`);

      try {
        // Generate AI-powered title
        const newTitle = await generateConversationTitle(
          userMessage.content,
          assistantMessage?.content || ''
        );

        // Update conversation title
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { title: newTitle },
        });

        console.log(`✅ Updated title to: "${newTitle}"`);
        fixedCount++;

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`❌ Error fixing conversation ${conversation.id}:`, error);
      }
    }

    console.log(`\n✨ Done! Fixed ${fixedCount} conversations, skipped ${skippedCount}`);
  } catch (error) {
    console.error('❌ Error in fixChatTitles:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixChatTitles()
  .then(() => {
    console.log('👋 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
