import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ConversionResult {
  success: boolean;
  pdfPath?: string;
  error?: string;
}

/**
 * Check if LibreOffice is available on the system
 */
export async function checkLibreOfficeAvailable(): Promise<{ available: boolean; path?: string }> {
  const possiblePaths = [
    // Windows
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    // Linux
    '/usr/bin/libreoffice',
    '/usr/bin/soffice',
    '/usr/local/bin/libreoffice',
    // macOS
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ];

  for (const soffice of possiblePaths) {
    if (fs.existsSync(soffice)) {
      return { available: true, path: soffice };
    }
  }

  // Try to find it in PATH
  try {
    const { stdout } = await execAsync(process.platform === 'win32' ? 'where soffice' : 'which soffice');
    if (stdout.trim()) {
      return { available: true, path: stdout.trim().split('\n')[0] };
    }
  } catch {
    // Not found in PATH
  }

  return { available: false };
}

/**
 * Convert PPTX to PDF using LibreOffice
 * Falls back to null if LibreOffice is not available
 */
export async function convertPptxToPdf(
  pptxPath: string,
  outputDir?: string
): Promise<ConversionResult> {
  try {
    const libreOffice = await checkLibreOfficeAvailable();

    if (!libreOffice.available) {
      console.log('⚠️ [PPTX Converter] LibreOffice not available, skipping PDF conversion');
      return {
        success: false,
        error: 'LibreOffice not installed. Slide preview not available.',
      };
    }

    // Use temp directory if not specified
    if (!outputDir) {
      outputDir = path.dirname(pptxPath);
    }

    console.log(`📊 [PPTX Converter] Converting ${path.basename(pptxPath)} to PDF using LibreOffice...`);

    // Verify input file exists
    if (!fs.existsSync(pptxPath)) {
      throw new Error(`Input file not found: ${pptxPath}`);
    }

    // Build LibreOffice command
    const soffice = libreOffice.path!;
    const cmd = `"${soffice}" --headless --convert-to pdf --outdir "${outputDir}" "${pptxPath}"`;

    console.log('🔄 [PPTX Converter] Running:', cmd);

    // Execute conversion with timeout
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 120000, // 2 minute timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr && !stderr.includes('warn')) {
      console.warn('⚠️ [PPTX Converter] LibreOffice warnings:', stderr);
    }

    // Find the output PDF
    const pptxName = path.basename(pptxPath, path.extname(pptxPath));
    const pdfPath = path.join(outputDir, `${pptxName}.pdf`);

    if (!fs.existsSync(pdfPath)) {
      throw new Error('PDF conversion failed - output file not found');
    }

    const stats = fs.statSync(pdfPath);
    console.log(`✅ [PPTX Converter] PDF created: ${pdfPath} (${stats.size} bytes)`);

    return {
      success: true,
      pdfPath: pdfPath,
    };

  } catch (error: any) {
    console.error('❌ [PPTX Converter] Error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Convert PPTX buffer to PDF buffer
 * Handles temp file creation and cleanup
 */
export async function convertPptxBufferToPdf(
  pptxBuffer: Buffer,
  filename: string
): Promise<{ success: boolean; pdfBuffer?: Buffer; error?: string }> {
  const tempDir = path.join(os.tmpdir(), `pptx-convert-${Date.now()}`);
  const pptxPath = path.join(tempDir, filename);

  try {
    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });

    // Write PPTX to temp file
    fs.writeFileSync(pptxPath, pptxBuffer);

    // Convert to PDF
    const result = await convertPptxToPdf(pptxPath, tempDir);

    if (!result.success || !result.pdfPath) {
      return {
        success: false,
        error: result.error || 'Conversion failed',
      };
    }

    // Read PDF buffer
    const pdfBuffer = fs.readFileSync(result.pdfPath);

    return {
      success: true,
      pdfBuffer,
    };

  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

export default {
  checkLibreOfficeAvailable,
  convertPptxToPdf,
  convertPptxBufferToPdf,
};
