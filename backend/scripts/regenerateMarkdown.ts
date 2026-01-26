/**
 * Batch Processing Script to Regenerate Markdown for Existing Documents
 *
 * This script reprocesses all documents that don't have markdown content yet.
 * It downloads each file from storage, converts it to markdown, and updates the database.
 */

import prisma from '../config/database';
import { downloadFile } from '../config/storage';
import { markdownConversionService } from '../services/ingestion';
import { extractText } from '../services/textExtraction.service';

interface ProcessingStats {
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  errors: Array<{ documentId: string; filename: string; error: string }>;
}

/**
 * Check if a document needs markdown regeneration
 */
async function needsMarkdownRegeneration(documentId: string): Promise<boolean> {
  const metadata = await prisma.documentMetadata.findUnique({
    where: { documentId },
    select: { markdownContent: true },
  });

  // Need regeneration if no metadata or no markdown content
  return !metadata || !metadata.markdownContent;
}

/**
 * Process a single document
 */
async function processDocument(document: any, stats: ProcessingStats): Promise<void> {
  const { id, userId, encryptedFilename, mimeType, filename } = document;

  console.log(`\n📄 [${stats.processed + 1}/${stats.total}] Processing: ${filename}`);
  console.log(`   Document ID: ${id}`);
  console.log(`   MIME Type: ${mimeType}`);

  try {
    // Skip images - they don't need markdown conversion
    if (mimeType.startsWith('image/')) {
      console.log(`   ⏭️  Skipped (images don't need markdown conversion)`);
      stats.skipped++;
      return;
    }

    // Check if document needs processing
    const needsProcessing = await needsMarkdownRegeneration(id);
    if (!needsProcessing) {
      console.log(`   ⏭️  Skipped (already has markdown content)`);
      stats.skipped++;
      return;
    }

    // Step 1: Download file from storage
    console.log(`   ⬇️  Downloading from storage...`);
    const fileBuffer = await downloadFile(encryptedFilename);
    console.log(`   ✅ Downloaded (${fileBuffer.length} bytes)`);

    // Step 2: Extract text (if not already done)
    console.log(`   📝 Extracting text...`);
    let extractedText = '';
    let ocrConfidence = null;
    let language = null;

    try {
      const extractionResult = await extractText(fileBuffer, mimeType);
      extractedText = extractionResult.text || '';
      ocrConfidence = extractionResult.confidence || null;
      language = extractionResult.language || null;
      console.log(`   ✅ Extracted ${extractionResult.wordCount || 0} words`);
    } catch (error) {
      console.warn(`   ⚠️  Text extraction failed: ${(error as Error).message}`);
    }

    // Step 3: Convert to markdown
    console.log(`   🔄 Converting to markdown...`);
    let markdownContent = null;
    let markdownStructure = null;
    let images: string[] = [];
    let document_metadata: { pageCount?: number; wordCount?: number; sheetCount?: number; slideCount?: number } = {};

    try {
      const conversionResult = await markdownConversionService.convertToMarkdown(
        fileBuffer,
        mimeType,
        encryptedFilename,
        id
      );

      markdownContent = conversionResult.markdownContent;
      markdownStructure = JSON.stringify(conversionResult.structure);
      images = conversionResult.images;
      metadata = conversionResult.document_metadata;

      console.log(`   ✅ Converted to markdown (${markdownContent.length} chars, ${conversionResult.structure.headings.length} headings)`);
    } catch (error) {
      console.warn(`   ⚠️  Markdown conversion failed: ${(error as Error).message}`);
      throw error; // Fail if markdown conversion fails
    }

    // Step 4: Update database
    console.log(`   💾 Saving to database...`);
    await prisma.$transaction(async (tx) => {
      // Verify document belongs to the user (security check)
      const doc = await tx.documents.findUnique({
        where: { id },
        select: { userId: true },
      });

      if (!doc) {
        throw new Error(`Document ${id} not found`);
      }

      if (doc.userId !== userId) {
        throw new Error(`SECURITY: documents ${id} belongs to different user`);
      }

      // Upsert metadata
      await tx.document_metadata.upsert({
        where: { documentId: id },
        create: {
          documentId: id,
          extractedText,
          ocrConfidence,
          markdownContent,
          markdownStructure,
          pageCount: metadata.pageCount || null,
          wordCount: metadata.wordCount || null,
          sheetCount: metadata.sheetCount || null,
          slideCount: metadata.slideCount || null,
        },
        update: {
          extractedText,
          ocrConfidence,
          markdownContent,
          markdownStructure,
          pageCount: metadata.pageCount || null,
          wordCount: metadata.wordCount || null,
          sheetCount: metadata.sheetCount || null,
          slideCount: metadata.slideCount || null,
        },
      });

      // Update document status
      await tx.documents.update({
        where: { id },
        data: { status: 'completed' },
      });
    });

    console.log(`   ✅ Successfully processed!`);
    stats.processed++;
  } catch (error) {
    console.error(`   ❌ Failed: ${(error as Error).message}`);
    stats.failed++;
    stats.errors.push({
      documentId: id,
      filename,
      error: (error as Error).message,
    });
  }
}

