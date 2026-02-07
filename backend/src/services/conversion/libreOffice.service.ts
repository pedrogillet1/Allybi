/**
 * LibreOffice Conversion Service
 *
 * Uses LibreOffice/soffice to convert Office documents to PDF locally.
 * This is a fallback when CloudConvert is unavailable or has no credits.
 *
 * Prerequisites:
 *   - LibreOffice must be installed (soffice command available)
 *   - macOS: brew install --cask libreoffice
 *   - Linux: apt-get install libreoffice
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, basename } from 'path';

const execAsync = promisify(exec);

export interface LibreOfficeResult {
  success: boolean;
  pdfBuffer?: Buffer;
  error?: string;
}

// Common paths for soffice binary
const SOFFICE_PATHS = [
  '/opt/homebrew/bin/soffice',  // macOS ARM (Homebrew)
  '/usr/local/bin/soffice',     // macOS Intel (Homebrew)
  '/usr/bin/soffice',           // Linux
  '/usr/bin/libreoffice',       // Linux alternative
  '/Applications/LibreOffice.app/Contents/MacOS/soffice', // macOS app bundle
  'soffice',                    // PATH fallback
];

let sofficePathCache: string | null = null;

/**
 * Find the soffice binary path
 */
async function findSofficePath(): Promise<string | null> {
  if (sofficePathCache) return sofficePathCache;

  for (const path of SOFFICE_PATHS) {
    try {
      await execAsync(`${path} --version`);
      sofficePathCache = path;
      console.log(`[LibreOffice] Found soffice at: ${path}`);
      return path;
    } catch {
      // Try next path
    }
  }

  console.warn('[LibreOffice] soffice binary not found in common paths');
  return null;
}

/**
 * Check if LibreOffice is available
 */
export async function isLibreOfficeAvailable(): Promise<boolean> {
  const path = await findSofficePath();
  return path !== null;
}

/**
 * Convert an Office document buffer to PDF using LibreOffice
 */
export async function convertToPdfWithLibreOffice(
  fileBuffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<LibreOfficeResult> {
  const startTime = Date.now();

  try {
    const sofficePath = await findSofficePath();
    if (!sofficePath) {
      return { success: false, error: 'LibreOffice (soffice) not found on this system' };
    }

    // Create temp directory for conversion
    const tempDir = await mkdtemp(join(tmpdir(), 'koda-libre-'));

    // Ensure filename has proper extension
    let safeFilename = filename || 'document';
    if (!safeFilename.includes('.')) {
      const extMap: Record<string, string> = {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        'application/vnd.ms-powerpoint': '.ppt',
        'application/rtf': '.rtf',
        'application/vnd.oasis.opendocument.text': '.odt',
        'application/vnd.oasis.opendocument.spreadsheet': '.ods',
        'application/vnd.oasis.opendocument.presentation': '.odp',
      };
      safeFilename += extMap[mimeType || ''] || '.docx';
    }

    // Sanitize filename (remove special chars that could cause issues)
    safeFilename = safeFilename.replace(/[^a-zA-Z0-9._-]/g, '_');

    const inputPath = join(tempDir, safeFilename);
    const expectedPdfName = safeFilename.replace(/\.[^.]+$/, '.pdf');
    const outputPath = join(tempDir, expectedPdfName);

    console.log(`[LibreOffice] Converting ${filename} to PDF...`);
    console.log(`[LibreOffice] Temp dir: ${tempDir}, Input: ${safeFilename}`);

    // Write input file
    await writeFile(inputPath, fileBuffer);

    // Run LibreOffice conversion
    // --headless: no GUI
    // --convert-to pdf: output format
    // --outdir: output directory
    const command = `"${sofficePath}" --headless --convert-to pdf --outdir "${tempDir}" "${inputPath}"`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 120000, // 2 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      if (stderr && !stderr.includes('CoreText')) {
        console.log(`[LibreOffice] stderr: ${stderr}`);
      }
    } catch (execError: any) {
      // Clean up temp directory
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});

      return {
        success: false,
        error: `LibreOffice conversion failed: ${execError.message}`,
      };
    }

    // Read the output PDF
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await readFile(outputPath);
    } catch (readError: any) {
      // Clean up temp directory
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});

      return {
        success: false,
        error: `PDF output not found after conversion: ${readError.message}`,
      };
    }

    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});

    const duration = Date.now() - startTime;
    console.log(
      `[LibreOffice] Conversion complete: "${filename}" → PDF ` +
      `(${(pdfBuffer.length / 1024).toFixed(1)} KB) in ${duration}ms`
    );

    return { success: true, pdfBuffer };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorMsg = error.message || 'Unknown LibreOffice error';
    console.error(`[LibreOffice] Conversion failed after ${duration}ms: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

export default {
  isLibreOfficeAvailable,
  convertToPdfWithLibreOffice,
};
