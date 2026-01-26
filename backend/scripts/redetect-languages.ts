/**
 * Re-detect Languages for Existing Documents
 *
 * Analyzes all existing documents and detects their language
 * using the franc library. Updates documents and regenerates
 * tsvector using the detected language.
 *
 * Usage: npx ts-node --transpile-only src/scripts/redetect-languages.ts
 */

import prisma from '../config/database';
import { detectLanguageFromSamples, type SupportedLanguage } from '../services/languageDetection.service';

interface DetectionStats {
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  byLanguage: Record<string, number>;
}

async function redetectLanguages(): Promise<DetectionStats> {
  console.log('═'.repeat(70));
  console.log('  RE-DETECT LANGUAGES FOR EXISTING DOCUMENTS');
  console.log('═'.repeat(70));
  console.log('');

  const stats: DetectionStats = {
    total: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    byLanguage: {
      english: 0,
      spanish: 0,
      portuguese: 0,
    },
  };

  try {
    // Get all completed documents with their embeddings
    const documents = await prisma.document.findMany({
      where: {
        status: 'completed',
      },
      include: {
        embeddings: {
          take: 5, // Get first 5 chunks for detection
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });

    stats.total = documents.length;
    console.log(`📊 Found ${documents.length} documents to process\n`);

    for (const doc of documents) {
      try {
        // Skip if no embeddings
        if (!doc.embeddings || doc.embeddings.length === 0) {
          console.log(`⏭️  ${doc.filename}: No embeddings, skipping`);
          stats.skipped++;
          continue;
        }

        // Get sample texts from embeddings
        const sampleTexts = doc.embeddings
          .map(emb => emb.content)
          .filter(content => content && content.length >= 50);

        if (sampleTexts.length === 0) {
          console.log(`⏭️  ${doc.filename}: No substantial text, skipping`);
          stats.skipped++;
          continue;
        }

        // Detect language
        const detection = detectLanguageFromSamples(sampleTexts);
        const detectedLanguage = detection.language as SupportedLanguage;

        // Update document language
        await prisma.document.update({
          where: { id: doc.id },
          data: { language: detectedLanguage },
        });

        // Regenerate tsvector for all embeddings of this document
        await prisma.$executeRaw`
          UPDATE document_embeddings
          SET content_tsv = to_tsvector(${detectedLanguage}::regconfig, content)
          WHERE "documentId" = ${doc.id}
        `;

        console.log(`✅ ${doc.filename}: ${detectedLanguage} (confidence: ${detection.confidence.toFixed(2)})`);
        stats.updated++;
        stats.byLanguage[detectedLanguage]++;

      } catch (error: any) {
        console.error(`❌ ${doc.filename}: Failed - ${error.message}`);
        stats.failed++;
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('  SUMMARY');
    console.log('═'.repeat(70));
    console.log(`\n📊 Results:`);
    console.log(`   Total documents: ${stats.total}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Skipped: ${stats.skipped}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log(`\n🌍 Language distribution:`);
    Object.entries(stats.byLanguage).forEach(([lang, count]) => {
      if (count > 0) {
        console.log(`   ${lang}: ${count} documents`);
      }
    });

    // Verify in database
    const dbStats = await prisma.$queryRaw<Array<{ language: string; count: bigint }>>`
      SELECT language, COUNT(*) as count
      FROM documents
      WHERE status = 'completed'
      GROUP BY language
      ORDER BY count DESC
    `;
    console.log(`\n📊 Database verification:`);
    dbStats.forEach(s => console.log(`   ${s.language}: ${s.count} documents`));

    return stats;

  } catch (error: any) {
    console.error('\n❌ Re-detection failed:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

redetectLanguages()
  .then((stats) => {
    console.log('\n✅ Language re-detection complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