/**
 * Main batch processing function
 */
async function regenerateMarkdownBatch(
  options: {
    batchSize?: number;
    dryRun?: boolean;
    userId?: string;
    documentIds?: string[];
  } = {}
): Promise<ProcessingStats> {
  const { batchSize = 50, dryRun = false, userId, documentIds } = options;

  console.log('\n🚀 Starting Markdown Regeneration Batch Process');
  console.log('================================================\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be saved\n');
  }

  const stats: ProcessingStats = {
    total: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Build query filters
    const where: any = {};
    if (userId) {
      where.userId = userId;
    }
    if (documentIds && documentIds.length > 0) {
      where.id = { in: documentIds };
    }

    // Get all documents that need processing
    const documents = await prisma.document.findMany({
      where,
      select: {
        id: true,
        userId: true,
        encryptedFilename: true,
        mimeType: true,
        filename: true,
        status: true,
      },
      take: batchSize,
      orderBy: { createdAt: 'desc' },
    });

    stats.total = documents.length;

    if (documents.length === 0) {
      console.log('ℹ️  No documents found to process');
      return stats;
    }

    console.log(`📊 Found ${documents.length} document(s) to process\n`);

    // Process each document
    for (const document of documents) {
      if (dryRun) {
        // Skip images
        if (document.mimeType.startsWith('image/')) {
          console.log(`[DRY RUN] Would skip: ${document.filename} (images don't need markdown)`);
          stats.skipped++;
          continue;
        }

        const needsProcessing = await needsMarkdownRegeneration(document.id);
        if (needsProcessing) {
          console.log(`[DRY RUN] Would process: ${document.filename} (${document.id})`);
          stats.processed++;
        } else {
          console.log(`[DRY RUN] Would skip: ${document.filename} (already has markdown)`);
          stats.skipped++;
        }
      } else {
        await processDocument(document, stats);

        // Add small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Print summary
    console.log('\n================================================');
    console.log('📊 Processing Summary');
    console.log('================================================');
    console.log(`Total documents: ${stats.total}`);
    console.log(`✅ Successfully processed: ${stats.processed}`);
    console.log(`⏭️  Skipped (already processed): ${stats.skipped}`);
    console.log(`❌ Failed: ${stats.failed}`);

    if (stats.errors.length > 0) {
      console.log('\n❌ Errors:');
      stats.errors.forEach((err, idx) => {
        console.log(`   ${idx + 1}. ${err.filename} (${err.documentId})`);
        console.log(`      ${err.error}`);
      });
    }

    console.log('\n✅ Batch processing completed!\n');

    return stats;
  } catch (error) {
    console.error('\n❌ Fatal error during batch processing:', error);
    throw error;
  }
}

/**
 * CLI Entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const options: any = {
    batchSize: 50,
    dryRun: false,
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i], 10);
        break;
      case '--user-id':
        options.userId = args[++i];
        break;
      case '--document-ids':
        options.documentIds = args[++i].split(',');
        break;
      case '--help':
        console.log(`
Markdown Regeneration Script

Usage: npm run regenerate-markdown [options]

Options:
  --dry-run              Run without making changes (preview mode)
  --batch-size <number>  Number of documents to process (default: 50)
  --user-id <id>         Process documents for specific user only
  --document-ids <ids>   Process specific documents (comma-separated)
  --help                 Show this help message

Examples:
  npm run regenerate-markdown --dry-run
  npm run regenerate-markdown --batch-size 10
  npm run regenerate-markdown --user-id abc123
  npm run regenerate-markdown --document-ids doc1,doc2,doc3
        `);
        process.exit(0);
      default:
        console.error(`Unknown argument: ${arg}`);
        process.exit(1);
    }
  }

  try {
    await regenerateMarkdownBatch(options);
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { regenerateMarkdownBatch, processDocument };
