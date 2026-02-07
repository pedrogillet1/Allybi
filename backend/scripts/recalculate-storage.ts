/**
 * One-time script to recalculate storage usage for all users
 *
 * This script:
 * 1. Sums up fileSize from all documents for each user
 * 2. Updates user.storageUsedBytes to match the actual sum
 *
 * Run with: npx ts-node scripts/recalculate-storage.ts
 * Or: npx tsx scripts/recalculate-storage.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting storage recalculation...\n');

  // Get all users
  const users = await prisma.user.findMany({
    select: { id: true, email: true, storageUsedBytes: true },
  });

  console.log(`Found ${users.length} users to process\n`);

  let updated = 0;
  let skipped = 0;

  for (const user of users) {
    // Calculate actual storage from documents
    const result = await prisma.document.aggregate({
      where: { userId: user.id },
      _sum: { fileSize: true },
    });

    const actualBytes = result._sum.fileSize || BigInt(0);
    const currentBytes = user.storageUsedBytes || BigInt(0);

    if (actualBytes !== currentBytes) {
      await prisma.user.update({
        where: { id: user.id },
        data: { storageUsedBytes: actualBytes },
      });

      console.log(`Updated ${user.email}:`);
      console.log(`  Previous: ${formatBytes(Number(currentBytes))}`);
      console.log(`  Actual:   ${formatBytes(Number(actualBytes))}`);
      console.log('');
      updated++;
    } else {
      skipped++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Updated: ${updated} users`);
  console.log(`Skipped: ${skipped} users (already correct)`);
  console.log('Done!');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
