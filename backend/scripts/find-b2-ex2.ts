import prisma from '../config/database';

async function findB2inEx2() {
  const documentId = '034c8e07-c6be-447d-90c9-c2f7cef119bd';

  // Search for Row 2 in ex2 sheet
  const embeddings = await prisma.documentEmbedding.findMany({
    where: {
      documentId,
      OR: [
        { content: { contains: "Sheet 'ex2', Row 2:" } },
        { content: { contains: 'B2:' } }
      ]
    },
    take: 5
  });

  console.log(`Found ${embeddings.length} embeddings mentioning Row 2 or B2 in ex2:\n`);

  embeddings.forEach((emb, idx) => {
    console.log(`${idx + 1}. ${emb.content}`);
    console.log(`   Metadata: ${emb.document_metadata}\n`);
  });

  // Check specific American Amber Light entry
  const amberLight = await prisma.documentEmbedding.findMany({
    where: {
      documentId,
      content: { contains: 'American Amber Light' }
    },
    take: 2
  });

  if (amberLight.length > 0) {
    console.log(`\n✅ Found "American Amber Light" entries:\n`);
    amberLight.forEach((emb, idx) => {
      console.log(`${idx + 1}. ${emb.content}\n`);
    });
  }

  await prisma.$disconnect();
}

findB2inEx2().catch(console.error);
