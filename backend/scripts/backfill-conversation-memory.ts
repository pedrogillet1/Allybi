/**
 * Backfill Conversation Memory Script
 *
 * PURPOSE: Chunk and embed all existing conversations for infinite memory
 * WHY: Existing conversations need to be processed so they can be searched
 * HOW: Iterate through all conversations, chunk them, embed them
 *
 * USAGE:
 *   npx ts-node src/scripts/backfill-conversation-memory.ts
 *   npx ts-node src/scripts/backfill-conversation-memory.ts --user=USER_ID
 *   npx ts-node src/scripts/backfill-conversation-memory.ts --dry-run
 *
 * OPTIONS:
 *   --user=USER_ID    Only backfill conversations for a specific user
 *   --dry-run         Show what would be processed without actually doing it
 *   --min-messages=N  Only process conversations with at least N messages (default: 4)
 *   --limit=N         Process at most N conversations (default: all)
 *   --verbose         Show detailed progress
 */

import { PrismaClient } from '@prisma/client';
import chunkingTrigger from '../services/conversationChunkingTrigger.service';

const prisma = new PrismaClient();

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  userId: args.find(a => a.startsWith('--user='))?.split('=')[1],
  dryRun: args.includes('--dry-run'),
  minMessages: parseInt(args.find(a => a.startsWith('--min-messages='))?.split('=')[1] || '4'),
  limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0') || undefined,
  verbose: args.includes('--verbose')
};

interface BackfillResult {
  conversationId: string;
  userId: string;
  messageCount: number;
  chunksCreated: number;
  chunksEmbedded: number;
  success: boolean;
  error?: string;
  duration: number;
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ♾️  INFINITE CONVERSATION MEMORY BACKFILL');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Show options
  console.log('📋 Options:');
  console.log(`   User filter: ${options.userId || 'All users'}`);
  console.log(`   Dry run: ${options.dryRun}`);
  console.log(`   Min messages: ${options.minMessages}`);
  console.log(`   Limit: ${options.limit || 'No limit'}`);
  console.log(`   Verbose: ${options.verbose}`);
  console.log('');

  // Get conversations to process
  console.log('🔍 Finding conversations to process...');

  const whereClause: any = {};
  if (options.userId) {
    whereClause.userId = options.userId;
  }

  const conversations = await prisma.conversation.findMany({
    where: whereClause,
    include: {
      _count: {
        select: { messages: true }
      }
    },
    orderBy: { updatedAt: 'desc' },
    take: options.limit
  });

  // Filter by minimum messages
  const eligibleConversations = conversations.filter(
    c => c._count.messages >= options.minMessages
  );

  console.log(`📊 Found ${conversations.length} total conversations`);
  console.log(`📊 ${eligibleConversations.length} have ${options.minMessages}+ messages`);
  console.log('');

  if (eligibleConversations.length === 0) {
    console.log('✅ No conversations need processing. Done!');
    await prisma.$disconnect();
    return;
  }

  if (options.dryRun) {
    console.log('🔍 DRY RUN - Showing what would be processed:');
    console.log('');
    eligibleConversations.forEach((conv, i) => {
      console.log(`   ${i + 1}. ${conv.id}`);
      console.log(`      User: ${conv.userId}`);
      console.log(`      Messages: ${conv._count.messages}`);
      console.log(`      Title: ${conv.title?.substring(0, 50) || 'Untitled'}...`);
      console.log('');
    });
    console.log('✅ Dry run complete. Run without --dry-run to process.');
    await prisma.$disconnect();
    return;
  }

  // Process conversations
  console.log('🚀 Starting backfill...');
  console.log('');

  const results: BackfillResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < eligibleConversations.length; i++) {
    const conv = eligibleConversations[i];
    const convStartTime = Date.now();

    console.log(`[${i + 1}/${eligibleConversations.length}] Processing: ${conv.id}`);

    try {
      // Check if already has chunks
      const existingChunks = await prisma.conversationChunk.count({
        where: { conversationId: conv.id }
      });

      if (existingChunks > 0 && options.verbose) {
        console.log(`   ⏭️  Already has ${existingChunks} chunks, re-processing...`);
      }

      // Chunk and embed
      const result = await chunkingTrigger.manualChunk(conv.id, conv.userId);

      const duration = Date.now() - convStartTime;

      results.push({
        conversationId: conv.id,
        userId: conv.userId,
        messageCount: conv._count.messages,
        chunksCreated: result.chunksCreated,
        chunksEmbedded: result.chunksEmbedded,
        success: true,
        duration
      });

      if (options.verbose) {
        console.log(`   ✅ Created ${result.chunksCreated} chunks, embedded ${result.chunksEmbedded} (${duration}ms)`);
      } else {
        console.log(`   ✅ ${result.chunksCreated} chunks (${duration}ms)`);
      }

    } catch (error: any) {
      const duration = Date.now() - convStartTime;

      results.push({
        conversationId: conv.id,
        userId: conv.userId,
        messageCount: conv._count.messages,
        chunksCreated: 0,
        chunksEmbedded: 0,
        success: false,
        error: error.message,
        duration
      });

      console.log(`   ❌ Error: ${error.message}`);
    }

    // Progress percentage every 10 conversations
    if ((i + 1) % 10 === 0) {
      const percent = Math.round(((i + 1) / eligibleConversations.length) * 100);
      console.log(`\n📈 Progress: ${percent}% (${i + 1}/${eligibleConversations.length})\n`);
    }
  }

  // Summary
  const totalDuration = Date.now() - startTime;
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalChunks = successful.reduce((sum, r) => sum + r.chunksCreated, 0);
  const totalEmbeddings = successful.reduce((sum, r) => sum + r.chunksEmbedded, 0);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📊 BACKFILL SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`   Total conversations: ${eligibleConversations.length}`);
  console.log(`   Successful: ${successful.length}`);
  console.log(`   Failed: ${failed.length}`);
  console.log(`   Total chunks created: ${totalChunks}`);
  console.log(`   Total embeddings: ${totalEmbeddings}`);
  console.log(`   Total duration: ${Math.round(totalDuration / 1000)}s`);
  console.log(`   Avg per conversation: ${Math.round(totalDuration / eligibleConversations.length)}ms`);
  console.log('');

  if (failed.length > 0) {
    console.log('❌ Failed conversations:');
    failed.forEach(r => {
      console.log(`   - ${r.conversationId}: ${r.error}`);
    });
    console.log('');
  }

  console.log('✅ Backfill complete!');
  console.log('');

  await prisma.$disconnect();
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
