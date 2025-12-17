import dotenv from 'dotenv';
dotenv.config();

import prisma from '../config/database';

async function diagnose() {
  console.log('=== DATABASE DIAGNOSTIC ===\n');

  // Check documents
  const docCount = await prisma.document.count();
  console.log('Total documents:', docCount);

  const docByStatus = await prisma.document.groupBy({
    by: ['status'],
    _count: true
  });
  console.log('Documents by status:', JSON.stringify(docByStatus, null, 2));

  // Check folders
  const folderCount = await prisma.folder.count();
  console.log('\nTotal folders:', folderCount);

  if (folderCount > 0) {
    const folders = await prisma.folder.findMany({
      select: { id: true, name: true, createdAt: true },
      take: 10,
      orderBy: { createdAt: 'desc' }
    });
    console.log('Recent folders:', JSON.stringify(folders, null, 2));
  }

  // Check users
  const userCount = await prisma.user.count();
  console.log('\nTotal users:', userCount);

  if (userCount > 0) {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, createdAt: true },
      take: 5
    });
    console.log('Users:', JSON.stringify(users.map(u => ({ id: u.id.substring(0, 8), email: u.email })), null, 2));
  }

  // Check for any recent activity
  const recentDocs = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      filename: true,
      status: true,
      createdAt: true,
      error: true
    }
  });

  if (recentDocs.length > 0) {
    console.log('\nRecent documents:');
    recentDocs.forEach(d => {
      console.log(`  - ${d.status}: ${d.filename} (${d.createdAt})`);
      if (d.error) console.log(`    Error: ${d.error}`);
    });
  }

  await prisma.$disconnect();
}

diagnose().catch(console.error);
