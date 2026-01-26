/**
 * Claude API Client
 * Handles communication with Claude API for dataset generation
 */

import Anthropic from '@anthropic-ai/sdk';

export interface GenerationResult {
  success: boolean;
  data?: unknown;
  rawResponse?: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ClaudeClientConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TEMPERATURE = 0.7;

export class ClaudeClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: ClaudeClientConfig = {}) {
    const apiKey = config.apiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Claude API key not found. Set CLAUDE_API_KEY or ANTHROPIC_API_KEY environment variable.'
      );
    }

    this.client = new Anthropic({ apiKey });
    this.model = config.model || DEFAULT_MODEL;
    this.maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
    this.temperature = config.temperature ?? DEFAULT_TEMPERATURE;
  }

  async generate(prompt: string): Promise<GenerationResult> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const textContent = response.content.find(block => block.type === 'text');
      const rawResponse = textContent && 'text' in textContent ? textContent.text : '';

      // Try to parse JSON from the response
      let data: unknown;
      try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                          rawResponse.match(/(\[[\s\S]*\])/) ||
                          rawResponse.match(/(\{[\s\S]*\})/);

        const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawResponse.trim();
        data = JSON.parse(jsonStr);
      } catch {
        // Return raw response if not valid JSON
        data = null;
      }

      return {
        success: true,
        data,
        rawResponse,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async generateWithRetry(prompt: string, maxRetries = 3): Promise<GenerationResult> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.generate(prompt);

      if (result.success && result.data) {
        return result;
      }

      lastError = result.error || 'Failed to parse JSON response';

      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }

    return {
      success: false,
      error: `Failed after ${maxRetries} attempts. Last error: ${lastError}`
    };
  }

  getModel(): string {
    return this.model;
  }

  setModel(model: string): void {
    this.model = model;
  }

  setTemperature(temperature: number): void {
    this.temperature = Math.max(0, Math.min(1, temperature));
  }
}
