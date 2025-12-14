/**
 * Claude API Client for Dataset Generation
 */

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TEMPERATURE = 0.7;

export class ClaudeGenerator {
  constructor(apiKey, options = {}) {
    if (!apiKey) {
      throw new Error('Claude API key is required');
    }

    this.client = new Anthropic({ apiKey });
    this.model = options.model || DEFAULT_MODEL;
    this.maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
    this.temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  }

  /**
   * Generate content from a prompt
   */
  async generate(prompt) {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [{ role: 'user', content: prompt }]
      });

      const textContent = response.content.find(block => block.type === 'text');
      const rawResponse = textContent?.text || '';

      // Parse JSON from response
      let data = null;
      try {
        const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                          rawResponse.match(/(\[[\s\S]*\])/) ||
                          rawResponse.match(/(\{[\s\S]*\})/);
        const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawResponse.trim();
        data = JSON.parse(jsonStr);
      } catch (parseError) {
        console.warn('Failed to parse JSON:', parseError.message);
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
      console.error('Claude API error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate with retry logic
   */
  async generateWithRetry(prompt, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`Attempt ${attempt}/${maxRetries}...`);

      const result = await this.generate(prompt);

      if (result.success && result.data) {
        return result;
      }

      lastError = result.error || 'Failed to parse response';

      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return {
      success: false,
      error: `Failed after ${maxRetries} attempts: ${lastError}`
    };
  }
}

/**
 * Validate generated data
 */
export function validateExamples(examples) {
  if (!Array.isArray(examples)) return { valid: false, errors: ['Not an array'] };

  const errors = [];
  const validExamples = examples.filter((ex, i) => {
    if (!ex.text || typeof ex.text !== 'string') {
      errors.push(`Example ${i}: missing or invalid text`);
      return false;
    }
    if (ex.text.length < 3) {
      errors.push(`Example ${i}: text too short`);
      return false;
    }
    return true;
  });

  return {
    valid: errors.length === 0,
    errors,
    data: validExamples,
    stats: {
      total: examples.length,
      valid: validExamples.length,
      rejected: examples.length - validExamples.length
    }
  };
}

export function validateKeywords(keywords) {
  if (!Array.isArray(keywords)) return { valid: false, errors: ['Not an array'] };

  const errors = [];
  const seen = new Set();
  const validKeywords = keywords.filter((kw, i) => {
    if (!kw.text || typeof kw.text !== 'string') {
      errors.push(`Keyword ${i}: missing or invalid text`);
      return false;
    }
    const normalized = kw.text.toLowerCase().trim();
    if (seen.has(normalized)) {
      errors.push(`Keyword ${i}: duplicate "${kw.text}"`);
      return false;
    }
    seen.add(normalized);
    return true;
  });

  return {
    valid: errors.length === 0,
    errors,
    data: validKeywords,
    stats: {
      total: keywords.length,
      valid: validKeywords.length,
      duplicates: keywords.length - validKeywords.length
    }
  };
}

export function validatePatterns(patterns) {
  if (!Array.isArray(patterns)) return { valid: false, errors: ['Not an array'] };

  const errors = [];
  const validPatterns = patterns.filter((p, i) => {
    if (!p.pattern || typeof p.pattern !== 'string') {
      errors.push(`Pattern ${i}: missing or invalid pattern`);
      return false;
    }
    try {
      new RegExp(p.pattern, 'i');
      return true;
    } catch (e) {
      errors.push(`Pattern ${i}: invalid regex "${p.pattern}"`);
      return false;
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    data: validPatterns,
    stats: {
      total: patterns.length,
      valid: validPatterns.length,
      invalid: patterns.length - validPatterns.length
    }
  };
}
