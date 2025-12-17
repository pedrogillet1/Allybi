/**
 * Reprocess the Scrum PDF document to generate proper embeddings
 * Uses Google Vision OCR for text extraction
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { downloadFile } from '../src/config/storage';
import encryptionService from '../src/services/encryption.service';
import googleVisionOCR from '../src/services/google-vision-ocr.service';
import vectorEmbeddingService from '../src/services/vectorEmbedding.service';
import embeddingService from '../src/services/embedding.service';

const prisma = new PrismaClient();

// Chunking function (copied from document.service.ts)
interface ChunkOptions {
  maxSize: number;
  overlap: number;
  splitOn: string[];
}

interface ChunkWithPosition {
  content: string;
  index: number;
  startChar: number;
  endChar: number;
}

function chunkTextWithOverlap(text: string, options: ChunkOptions): ChunkWithPosition[] {
  const { maxSize, overlap, splitOn } = options;
  const chunks: ChunkWithPosition[] = [];

  let currentPos = 0;
  let chunkIndex = 0;

  while (currentPos < text.length) {
    let endPos = Math.min(currentPos + maxSize, text.length);

    // Try to find a good break point
    if (endPos < text.length) {
      let bestBreak = endPos;

      for (const delimiter of splitOn) {
        const lastIndex = text.lastIndexOf(delimiter, endPos);
        if (lastIndex > currentPos && lastIndex > bestBreak - 100) {
          bestBreak = lastIndex + delimiter.length;
          break;
        }
      }

      endPos = bestBreak;
    }

    const content = text.substring(currentPos, endPos).trim();

    if (content.length > 0) {
      chunks.push({
        content,
        index: chunkIndex++,
        startChar: currentPos,
        endChar: endPos,
      });
    }

    // Move forward, accounting for overlap
    const prevStartChar = chunks[chunks.length - 1]?.startChar ?? -1;
    currentPos = endPos - overlap;

    // Ensure we make progress
    if (currentPos <= prevStartChar) {
      currentPos = endPos;
    }
  }

  return chunks;
}

async function reprocessScrumPDF() {
  console.log('=== REPROCESSING SCRUM PDF FOR EMBEDDINGS ===\n');

  // Step 1: Check Google Vision OCR
  console.log('1. Checking Google Vision OCR...');
  if (!googleVisionOCR.isAvailable()) {
    console.error('❌ Not available:', googleVisionOCR.getInitializationError());
    process.exit(1);
  }
  console.log('✅ Google Vision OCR is available\n');

  // Step 2: Find the document
  console.log('2. Finding Scrum PDF...');
  const doc = await prisma.document.findFirst({
    where: { filename: { contains: 'Scrum' } },
    include: { chunks: true, metadata: true }
  });

  if (!doc) {
    console.log('❌ Document not found');
    await prisma.$disconnect();
    return;
  }

  console.log('✅ Found:', doc.filename);
  console.log('   ID:', doc.id);
  console.log('   Current chunks:', doc.chunks.length);
  console.log('   Current status:', doc.status);
  console.log('   Has extracted text:', !!doc.metadata?.extractedText && doc.metadata.extractedText.length > 100, '\n');

  // Step 3: Download and decrypt
  console.log('3. Downloading from S3...');
  let buffer = await downloadFile(doc.encryptedFilename);
  console.log('✅ Downloaded:', buffer.length, 'bytes');

  if (doc.isEncrypted) {
    console.log('   Decrypting...');
    buffer = encryptionService.decryptFile(buffer, `document-${doc.userId}`);
    console.log('✅ Decrypted:', buffer.length, 'bytes\n');
  }

  // Step 4: Run OCR to extract text
  console.log('4. Running Google Vision OCR...');
  const startTime = Date.now();
  const ocrResult = await googleVisionOCR.processScannedPDF(buffer);
  const ocrTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('✅ OCR completed in', ocrTime, 'seconds');
  console.log('   Pages:', ocrResult.pageCount);
  console.log('   Characters:', ocrResult.text.length);
  console.log('   Words:', ocrResult.text.split(/\s+/).length, '\n');

  // Step 5: Delete old chunks
  console.log('5. Deleting old chunks...');
  const deleted = await prisma.documentChunk.deleteMany({
    where: { documentId: doc.id }
  });
  console.log('✅ Deleted', deleted.count, 'old chunks\n');

  // Step 6: Generate new embeddings
  console.log('6. Generating new embeddings...');
  const embeddingStartTime = Date.now();

  try {
    // Update document status
    await prisma.document.update({
      where: { id: doc.id },
      data: { status: 'processing' }
    });

    // Update or create document metadata with extracted text
    await prisma.documentMetadata.upsert({
      where: { documentId: doc.id },
      update: {
        extractedText: ocrResult.text,
        pageCount: ocrResult.pageCount,
        ocrConfidence: ocrResult.confidence,
        wordCount: ocrResult.text.split(/\s+/).length,
        characterCount: ocrResult.text.length
      },
      create: {
        documentId: doc.id,
        extractedText: ocrResult.text,
        pageCount: ocrResult.pageCount,
        ocrConfidence: ocrResult.confidence,
        wordCount: ocrResult.text.split(/\s+/).length,
        characterCount: ocrResult.text.length
      }
    });

    // Chunk the text
    console.log('   Creating chunks...');
    const chunks = chunkTextWithOverlap(ocrResult.text, {
      maxSize: 1000,
      overlap: 200,
      splitOn: ['\n\n', '\n', '. ', ', ', ' ']
    });

    console.log('   Created', chunks.length, 'chunks');

    // Generate embeddings for each chunk
    console.log('   Generating embeddings (batches of 10)...');
    const BATCH_SIZE = 10;
    const chunkObjectsWithEmbeddings: Array<{
      chunkIndex: number;
      content: string;
      embedding: number[];
    }> = [];

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchTexts = batch.map(c => c.content);

      // Generate batch embeddings
      const embeddingsResult = await embeddingService.generateBatchEmbeddings(batchTexts);

      // Map results to chunk objects
      for (let j = 0; j < batch.length; j++) {
        const embeddingResult = embeddingsResult.embeddings[j];
        chunkObjectsWithEmbeddings.push({
          chunkIndex: i + j,
          content: batch[j].content,
          embedding: embeddingResult?.embedding || [],
        });
      }

      console.log(`   Processed ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} chunks`);
    }

    // Store embeddings in Pinecone
    console.log('   Storing embeddings in Pinecone...');
    await vectorEmbeddingService.storeDocumentEmbeddings(doc.id, chunkObjectsWithEmbeddings);

    const embeddingTime = ((Date.now() - embeddingStartTime) / 1000).toFixed(1);

    console.log('✅ Generated and stored', chunks.length, 'chunks in', embeddingTime, 'seconds');

    // Mark document as completed
    await prisma.document.update({
      where: { id: doc.id },
      data: {
        status: 'completed',
        chunksCount: chunks.length,
        embeddingsGenerated: true
      }
    });

    console.log('✅ Document marked as completed\n');

    // Verify
    console.log('7. Verification...');
    const updatedDoc = await prisma.document.findUnique({
      where: { id: doc.id },
      include: { chunks: true, metadata: true }
    });

    console.log('   Status:', updatedDoc?.status);
    console.log('   Total chunks:', updatedDoc?.chunks.length);
    console.log('   Extracted text length:', updatedDoc?.metadata?.extractedText?.length);
    console.log('   OCR confidence:', updatedDoc?.metadata?.ocrConfidence);

    // Show sample chunks
    if (updatedDoc?.chunks && updatedDoc.chunks.length > 0) {
      console.log('\n   Sample chunks:');
      for (let i = 0; i < Math.min(3, updatedDoc.chunks.length); i++) {
        const chunk = updatedDoc.chunks[i];
        console.log(`   [${i + 1}] ${chunk.text.substring(0, 100)}...`);
      }
    }

  } catch (error: any) {
    console.error('❌ Embedding generation failed:', error.message);
    console.error(error.stack);

    // Mark as failed
    await prisma.document.update({
      where: { id: doc.id },
      data: { status: 'failed', error: error.message }
    });
  }

  await prisma.$disconnect();
  console.log('\n✅ Done!');
}

reprocessScrumPDF().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
