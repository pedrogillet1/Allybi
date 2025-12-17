/**
 * Test script to verify PowerPoint slide content is searchable
 */

import { PrismaClient } from '@prisma/client';
import vectorEmbeddingService from '../services/vectorEmbedding.service';
import pineconeService from '../services/pinecone.service';

const prisma = new PrismaClient();

async function testPowerPointSearch() {
  try {
    console.log('🧪 Testing PowerPoint slide search...\n');

    // Get a PowerPoint document
    const doc = await prisma.document.findFirst({
      where: {
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      }
    });

    if (!doc) {
      console.log('❌ No PowerPoint documents found');
      return;
    }

    console.log(`📄 Testing with document: ${doc.filename}`);
    console.log(`   ID: ${doc.id}`);
    console.log(`   User: ${doc.userId}\n`);

    // Test query for slide 2
    const query = 'slide 2';
    console.log(`🔍 Searching for: "${query}"`);

    // Search embeddings
    const results = await vectorEmbeddingService.searchSimilarChunks(
      doc.userId,
      query,
      10,
      0.0 // No minimum similarity to see all results
    );

    console.log(`\n📊 Found ${results.length} results:\n`);

    results.forEach((result, index) => {
      console.log(`Result ${index + 1}:`);
      console.log(`  Similarity: ${result.similarity?.toFixed(3)}`);
      console.log(`  Document: ${result.document?.filename || 'Unknown'}`);
      console.log(`  Metadata:`, result.document_metadata);
      console.log(`  Content preview: ${result.content?.substring(0, 200)}...`);
      console.log('');
    });

    // Try a more specific query about slide 2 content
    const specificQuery = 'what is on slide 2';
    console.log(`\n🔍 Searching for: "${specificQuery}"`);

    const specificResults = await vectorEmbeddingService.searchSimilarChunks(
      doc.userId,
      specificQuery,
      5,
      0.0
    );

    console.log(`\n📊 Found ${specificResults.length} results:\n`);

    specificResults.forEach((result, index) => {
      console.log(`Result ${index + 1}:`);
      console.log(`  Similarity: ${result.similarity?.toFixed(3)}`);
      console.log(`  Slide: ${result.document_metadata?.slide || 'N/A'}`);
      console.log(`  Content preview: ${result.content?.substring(0, 300)}...`);
      console.log('');
    });

    // Check if Pinecone has the embeddings
    console.log('\n🔍 Checking Pinecone directly...');
    const pineconeStats = await pineconeService.getIndexStats();
    console.log('Pinecone index stats:', pineconeStats);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPowerPointSearch()
  .then(() => {
    console.log('\n✅ Test complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
