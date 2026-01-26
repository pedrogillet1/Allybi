/**
 * Direct Document Processing Script (No Queue)
 *
 * This script processes documents directly without requiring Redis/BullMQ.
 * It finds all documents with fileHash='pending' and processes them sequentially.
 *
 * Run with: npx ts-node --transpile-only src/scripts/process-stuck-documents-direct.ts
 */

import prisma from '../config/database';
import { downloadFile } from '../config/storage';
import { extractText } from '../services/textExtraction.service';
import { markdownConversionService } from '../services/ingestion';
import vectorEmbeddingService from '../services/vectorEmbedding.service';
import semanticChunkingService from '../services/semantic-chunking.service';

const BATCH_SIZE = 10; // Process 10 documents at a time
const CONCURRENT_PROCESSING = 5; // Process 5 documents concurrently

interface ProcessingResult {
  documentId: string;
  filename: string;
  success: boolean;
  error?: string;
  textLength?: number;
}

/**
 * Chunk text into smaller pieces for vector embedding
 */
async function chunkText(text: string, filename: string = 'document'): Promise<Array<{content: string, metadata: any}>> {
  try {
    const semanticChunks = await semanticChunkingService.chunkDocument(text, filename);
    return semanticChunks.map((chunk, index) => ({
      content: chunk.text,
      metadata: {
        chunkIndex: index,
        title: chunk.title,
        section: chunk.metadata.section,
        hasHeading: chunk.metadata.hasHeading,
        topicSummary: chunk.metadata.topicSummary,
        tokenCount: chunk.tokenCount,
        startChar: chunk.startPosition,
        endChar: chunk.endPosition,
      }
    }));
  } catch (error) {
    console.warn('⚠️  Semantic chunking failed, using fallback');
    // Fallback to simple chunking
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: Array<{content: string, metadata: any}> = [];
    let currentChunk = '';
    let currentWordCount = 0;
    let chunkIndex = 0;
    const maxWords = 500;

    for (const sentence of sentences) {
      const words = sentence.trim().split(/\s+/);
      if (currentWordCount + words.length > maxWords && currentChunk.length > 0) {
        chunks.push({ content: currentChunk.trim(), metadata: { chunkIndex } });
        chunkIndex++;
        currentChunk = '';
        currentWordCount = 0;
      }
      currentChunk += sentence + ' ';
      currentWordCount += words.length;
    }
    if (currentChunk.trim().length > 0) {
      chunks.push({ content: currentChunk.trim(), metadata: { chunkIndex } });
    }
    return chunks;
  }
}

/**
 * Process a single document
 */
