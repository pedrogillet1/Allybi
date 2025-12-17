import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ConversionResult {
  success: boolean;
  pdfBuffer?: Buffer;
  pdfPath?: string;
  error?: string;
}

interface LibreOfficeInfo {
  available: boolean;
  path?: string;
  version?: string;
}

// Cache LibreOffice availability check
let libreOfficeCache: LibreOfficeInfo | null = null;

/**
 * LibreOffice Converter Service
 * Converts Office documents (DOCX, XLSX, PPTX) to PDF with excellent fidelity
 *
 * This provides pixel-perfect conversion that matches the original document exactly.
 */

/**
 * Check if LibreOffice is available on the system
 */
export async function checkLibreOfficeAvailable(): Promise<LibreOfficeInfo> {
  // Return cached result if available
  if (libreOfficeCache !== null) {
    return libreOfficeCache;
  }

  const possiblePaths = [
    // Windows
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    // Linux
    '/usr/bin/libreoffice',
    '/usr/bin/soffice',
    '/usr/local/bin/libreoffice',
    '/snap/bin/libreoffice',
    // macOS
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ];

  for (const soffice of possiblePaths) {
    if (fs.existsSync(soffice)) {
      libreOfficeCache = { available: true, path: soffice };
      console.log(`✅ [LibreOffice] Found at: ${soffice}`);
      return libreOfficeCache;
    }
  }

  // Try to find it in PATH
  try {
    const cmd = process.platform === 'win32' ? 'where soffice' : 'which soffice';
    const { stdout } = await execAsync(cmd);
    if (stdout.trim()) {
      const sofficePath = stdout.trim().split('\n')[0];
      libreOfficeCache = { available: true, path: sofficePath };
      console.log(`✅ [LibreOffice] Found in PATH: ${sofficePath}`);
      return libreOfficeCache;
    }
  } catch {
    // Not found in PATH
  }

  libreOfficeCache = { available: false };
  console.log('⚠️ [LibreOffice] Not found. Office document previews will have limited fidelity.');
  return libreOfficeCache;
}

/**
 * Convert an Office document (DOCX, XLSX, PPTX) to PDF using LibreOffice
 * Returns the PDF as a buffer for maximum flexibility
 */
export async function convertToPdf(
  inputBuffer: Buffer,
  filename: string,
  options: {
    timeout?: number;  // Timeout in ms (default: 120000 = 2 minutes)
  } = {}
): Promise<ConversionResult> {
  const { timeout = 120000 } = options;

  // Check LibreOffice availability
  const libreOffice = await checkLibreOfficeAvailable();
  if (!libreOffice.available || !libreOffice.path) {
    return {
      success: false,
      error: 'LibreOffice is not installed. Please install LibreOffice for excellent document preview fidelity.',
    };
  }

  // Create temp directory for this conversion
  const tempDir = path.join(os.tmpdir(), `libreoffice-convert-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const inputPath = path.join(tempDir, filename);

  try {
    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });

    // Write input file
    fs.writeFileSync(inputPath, inputBuffer);

    console.log(`📄 [LibreOffice] Converting ${filename} to PDF...`);

    // Build LibreOffice command
    // --headless: Run without GUI
    // --convert-to pdf: Convert to PDF format
    // --outdir: Output directory
    const soffice = libreOffice.path;
    const cmd = `"${soffice}" --headless --convert-to pdf --outdir "${tempDir}" "${inputPath}"`;

    console.log(`🔄 [LibreOffice] Running: ${cmd}`);

    // Execute conversion
    const { stdout, stderr } = await execAsync(cmd, {
      timeout,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large documents
      windowsHide: true,
    });

    if (stdout) {
      console.log(`[LibreOffice] stdout: ${stdout}`);
    }
    if (stderr && !stderr.toLowerCase().includes('warn')) {
      console.warn(`[LibreOffice] stderr: ${stderr}`);
    }

    // Find the output PDF
    const baseName = path.basename(filename, path.extname(filename));
    const pdfPath = path.join(tempDir, `${baseName}.pdf`);

    if (!fs.existsSync(pdfPath)) {
      // Try to find any PDF in the temp directory
      const files = fs.readdirSync(tempDir);
      const pdfFile = files.find(f => f.endsWith('.pdf'));
      if (pdfFile) {
        const actualPdfPath = path.join(tempDir, pdfFile);
        const pdfBuffer = fs.readFileSync(actualPdfPath);
        console.log(`✅ [LibreOffice] PDF created: ${pdfFile} (${pdfBuffer.length} bytes)`);
        return {
          success: true,
          pdfBuffer,
          pdfPath: actualPdfPath,
        };
      }
      throw new Error('PDF conversion failed - output file not found');
    }

    // Read PDF buffer
    const pdfBuffer = fs.readFileSync(pdfPath);
    console.log(`✅ [LibreOffice] PDF created: ${baseName}.pdf (${pdfBuffer.length} bytes)`);

    return {
      success: true,
      pdfBuffer,
      pdfPath,
    };

  } catch (error: any) {
    console.error('❌ [LibreOffice] Conversion error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Get supported MIME types for LibreOffice conversion
 */
export function getSupportedMimeTypes(): string[] {
  return [
    // Word documents
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    // Excel spreadsheets
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    // PowerPoint presentations
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/vnd.ms-powerpoint', // .ppt
    // OpenDocument formats
    'application/vnd.oasis.opendocument.text', // .odt
    'application/vnd.oasis.opendocument.spreadsheet', // .ods
    'application/vnd.oasis.opendocument.presentation', // .odp
    // Rich Text Format
    'application/rtf', // .rtf
  ];
}

/**
 * Check if a MIME type is supported for conversion
 */
export function isSupportedMimeType(mimeType: string): boolean {
  return getSupportedMimeTypes().includes(mimeType);
}

export default {
  checkLibreOfficeAvailable,
  convertToPdf,
  getSupportedMimeTypes,
  isSupportedMimeType,
};
