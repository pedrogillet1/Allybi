import dotenv from 'dotenv';
dotenv.config();

import prisma from '../config/database';

async function resetFailed() {
  // Reset all processing_failed documents back to completed so they can be re-queued
  const result = await prisma.document.updateMany({
    where: { status: 'processing_failed' },
    data: { status: 'completed', error: null }
  });
  console.log('Reset', result.count, 'failed documents to completed status');

  // Show current status counts
  const byStatus = await prisma.document.groupBy({
    by: ['status'],
    _count: true
  });
  console.log('Current status counts:', byStatus);

  await prisma.$disconnect();
}

resetFailed().catch(console.error);
