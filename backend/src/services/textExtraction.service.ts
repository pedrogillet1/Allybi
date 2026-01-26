import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import sharp from 'sharp';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { extractPDFWithTables } from '../utils/pdfTableExtractor';
import googleVisionOCR from './google-vision-ocr.service';

export interface ExtractionResult {
  text: string;
  confidence?: number;
  pageCount?: number;
  wordCount?: number;
  language?: string;
}

/**
 * Preprocess image to improve OCR accuracy
 * Aggressive preprocessing for maximum text extraction accuracy
 */
const preprocessImage = async (inputBuffer: Buffer): Promise<Buffer> => {
  try {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    let pipeline = image;

    // Step 0: Auto-rotate based on EXIF (fixes orientation issues)
    pipeline = pipeline.rotate();

    // Step 1: Increase resolution for better OCR (2000px minimum)
    if (metadata.width && metadata.width < 2000) {
      const scale = 2000 / metadata.width;
      pipeline = pipeline.resize(
        Math.round(metadata.width * scale),
        metadata.height ? Math.round(metadata.height * scale) : undefined,
        { kernel: 'lanczos3' }
      );
    }

    // Step 2: Convert to grayscale
    pipeline = pipeline.grayscale();

    // Step 3: Enhance contrast aggressively
    pipeline = pipeline.normalize().linear(1.2, -(128 * 0.2));

    // Step 4: Sharpen text edges
    pipeline = pipeline.sharpen({
      sigma: 2.0,
      m1: 1.5,
      m2: 0.7
    });

    // Step 5: Remove noise
    pipeline = pipeline.median(3);

    const processedBuffer = await pipeline.toBuffer();
    return processedBuffer;
  } catch (error) {
    console.error('Image preprocessing error:', error);
    return inputBuffer; // Fallback to original
  }
};

/**
 * Post-process OCR text to fix common recognition errors
 */
const postProcessOCRText = (text: string): string => {
  if (!text || text.trim().length === 0) {
    return text;
  }

  let cleaned = text;

  // 1. Fix spacing issues
  cleaned = cleaned.replace(/\s+/g, ' '); // Multiple spaces to single
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines

  // 2. Fix punctuation spacing
  cleaned = cleaned.replace(/\s+([.,!?;:])/g, '$1'); // Remove space before punctuation
  cleaned = cleaned.replace(/([.,!?;:])(\S)/g, '$1 $2'); // Add space after punctuation if missing

  // 3. Fix common OCR character mistakes (only in word contexts)
  // These are applied carefully to avoid breaking intentional numbers/symbols
  const charCorrections: Array<{ pattern: RegExp; replacement: string }> = [
    // Fix "0" (zero) mistaken as "O" in words
    { pattern: /(?<=[a-zA-Z])0(?=[a-zA-Z])/g, replacement: 'O' },
    // Fix "1" (one) mistaken as "l" or "I" in words
    { pattern: /(?<=[a-z])1(?=[a-z])/g, replacement: 'l' },
    // Fix "|" (pipe) mistaken as "I"
    { pattern: /\|(?=[a-zA-Z])|(?<=[a-zA-Z])\|/g, replacement: 'I' },
  ];

  charCorrections.forEach(({ pattern, replacement }) => {
    cleaned = cleaned.replace(pattern, replacement);
  });

  // 4. Fix common word typos
  const wordCorrections: Record<string, string> = {
    'teh': 'the',
    'adn': 'and',
    'taht': 'that',
    'hte': 'the',
    'recieve': 'receive',
    'occured': 'occurred',
    'thier': 'their',
    'whcih': 'which'
  };

  Object.entries(wordCorrections).forEach(([wrong, right]) => {
    const pattern = new RegExp(`\\b${wrong}\\b`, 'gi');
    cleaned = cleaned.replace(pattern, right);
  });

  // 5. Final cleanup
  cleaned = cleaned.trim();

  return cleaned;
};

/**
 * Extract text from PDF document
 * @param buffer - PDF file buffer
 * @returns Extracted text and metadata
 */
