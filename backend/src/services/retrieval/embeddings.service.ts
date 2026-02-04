/**
 * Embeddings Service
 * Generates embeddings using Ollama (local) or OpenAI (cloud).
 * Supports caching to avoid recomputation.
 */
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import defaultLogger from '../../utils/logger';

const logger = {
  info: (msg: string, ...args: any[]) => defaultLogger.info(`[EmbeddingsService] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => defaultLogger.warn(`[EmbeddingsService] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => defaultLogger.error(`[EmbeddingsService] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => defaultLogger.debug(`[EmbeddingsService] ${msg}`, ...args),
};

// ============================================================================
// Types
// ============================================================================

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  cached: boolean;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  model: string;
  cached: boolean[];
}

// ============================================================================
// Configuration
// ============================================================================

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';

// Embedding provider: 'ollama' (default), 'openai'
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'ollama';

// Cache settings
const EMBEDDING_CACHE_ENABLED = process.env.EMBEDDING_CACHE_ENABLED !== 'false';
const EMBEDDING_CACHE_DIR = process.env.EMBEDDING_CACHE_DIR || path.resolve(process.cwd(), 'storage/embeddings-cache');

// Ensure cache directory exists
if (EMBEDDING_CACHE_ENABLED) {
  fs.mkdirSync(EMBEDDING_CACHE_DIR, { recursive: true });
}

// ============================================================================
// Cache Functions
// ============================================================================

function getCacheKey(text: string, model: string): string {
  const hash = crypto.createHash('sha256').update(`${model}:${text}`).digest('hex');
  return hash.substring(0, 32);
}

function getCachePath(key: string): string {
  // Use 2-level directory structure to avoid too many files in one dir
  const dir1 = key.substring(0, 2);
  const dir2 = key.substring(2, 4);
  const cacheDir = path.join(EMBEDDING_CACHE_DIR, dir1, dir2);
  fs.mkdirSync(cacheDir, { recursive: true });
  return path.join(cacheDir, `${key}.json`);
}

function getFromCache(text: string, model: string): number[] | null {
  if (!EMBEDDING_CACHE_ENABLED) return null;

  try {
    const key = getCacheKey(text, model);
    const cachePath = getCachePath(key);

    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      return cached.embedding;
    }
  } catch (error) {
    // Cache miss or error
  }
  return null;
}

function saveToCache(text: string, model: string, embedding: number[]): void {
  if (!EMBEDDING_CACHE_ENABLED) return;

  try {
    const key = getCacheKey(text, model);
    const cachePath = getCachePath(key);
    fs.writeFileSync(cachePath, JSON.stringify({ embedding, model, timestamp: Date.now() }));
  } catch (error) {
    logger.warn('[EmbeddingsCache] Failed to save:', error);
  }
}

// ============================================================================
// Ollama Embeddings
// ============================================================================

// Configurable timeout for VPS deployments with network latency
const EMBEDDING_TIMEOUT_MS = parseInt(process.env.EMBEDDING_TIMEOUT_MS || '60000', 10);

async function getOllamaEmbedding(text: string): Promise<number[]> {
  const response = await axios.post(
    `${OLLAMA_URL}/api/embeddings`,
    {
      model: OLLAMA_MODEL,
      prompt: text,
    },
    {
      timeout: EMBEDDING_TIMEOUT_MS,
    }
  );

  if (!response.data?.embedding) {
    throw new Error('Ollama returned no embedding');
  }

  return response.data.embedding;
}

async function getOllamaEmbeddings(texts: string[]): Promise<number[][]> {
  // Ollama doesn't support batch embeddings, so we do them sequentially
  const embeddings: number[][] = [];

  for (const text of texts) {
    const embedding = await getOllamaEmbedding(text);
    embeddings.push(embedding);
  }

  return embeddings;
}

// ============================================================================
// OpenAI Embeddings
// ============================================================================

async function getOpenAIEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await axios.post(
    'https://api.openai.com/v1/embeddings',
    {
      model: OPENAI_EMBED_MODEL,
      input: text,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: EMBEDDING_TIMEOUT_MS,
    }
  );

  if (!response.data?.data?.[0]?.embedding) {
    throw new Error('OpenAI returned no embedding');
  }

  return response.data.data[0].embedding;
}

async function getOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  // OpenAI supports batch embeddings - use longer timeout for batches
  const batchTimeout = parseInt(process.env.EMBEDDING_BATCH_TIMEOUT_MS || '120000', 10);
  const response = await axios.post(
    'https://api.openai.com/v1/embeddings',
    {
      model: OPENAI_EMBED_MODEL,
      input: texts,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: batchTimeout,
    }
  );

  if (!response.data?.data) {
    throw new Error('OpenAI returned no embeddings');
  }

  // Sort by index to ensure correct order
  const sorted = response.data.data.sort((a: any, b: any) => a.index - b.index);
  return sorted.map((item: any) => item.embedding);
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Get embedding for a single text.
 */
export async function getEmbedding(text: string): Promise<EmbeddingResult> {
  const model = EMBEDDING_PROVIDER === 'openai' ? OPENAI_EMBED_MODEL : OLLAMA_MODEL;

  // Check cache first
  const cached = getFromCache(text, model);
  if (cached) {
    return { embedding: cached, model, cached: true };
  }

  // Generate new embedding
  let embedding: number[];

  if (EMBEDDING_PROVIDER === 'openai') {
    embedding = await getOpenAIEmbedding(text);
  } else {
    embedding = await getOllamaEmbedding(text);
  }

  // Save to cache
  saveToCache(text, model, embedding);

  return { embedding, model, cached: false };
}

/**
 * Get embeddings for multiple texts (batch).
 */
export async function getEmbeddings(texts: string[]): Promise<BatchEmbeddingResult> {
  const model = EMBEDDING_PROVIDER === 'openai' ? OPENAI_EMBED_MODEL : OLLAMA_MODEL;
  const embeddings: number[][] = [];
  const cached: boolean[] = [];
  const textsToEmbed: { index: number; text: string }[] = [];

  // Check cache for each text
  for (let i = 0; i < texts.length; i++) {
    const cachedEmbedding = getFromCache(texts[i], model);
    if (cachedEmbedding) {
      embeddings[i] = cachedEmbedding;
      cached[i] = true;
    } else {
      textsToEmbed.push({ index: i, text: texts[i] });
      cached[i] = false;
    }
  }

  // Generate embeddings for uncached texts
  if (textsToEmbed.length > 0) {
    logger.info(`[Embeddings] Generating ${textsToEmbed.length} new embeddings (${texts.length - textsToEmbed.length} cached)`);

    let newEmbeddings: number[][];

    if (EMBEDDING_PROVIDER === 'openai') {
      newEmbeddings = await getOpenAIEmbeddings(textsToEmbed.map((t) => t.text));
    } else {
      newEmbeddings = await getOllamaEmbeddings(textsToEmbed.map((t) => t.text));
    }

    // Place new embeddings in correct positions and cache them
    for (let j = 0; j < textsToEmbed.length; j++) {
      const { index, text } = textsToEmbed[j];
      embeddings[index] = newEmbeddings[j];
      saveToCache(text, model, newEmbeddings[j]);
    }
  }

  return { embeddings, model, cached };
}

/**
 * Check if embedding service is available.
 */
export async function isEmbeddingServiceAvailable(): Promise<boolean> {
  try {
    if (EMBEDDING_PROVIDER === 'openai') {
      return !!OPENAI_API_KEY;
    } else {
      // Try to connect to Ollama
      const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
      return response.status === 200;
    }
  } catch {
    return false;
  }
}

// ============================================================================
// Exports
// ============================================================================

export const EmbeddingsService = {
  getEmbedding,
  getEmbeddings,
  isAvailable: isEmbeddingServiceAvailable,
  config: {
    provider: EMBEDDING_PROVIDER,
    ollamaUrl: OLLAMA_URL,
    ollamaModel: OLLAMA_MODEL,
    openaiModel: OPENAI_EMBED_MODEL,
    cacheEnabled: EMBEDDING_CACHE_ENABLED,
    cacheDir: EMBEDDING_CACHE_DIR,
  },
};

export default EmbeddingsService;
