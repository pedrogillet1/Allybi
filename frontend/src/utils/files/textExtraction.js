import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Extract text from any file type
 * @param {File} file - The file to extract text from
 * @returns {Promise<string>} - Extracted text content
 */
export const extractText = async (file) => {
  const mimeType = file.type;
  const fileName = file.name.toLowerCase();

  try {
    // PDF files
    if (mimeType === 'application/pdf') {
      return await extractTextFromPDF(file);
    }

    // Word documents
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileName.endsWith('.docx')) {
      return await extractTextFromDOCX(file);
    }

    // Excel files
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        fileName.endsWith('.xlsx')) {
      return await extractTextFromXLSX(file);
    }

    // PowerPoint files
    if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        fileName.endsWith('.pptx')) {
      return await extractTextFromPPTX(file);
    }

    // Text files
    if (mimeType.startsWith('text/') ||
        fileName.endsWith('.txt') ||
        fileName.endsWith('.csv') ||
        fileName.endsWith('.json') ||
        fileName.endsWith('.xml') ||
        fileName.endsWith('.md')) {
      return await extractTextFromTextFile(file);
    }

    // Images (skip OCR for now - too expensive)
    if (mimeType.startsWith('image/')) {
      return '';
    }

    // Unsupported file type
    console.log(`⚠️ Text extraction not supported for ${mimeType}`);
    return '';
  } catch (error) {
    console.error('❌ Text extraction error:', error);
    return '';
  }
};

/**
 * Extract text from PDF using PDF.js
 * @param {File} file - PDF file
 * @returns {Promise<string>} - Extracted text
 */
const extractTextFromPDF = async (file) => {
  console.log('📄 Extracting text from PDF...');
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';

  // Extract text from each page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n\n';
  }

  console.log(`✅ Extracted ${fullText.length} characters from ${pdf.numPages} pages`);
  return fullText.trim();
};

/**
 * Extract text from DOCX using Mammoth.js
 * @param {File} file - DOCX file
 * @returns {Promise<string>} - Extracted text
 */
const extractTextFromDOCX = async (file) => {
  console.log('📄 Extracting text from DOCX...');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  console.log(`✅ Extracted ${result.value.length} characters from DOCX`);
  return result.value;
};

/**
 * Extract text from XLSX using SheetJS
 * @param {File} file - XLSX file
 * @returns {Promise<string>} - Extracted text
 */
const extractTextFromXLSX = async (file) => {
  console.log('📄 Extracting text from XLSX...');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  let fullText = '';

  // Extract text from each sheet
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const sheetText = XLSX.utils.sheet_to_txt(sheet);
    fullText += `Sheet: ${sheetName}\n${sheetText}\n\n`;
  });

  console.log(`✅ Extracted ${fullText.length} characters from ${workbook.SheetNames.length} sheets`);
  return fullText.trim();
};

/**
 * Extract text from PPTX using JSZip
 * @param {File} file - PPTX file
 * @returns {Promise<string>} - Extracted text
 */
const extractTextFromPPTX = async (file) => {
  console.log('📄 Extracting text from PPTX...');
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  let fullText = '';

  // Extract text from slide XML files
  const slideFiles = Object.keys(zip.files)
    .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
    .sort(); // Sort to maintain slide order

  for (const slideFile of slideFiles) {
    const content = await zip.files[slideFile].async('string');

    // Extract text from XML (simple regex approach)
    const textMatches = content.match(/<a:t>(.*?)<\/a:t>/g);
    if (textMatches) {
      const slideText = textMatches
        .map(match => match.replace(/<\/?a:t>/g, ''))
        .join(' ');
      fullText += slideText + '\n\n';
    }
  }

  console.log(`✅ Extracted ${fullText.length} characters from ${slideFiles.length} slides`);
  return fullText.trim();
};

/**
 * Extract text from plain text files
 * @param {File} file - Text file
 * @returns {Promise<string>} - File content
 */
const extractTextFromTextFile = async (file) => {
  console.log('📄 Reading text file...');
  const text = await file.text();
  console.log(`✅ Read ${text.length} characters`);
  return text;
};
