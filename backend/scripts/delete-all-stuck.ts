import dotenv from 'dotenv';
dotenv.config();
import prisma from './src/config/database';

async function deleteAll() {
  const result = await prisma.document.deleteMany({
    where: { status: { in: ['uploading', 'processing', 'failed'] } }
  });
  console.log(`Deleted ${result.count} stuck documents`);
  await prisma.$disconnect();
}

deleteAll().catch(console.error);
