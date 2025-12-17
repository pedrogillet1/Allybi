import vectorEmbeddingService from '../services/vectorEmbedding.service';
import prisma from '../config/database';

async function testRAGSearch() {
  const userId = '03ec97ac-1934-4188-8471-524366d87521'; // Your user ID
  const query = 'What is the value in cell B2 on sheet ex2';

  console.log(`Testing RAG search for: "${query}"\n`);

  try {
    // Test vector search
    console.log('1. Testing vector similarity search...');
    const results = await vectorEmbeddingService.searchSimilarChunks(
      userId,
      query,
      10,  // Get top 10 results
      0.3  // Lower similarity threshold
    );

    console.log(`\nFound ${results.length} results:\n`);

    results.forEach((result, idx) => {
      console.log(`${idx + 1}. Document: ${result.document.filename}`);
      console.log(`   Similarity: ${result.similarity.toFixed(4)}`);
      console.log(`   Metadata: ${JSON.stringify(result.document_metadata)}`);
      console.log(`   Content: ${result.content.substring(0, 150)}...`);
      console.log('');
    });

    // Check if ex2 data exists in results
    const ex2Results = results.filter(r =>
      r.content.includes('ex2') ||
      (r.document_metadata && r.document_metadata.sheet === 'ex2')
    );

    console.log(`\n${ex2Results.length > 0 ? '✅' : '❌'} ex2 sheet found in results: ${ex2Results.length} matches`);

    if (ex2Results.length > 0) {
      console.log('\nex2 matches:');
      ex2Results.forEach((result, idx) => {
        console.log(`\n${idx + 1}. ${result.content}`);
      });
    }

    // Check what's in the database for this user
    console.log('\n2. Checking database directly...');
    const allDocs = await prisma.document.findMany({
      where: { userId },
      select: { id: true, filename: true }
    });

    console.log(`\nUser has ${allDocs.length} documents:`);
    allDocs.forEach(doc => {
      console.log(`  - ${doc.filename} (${doc.id})`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testRAGSearch().catch(console.error);
