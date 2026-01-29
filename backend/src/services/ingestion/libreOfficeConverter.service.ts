import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, exec, execSync } from 'child_process';
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
  reason?: string;
  searchedPaths?: string[];
}

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  killed: boolean;
}

// Cache LibreOffice availability check
let libreOfficeCache: LibreOfficeInfo | null = null;

/**
 * LibreOffice Converter Service
 * Converts Office documents (DOCX, XLSX, PPTX) to PDF using spawn with
 * proper environment isolation, crash detection, and retry logic.
 */

/**
 * Clear the LibreOffice cache (useful for testing or after installation)
 */
export function clearLibreOfficeCache(): void {
  libreOfficeCache = null;
  console.log('[LibreOffice] Cache cleared');
}

/**
 * Check if LibreOffice is available on the system
 */
export async function checkLibreOfficeAvailable(): Promise<LibreOfficeInfo> {
  if (libreOfficeCache !== null) {
    return libreOfficeCache;
  }

  const searchedPaths: string[] = [];

  // 1. Check for env override
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
      console.log(`[LibreOffice] Found via env LIBREOFFICE_PATH: ${envPath}`);
      return libreOfficeCache;
    } else {
      console.warn(`[LibreOffice] LIBREOFFICE_PATH set to ${envPath} but file does not exist`);
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
      console.log(`[LibreOffice] Found at: ${soffice}`);
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
      console.log(`[LibreOffice] Found in PATH: ${sofficePath}`);
      return libreOfficeCache;
    }
  } catch {
    // Not found in PATH
  }

  // 4. Not found
  libreOfficeCache = {
    available: false,
    reason: `Not found after searching ${searchedPaths.length} locations`,
    searchedPaths
  };

  console.log('[LibreOffice] NOT FOUND. Office document previews will use text-only fallback.');
  console.log(`   Searched paths: ${searchedPaths.join(', ')}`);
  console.log('   To fix: Install LibreOffice or set LIBREOFFICE_PATH env variable');

  return libreOfficeCache;
}

/**
 * Get version of installed LibreOffice
 */
export async function getLibreOfficeVersion(): Promise<string | null> {
  const info = await checkLibreOfficeAvailable();
  if (!info.available || !info.path) {
    return null;
  }

  try {
    const { stdout } = await execAsync(`"${info.path}" --version`, { timeout: 10000 });
    const version = stdout.trim();
    console.log(`[LibreOffice] Version: ${version}`);
    return version;
  } catch (error: any) {
    console.warn(`[LibreOffice] Could not get version: ${error.message}`);
    return null;
  }
}

/**
 * Kill any soffice processes associated with a specific profile directory
 */
function killStaleProcesses(profileDir: string): void {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM soffice.exe 2>nul', { timeout: 5000 });
    } else {
      // Kill processes referencing this specific profile
      execSync(`pkill -f "${profileDir}" 2>/dev/null || true`, { timeout: 5000 });
    }
  } catch {
    // Ignore - process may already be gone
  }
}

/**
 * Detect a crash: lock file exists but no PDF was written
 */
function detectCrash(dir: string): boolean {
  try {
    const files = fs.readdirSync(dir);
    const hasLockFile = files.some(f => f.startsWith('.~lock.') && f.endsWith('#'));
    const hasPdf = files.some(f => f.endsWith('.pdf'));
    return hasLockFile && !hasPdf;
  } catch {
    return false;
  }
}

/**
 * Find a PDF file in the given directory — exact name first, then any .pdf
 */
function findPdf(dir: string, baseName: string): string | null {
  const exactPath = path.join(dir, `${baseName}.pdf`);
  if (fs.existsSync(exactPath)) return exactPath;

  try {
    const files = fs.readdirSync(dir);
    const pdfFile = files.find(f => f.endsWith('.pdf'));
    if (pdfFile) return path.join(dir, pdfFile);
  } catch { /* dir might not exist */ }

  return null;
}

/**
 * Run a single LibreOffice conversion attempt using spawn
 */
function runConversion(
  sofficePath: string,
  inputPath: string,
  outDir: string,
  profileDir: string,
  timeout: number,
): Promise<SpawnResult> {
  const profileUrl = `file://${profileDir}`;

  const args = [
    '--headless',
    '--nologo',
    '--nofirststartwizard',
    '--norestore',
    '--nodefault',
    '--nolockcheck',
    `-env:UserInstallation=${profileUrl}`,
    '--convert-to', 'pdf',
    '--outdir', outDir,
    inputPath,
  ];

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(sofficePath, args, {
      cwd: outDir,
      env: {
        ...process.env,
        HOME: outDir,
        TMPDIR: outDir,
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, killed: timedOut });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr + '\n' + err.message,
        exitCode: null,
        killed: false,
      });
    });
  });
}

