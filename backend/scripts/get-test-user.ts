#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'test@koda.com' },
    include: {
      _count: {
        select: {
          documents: true,
          conversations: true,
          folders: true,
        },
      },
    },
  });

  if (!user) {
    console.log('❌ User test@koda.com not found');
    process.exit(1);
  }

  console.log('\n✅ User Found:');
  console.log('─'.repeat(60));
  console.log(`Email: ${user.email}`);
  console.log(`Name: ${user.firstName || ''} ${user.lastName || ''}`.trim() || 'N/A');
  console.log(`ID: ${user.id}`);
  console.log(`Created: ${user.createdAt.toISOString()}`);
  console.log('─'.repeat(60));
  console.log(`Documents: ${user._count.documents}`);
  console.log(`Conversations: ${user._count.conversations}`);
  console.log(`Folders: ${user._count.folders}`);
  console.log('─'.repeat(60));
  console.log(`\n📋 Copy this ID to use in tests:`);
  console.log(`   ${user.id}\n`);

  // Get recent documents
  const documents = await prisma.document.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (documents.length > 0) {
    console.log(`📄 Recent Documents (${documents.length}):\n`);
    documents.forEach((doc: any, i: number) => {
      console.log(`${i + 1}. ${doc.filename}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   Type: ${doc.mimeType}`);
      console.log(`   Size: ${(doc.fileSize / 1024).toFixed(1)} KB`);
      console.log('');
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);
