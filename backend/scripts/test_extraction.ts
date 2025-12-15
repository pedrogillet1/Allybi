/**
 * Text Extraction Test Script
 * Tests all format extractors to ensure they produce text > 0
 */

import {
  extractText,
  extractTextFromPDF,
  extractTextFromWord,
  extractTextFromExcel,
  extractTextFromPowerPoint,
  extractTextFromPlainText,
} from '../src/services/textExtraction.service';
import fs from 'fs';
import path from 'path';

interface TestResult {
  format: string;
  success: boolean;
  textLength: number;
  wordCount: number;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

// Test plain text extraction
async function testPlainText(): Promise<void> {
  console.log('\n📝 Testing TXT extraction...');
  const start = Date.now();

  try {
    const testText = 'This is a test document with some content.\nIt has multiple lines and words.';
    const buffer = Buffer.from(testText, 'utf-8');

    const result = await extractTextFromPlainText(buffer);

    results.push({
      format: 'TXT',
      success: result.text.length > 0 && (result.wordCount ?? 0) > 0,
      textLength: result.text.length,
      wordCount: result.wordCount ?? 0,
      duration: Date.now() - start,
    });

    console.log(`   ✅ TXT: ${result.text.length} chars, ${result.wordCount} words`);
  } catch (error: any) {
    results.push({
      format: 'TXT',
      success: false,
      textLength: 0,
      wordCount: 0,
      error: error.message,
      duration: Date.now() - start,
    });
    console.log(`   ❌ TXT: ${error.message}`);
  }
}

// Test CSV extraction
async function testCSV(): Promise<void> {
  console.log('\n📊 Testing CSV extraction...');
  const start = Date.now();

  try {
    const csvContent = `Name,Age,City
John Doe,30,New York
Jane Smith,25,Los Angeles
Bob Wilson,35,Chicago`;
    const buffer = Buffer.from(csvContent, 'utf-8');

    const result = await extractText(buffer, 'text/csv');

    results.push({
      format: 'CSV',
      success: result.text.length > 0 && (result.wordCount ?? 0) > 0,
      textLength: result.text.length,
      wordCount: result.wordCount ?? 0,
      duration: Date.now() - start,
    });

    console.log(`   ✅ CSV: ${result.text.length} chars, ${result.wordCount} words`);
  } catch (error: any) {
    results.push({
      format: 'CSV',
      success: false,
      textLength: 0,
      wordCount: 0,
      error: error.message,
      duration: Date.now() - start,
    });
    console.log(`   ❌ CSV: ${error.message}`);
  }
}

// Test HTML extraction
async function testHTML(): Promise<void> {
  console.log('\n🌐 Testing HTML extraction...');
  const start = Date.now();

  try {
    const htmlContent = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
<h1>Welcome to Test Page</h1>
<p>This is a paragraph with some text content.</p>
<ul>
  <li>First item</li>
  <li>Second item</li>
</ul>
</body>
</html>`;
    const buffer = Buffer.from(htmlContent, 'utf-8');

    const result = await extractText(buffer, 'text/html');

    results.push({
      format: 'HTML',
      success: result.text.length > 0 && (result.wordCount ?? 0) > 0,
      textLength: result.text.length,
      wordCount: result.wordCount ?? 0,
      duration: Date.now() - start,
    });

    console.log(`   ✅ HTML: ${result.text.length} chars, ${result.wordCount} words`);
  } catch (error: any) {
    results.push({
      format: 'HTML',
      success: false,
      textLength: 0,
      wordCount: 0,
      error: error.message,
      duration: Date.now() - start,
    });
    console.log(`   ❌ HTML: ${error.message}`);
  }
}

// Test with real files from test-files directory (if exists)
async function testRealFiles(): Promise<void> {
  const testFilesDir = path.join(__dirname, '../test-files');

  if (!fs.existsSync(testFilesDir)) {
    console.log('\n⚠️ No test-files directory found. Skipping real file tests.');
    console.log('   To test with real files, create a test-files directory with sample files.');
    return;
  }

  const testFiles = fs.readdirSync(testFilesDir);

  for (const filename of testFiles) {
    const filePath = path.join(testFilesDir, filename);
    const ext = path.extname(filename).toLowerCase();

    // Determine MIME type
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.csv': 'text/csv',
    };

    const mimeType = mimeTypes[ext];
    if (!mimeType) {
      console.log(`\n⏭️ Skipping ${filename} (unsupported format)`);
      continue;
    }

    console.log(`\n📁 Testing ${filename}...`);
    const start = Date.now();

    try {
      const buffer = fs.readFileSync(filePath);
      const result = await extractText(buffer, mimeType);

      results.push({
        format: `${ext.toUpperCase()} (${filename})`,
        success: result.text.length > 0 && (result.wordCount ?? 0) > 0,
        textLength: result.text.length,
        wordCount: result.wordCount ?? 0,
        duration: Date.now() - start,
      });

      console.log(`   ✅ ${filename}: ${result.text.length} chars, ${result.wordCount} words`);
    } catch (error: any) {
      results.push({
        format: `${ext.toUpperCase()} (${filename})`,
        success: false,
        textLength: 0,
        wordCount: 0,
        error: error.message,
        duration: Date.now() - start,
      });
      console.log(`   ❌ ${filename}: ${error.message}`);
    }
  }
}

// Print summary
function printSummary(): void {
  console.log('\n' + '='.repeat(80));
  console.log('📋 TEXT EXTRACTION TEST SUMMARY');
  console.log('='.repeat(80));

  console.log('\n| Format | Status | Text Length | Word Count | Duration |');
  console.log('|--------|--------|-------------|------------|----------|');

  for (const r of results) {
    const status = r.success ? '✅ PASS' : '❌ FAIL';
    console.log(`| ${r.format.padEnd(20)} | ${status} | ${r.textLength.toString().padStart(11)} | ${r.wordCount.toString().padStart(10)} | ${r.duration}ms |`);
  }

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('\n' + '-'.repeat(80));
  console.log(`Total: ${results.length} tests | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    for (const r of results.filter(r => !r.success)) {
      console.log(`   - ${r.format}: ${r.error}`);
    }
  }

  console.log('\n' + '='.repeat(80));
}

// Main
async function main(): Promise<void> {
  console.log('🧪 TEXT EXTRACTION FORMAT TESTS');
  console.log('=' .repeat(80));
  console.log('Testing that all supported formats extract text > 0\n');

  // Test in-memory formats
  await testPlainText();
  await testCSV();
  await testHTML();

  // Test real files if available
  await testRealFiles();

  // Print summary
  printSummary();

  // Exit with error code if any tests failed
  const failed = results.filter(r => !r.success).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