/**
 * Convert an Office document (DOCX, XLSX, PPTX) to PDF using LibreOffice.
 * Uses spawn with isolated HOME/TMPDIR, crash detection, and up to 2 attempts.
 */
export async function convertToPdf(
  inputBuffer: Buffer,
  filename: string,
  options: {
    timeout?: number;
  } = {}
): Promise<ConversionResult> {
  const { timeout = 120000 } = options;
  const MAX_ATTEMPTS = 2;

  const libreOffice = await checkLibreOfficeAvailable();
  if (!libreOffice.available || !libreOffice.path) {
    const errorMsg = `LibreOffice is not installed. ${libreOffice.reason || 'Unknown reason'}. Searched: ${libreOffice.searchedPaths?.join(', ') || 'none'}`;
    console.error(`[LibreOffice] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  let lastError = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const tempId = `lo-conv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempDir = path.join(os.tmpdir(), tempId);
    fs.mkdirSync(tempDir, { recursive: true });

    // Resolve real path immediately — macOS symlinks /var -> /private/var
    // LibreOffice resolves symlinks internally, so we must use the real path everywhere
    const realTempDir = fs.realpathSync(tempDir);
    const inputPath = path.join(realTempDir, filename);
    const profileDir = path.join(realTempDir, `profile-${attempt}`);
    fs.mkdirSync(profileDir, { recursive: true });

    try {
      fs.writeFileSync(inputPath, inputBuffer);

      console.log(`[LibreOffice] Converting ${filename} (attempt ${attempt}/${MAX_ATTEMPTS})...`);
      console.log(`   Using: ${libreOffice.path}`);
      console.log(`   Temp dir (real): ${realTempDir}`);

      const startTime = Date.now();

      const result = await runConversion(
        libreOffice.path,
        inputPath,
        realTempDir,
        profileDir,
        timeout,
      );

      const duration = Date.now() - startTime;

      if (result.killed) {
        lastError = `Timed out after ${timeout}ms`;
        console.error(`[LibreOffice] ${lastError}`);
        killStaleProcesses(profileDir);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        return { success: false, error: lastError };
      }

      if (result.stdout) console.log(`[LibreOffice] stdout: ${result.stdout.trim()}`);
      if (result.stderr) {
        // Filter out harmless macOS Task policy warnings
        const stderrClean = result.stderr.split('\n')
          .filter(l => !l.includes('Task policy') && l.trim().length > 0)
          .join('\n');
        if (stderrClean) console.warn(`[LibreOffice] stderr: ${stderrClean.trim()}`);
      }

      // Search for output PDF in the real temp dir
      const baseName = path.basename(filename, path.extname(filename));
      const foundPdfPath = findPdf(realTempDir, baseName);

      if (foundPdfPath) {
        const pdfBuffer = fs.readFileSync(foundPdfPath);
        console.log(`[LibreOffice] PDF created: ${path.basename(foundPdfPath)} (${(pdfBuffer.length / 1024).toFixed(1)} KB) in ${duration}ms`);
        return { success: true, pdfBuffer, pdfPath: foundPdfPath };
      }

      // No PDF found — check for crash pattern (lock file but no PDF)
      if (detectCrash(realTempDir)) {
        lastError = `Crash detected (lock file but no PDF output), attempt ${attempt}/${MAX_ATTEMPTS}`;
        console.warn(`[LibreOffice] ${lastError}`);
        killStaleProcesses(profileDir);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        return { success: false, error: lastError };
      }

      // No PDF and no crash — unknown failure
      lastError = result.exitCode !== 0
        ? `LibreOffice failed (exit ${result.exitCode}): ${result.stderr || 'unknown error'}`
        : 'PDF conversion failed - output file not found';
      console.error(`[LibreOffice] ${lastError}`);

      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      return { success: false, error: lastError };

    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  return { success: false, error: lastError || 'All conversion attempts failed' };
}

/**
 * Get supported MIME types for LibreOffice conversion
 */
export function getSupportedMimeTypes(): string[] {
  return [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'application/rtf',
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
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
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
