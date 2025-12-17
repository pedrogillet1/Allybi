/**
 * Upload Local Files Script
 *
 * This script uploads files from a local folder to the database and generates embeddings.
 *
 * Run with: npx ts-node --transpile-only src/scripts/upload-local-files.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import prisma from '../config/database';
import { extractText } from '../services/textExtraction.service';
import { vectorEmbeddingService } from '../services/vectorEmbedding.service';
import chunkingService from '../services/chunking.service';
import embeddingService from '../services/embedding.service';

const USER_ID = '271a9282-463b-42bd-ac2c-4034ce9d9524'; // localhost@koda.com
const LOCAL_FOLDER = 'C:/Users/pedro/OneDrive/Área de Trabalho/trabalhos';
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.txt', '.pptx'];

interface ProcessingResult {
  filename: string;
  success: boolean;
  error?: string;
  chunksCreated?: number;
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.html': 'text/html',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

async function processLocalFile(filePath: string): Promise<ProcessingResult> {
  const filename = path.basename(filePath);
  const result: ProcessingResult = {
    filename,
    success: false,
  };

  try {
    console.log(`\n📄 Processing: ${filename}`);

    // Step 1: Read file
    console.log('  📂 Reading file...');
    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = getMimeType(filename);
    console.log(`  ✅ File size: ${(fileBuffer.length / 1024).toFixed(1)} KB`);

    // Step 2: Check if document already exists
    const existingDoc = await prisma.document.findFirst({
      where: {
        userId: USER_ID,
        filename: filename,
      }
    });

    let documentId: string;

    if (existingDoc) {
      console.log(`  ℹ️  Document exists, updating...`);
      documentId = existingDoc.id;

      // Delete existing chunks
      await prisma.documentChunk.deleteMany({
        where: { documentId }
      });
    } else {
      console.log('  ➕ Creating new document record...');
      const newDoc = await prisma.document.create({
        data: {
          userId: USER_ID,
          filename,
          displayTitle: filename,
          mimeType,
          fileSize: fileBuffer.length,
          status: 'processing',
          embeddingsGenerated: false,
          fileHash: 'local-upload',
        }
      });
      documentId = newDoc.id;
    }

    // Step 3: Extract text
    console.log('  📝 Extracting text...');
    const extractionResult = await extractText(fileBuffer, mimeType);
    const extractedText = extractionResult.text;
    if (!extractedText || extractedText.length < 10) {
      throw new Error(`Failed to extract text or text too short (got ${extractedText?.length || 0} chars)`);
    }
    console.log(`  ✅ Extracted ${extractedText.length} characters`);

    // Step 4: Chunk text
    console.log('  🔪 Chunking text...');
    const rawChunks = chunkingService.chunkTextWithOverlap(extractedText, {
      maxChunkSize: 1000,
      overlap: 200
    });
    console.log(`  📊 Raw chunks count: ${rawChunks.length}`);

    const chunks = rawChunks.map((chunk) => ({
      content: chunk.content,
      text: chunk.content, // Some services expect 'text' instead of 'content'
      metadata: {
        chunkIndex: chunk.chunkIndex,
        startChar: chunk.startChar,
        endChar: chunk.endChar,
        filename,
      }
    }));
    console.log(`  ✅ Created ${chunks.length} chunks`);

    // Step 5: Save chunks to database
    console.log('  💾 Saving chunks to database...');
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      await prisma.documentChunk.create({
        data: {
          documentId,
          text: chunk.content,
          chunkIndex: i,
          startChar: chunk.metadata.startChar,
          endChar: chunk.metadata.endChar,
        }
      });
    }

    // Step 6: Generate embeddings for each chunk
    console.log('  🧠 Generating embeddings...');
    const chunksWithEmbeddings = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const embeddingResult = await embeddingService.generateEmbedding(chunk.content);
        chunksWithEmbeddings.push({
          ...chunk,
          embedding: embeddingResult.embedding,
        });
        if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
          console.log(`    📊 Generated ${i + 1}/${chunks.length} embeddings`);
        }
      } catch (embError: any) {
        console.error(`    ⚠️ Failed to generate embedding for chunk ${i}: ${embError.message}`);
        // Skip this chunk but continue with others
      }
    }

    // Step 7: Store embeddings in Pinecone
    console.log('  💾 Storing embeddings in Pinecone...');
    await vectorEmbeddingService.storeDocumentEmbeddings(documentId, chunksWithEmbeddings);

    // Step 8: Update document status
    await prisma.document.update({
      where: { id: documentId },
      data: {
        embeddingsGenerated: true,
        chunksCount: chunks.length,
        status: 'completed',
      }
    });

    result.success = true;
    result.chunksCreated = chunks.length;
    console.log(`  ✅ Document processed successfully!`);

  } catch (error: any) {
    result.error = error.message;
    console.error(`  ❌ Error: ${error.message}`);
  }

  return result;
}

async function main() {
  console.log('🚀 Starting local file upload and embedding generation...\n');
  console.log(`📁 Source folder: ${LOCAL_FOLDER}\n`);

  // Get list of files
  const files = fs.readdirSync(LOCAL_FOLDER)
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      return SUPPORTED_EXTENSIONS.includes(ext) && !fs.statSync(path.join(LOCAL_FOLDER, f)).isDirectory();
    });

  console.log(`Found ${files.length} supported files\n`);

  const results: ProcessingResult[] = [];

  for (const file of files) {
    const filePath = path.join(LOCAL_FOLDER, file);
    const result = await processLocalFile(filePath);
    results.push(result);
  }

  // Summary
  console.log('\n\n========================================');
  console.log('📊 PROCESSING SUMMARY');
  console.log('========================================');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log('\nSuccessful uploads:');
    for (const s of successful) {
      console.log(`  ✅ ${s.filename} (${s.chunksCreated} chunks)`);
    }
  }

  if (failed.length > 0) {
    console.log('\nFailed documents:');
    for (const f of failed) {
      console.log(`  ❌ ${f.filename}: ${f.error}`);
    }
  }

  console.log('\n✨ Done!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
