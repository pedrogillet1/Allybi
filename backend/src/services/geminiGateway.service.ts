/**
 * =============================================================================
 * GEMINI GATEWAY SERVICE - Centralized Gemini API Layer
 * =============================================================================
 *
 * The single source of truth for ALL Gemini API calls in the application.
 *
 * BENEFITS:
 * - Single connection pool (prevents exhaustion)
 * - Unified retry logic with exponential backoff
 * - Centralized error handling
 * - Consistent model configuration
 * - Automatic safety settings
 * - Cost tracking and logging
 *
 * USAGE:
 * Instead of: new GoogleGenerativeAI(apiKey).getGenerativeModel({...})
 * Use: geminiGateway.generateContent({ prompt, options })
 *
 * =============================================================================
 */

import { GoogleGenerativeAI, GenerativeModel, HarmCategory, HarmBlockThreshold, Content } from '@google/generative-ai';

// =============================================================================
// TYPES
// =============================================================================

export type GeminiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-1.5-flash' | 'gemini-1.5-pro';

export interface GeminiGenerationConfig {
  temperature?: number;
  topK?: number;
  topP?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
}

export interface GeminiRequest {
  prompt: string;
  systemInstruction?: string;
  model?: GeminiModel;
  config?: GeminiGenerationConfig;
  history?: Content[];
  safetySettings?: 'strict' | 'balanced' | 'permissive';
}

export interface GeminiStreamRequest extends GeminiRequest {
  onChunk: (chunk: string) => void;
}

export interface GeminiResponse {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  model: GeminiModel;
  finishReason?: string;
}

export interface GeminiStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokensUsed: number;
  averageLatencyMs: number;
  cacheHits: number;
}

// =============================================================================
// SAFETY SETTINGS PRESETS
// =============================================================================

const SAFETY_PRESETS = {
  strict: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ],
  balanced: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  ],
  permissive: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  ],
};

// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================

const DEFAULT_MODEL: GeminiModel = 'gemini-2.5-flash';

const DEFAULT_CONFIG: GeminiGenerationConfig = {
  temperature: 0.7,
  topK: 40,
  topP: 0.95,
  maxOutputTokens: 2048,
};

const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
};

// =============================================================================
// GEMINI GATEWAY CLASS
// =============================================================================

