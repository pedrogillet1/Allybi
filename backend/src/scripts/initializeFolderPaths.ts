/**
 * Initialize Folder Paths Script
 *
 * One-time migration script to compute and store full paths for all folders.
 * This enables O(1) path queries instead of recursive parent lookups.
 *
 * Usage:
 *   npx ts-node src/scripts/initializeFolderPaths.ts
 *
 * Or with npm:
 *   npm run initialize-folder-paths
 */

import prisma from '../config/database';
import { initializeAllFolderPaths, initializeUserFolderPaths } from '../services/folderPath.service';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       FOLDER PATH INITIALIZATION SCRIPT                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  try {
    // Check current state
    const totalFolders = await prisma.folder.count();
    const foldersWithPaths = await prisma.folder.count({ where: { path: { not: null } } });
    const foldersWithoutPaths = totalFolders - foldersWithPaths;

    console.log('📊 Current State:');
    console.log(`   Total folders: ${totalFolders}`);
    console.log(`   With paths: ${foldersWithPaths}`);
    console.log(`   Without paths: ${foldersWithoutPaths}`);
    console.log('');

    if (foldersWithoutPaths === 0) {
      console.log('✅ All folders already have paths computed. Nothing to do!');
      return;
    }

    console.log('🔄 Initializing folder paths...\n');

    // Initialize all folder paths
    const updatedCount = await initializeAllFolderPaths();

    const duration = Date.now() - startTime;
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    INITIALIZATION COMPLETE                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`   ✅ Updated: ${updatedCount} folders`);
    console.log(`   ⏱️  Duration: ${duration}ms`);
    console.log('');

    // Verify
    const verifyCount = await prisma.folder.count({ where: { path: { not: null } } });
    console.log(`📊 Verification: ${verifyCount}/${totalFolders} folders now have paths`);

    // Show sample paths
    const sampleFolders = await prisma.folder.findMany({
      take: 5,
      where: { path: { not: null } },
      select: { name: true, path: true },
      orderBy: { createdAt: 'desc' }
    });

    if (sampleFolders.length > 0) {
      console.log('\n📁 Sample paths:');
      for (const folder of sampleFolders) {
        console.log(`   ${folder.name} → ${folder.path}`);
      }
    }

  } catch (error) {
    console.error('❌ Error during initialization:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
