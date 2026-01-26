import * as path from 'path';
import * as fs from 'fs';
import mammoth from 'mammoth';
import puppeteer from 'puppeteer';

interface ConversionResult {
  success: boolean;
  pdfPath?: string;
  error?: string;
}

/**
 * Convert DOCX file to PDF using Mammoth (DOCX → HTML) + Puppeteer (HTML → PDF)
 * This is a pure Node.js solution that doesn't require LibreOffice or X11
 */
export const convertDocxToPdf = async (
  docxPath: string,
  outputDir?: string
): Promise<ConversionResult> => {
  let browser;

  try {
    // Use same directory if not specified
    if (!outputDir) {
      outputDir = path.dirname(docxPath);
    }

    console.log(`📄 Converting ${path.basename(docxPath)} to PDF using Mammoth + Puppeteer...`);

    // Verify input file exists
    if (!fs.existsSync(docxPath)) {
      throw new Error(`Input file not found: ${docxPath}`);
    }

    // Step 1: Convert DOCX to HTML using Mammoth
    console.log('📝 Step 1: Converting DOCX to HTML with Mammoth...');
    const result = await mammoth.convertToHtml({ path: docxPath });
    const htmlContent = result.value;

    if (result.messages.length > 0) {
      console.log('ℹ️  Mammoth conversion messages:', result.messages);
    }

    // Wrap HTML in a full document with enhanced styling for better fidelity
    const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* Page setup */
    @page {
      size: A4;
      margin: 2.5cm 2cm 2.5cm 2cm;
    }

    /* Reset and base styles */
    * {
      box-sizing: border-box;
    }

    body {
      font-family: 'Calibri', 'Segoe UI', 'Arial', sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #000;
      max-width: 21cm;
      margin: 0 auto;
      padding: 1cm;
      background: white;
      -webkit-font-smoothing: antialiased;
    }

    /* Headings */
    h1 {
      font-size: 24pt;
      font-weight: bold;
      margin: 24pt 0 12pt 0;
      color: #1a1a1a;
      line-height: 1.3;
    }

    h2 {
      font-size: 18pt;
      font-weight: bold;
      margin: 20pt 0 10pt 0;
      color: #2a2a2a;
      line-height: 1.3;
    }

    h3 {
      font-size: 14pt;
      font-weight: bold;
      margin: 16pt 0 8pt 0;
      color: #3a3a3a;
      line-height: 1.3;
    }

    h4 {
      font-size: 12pt;
      font-weight: bold;
      margin: 14pt 0 6pt 0;
      color: #4a4a4a;
    }

    h5, h6 {
      font-size: 11pt;
      font-weight: bold;
      margin: 12pt 0 6pt 0;
      color: #5a5a5a;
    }

    /* Paragraphs */
    p {
      margin: 0 0 10pt 0;
      text-align: justify;
      hyphens: auto;
    }

    /* Tables - enhanced styling */
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 12pt 0 16pt 0;
      font-size: 10pt;
      page-break-inside: auto;
    }

    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }

    td, th {
      border: 1px solid #666;
      padding: 6pt 10pt;
      text-align: left;
      vertical-align: top;
    }

    th {
      background-color: #e8e8e8;
      font-weight: bold;
      color: #333;
    }

    tr:nth-child(even) td {
      background-color: #fafafa;
    }

    /* Images */
    img {
      max-width: 100%;
      height: auto;
      margin: 10pt 0;
      page-break-inside: avoid;
    }

    /* Lists */
    ul, ol {
      margin: 8pt 0 12pt 0;
      padding-left: 24pt;
    }

    li {
      margin: 4pt 0;
      line-height: 1.5;
    }

    li p {
      margin: 0;
    }

    /* Nested lists */
    ul ul, ol ol, ul ol, ol ul {
      margin: 4pt 0;
    }

    /* Links */
    a {
      color: #0066cc;
      text-decoration: underline;
    }

    /* Blockquotes */
    blockquote {
      margin: 12pt 0 12pt 20pt;
      padding-left: 12pt;
      border-left: 3pt solid #ccc;
      color: #555;
      font-style: italic;
    }

    /* Code blocks */
    pre, code {
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 10pt;
      background: #f5f5f5;
      padding: 2pt 4pt;
      border-radius: 2pt;
    }

    pre {
      padding: 10pt;
      margin: 10pt 0;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    /* Strong and emphasis */
    strong, b {
      font-weight: bold;
    }

    em, i {
      font-style: italic;
    }

    /* Underline */
    u {
      text-decoration: underline;
    }

    /* Horizontal rules */
    hr {
      border: none;
      border-top: 1pt solid #ccc;
      margin: 16pt 0;
    }

    /* Page breaks */
    .page-break {
      page-break-after: always;
    }

    /* Footnotes */
    sup {
      font-size: 0.7em;
      vertical-align: super;
    }

    sub {
      font-size: 0.7em;
      vertical-align: sub;
    }

    /* Table of contents styles */
    .toc {
      margin: 20pt 0;
    }

    .toc a {
      text-decoration: none;
      color: #333;
    }

    .toc a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;

    // Step 2: Convert HTML to PDF using Puppeteer
    console.log('🖨️  Step 2: Converting HTML to PDF with Puppeteer...');

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setContent(fullHtml, {
      waitUntil: 'networkidle0'
    });

    // Generate PDF path
    const fileName = path.basename(docxPath, path.extname(docxPath));
    const pdfPath = path.join(outputDir, `${fileName}.pdf`);

    // Generate PDF
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '2cm',
        right: '2cm',
        bottom: '2cm',
        left: '2cm'
      }
    });

    await browser.close();
    browser = undefined;

    // Verify PDF was created
    if (!fs.existsSync(pdfPath)) {
      throw new Error('PDF conversion failed - output file not found');
    }

    const stats = fs.statSync(pdfPath);
    console.log(`✅ PDF created: ${pdfPath} (${stats.size} bytes)`);

    return {
      success: true,
      pdfPath: pdfPath,
    };

  } catch (error: any) {
    console.error('❌ DOCX to PDF conversion error:', error.message);

    // Clean up browser if it's still running
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }

    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Check if the converter is available (always true for Node.js solution)
 */
export const checkLibreOfficeInstalled = async (): Promise<boolean> => {
  console.log('✅ Using Mammoth + Puppeteer converter (no external dependencies needed)');
  return true;
};
