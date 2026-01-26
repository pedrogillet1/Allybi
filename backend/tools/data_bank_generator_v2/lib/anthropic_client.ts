/**
 * Anthropic API Client for Bank Generation
 *
 * Features:
 * - Retries with exponential backoff
 * - Rate limiting
 * - Caching by prompt hash
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_DIR = path.join(__dirname, "../.cache");
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const MAX_TOKENS = 8000;
const MODEL = "claude-sonnet-4-20250514";

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 200; // 5 requests per second max

// ============================================================================
// CLIENT CLASS
// ============================================================================

export class AnthropicClient {
  private client: Anthropic;
  private cacheEnabled: boolean;

  constructor(options?: { cacheEnabled?: boolean }) {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable required");
    }

    this.client = new Anthropic({ apiKey });
    this.cacheEnabled = options?.cacheEnabled ?? true;

    // Ensure cache directory exists
    if (this.cacheEnabled && !fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  /**
   * Generate content with caching and retries
   */
  async generate(prompt: string, options?: {
    maxTokens?: number;
    temperature?: number;
    skipCache?: boolean;
  }): Promise<string> {
    const maxTokens = options?.maxTokens ?? MAX_TOKENS;
    const temperature = options?.temperature ?? 0.7;

    // Check cache first
    const cacheKey = this.getCacheKey(prompt, maxTokens, temperature);
    if (this.cacheEnabled && !options?.skipCache) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Rate limiting
    await this.rateLimit();

    // Generate with retries
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: MODEL,
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: "user", content: prompt }],
        });

        const content = response.content[0];
        if (content.type !== "text") {
          throw new Error("Unexpected response type");
        }

        const text = content.text;

        // Cache the result
        if (this.cacheEnabled) {
          this.saveToCache(cacheKey, text);
        }

        return text;
      } catch (error: any) {
        lastError = error;

        // Check if retryable
        if (error.status === 429 || error.status >= 500) {
          const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
          console.log(`  Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms...`);
          await this.sleep(delay);
        } else {
          throw error;
        }
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Generate JSON array with automatic parsing and validation
   */
  async generateJsonArray<T = any>(prompt: string, options?: {
    maxTokens?: number;
    temperature?: number;
    skipCache?: boolean;
  }): Promise<T[]> {
    const text = await this.generate(prompt, options);

    // Extract JSON array
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      throw new Error("No JSON array found in response");
    }

    try {
      return JSON.parse(match[0]);
    } catch (e) {
      throw new Error(`Failed to parse JSON: ${e}`);
    }
  }

  // ============================================================================
  // CACHING
  // ============================================================================

  private getCacheKey(prompt: string, maxTokens: number, temperature: number): string {
    const hash = crypto
      .createHash("sha256")
      .update(`${prompt}:${maxTokens}:${temperature}`)
      .digest("hex")
      .slice(0, 16);
    return hash;
  }

  private getCachePath(key: string): string {
    return path.join(CACHE_DIR, `${key}.json`);
  }

  private getFromCache(key: string): string | null {
    const cachePath = this.getCachePath(key);
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
        return cached.content;
      } catch {
        return null;
      }
    }
    return null;
  }

  private saveToCache(key: string, content: string): void {
    const cachePath = this.getCachePath(key);
    fs.writeFileSync(
      cachePath,
      JSON.stringify({
        content,
        timestamp: new Date().toISOString(),
      })
    );
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await this.sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  clearCache(): void {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(CACHE_DIR, file));
      }
    }
  }

  getCacheStats(): { files: number; sizeBytes: number } {
    if (!fs.existsSync(CACHE_DIR)) {
      return { files: 0, sizeBytes: 0 };
    }

    const files = fs.readdirSync(CACHE_DIR);
    let sizeBytes = 0;

    for (const file of files) {
      const stat = fs.statSync(path.join(CACHE_DIR, file));
      sizeBytes += stat.size;
    }

    return { files: files.length, sizeBytes };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: AnthropicClient | null = null;

export function getAnthropicClient(options?: { cacheEnabled?: boolean }): AnthropicClient {
  if (!instance) {
    instance = new AnthropicClient(options);
  }
  return instance;
}
