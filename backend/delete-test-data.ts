import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { PrismaClient } from '@prisma/client';

// Use direct connection to avoid pool exhaustion
const directUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: { db: { url: directUrl } }
});

async function deleteTestData() {
  const user = await prisma.user.findFirst({ where: { email: 'test@koda.com' } });
  if (!user) { console.log('User not found'); return; }

  console.log(`Deleting all data for test@koda.com (${user.id})...\n`);

  // Delete in order due to foreign key constraints

  // 1. Delete document embeddings
  const embeddings = await prisma.documentEmbedding.deleteMany({
    where: { document: { userId: user.id } }
  });
  console.log(`Deleted ${embeddings.count} embeddings`);

  // 2. Delete document chunks
  const chunks = await prisma.documentChunk.deleteMany({
    where: { document: { userId: user.id } }
  });
  console.log(`Deleted ${chunks.count} chunks`);

  // 3. Delete document metadata
  const metadata = await prisma.documentMetadata.deleteMany({
    where: { document: { userId: user.id } }
  });
  console.log(`Deleted ${metadata.count} metadata records`);

  // 4. Delete documents
  const docs = await prisma.document.deleteMany({
    where: { userId: user.id }
  });
  console.log(`Deleted ${docs.count} documents`);

  // 5. Delete folders
  const folders = await prisma.folder.deleteMany({
    where: { userId: user.id }
  });
  console.log(`Deleted ${folders.count} folders`);

  // 6. Delete messages
  const messages = await prisma.message.deleteMany({
    where: { conversation: { userId: user.id } }
  });
  console.log(`Deleted ${messages.count} messages`);

  // 7. Delete conversations
  const convos = await prisma.conversation.deleteMany({
    where: { userId: user.id }
  });
  console.log(`Deleted ${convos.count} conversations`);

  console.log('\nDone! test@koda.com account is now clean.');
  await prisma.$disconnect();
}

deleteTestData().catch(console.error);
