/**
 * Docling Bridge Service
 * Calls the Python Docling extractor and returns structured results.
 * Falls back to existing extractors on failure.
 */
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import defaultLogger from '../../utils/logger';

const logger = {
  info: (msg: string, ...args: any[]) => defaultLogger.info(`[DoclingBridge] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => defaultLogger.warn(`[DoclingBridge] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => defaultLogger.error(`[DoclingBridge] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => defaultLogger.debug(`[DoclingBridge] ${msg}`, ...args),
};

// ============================================================================
// Types
// ============================================================================

export interface DoclingSuccessResult {
  ok: true;
  docling_json: string;
  docling_md: string;
  chunks_json: string;
  chunk_count: number;
  total_chars?: number;
}

export interface DoclingErrorResult {
  ok: false;
  error: string;
  traceback?: string;
}

export type DoclingBridgeResult = DoclingSuccessResult | DoclingErrorResult;

export interface DoclingChunk {
  chunk_id: string;
  text: string;
  char_count: number;
  meta: {
    page?: number;
    headings?: string[];
    [key: string]: any;
  };
}

export interface DoclingExtractedDocument {
  markdown: string;
  chunks: DoclingChunk[];
  json: any;
  chunkCount: number;
  totalChars: number;
}

// ============================================================================
// Configuration
// ============================================================================

const DOCLING_ENABLED = process.env.DOCLING_ENABLED !== 'false'; // Default enabled
const DOCLING_TIMEOUT_MS = parseInt(process.env.DOCLING_TIMEOUT_MS || '120000', 10);
const DOCLING_PYTHON = process.env.DOCLING_PYTHON || path.resolve(process.cwd(), '.venv-docling/bin/python3');
const DOCLING_SCRIPT = path.resolve(process.cwd(), 'scripts/docling_extract.py');

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Check if Docling is available and enabled.
 */
export function isDoclingAvailable(): boolean {
  if (!DOCLING_ENABLED) {
    logger.info('[Docling] Disabled via DOCLING_ENABLED=false');
    return false;
  }

  // Check if Python venv exists
  if (!fs.existsSync(DOCLING_PYTHON)) {
    logger.warn(`[Docling] Python not found at: ${DOCLING_PYTHON}`);
    return false;
  }

  // Check if script exists
  if (!fs.existsSync(DOCLING_SCRIPT)) {
    logger.warn(`[Docling] Script not found at: ${DOCLING_SCRIPT}`);
    return false;
  }

  return true;
}

/**
 * Run Docling extraction on a file.
 * @param inputPath - Absolute path to the input file
 * @param outDir - Absolute path to the output directory
 * @returns DoclingBridgeResult with paths to extracted files
 */
export async function runDoclingExtract(
  inputPath: string,
  outDir: string
): Promise<DoclingBridgeResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    // Validate inputs
    if (!fs.existsSync(inputPath)) {
      resolve({ ok: false, error: `Input file not found: ${inputPath}` });
      return;
    }

    // Create output directory
    fs.mkdirSync(outDir, { recursive: true });

    const args = [DOCLING_SCRIPT, '--input', inputPath, '--outdir', outDir];

    logger.info(`[Docling] Starting extraction: ${path.basename(inputPath)}`);
    logger.debug(`[Docling] Command: ${DOCLING_PYTHON} ${args.join(' ')}`);

    let child: ChildProcess;
    try {
      child = spawn(DOCLING_PYTHON, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });
    } catch (spawnError: any) {
      resolve({ ok: false, error: `Failed to spawn Docling: ${spawnError.message}` });
      return;
    }

    let stdout = '';
    let stderr = '';
    let resolved = false;

    // Timeout handler
    const killTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill('SIGKILL');
        const elapsed = Date.now() - startTime;
        logger.error(`[Docling] Timed out after ${elapsed}ms`);
        resolve({ ok: false, error: `Docling timed out after ${DOCLING_TIMEOUT_MS}ms` });
      }
    }, DOCLING_TIMEOUT_MS);

    child.stdout?.on('data', (data) => {
      stdout += data.toString('utf8');
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString('utf8');
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(killTimer);
        logger.error(`[Docling] Process error: ${err.message}`);
        resolve({ ok: false, error: `Docling process error: ${err.message}` });
      }
    });

    child.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(killTimer);

      const elapsed = Date.now() - startTime;

      try {
        // Parse the last line of stdout (JSON output)
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1] || '';
        const parsed = JSON.parse(lastLine);

        if (parsed?.ok) {
          logger.info(`[Docling] Success: ${parsed.chunk_count} chunks in ${elapsed}ms`);
          resolve(parsed as DoclingSuccessResult);
        } else {
          logger.error(`[Docling] Failed: ${parsed?.error || 'Unknown error'}`);
          resolve({
            ok: false,
            error: parsed?.error || 'Docling returned failure',
            traceback: parsed?.traceback,
          });
        }
      } catch (parseError) {
        logger.error(`[Docling] Failed to parse output (exit code ${code})`);
        logger.debug(`[Docling] stdout: ${stdout.substring(0, 500)}`);
        logger.debug(`[Docling] stderr: ${stderr.substring(0, 500)}`);
        resolve({
          ok: false,
          error: stderr || 'Docling returned non-JSON output',
        });
      }
    });
  });
}

/**
 * Load extracted Docling content from output files.
 * @param result - The successful DoclingBridgeResult
 * @returns Parsed document with markdown, chunks, and metadata
 */
export async function loadDoclingOutput(
  result: DoclingSuccessResult
): Promise<DoclingExtractedDocument> {
  // Load markdown
  const markdown = fs.readFileSync(result.docling_md, 'utf-8');

  // Load chunks
  const chunksRaw = fs.readFileSync(result.chunks_json, 'utf-8');
  const chunks: DoclingChunk[] = JSON.parse(chunksRaw);

  // Load JSON (optional, might be large)
  let json: any = null;
  try {
    const jsonRaw = fs.readFileSync(result.docling_json, 'utf-8');
    json = JSON.parse(jsonRaw);
  } catch {
    logger.warn('[Docling] Failed to load docling.json');
  }

  return {
    markdown,
    chunks,
    json,
    chunkCount: result.chunk_count,
    totalChars: result.total_chars || chunks.reduce((sum, c) => sum + c.char_count, 0),
  };
}

/**
 * High-level function: Extract document and load results.
 * @param inputPath - Path to input file
 * @param outDir - Output directory for Docling files
 * @returns Extracted document or null on failure
 */
export async function extractWithDocling(
  inputPath: string,
  outDir: string
): Promise<DoclingExtractedDocument | null> {
  if (!isDoclingAvailable()) {
    logger.info('[Docling] Not available, skipping');
    return null;
  }

  const result = await runDoclingExtract(inputPath, outDir);

  if (!result.ok) {
    logger.error(`[Docling] Extraction failed: ${result.error}`);
    return null;
  }

  try {
    return await loadDoclingOutput(result);
  } catch (loadError: any) {
    logger.error(`[Docling] Failed to load output: ${loadError.message}`);
    return null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export const DoclingBridge = {
  isAvailable: isDoclingAvailable,
  extract: runDoclingExtract,
  loadOutput: loadDoclingOutput,
  extractAndLoad: extractWithDocling,
  config: {
    enabled: DOCLING_ENABLED,
    timeoutMs: DOCLING_TIMEOUT_MS,
    pythonPath: DOCLING_PYTHON,
    scriptPath: DOCLING_SCRIPT,
  },
};

export default DoclingBridge;