async function processDocument(doc: {
  id: string;
  userId: string;
  filename: string;
  encryptedFilename: string;
  mimeType: string;
}): Promise<ProcessingResult> {
  const { id: documentId, userId, filename, encryptedFilename, mimeType } = doc;

  try {
    console.log(`\n📄 Processing: ${filename}`);

    // Step 1: Download file from S3
    console.log(`   ⬇️  Downloading...`);
    const fileBuffer = await downloadFile(encryptedFilename);

    // Step 2: Extract text
    console.log(`   📝 Extracting text...`);
    let extractedText = '';
    let ocrConfidence = null;
    try {
      const extractionResult = await extractText(fileBuffer, mimeType);
      extractedText = extractionResult.text || '';
      ocrConfidence = extractionResult.confidence || null;
      console.log(`   ✅ Extracted ${extractionResult.wordCount || 0} words`);
    } catch (error) {
      console.warn(`   ⚠️  Text extraction failed: ${(error as Error).message}`);
    }

    // Step 3: Convert to markdown
    console.log(`   📑 Converting to markdown...`);
    let markdownContent = null;
    let markdownStructure = null;
    let metadata: any = {};
    try {
      const conversionResult = await markdownConversionService.convertToMarkdown(
        fileBuffer,
        mimeType,
        encryptedFilename,
        documentId
      );
      markdownContent = conversionResult.markdownContent;
      markdownStructure = JSON.stringify(conversionResult.structure);
      metadata = conversionResult.metadata || {};
      console.log(`   ✅ Markdown: ${markdownContent.length} chars`);
    } catch (error) {
      console.warn(`   ⚠️  Markdown conversion failed: ${(error as Error).message}`);
    }

    // Step 4: Save metadata to database
    console.log(`   💾 Saving metadata...`);
    await prisma.documentMetadata.upsert({
      where: { documentId },
      create: {
        documentId,
        extractedText,
        ocrConfidence,
        thumbnailUrl: null,
        entities: JSON.stringify({}),
        classification: 'unknown',
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

    // Step 5: Generate vector embeddings
    if (extractedText && extractedText.length > 50) {
      console.log(`   🧠 Generating embeddings...`);
      try {
        const chunks = await chunkText(extractedText, filename);
        await vectorEmbeddingService.storeDocumentEmbeddings(documentId, chunks);
        console.log(`   ✅ Stored ${chunks.length} embeddings`);
      } catch (error) {
        console.warn(`   ⚠️  Embedding generation failed: ${(error as Error).message}`);
      }
    }

    // Step 6: Calculate file hash and update status
    const crypto = await import('crypto');
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'completed',
        fileHash: fileHash,
      },
    });

    console.log(`   ✅ DONE: ${filename}`);

    return {
      documentId,
      filename,
      success: true,
      textLength: extractedText.length,
    };

  } catch (error) {
    console.error(`   ❌ FAILED: ${filename} - ${(error as Error).message}`);

    // Mark as failed
    try {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'failed' },
      });
    } catch (dbError) {
      // Ignore
    }

    return {
      documentId,
      filename,
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Process documents in parallel batches
 */
async function processBatch(documents: any[]): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = [];

  // Process in groups of CONCURRENT_PROCESSING
  for (let i = 0; i < documents.length; i += CONCURRENT_PROCESSING) {
    const batch = documents.slice(i, i + CONCURRENT_PROCESSING);
    const batchResults = await Promise.all(batch.map(doc => processDocument(doc)));
    results.push(...batchResults);
  }

  return results;
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  DIRECT DOCUMENT PROCESSING (NO QUEUE)');
  console.log('='.repeat(70) + '\n');

  try {
    // Find all documents with fileHash='pending'
    const stuckDocuments = await prisma.document.findMany({
      where: { fileHash: 'pending' },
      select: {
        id: true,
        userId: true,
        filename: true,
        encryptedFilename: true,
        mimeType: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`📊 Found ${stuckDocuments.length} documents to process\n`);

    if (stuckDocuments.length === 0) {
      console.log('✅ No documents need processing.');
      return;
    }

    // Group by status for reporting
    const statusGroups: Record<string, number> = {};
    stuckDocuments.forEach(doc => {
      statusGroups[doc.status] = (statusGroups[doc.status] || 0) + 1;
    });
    console.log('📈 Current status breakdown:');
    Object.entries(statusGroups).forEach(([status, count]) => {
      console.log(`   - ${status}: ${count}`);
    });

    const startTime = Date.now();
    const results: ProcessingResult[] = [];
    let processed = 0;

    // Process in batches
    const totalBatches = Math.ceil(stuckDocuments.length / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batch = stuckDocuments.slice(batchStart, batchStart + BATCH_SIZE);

      console.log(`\n${'─'.repeat(60)}`);
      console.log(`📦 BATCH ${batchIndex + 1}/${totalBatches} (${batch.length} documents)`);
      console.log(`${'─'.repeat(60)}`);

      const batchResults = await processBatch(batch);
      results.push(...batchResults);

      processed += batch.length;
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = stuckDocuments.length - processed;
      const eta = remaining / rate;

      console.log(`\n📊 Progress: ${processed}/${stuckDocuments.length} (${Math.round(processed/stuckDocuments.length*100)}%)`);
      console.log(`⏱️  Rate: ${rate.toFixed(2)} docs/sec | ETA: ${Math.round(eta)}s`);
    }

    // Final summary
    const duration = (Date.now() - startTime) / 1000;
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log('\n' + '='.repeat(70));
    console.log('  PROCESSING COMPLETE');
    console.log('='.repeat(70));
    console.log(`\n  📊 Summary:`);
    console.log(`     - Total processed: ${results.length}`);
    console.log(`     - Successful: ${successCount}`);
    console.log(`     - Failed: ${failureCount}`);
    console.log(`     - Duration: ${duration.toFixed(1)}s`);
    console.log(`     - Average rate: ${(results.length / duration).toFixed(2)} docs/sec`);

    if (failureCount > 0) {
      console.log(`\n  ❌ Failed documents:`);
      results.filter(r => !r.success).slice(0, 10).forEach(r => {
        console.log(`     - ${r.filename}: ${r.error}`);
      });
      if (failureCount > 10) {
        console.log(`     ... and ${failureCount - 10} more`);
      }
    }

    console.log('');

  } catch (error) {
    console.error('\n❌ Script failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main()
  .then(() => {
    console.log('✅ Script completed.\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
