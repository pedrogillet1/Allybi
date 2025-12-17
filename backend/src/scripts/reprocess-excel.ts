import prisma from '../config/database';
import { downloadFile } from '../config/storage';
import excelProcessor from '../services/excelProcessor.service';
import vectorEmbeddingService from '../services/vectorEmbedding.service';
import encryptionService from '../services/encryption.service';

/**
 * Reprocess Excel files to extract ALL sheets with new processor
 * Usage: npx ts-node src/scripts/reprocess-excel.ts [documentId|filename_pattern]
 * Examples:
 *   npx ts-node src/scripts/reprocess-excel.ts                    # All Excel files
 *   npx ts-node src/scripts/reprocess-excel.ts Rosewood           # Files containing "Rosewood"
 *   npx ts-node src/scripts/reprocess-excel.ts "Lone Mountain"    # Files containing "Lone Mountain"
 */
async function reprocessExcelFile(filter?: string) {
  try {
    console.log('🔄 Starting Excel reprocessing...\n');

    // Find Excel documents to reprocess
    const where: any = {
      mimeType: {
        in: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel'
        ]
      }
    };

    // Check if filter is a UUID (document ID) or filename pattern
    if (filter) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filter);
      if (isUUID) {
        where.id = filter;
      } else {
        where.filename = { contains: filter, mode: 'insensitive' };
      }
    }

    const documents = await prisma.document.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (documents.length === 0) {
      console.log('❌ No Excel documents found');
      return;
    }

    console.log(`Found ${documents.length} Excel document(s) to reprocess:\n`);
    documents.forEach((doc, idx) => {
      console.log(`${idx + 1}. ${doc.filename} (ID: ${doc.id})`);
    });
    console.log('');

    // Process each document
    for (const document of documents) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Processing: ${document.filename}`);
      console.log(`${'='.repeat(80)}\n`);

      try {
        // 1. Download file from storage
        console.log('📥 Downloading file from storage...');
        let fileBuffer = await downloadFile(document.encryptedFilename);
        console.log(`✅ Downloaded ${fileBuffer.length} bytes`);

        // 2. Decrypt if encrypted
        if (document.isEncrypted) {
          console.log('🔐 Decrypting file...');
          fileBuffer = encryptionService.decryptFile(fileBuffer, 'excel-reprocess');
          console.log(`✅ Decrypted to ${fileBuffer.length} bytes\n`);
        } else {
          console.log('📄 File is not encrypted\n');
        }

        // 3. Process with enhanced Excel processor
        console.log('📊 Processing Excel file with enhanced processor...');
        const excelChunks = await excelProcessor.processExcel(fileBuffer);
        console.log(`✅ Created ${excelChunks.length} chunks\n`);

        // 3. Show sample of extracted data
        console.log('📋 Sample of extracted data:');
        excelChunks.slice(0, 5).forEach((chunk, idx) => {
          console.log(`\n  Chunk ${idx + 1}:`);
          console.log(`    Sheet: ${chunk.metadata.sheetName}`);
          console.log(`    Row: ${chunk.metadata.rowNumber}`);
          console.log(`    Cells: ${chunk.metadata.cells.join(', ')}`);
          console.log(`    Content: ${chunk.content.substring(0, 100)}...`);
          if (chunk.metadata.hasFormula) {
            console.log(`    Formulas: ${chunk.metadata.formulas?.join(', ')}`);
          }
          if (chunk.metadata.entities?.length) {
            console.log(`    Entities: ${chunk.metadata.entities.join(', ')}`);
          }
        });
        console.log('');

        // 4. Delete old embeddings
        console.log('🗑️  Deleting old embeddings...');
        await vectorEmbeddingService.deleteDocumentEmbeddings(document.id);
        console.log('✅ Old embeddings deleted\n');

        // 5. Convert Excel chunks to embedding format
        const chunks = excelChunks.map(chunk => ({
          content: chunk.content,
          metadata: {
            sheet: chunk.metadata.sheetName,
            row: chunk.metadata.rowNumber,
            cells: chunk.metadata.cells,
            chunkIndex: chunk.metadata.chunkIndex,
            sourceType: chunk.metadata.sourceType,
            tableHeaders: chunk.metadata.tableHeaders,
            // ✅ Include formula and entity metadata
            hasFormula: chunk.metadata.hasFormula,
            formulas: chunk.metadata.formulas,
            entities: chunk.metadata.entities
          }
        }));

        // 6. Store new embeddings
        console.log('💾 Storing new embeddings...');
        await vectorEmbeddingService.storeDocumentEmbeddings(document.id, chunks);
        console.log(`✅ Stored ${chunks.length} embeddings\n`);

        // 7. Show statistics
        const sheets = [...new Set(excelChunks.map(c => c.metadata.sheetName))];
        const formulaChunks = excelChunks.filter(c => c.metadata.hasFormula);
        const entityChunks = excelChunks.filter(c => c.metadata.entities?.length);

        console.log('📊 Statistics:');
        console.log(`   Total chunks: ${excelChunks.length}`);
        console.log(`   Sheets found: ${sheets.length}`);
        console.log(`   Sheet names: ${sheets.join(', ')}`);
        console.log(`   Chunks with formulas: ${formulaChunks.length}`);
        console.log(`   Chunks with entities: ${entityChunks.length}`);

        sheets.forEach(sheetName => {
          const sheetChunks = excelChunks.filter(c => c.metadata.sheetName === sheetName);
          const maxRow = Math.max(...sheetChunks.map(c => c.metadata.rowNumber));
          console.log(`     - "${sheetName}": ${sheetChunks.length} chunks, ${maxRow} rows`);
        });

        console.log(`\n✅ Successfully reprocessed: ${document.filename}`);

      } catch (error: any) {
        console.error(`\n❌ Error processing ${document.filename}:`, error.message);
        console.error('Stack:', error.stack);
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('✅ Reprocessing complete!');
    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
const filter = process.argv[2]; // Optional: document ID or filename pattern
reprocessExcelFile(filter).catch(console.error);