export const extractTextFromPDF = async (buffer: Buffer): Promise<ExtractionResult> => {
  try {
    // Use require() for pdf-parse v2 (uses PDFParse class)
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();

    // ════════════════════════════════════════════════════════════════════════════════
    // FIX: UTF-8 ENCODING ISSUE (Pólya showing as PÃ³lya)
    // ════════════════════════════════════════════════════════════════════════════════
    // Some PDFs have incorrect encoding where accented characters are double-encoded
    // This fixes the common issue where UTF-8 is interpreted as Latin-1
    let extractedText = data.text || '';
    try {
      // Detect if text has encoding issues (e.g., "Ã³" instead of "ó")
      if (extractedText.includes('Ã') && /Ã[\x80-\xBF]/.test(extractedText)) {
        // Convert from incorrectly decoded Latin-1 to proper UTF-8
        const buffer = Buffer.from(extractedText, 'latin1');
        extractedText = buffer.toString('utf-8');
        console.log('🔧 [PDF] Fixed UTF-8 encoding issue in PDF text');
      }
    } catch (encodingError) {
      console.warn('⚠️ [PDF] Could not fix encoding, using original text:', encodingError);
    }
    data.text = extractedText;

    // ════════════════════════════════════════════════════════════════════════════════
    // IMPROVED SCANNED PDF DETECTION
    // ════════════════════════════════════════════════════════════════════════════════

    const hasText = extractedText && extractedText.trim().length > 0;
    const avgCharsPerPage = hasText ? extractedText.length / data.numpages : 0;

    // Consider PDF scanned if:
    // 1. No text at all, OR
    // 2. Less than 100 characters per page (likely just page numbers/headers)
    const isLikelyScanned = avgCharsPerPage < 100;

    // If PDF appears scanned (low text density), try OCR
    if (!hasText || isLikelyScanned) {
      const reason = !hasText
        ? 'no text found'
        : `low text density (${avgCharsPerPage.toFixed(0)} chars/page, threshold: 100)`;

      console.log(`📄 PDF appears to be scanned (${reason})`);
      console.log(`📊 PDF Analysis:`, {
        totalPages: data.numpages,
        totalChars: data.text?.length || 0,
        avgCharsPerPage: avgCharsPerPage.toFixed(2),
        isScanned: isLikelyScanned,
        reason: reason
      });

      // ════════════════════════════════════════════════════════════════════════════════
      // TRY GOOGLE VISION OCR FOR SCANNED PDFs (Fast batch processing)
      // ════════════════════════════════════════════════════════════════════════════════
      if (googleVisionOCR.isAvailable()) {
        try {
          console.log('🔍 [PDF] Using Google Vision OCR for scanned PDF...');
          const ocrResult = await googleVisionOCR.processScannedPDF(buffer);

          console.log(`✅ [PDF] OCR completed: ${ocrResult.text.length} chars, ${ocrResult.pageCount} pages, confidence: ${(ocrResult.confidence * 100).toFixed(0)}%`);

          return {
            text: ocrResult.text,
            confidence: ocrResult.confidence,
            pageCount: ocrResult.pageCount,
            wordCount: ocrResult.text.split(/\s+/).filter((w: string) => w.length > 0).length,
          };
        } catch (ocrError: any) {
          console.error('❌ [PDF] Google Vision OCR failed:', ocrError.message);
          console.warn('⚠️ [PDF] Falling back to native extraction');
        }
      } else {
        console.warn('⚠️ [PDF] Google Vision OCR not available:', googleVisionOCR.getInitializationError());
      }

      // Fallback: return whatever text we have from native extraction
      return {
        text: data.text || '',
        confidence: 0.3,
        pageCount: data.numpages,
        wordCount: data.text ? data.text.split(/\s+/).length : 0,
      };
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // NATIVE TEXT EXTRACTION (PDF has text layer)
    // ════════════════════════════════════════════════════════════════════════════════

    // Apply basic cleanup even for native text
    let cleanedText = postProcessOCRText(data.text);

    // ════════════════════════════════════════════════════════════════════════════════
    // ✅ FIX: Detect and preserve table structure
    // ════════════════════════════════════════════════════════════════════════════════
    try {
      cleanedText = extractPDFWithTables(cleanedText);
    } catch (tableError) {
      console.warn('⚠️ [PDF] Table extraction failed, using raw text:', tableError);
    }

    console.log(`✅ Native PDF text extraction: ${cleanedText.length} chars, ${cleanedText.split(/\s+/).length} words, ${avgCharsPerPage.toFixed(0)} chars/page`);

    return {
      text: cleanedText,
      pageCount: data.numpages,
      wordCount: cleanedText.split(/\s+/).filter((w: any) => w.length > 0).length,
      confidence: 1.0, // Native text extraction has 100% confidence
    };
  } catch (error: any) {
    console.error('❌ PDF text extraction failed:', error.message);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
};

/**
 * Extract text from Word document (.doc, .docx)
 * @param buffer - Word file buffer
 * @returns Extracted text and metadata
 */
export const extractTextFromWord = async (buffer: Buffer): Promise<ExtractionResult> => {
  try {
    console.log(`📝 Extracting text from Word document (buffer size: ${buffer.length} bytes)`);

    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    if (result.messages && result.messages.length > 0) {
      console.log('ℹ️ Mammoth extraction messages:', result.messages);
    }

    if (!text || text.trim().length === 0) {
      console.warn('⚠️ Word document appears to be empty or text could not be extracted');
      return {
        text: '',
        wordCount: 0,
        confidence: 0,
      };
    }

    console.log(`✅ Extracted ${text.length} characters from Word document`);

    // Post-process to clean up text
    const cleanedText = postProcessOCRText(text);

    return {
      text: cleanedText,
      wordCount: cleanedText.split(/\s+/).filter((w) => w.length > 0).length,
      confidence: 1.0,
    };
  } catch (error: any) {
    console.error('Error extracting text from Word document:', error);
    console.error('Error details:', error.message || error);

    // Provide user-friendly error messages
    if (error.message?.includes('zip file') || error.message?.includes('central directory')) {
      throw new Error(`Word document appears to be corrupted or incomplete (${buffer.length} bytes). Please try re-uploading the file.`);
    }

    throw new Error(`Failed to extract text from Word document: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Extract text from Excel spreadsheet (.xls, .xlsx) with proper structure preservation
 * @param buffer - Excel file buffer
 * @returns Extracted text and metadata with structured data
 */
export const extractTextFromExcel = async (buffer: Buffer): Promise<ExtractionResult> => {
  try {
    console.log('📊 Extracting structured data from Excel spreadsheet...');
    console.log(`   Buffer size: ${buffer.length} bytes`);

    // Validate buffer
    if (!buffer || buffer.length === 0) {
      throw new Error('Excel file buffer is empty');
    }

    // Check minimum file size (valid Excel files are at least ~1KB)
    if (buffer.length < 1024) {
      throw new Error(`Excel file appears to be too small (${buffer.length} bytes). Minimum expected: 1KB`);
    }

    // Try to read workbook with full cell information including formulas and types
    let workbook;
    try {
      workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellFormula: true,  // Preserve formulas
        cellStyles: true,   // Preserve styles
        cellDates: true,    // Parse dates properly
        cellNF: true        // Number formats
      });
    } catch (readError: any) {
      console.error('❌ Excel file reading failed:', readError.message);

      // Provide specific error messages based on common failures
      if (readError.message?.includes('Unsupported file') || readError.message?.includes('ZIP')) {
        throw new Error(`Excel file appears to be corrupted or in an unsupported format. Expected .xlsx or .xls file.`);
      }
      if (readError.message?.includes('encrypted') || readError.message?.includes('password')) {
        throw new Error(`Excel file is password-protected. Please remove the password and try again.`);
      }

      throw new Error(`Failed to read Excel file: ${readError.message}`);
    }

    // Validate workbook structure
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Excel file contains no sheets or is empty');
    }

    console.log(`   Found ${workbook.SheetNames.length} sheet(s): ${workbook.SheetNames.join(', ')}`);

    let allText = '';
    let totalCells = 0;
    let processedSheets = 0;
    let emptySheets = 0;

    // Extract structured text from all sheets
    workbook.SheetNames.forEach((sheetName, sheetIndex) => {
      try {
        const sheet = workbook.Sheets[sheetName];

        // Validate sheet exists
        if (!sheet) {
          console.warn(`⚠️ Sheet "${sheetName}" is null or undefined, skipping`);
          allText += `\n=== Sheet ${sheetIndex + 1}: ${sheetName} (Not Found) ===\n`;
          return;
        }

        // Convert sheet to JSON to preserve structure and data types
        let jsonData;
        try {
          jsonData = XLSX.utils.sheet_to_json(sheet, {
            header: 1,           // Use array of arrays format
            defval: '',          // Default value for empty cells
            blankrows: false,    // Skip blank rows
            raw: false           // Format values (dates, numbers, etc.)
          });
        } catch (sheetError: any) {
          console.error(`❌ Error processing sheet "${sheetName}":`, sheetError.message);
          allText += `\n=== Sheet ${sheetIndex + 1}: ${sheetName} (Error: ${sheetError.message}) ===\n`;
          return;
        }

        // Check if sheet is empty
        if (!jsonData || jsonData.length === 0) {
          console.log(`   📄 Sheet "${sheetName}" is empty`);
          emptySheets++;
          allText += `\n=== Sheet ${sheetIndex + 1}: ${sheetName} (Empty) ===\n`;
          return;
        }

        // Calculate actual column count
        const columnCount = Math.max(...jsonData.map((row: any) => Array.isArray(row) ? row.length : 0));

        allText += `\n=== Sheet ${sheetIndex + 1}: ${sheetName} ===\n`;
        allText += `Rows: ${jsonData.length}, Columns: ${columnCount}\n\n`;

        let sheetCellCount = 0;

        // Format as a readable table
        (jsonData as any[][]).forEach((row: any[], rowIndex: number) => {
          if (!row || row.length === 0) return;

          try {
            // Header row (first row) - mark it clearly
            if (rowIndex === 0) {
              const headers = row.map((cell: any) => {
                if (cell === null || cell === undefined) return '""';
                return `"${String(cell).substring(0, 100)}"`;
              }).join(' | ');
              allText += 'Headers: ' + headers + '\n';
              allText += '-'.repeat(80) + '\n';
            } else {
              // Data rows - preserve cell types and values
              const rowText = row.map((cell: any, colIndex: number) => {
                if (cell === null || cell === undefined || cell === '') return '';

                try {
                  // Try to preserve data types in text representation
                  if (typeof cell === 'number') {
                    // Handle special number cases
                    if (isNaN(cell)) return 'NaN';
                    if (!isFinite(cell)) return 'Infinity';
                    return cell.toString();
                  } else if (typeof cell === 'boolean') {
                    return cell ? 'TRUE' : 'FALSE';
                  } else if (cell instanceof Date) {
                    return cell.toISOString();
                  } else {
                    // String or other types - truncate very long values
                    const cellStr = String(cell).substring(0, 500);
                    return `"${cellStr}"`;
                  }
                } catch (cellError) {
                  console.warn(`⚠️ Error formatting cell [${rowIndex}, ${colIndex}]:`, cellError);
                  return '[Error]';
                }
              }).join(' | ');

              if (rowText.trim()) {
                allText += `Row ${rowIndex}: ${rowText}\n`;
                sheetCellCount += row.filter((c: any) => c !== null && c !== undefined && c !== '').length;
              }
            }
          } catch (rowError) {
            console.warn(`⚠️ Error processing row ${rowIndex} in sheet "${sheetName}":`, rowError);
            allText += `Row ${rowIndex}: [Error processing row]\n`;
          }
        });

        allText += '\n';
        totalCells += sheetCellCount;
        processedSheets++;
        console.log(`   ✅ Sheet "${sheetName}": ${jsonData.length} rows, ${sheetCellCount} data cells`);

      } catch (sheetError: any) {
        console.error(`❌ Unexpected error processing sheet "${sheetName}":`, sheetError);
        allText += `\n=== Sheet: ${sheetName} (Critical Error) ===\n`;
        allText += `Error: ${sheetError.message}\n\n`;
      }
    });

    // Validate that we extracted meaningful data
    if (processedSheets === 0) {
      throw new Error(`Failed to process any sheets. All ${workbook.SheetNames.length} sheet(s) were empty or had errors.`);
    }

    if (totalCells === 0) {
      console.warn('⚠️ No data cells found in Excel file');
      return {
        text: `Excel file has ${workbook.SheetNames.length} sheet(s) but contains no data cells.`,
        wordCount: 0,
        confidence: 0.5,
      };
    }

    // Add comprehensive summary
    const summary = `Excel Spreadsheet Analysis
Total Sheets: ${workbook.SheetNames.length}
Processed Sheets: ${processedSheets}
Empty Sheets: ${emptySheets}
Total Data Cells: ${totalCells}
Average Cells per Sheet: ${Math.round(totalCells / processedSheets)}
`;

    allText = summary + allText;

    console.log(`✅ Successfully extracted structured data from ${processedSheets}/${workbook.SheetNames.length} sheet(s), ${totalCells} total cells`);

    return {
      text: allText.trim(),
      wordCount: allText.split(/\s+/).filter((w) => w.length > 0).length,
      confidence: processedSheets === workbook.SheetNames.length ? 1.0 : 0.8,
    };

  } catch (error: any) {
    console.error('❌ Error extracting text from Excel:', error);
    console.error('Error stack:', error.stack);

    // Provide user-friendly error messages
    const errorMessage = error.message || 'Unknown error';

    // Check for common error patterns
    if (errorMessage.includes('corrupted') || errorMessage.includes('ZIP') || errorMessage.includes('Unsupported')) {
      throw new Error(`Excel file is corrupted or in an unsupported format. Please verify the file is a valid .xlsx or .xls file and try again.`);
    }

    if (errorMessage.includes('encrypted') || errorMessage.includes('password')) {
      throw new Error(`Excel file is password-protected. Please remove the password protection and upload again.`);
    }

    if (errorMessage.includes('empty') || errorMessage.includes('no sheets')) {
      throw new Error(errorMessage);
    }

    // Generic fallback
    throw new Error(`Failed to extract text from Excel spreadsheet: ${errorMessage}`);
  }
};

/**
 * Extract text from PowerPoint presentation (.pptx)
 * @param buffer - PowerPoint file buffer
 * @returns Extracted text and metadata
 */
export const extractTextFromPowerPoint = async (buffer: Buffer): Promise<ExtractionResult> => {
  try {
    console.log('📊 Extracting text from PowerPoint presentation...');

    const AdmZip = require('adm-zip');
    const xml2js = require('xml2js');

    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    let allText = '';
    let slideCount = 0;

    // Extract text from each slide
    for (const entry of zipEntries) {
      // Look for slide XML files (ppt/slides/slide1.xml, slide2.xml, etc.)
      if (entry.entryName.match(/ppt\/slides\/slide\d+\.xml$/)) {
        slideCount++;
        const slideXml = entry.getData().toString('utf8');

        try {
          const parser = new xml2js.Parser();
          const result = await parser.parseStringPromise(slideXml);

          // Extract text from the slide
          const slideText = extractTextFromSlideXml(result, slideCount);
          if (slideText.trim()) {
            allText += `\n\n=== Slide ${slideCount} ===\n${slideText}`;
          }
        } catch (xmlError) {
          console.warn(`⚠️ Failed to parse slide ${slideCount}:`, xmlError);
          allText += `\n\n=== Slide ${slideCount} ===\n[Failed to parse slide content]`;
        }
      }
    }

    if (slideCount === 0) {
      throw new Error('No slides found in PowerPoint file');
    }

    // Clean up the text
    const cleanedText = postProcessOCRText(allText);

    console.log(`✅ Extracted text from ${slideCount} slides (${cleanedText.length} characters)`);

    return {
      text: cleanedText,
      pageCount: slideCount,
      wordCount: cleanedText.split(/\s+/).filter((w) => w.length > 0).length,
      confidence: 1.0,
    };
  } catch (error: any) {
    console.error('❌ Error extracting text from PowerPoint:', error);

    // Check if it's a corrupted file
    if (error.message?.includes('invalid zip') || error.message?.includes('corrupted')) {
      throw new Error('PowerPoint file appears to be corrupted. Please verify the file integrity.');
    }

    // Check if adm-zip is missing
    if (error.code === 'MODULE_NOT_FOUND' && error.message?.includes('adm-zip')) {
      throw new Error('PowerPoint extraction module not installed. Please run: npm install adm-zip xml2js');
    }

    throw new Error(`Failed to extract text from PowerPoint: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Extract text from parsed slide XML object
 * Only extracts actual text content from a:t tags within text body containers
 * FIX: Previous version extracted ALL XML properties including coordinates/styling
 */
function extractTextFromSlideXml(slideXml: any, slideNumber: number): string {
  const textParts: string[] = [];

  /**
   * Recursively find text body containers (p:txBody) and extract a:t text only
   * This avoids extracting numeric coordinates, font names, and other XML attributes
   */
  function findTextBodies(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (const item of node) {
        findTextBodies(item);
      }
      return;
    }

    // Found a text body container - extract text from it
    if (node['p:txBody']) {
      const bodyText = extractTextFromBody(node['p:txBody']);
      if (bodyText.trim()) {
        textParts.push(bodyText.trim());
      }
    }

    // Also check for standalone paragraphs at shape level
    if (node['a:p'] && !node['p:txBody']) {
      const paragraphText = extractTextFromParagraphs(node['a:p']);
      if (paragraphText.trim()) {
        textParts.push(paragraphText.trim());
      }
    }

    // Recurse into known container elements only (not all properties)
    // NOTE: p:sld is the root element and MUST be included
    const containerKeys = [
      'p:sld', 'p:cSld', 'p:spTree', 'p:sp', 'p:grpSp', 'p:graphicFrame',
      'a:graphic', 'a:graphicData', 'a:tbl', 'a:tr', 'a:tc'
    ];
    for (const key of containerKeys) {
      if (node[key]) {
        findTextBodies(node[key]);
      }
    }
  }

  /**
   * Extract text from a text body (p:txBody)
   */
  function extractTextFromBody(txBody: any): string {
    if (!txBody) return '';
    // xml2js wraps elements in arrays, so unwrap if needed
    const body = Array.isArray(txBody) ? txBody[0] : txBody;
    if (!body) return '';
    const paragraphs = body['a:p'];
    return extractTextFromParagraphs(paragraphs);
  }

  /**
   * Extract text from paragraph array (a:p)
   */
  function extractTextFromParagraphs(paragraphs: any): string {
    if (!paragraphs) return '';

    const paragraphArray = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
    const lines: string[] = [];

    for (const p of paragraphArray) {
      const lineText = extractTextFromRuns(p['a:r']);
      if (lineText.trim()) {
        lines.push(lineText.trim());
      }
    }

    return lines.join('\n');
  }

  /**
   * Extract text from text runs (a:r) - these contain the actual a:t text
   */
  function extractTextFromRuns(runs: any): string {
    if (!runs) return '';

    const runArray = Array.isArray(runs) ? runs : [runs];
    const textFragments: string[] = [];

    for (const run of runArray) {
      if (run && run['a:t']) {
        // a:t can be a string or array of strings
        const textContent = run['a:t'];
        if (Array.isArray(textContent)) {
          for (const t of textContent) {
            if (typeof t === 'string') {
              textFragments.push(t);
            } else if (t && typeof t === 'object' && t['_']) {
              textFragments.push(t['_']);
            }
          }
        } else if (typeof textContent === 'string') {
          textFragments.push(textContent);
        } else if (textContent && typeof textContent === 'object' && textContent['_']) {
          textFragments.push(textContent['_']);
        }
      }
    }

    return textFragments.join('');
  }

  // Start extraction from root
  findTextBodies(slideXml);

  // Join all text parts with line breaks
  const text = textParts.join('\n\n');

  // Clean up whitespace
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract text from plain text file
 * @param buffer - Text file buffer
 * @returns Extracted text and metadata
 */
export const extractTextFromPlainText = async (buffer: Buffer): Promise<ExtractionResult> => {
  try {
    const text = buffer.toString('utf-8');

    // Post-process to clean up text
    const cleanedText = postProcessOCRText(text);

    return {
      text: cleanedText,
      wordCount: cleanedText.split(/\s+/).filter((w) => w.length > 0).length,
      confidence: 1.0,
    };
  } catch (error) {
    console.error('Error extracting text from plain text file:', error);
    throw new Error('Failed to extract text from plain text file');
  }
};

/**
 * Extract text from image file (JPEG, PNG, etc.)
 * @param buffer - Image file buffer
 * @returns Extracted text and metadata using OCR
 */
export const extractTextFromImage = async (buffer: Buffer): Promise<ExtractionResult> => {
  // Try Google Vision OCR for images (fast)
  if (googleVisionOCR.isAvailable()) {
    try {
      console.log('🔍 [Image] Using Google Vision OCR for image...');
      const ocrResult = await googleVisionOCR.processImage(buffer);

      console.log(`✅ [Image] OCR completed: ${ocrResult.text.length} chars, confidence: ${(ocrResult.confidence * 100).toFixed(0)}%`);

      return {
        text: ocrResult.text,
        confidence: ocrResult.confidence,
        pageCount: 1,
        wordCount: ocrResult.text.split(/\s+/).filter((w: string) => w.length > 0).length,
      };
    } catch (ocrError: any) {
      console.error('❌ [Image] Google Vision OCR failed:', ocrError.message);
      throw new Error(`Image OCR failed: ${ocrError.message}`);
    }
  }

  // OCR not available
  console.warn('⚠️ [Image] Google Vision OCR not available:', googleVisionOCR.getInitializationError());
  throw new Error('Image text extraction (OCR) is not currently available. Please enable ENABLE_GOOGLE_CLOUD_VISION.');
};

/**
 * Enhanced text extraction with advanced features
 * Includes: table extraction, layout analysis, and structure-aware chunking
 * @param buffer - File buffer
 * @param mimeType - MIME type of the document
 * @param options - Advanced extraction options
 * @returns Enhanced extraction result with structure and chunks
 */
export const extractTextAdvanced = async (
  buffer: Buffer,
  mimeType: string,
  options: {
    extractTables?: boolean;
    analyzeLayout?: boolean;
    structuredChunking?: boolean;
    maxChunkSize?: number;
  } = {}
): Promise<ExtractionResult & {
  tables?: any[];
  layout?: any;
  chunks?: any[];
  structure?: any;
}> => {
  try {
    console.log('🚀 [Advanced Extraction] Starting enhanced extraction...');

    // Step 1: Basic text extraction
    const basicResult = await extractText(buffer, mimeType);
    console.log(`   ✅ Basic extraction: ${basicResult.wordCount} words`);

    const result: any = { ...basicResult };

    // Step 2: Extract tables (for PDFs and images)
    if (options.extractTables !== false && (mimeType === 'application/pdf' || mimeType.startsWith('image/'))) {
      try {
        const tableExtractor = require('./tableExtractor.service').default;
        const tableResult = mimeType === 'application/pdf'
          ? await tableExtractor.extractTablesFromPDF(buffer)
          : await tableExtractor.extractTablesFromImage(buffer);

        if (tableResult.tables.length > 0) {
          result.tables = tableResult.tables;
          result.text = tableExtractor.insertTablesIntoMarkdown(result.text, tableResult.tables);
          console.log(`   📊 Extracted ${tableResult.tables.length} tables`);
        }
      } catch (error) {
        console.warn('   ⚠️ Table extraction failed:', error);
      }
    }

    // Step 3: Analyze layout (for PDFs and images)
    if (options.analyzeLayout && (mimeType === 'application/pdf' || mimeType.startsWith('image/'))) {
      try {
        const layoutAnalyzer = require('./layoutAnalyzer.service').default;
        const layoutResult = mimeType === 'application/pdf'
          ? await layoutAnalyzer.analyzePDFLayout(buffer)
          : await layoutAnalyzer.analyzeImageLayout(buffer);

        if (layoutResult.hasMultiColumn) {
          result.layout = layoutResult;
          result.text = layoutResult.combinedText; // Use layout-aware text
          console.log(`   📐 Multi-column layout detected (${layoutResult.averageColumns.toFixed(1)} avg columns)`);
        }
      } catch (error) {
        console.warn('   ⚠️ Layout analysis failed:', error);
      }
    }

    // Step 4: Structure-aware chunking
    if (options.structuredChunking !== false) {
      try {
        const documentStructure = require('./documentStructure.service').default;
        const structure = documentStructure.parseStructure(result.text, 'markdown');
        const chunks = documentStructure.createStructureAwareChunks(
          structure,
          options.maxChunkSize || 1000
        );

        result.structure = structure;
        result.chunks = chunks;
        console.log(`   ✂️ Created ${chunks.length} structure-aware chunks`);
      } catch (error) {
        console.warn('   ⚠️ Structure-aware chunking failed:', error);
      }
    }

    console.log('✅ [Advanced Extraction] Complete!');
    return result;
  } catch (error) {
    console.error('❌ [Advanced Extraction] Error:', error);
    throw error;
  }
};

/**
 * Main text extraction function - automatically detects document type
 * @param buffer - File buffer
 * @param mimeType - MIME type of the document
 * @returns Extracted text and metadata
 */
export const extractText = async (
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> => {
  // Check for explicitly unsupported types first with clear error messages
  const UNSUPPORTED_TYPES: Record<string, string> = {
    'video/quicktime': 'Video files (.mov) are not supported for text extraction',
    'video/mp4': 'Video files (.mp4) are not supported for text extraction',
    'video/x-msvideo': 'Video files (.avi) are not supported for text extraction',
    'video/x-matroska': 'Video files (.mkv) are not supported for text extraction',
    'video/webm': 'Video files (.webm) are not supported for text extraction',
    'audio/mpeg': 'Audio files (.mp3) are not supported for text extraction',
    'audio/wav': 'Audio files (.wav) are not supported for text extraction',
    'audio/ogg': 'Audio files (.ogg) are not supported for text extraction',
    'audio/aac': 'Audio files (.aac) are not supported for text extraction',
  };

  // Check explicit unsupported types
  if (UNSUPPORTED_TYPES[mimeType]) {
    throw new Error(UNSUPPORTED_TYPES[mimeType]);
  }

  // Check wildcard patterns for video/audio
  if (mimeType.startsWith('video/')) {
    throw new Error(`Video files (${mimeType}) are not supported for text extraction`);
  }

  if (mimeType.startsWith('audio/')) {
    throw new Error(`Audio files (${mimeType}) are not supported for text extraction`);
  }

  try {
    switch (mimeType) {
      case 'application/pdf':
        return await extractTextFromPDF(buffer);

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        return await extractTextFromWord(buffer);

      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.ms-excel':
        return await extractTextFromExcel(buffer);

      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      case 'application/vnd.ms-powerpoint':
        return await extractTextFromPowerPoint(buffer);

      case 'text/plain':
        return await extractTextFromPlainText(buffer);

      case 'text/html':
        // Simple HTML to text conversion (strip HTML tags)
        try {
          const htmlText = buffer.toString('utf-8');
          // Strip HTML tags for basic text extraction
          const text = htmlText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

          console.log(`[HTML] Extracted ${wordCount} words from HTML`);

          return {
            text,
            wordCount,
            confidence: 0.9, // Lower confidence for simple HTML stripping
          };
        } catch (error: any) {
          throw new Error(`Failed to process HTML: ${error.message}`);
        }

      case 'text/csv':
      case 'application/csv':
        // Use CSV processor for structured table output
        const csvProcessor = require('./csvProcessor.service').default;
        return await csvProcessor.processCSV(buffer);

      case 'application/zip':
      case 'application/x-zip-compressed':
        // ZIP files are not supported for direct text extraction
        throw new Error('ZIP archive files are not supported for text extraction. Please extract and upload individual files.');

      case 'image/jpeg':
      case 'image/jpg':
      case 'image/png':
      case 'image/gif':
      case 'image/webp':
      case 'image/tiff':
      case 'image/bmp':
        return await extractTextFromImage(buffer);

      default:
        throw new Error(`Unsupported document type: ${mimeType}`);
    }
  } catch (error) {
    console.error('Error in text extraction:', error);
    throw error;
  }
};

// Default export for convenience
export default {
  extractText,
  extractTextAdvanced,
  extractTextFromPDF,
  extractTextFromWord,
  extractTextFromExcel,
  extractTextFromPowerPoint,
  extractTextFromPlainText,
  extractTextFromImage,
};