class GeminiGateway {
  private static instance: GeminiGateway;
  private genAI: GoogleGenerativeAI;
  private modelCache: Map<string, GenerativeModel> = new Map();
  private stats: GeminiStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalTokensUsed: 0,
    averageLatencyMs: 0,
    cacheHits: 0,
  };
  private latencies: number[] = [];

  private constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    console.log('✅ [GEMINI-GATEWAY] Singleton instance created');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): GeminiGateway {
    if (!GeminiGateway.instance) {
      GeminiGateway.instance = new GeminiGateway();
    }
    return GeminiGateway.instance;
  }

  /**
   * Get or create a cached model instance
   */
  private getModel(
    modelName: GeminiModel,
    systemInstruction?: string,
    config?: GeminiGenerationConfig,
    safetySettings?: 'strict' | 'balanced' | 'permissive'
  ): GenerativeModel {
    const cacheKey = JSON.stringify({
      model: modelName,
      hasSystemInstruction: !!systemInstruction,
      config: config || {},
      safety: safetySettings || 'permissive',
    });

    if (this.modelCache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.modelCache.get(cacheKey)!;
    }

    const model = this.genAI.getGenerativeModel({
      model: modelName,
      systemInstruction,
      generationConfig: {
        ...DEFAULT_CONFIG,
        ...config,
      },
      safetySettings: SAFETY_PRESETS[safetySettings || 'permissive'],
    });

    this.modelCache.set(cacheKey, model);
    console.log(`📦 [GEMINI-GATEWAY] Cached model: ${modelName}`);
    return model;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate delay for retry attempt
   */
  private getRetryDelay(attempt: number): number {
    const delay = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
    return Math.min(delay, RETRY_CONFIG.maxDelayMs);
  }

  /**
   * Update statistics
   */
  private updateStats(latencyMs: number, success: boolean, tokens?: number): void {
    this.stats.totalRequests++;
    if (success) {
      this.stats.successfulRequests++;
      this.latencies.push(latencyMs);
      if (this.latencies.length > 100) {
        this.latencies.shift(); // Keep last 100 latencies
      }
      this.stats.averageLatencyMs = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
      if (tokens) {
        this.stats.totalTokensUsed += tokens;
      }
    } else {
      this.stats.failedRequests++;
    }
  }

  /**
   * =============================================================================
   * MAIN API: Generate Content (Non-Streaming)
   * =============================================================================
   */
  public async generateContent(request: GeminiRequest): Promise<GeminiResponse> {
    const startTime = Date.now();
    const model = request.model || DEFAULT_MODEL;

    console.log(`🚀 [GEMINI-GATEWAY] generateContent (model: ${model})`);

    for (let attempt = 0; attempt < RETRY_CONFIG.maxAttempts; attempt++) {
      try {
        const geminiModel = this.getModel(
          model,
          request.systemInstruction,
          request.config,
          request.safetySettings
        );

        let result;
        if (request.history && request.history.length > 0) {
          // Chat mode with history
          const chat = geminiModel.startChat({ history: request.history });
          result = await chat.sendMessage(request.prompt);
        } else {
          // Simple generation
          result = await geminiModel.generateContent(request.prompt);
        }

        const response = result.response;
        const text = response.text();
        const latencyMs = Date.now() - startTime;

        // Extract token usage if available
        const usageMetadata = response.usageMetadata;
        const promptTokens = usageMetadata?.promptTokenCount;
        const completionTokens = usageMetadata?.candidatesTokenCount;
        const totalTokens = usageMetadata?.totalTokenCount;

        this.updateStats(latencyMs, true, totalTokens);

        console.log(`✅ [GEMINI-GATEWAY] Response: ${text.length} chars in ${latencyMs}ms`);

        return {
          text,
          promptTokens,
          completionTokens,
          totalTokens,
          model,
          finishReason: response.candidates?.[0]?.finishReason,
        };
      } catch (error: any) {
        const isRetryable = this.isRetryableError(error);
        console.warn(`⚠️ [GEMINI-GATEWAY] Attempt ${attempt + 1} failed: ${error.message}`);

        if (!isRetryable || attempt === RETRY_CONFIG.maxAttempts - 1) {
          this.updateStats(Date.now() - startTime, false);
          console.error(`❌ [GEMINI-GATEWAY] All retries exhausted`);
          throw this.wrapError(error);
        }

        const delay = this.getRetryDelay(attempt);
        console.log(`⏳ [GEMINI-GATEWAY] Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    throw new Error('Unexpected: All retries exhausted without throwing');
  }

  /**
   * =============================================================================
   * MAIN API: Generate Content with Streaming
   * =============================================================================
   */
  public async generateContentStream(request: GeminiStreamRequest): Promise<GeminiResponse> {
    const startTime = Date.now();
    const model = request.model || DEFAULT_MODEL;

    console.log(`🚀 [GEMINI-GATEWAY] generateContentStream (model: ${model})`);

    for (let attempt = 0; attempt < RETRY_CONFIG.maxAttempts; attempt++) {
      try {
        const geminiModel = this.getModel(
          model,
          request.systemInstruction,
          request.config,
          request.safetySettings
        );

        let result;
        if (request.history && request.history.length > 0) {
          // Chat mode with history
          const chat = geminiModel.startChat({ history: request.history });
          result = await chat.sendMessageStream(request.prompt);
        } else {
          // Simple streaming generation
          result = await geminiModel.generateContentStream(request.prompt);
        }

        let fullText = '';
        let chunkCount = 0;
        let firstChunkTime: number | null = null;

        for await (const chunk of result.stream) {
          let chunkText = chunk.text();

          // UTF-8 fix for mojibake
          if (chunkText && /Ã[£¡©²³¢§¨ª«¬­´µ¶·¸¹º»¼½¾¿àáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/.test(chunkText)) {
            try {
              const decoded = Buffer.from(chunkText, 'latin1').toString('utf8');
              if (decoded && !decoded.includes('�')) {
                chunkText = decoded;
              }
            } catch { /* Keep original */ }
          }

          fullText += chunkText;
          chunkCount++;

          if (!firstChunkTime) {
            firstChunkTime = Date.now() - startTime;
            console.log(`⚡ [GEMINI-GATEWAY] First chunk in ${firstChunkTime}ms`);
          }

          request.onChunk(chunkText);
        }

        const latencyMs = Date.now() - startTime;

        // Get final response for metadata
        const finalResponse = await result.response;
        const usageMetadata = finalResponse.usageMetadata;
        const totalTokens = usageMetadata?.totalTokenCount;

        this.updateStats(latencyMs, true, totalTokens);

        console.log(`✅ [GEMINI-GATEWAY] Stream complete: ${fullText.length} chars, ${chunkCount} chunks, ${latencyMs}ms`);

        return {
          text: fullText,
          promptTokens: usageMetadata?.promptTokenCount,
          completionTokens: usageMetadata?.candidatesTokenCount,
          totalTokens,
          model,
          finishReason: finalResponse.candidates?.[0]?.finishReason,
        };
      } catch (error: any) {
        const isRetryable = this.isRetryableError(error);
        console.warn(`⚠️ [GEMINI-GATEWAY] Stream attempt ${attempt + 1} failed: ${error.message}`);

        if (!isRetryable || attempt === RETRY_CONFIG.maxAttempts - 1) {
          this.updateStats(Date.now() - startTime, false);
          console.error(`❌ [GEMINI-GATEWAY] All stream retries exhausted`);
          throw this.wrapError(error);
        }

        const delay = this.getRetryDelay(attempt);
        console.log(`⏳ [GEMINI-GATEWAY] Retrying stream in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    throw new Error('Unexpected: All stream retries exhausted without throwing');
  }

  /**
   * =============================================================================
   * MAIN API: True AsyncGenerator Streaming (Yields Tokens)
   * =============================================================================
   *
   * TRUE STREAMING: Yields each token as it arrives from Gemini.
   * Use this for real-time streaming to the browser via SSE.
   * TTFT (Time To First Token) should be <500ms with proper network conditions.
   */
  public async *streamText(
    request: Omit<GeminiRequest, 'onChunk'>
  ): AsyncGenerator<string, GeminiResponse, unknown> {
    const startTime = Date.now();
    const model = request.model || DEFAULT_MODEL;

    console.log(`🚀 [GEMINI-GATEWAY] streamText AsyncGenerator (model: ${model})`);

    for (let attempt = 0; attempt < RETRY_CONFIG.maxAttempts; attempt++) {
      try {
        const geminiModel = this.getModel(
          model,
          request.systemInstruction,
          request.config,
          request.safetySettings
        );

        let streamResult;
        if (request.history && request.history.length > 0) {
          const chat = geminiModel.startChat({ history: request.history });
          streamResult = await chat.sendMessageStream(request.prompt);
        } else {
          streamResult = await geminiModel.generateContentStream(request.prompt);
        }

        let fullText = '';
        let chunkCount = 0;
        let firstChunkTime: number | null = null;

        // Yield each chunk as it arrives - TRUE STREAMING
        for await (const chunk of streamResult.stream) {
          let chunkText = chunk.text();

          // UTF-8 fix for mojibake
          if (chunkText && /Ã[£¡©²³¢§¨ª«¬­´µ¶·¸¹º»¼½¾¿àáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/.test(chunkText)) {
            try {
              const decoded = Buffer.from(chunkText, 'latin1').toString('utf8');
              if (decoded && !decoded.includes('�')) {
                chunkText = decoded;
              }
            } catch { /* Keep original */ }
          }

          fullText += chunkText;
          chunkCount++;

          if (!firstChunkTime) {
            firstChunkTime = Date.now() - startTime;
            console.log(`⚡ [GEMINI-GATEWAY] streamText first token in ${firstChunkTime}ms (TTFT)`);
          }

          // YIELD the token immediately to the consumer
          yield chunkText;
        }

        const latencyMs = Date.now() - startTime;

        // Get final response for metadata
        const finalResponse = await streamResult.response;
        const usageMetadata = finalResponse.usageMetadata;
        const totalTokens = usageMetadata?.totalTokenCount;

        this.updateStats(latencyMs, true, totalTokens);

        console.log(`✅ [GEMINI-GATEWAY] streamText complete: ${fullText.length} chars, ${chunkCount} chunks, ${latencyMs}ms`);

        // Return final result (accessible via generator.return() or final iteration)
        return {
          text: fullText,
          promptTokens: usageMetadata?.promptTokenCount,
          completionTokens: usageMetadata?.candidatesTokenCount,
          totalTokens,
          model,
          finishReason: finalResponse.candidates?.[0]?.finishReason,
        };
      } catch (error: any) {
        const isRetryable = this.isRetryableError(error);
        console.warn(`⚠️ [GEMINI-GATEWAY] streamText attempt ${attempt + 1} failed: ${error.message}`);

        if (!isRetryable || attempt === RETRY_CONFIG.maxAttempts - 1) {
          this.updateStats(Date.now() - startTime, false);
          console.error(`❌ [GEMINI-GATEWAY] streamText all retries exhausted`);
          throw this.wrapError(error);
        }

        const delay = this.getRetryDelay(attempt);
        console.log(`⏳ [GEMINI-GATEWAY] Retrying streamText in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    throw new Error('Unexpected: All streamText retries exhausted without throwing');
  }

  /**
   * =============================================================================
   * CONVENIENCE METHODS
   * =============================================================================
   */

  /**
   * Quick generation with minimal config
   */
  public async quickGenerate(
    prompt: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      model?: GeminiModel;
    } = {}
  ): Promise<string> {
    const response = await this.generateContent({
      prompt,
      model: options.model,
      config: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    });
    return response.text;
  }

  /**
   * Quick generation with full response (includes finishReason for truncation detection)
   */
  public async quickGenerateWithMetadata(
    prompt: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      model?: GeminiModel;
    } = {}
  ): Promise<GeminiResponse> {
    return this.generateContent({
      prompt,
      model: options.model,
      config: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    });
  }

  /**
   * JSON generation with automatic parsing
   */
  public async generateJSON<T = any>(
    prompt: string,
    options: {
      model?: GeminiModel;
      temperature?: number;
    } = {}
  ): Promise<T> {
    const response = await this.generateContent({
      prompt: `${prompt}\n\nRespond ONLY with valid JSON, no markdown or explanation.`,
      model: options.model,
      config: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: 4096,
      },
    });

    // Clean and parse JSON
    let jsonText = response.text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    try {
      return JSON.parse(jsonText) as T;
    } catch (parseError: any) {
      console.error(`❌ [GEMINI-GATEWAY] JSON parse error:`, parseError.message);
      console.error(`📝 [GEMINI-GATEWAY] Raw response:`, jsonText.slice(0, 500));
      throw new Error(`Failed to parse JSON response: ${parseError.message}`);
    }
  }

  /**
   * =============================================================================
   * ERROR HANDLING
   * =============================================================================
   */

  private isRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    const code = error.code || error.status;

    // Retryable errors
    if (code === 429 || message.includes('rate limit')) return true;
    if (code === 500 || code === 502 || code === 503 || code === 504) return true;
    if (message.includes('overloaded')) return true;
    if (message.includes('timeout')) return true;
    if (message.includes('econnreset')) return true;
    if (message.includes('socket hang up')) return true;

    return false;
  }

  private wrapError(error: any): Error {
    const message = error.message?.toLowerCase() || '';

    if (message.includes('api key')) {
      return new Error('Gemini API key is invalid or not configured');
    }
    if (message.includes('rate limit') || error.code === 429) {
      return new Error('Gemini API rate limit exceeded. Please try again later.');
    }
    if (message.includes('quota')) {
      return new Error('Gemini API quota exceeded. Please check your billing.');
    }
    if (message.includes('safety')) {
      return new Error('Content was blocked by safety filters. Please rephrase your request.');
    }

    return new Error(`Gemini API error: ${error.message}`);
  }

  /**
   * =============================================================================
   * UTILITY METHODS
   * =============================================================================
   */

  /**
   * Get raw GoogleGenerativeAI client (use sparingly)
   */
  public getRawClient(): GoogleGenerativeAI {
    return this.genAI;
  }

  /**
   * Clear model cache
   */
  public clearModelCache(): void {
    this.modelCache.clear();
    console.log('🗑️ [GEMINI-GATEWAY] Model cache cleared');
  }

  /**
   * Get statistics
   */
  public getStats(): GeminiStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokensUsed: 0,
      averageLatencyMs: 0,
      cacheHits: 0,
    };
    this.latencies = [];
    console.log('📊 [GEMINI-GATEWAY] Stats reset');
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      await this.quickGenerate('Say "ok"', { maxTokens: 10, temperature: 0 });
      return {
        healthy: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error.message,
      };
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// Lazy singleton accessor - prevents crash on import when GEMINI_API_KEY is absent
let _instance: GeminiGateway | null = null;

/**
 * Get the GeminiGateway singleton instance.
 * Throws only when actually called if GEMINI_API_KEY is missing.
 */
export function getGeminiGateway(): GeminiGateway {
  if (!_instance) {
    _instance = GeminiGateway.getInstance();
  }
  return _instance;
}

/**
 * Check if Gemini gateway is available (API key is set)
 */
export function isGeminiAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

// Proxy object for backwards compatibility with existing imports
// Lazily accesses the gateway only when methods are called
const geminiGateway: GeminiGateway = new Proxy({} as GeminiGateway, {
  get(_target, prop: keyof GeminiGateway) {
    return getGeminiGateway()[prop];
  },
});

export default geminiGateway;
export { geminiGateway, GeminiGateway };
