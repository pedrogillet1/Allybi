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
  reason?: string; // Why it was found or not found
  searchedPaths?: string[]; // Paths that were searched
}

// Cache LibreOffice availability check
let libreOfficeCache: LibreOfficeInfo | null = null;

/**
 * LibreOffice Converter Service
 * Converts Office documents (DOCX, XLSX, PPTX) to PDF with excellent fidelity
 *
 * This provides pixel-perfect conversion that matches the original document exactly.
 *
 * Configuration:
 * - LIBREOFFICE_PATH: Override the auto-detected path to LibreOffice/soffice
 */

/**
 * Clear the LibreOffice cache (useful for testing or after installation)
 */
export function clearLibreOfficeCache(): void {
  libreOfficeCache = null;
  console.log('🔄 [LibreOffice] Cache cleared');
}

/**
 * Check if LibreOffice is available on the system
 * Returns detailed info including reason and searched paths for debugging
 */
export async function checkLibreOfficeAvailable(): Promise<LibreOfficeInfo> {
  // Return cached result if available
  if (libreOfficeCache !== null) {
    return libreOfficeCache;
  }

  const searchedPaths: string[] = [];

  // 1. First check for env override
  const envPath = process.env.LIBREOFFICE_PATH;
  if (envPath) {
    searchedPaths.push(`ENV:${envPath}`);
    if (fs.existsSync(envPath)) {
      libreOfficeCache = {
        available: true,
        path: envPath,
        reason: `Found via LIBREOFFICE_PATH env variable`,
        searchedPaths
      };
      console.log(`✅ [LibreOffice] Found via env LIBREOFFICE_PATH: ${envPath}`);
      return libreOfficeCache;
    } else {
      console.warn(`⚠️ [LibreOffice] LIBREOFFICE_PATH set to ${envPath} but file does not exist`);
    }
  }

  // 2. Check known installation paths
  const possiblePaths = [
    // Windows
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    // Linux
    '/usr/bin/libreoffice',
    '/usr/bin/soffice',
    '/usr/local/bin/libreoffice',
    '/usr/local/bin/soffice',
    '/snap/bin/libreoffice',
    // macOS
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    // Docker/container common paths
    '/opt/libreoffice/program/soffice',
    '/opt/libreoffice7.6/program/soffice',
  ];

  for (const soffice of possiblePaths) {
    searchedPaths.push(soffice);
    if (fs.existsSync(soffice)) {
      libreOfficeCache = {
        available: true,
        path: soffice,
        reason: `Found at known path`,
        searchedPaths
      };
      console.log(`✅ [LibreOffice] Found at: ${soffice}`);
      return libreOfficeCache;
    }
  }

  // 3. Try to find it in PATH
  try {
    const cmd = process.platform === 'win32' ? 'where soffice' : 'which libreoffice || which soffice';
    searchedPaths.push('PATH lookup');
    const { stdout } = await execAsync(cmd);
    if (stdout.trim()) {
      const sofficePath = stdout.trim().split('\n')[0];
      libreOfficeCache = {
        available: true,
        path: sofficePath,
        reason: `Found in system PATH`,
        searchedPaths
      };
      console.log(`✅ [LibreOffice] Found in PATH: ${sofficePath}`);
      return libreOfficeCache;
    }
  } catch {
    // Not found in PATH - this is expected if not installed
  }

  // 4. Not found - log detailed info for debugging
  libreOfficeCache = {
    available: false,
    reason: `Not found after searching ${searchedPaths.length} locations`,
    searchedPaths
  };

  console.log('⚠️ [LibreOffice] NOT FOUND. Office document previews will use text-only fallback.');
  console.log(`   Searched paths: ${searchedPaths.join(', ')}`);
  console.log('   To fix: Install LibreOffice or set LIBREOFFICE_PATH env variable');

  return libreOfficeCache;
}

/**
 * Get version of installed LibreOffice (for debugging/logging)
 */
export async function getLibreOfficeVersion(): Promise<string | null> {
  const info = await checkLibreOfficeAvailable();
  if (!info.available || !info.path) {
    return null;
  }

  try {
    const { stdout } = await execAsync(`"${info.path}" --version`, { timeout: 10000 });
    const version = stdout.trim();
    console.log(`📋 [LibreOffice] Version: ${version}`);
    return version;
  } catch (error: any) {
    console.warn(`⚠️ [LibreOffice] Could not get version: ${error.message}`);
    return null;
  }
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
    const errorMsg = `LibreOffice is not installed. ${libreOffice.reason || 'Unknown reason'}. Searched: ${libreOffice.searchedPaths?.join(', ') || 'none'}`;
    console.error(`❌ [LibreOffice] ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
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
    console.log(`   Using: ${libreOffice.path}`);
    console.log(`   Temp dir: ${tempDir}`);

    // Build LibreOffice command
    // --headless: Run without GUI
    // --convert-to pdf: Convert to PDF format
    // --outdir: Output directory
    const soffice = libreOffice.path;
    const cmd = `"${soffice}" --headless --convert-to pdf --outdir "${tempDir}" "${inputPath}"`;

    console.log(`🔄 [LibreOffice] Running: ${cmd}`);
    const startTime = Date.now();

    // Execute conversion
    const { stdout, stderr } = await execAsync(cmd, {
      timeout,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large documents
      windowsHide: true,
    });

    const duration = Date.now() - startTime;

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
        console.log(`✅ [LibreOffice] PDF created: ${pdfFile} (${(pdfBuffer.length / 1024).toFixed(1)} KB) in ${duration}ms`);
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
    console.log(`✅ [LibreOffice] PDF created: ${baseName}.pdf (${(pdfBuffer.length / 1024).toFixed(1)} KB) in ${duration}ms`);

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

/**
 * Check if a MIME type is an Office document that needs PDF conversion for preview
 */
export function needsPdfConversion(mimeType: string): boolean {
  const typesNeedingConversion = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/vnd.ms-powerpoint', // .ppt
  ];
  return typesNeedingConversion.includes(mimeType);
}

export default {
  checkLibreOfficeAvailable,
  clearLibreOfficeCache,
  getLibreOfficeVersion,
  convertToPdf,
  getSupportedMimeTypes,
  isSupportedMimeType,
  needsPdfConversion,
};
