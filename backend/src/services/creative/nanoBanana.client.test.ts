/**
 * nanoBanana.client.test.ts
 *
 * Tests for NanoBananaClientService:
 * 1. Validation rejects empty prompts
 * 2. Validation rejects invalid dimensions
 * 3. Without provider, throws NANO_BANANA_NOT_CONFIGURED
 * 4. With injected provider, delegates and returns result
 * 5. Provider errors propagate
 */

import { describe, expect, test } from '@jest/globals';
import {
  NanoBananaClientService,
  NanoBananaClientError,
  type NanoBananaRequest,
  type NanoBananaResponse,
  type NanoBananaProviderFn,
} from './nanoBanana.client.service';

function validRequest(overrides: Partial<NanoBananaRequest> = {}): NanoBananaRequest {
  return {
    systemPrompt: 'Generate a professional slide visual',
    userPrompt: 'A blue gradient background with subtle geometric shapes',
    width: 1280,
    height: 720,
    ...overrides,
  };
}

function fakeResponse(overrides: Partial<NanoBananaResponse> = {}): NanoBananaResponse {
  return {
    imageBuffer: Buffer.from('fake-png-data'),
    mimeType: 'image/png',
    model: 'test-model-v1',
    providerRequestId: 'req_123',
    latencyMs: 42,
    promptHash: 'abc123',
    ...overrides,
  };
}

describe('NanoBananaClientService', () => {
  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------

  describe('input validation', () => {
    test('rejects empty systemPrompt', async () => {
      const client = new NanoBananaClientService();
      const req = validRequest({ systemPrompt: '   ' });

      await expect(client.generate(req)).rejects.toThrow(NanoBananaClientError);
      await expect(client.generate(req)).rejects.toMatchObject({ code: 'INVALID_PROMPT' });
    });

    test('rejects empty userPrompt', async () => {
      const client = new NanoBananaClientService();
      const req = validRequest({ userPrompt: '' });

      await expect(client.generate(req)).rejects.toThrow(NanoBananaClientError);
      await expect(client.generate(req)).rejects.toMatchObject({ code: 'INVALID_PROMPT' });
    });

    test('rejects non-integer width', async () => {
      const client = new NanoBananaClientService();
      const req = validRequest({ width: 12.5 });

      await expect(client.generate(req)).rejects.toThrow(NanoBananaClientError);
      await expect(client.generate(req)).rejects.toMatchObject({ code: 'INVALID_DIMENSIONS' });
    });

    test('rejects zero height', async () => {
      const client = new NanoBananaClientService();
      const req = validRequest({ height: 0 });

      await expect(client.generate(req)).rejects.toThrow(NanoBananaClientError);
      await expect(client.generate(req)).rejects.toMatchObject({ code: 'INVALID_DIMENSIONS' });
    });

    test('rejects negative dimensions', async () => {
      const client = new NanoBananaClientService();
      const req = validRequest({ width: -100, height: -200 });

      await expect(client.generate(req)).rejects.toMatchObject({ code: 'INVALID_DIMENSIONS' });
    });
  });

  // ------------------------------------------------------------------
  // Without provider (shell mode)
  // ------------------------------------------------------------------

  describe('without provider (shell mode)', () => {
    test('throws NANO_BANANA_NOT_CONFIGURED', async () => {
      const client = new NanoBananaClientService();
      const req = validRequest();

      await expect(client.generate(req)).rejects.toThrow(NanoBananaClientError);
      await expect(client.generate(req)).rejects.toMatchObject({ code: 'NANO_BANANA_NOT_CONFIGURED' });
    });

    test('custom model name does not change shell behavior', async () => {
      const client = new NanoBananaClientService('custom-model-v2');
      const req = validRequest();

      await expect(client.generate(req)).rejects.toMatchObject({ code: 'NANO_BANANA_NOT_CONFIGURED' });
    });
  });

  // ------------------------------------------------------------------
  // With injected provider
  // ------------------------------------------------------------------

  describe('with injected provider', () => {
    test('delegates to provider function and returns result', async () => {
      const expected = fakeResponse();
      const provider: NanoBananaProviderFn = async (_req) => expected;

      const client = new NanoBananaClientService('test-model', provider);
      const result = await client.generate(validRequest());

      expect(result).toBe(expected);
      expect(result.imageBuffer).toEqual(Buffer.from('fake-png-data'));
      expect(result.mimeType).toBe('image/png');
      expect(result.model).toBe('test-model-v1');
    });

    test('passes the full request to provider', async () => {
      let captured: NanoBananaRequest | null = null;
      const provider: NanoBananaProviderFn = async (req) => {
        captured = req;
        return fakeResponse();
      };

      const client = new NanoBananaClientService('test-model', provider);
      const req = validRequest({ seed: 42, negativePrompt: 'no text in image' });
      await client.generate(req);

      expect(captured).not.toBeNull();
      expect(captured!.systemPrompt).toBe(req.systemPrompt);
      expect(captured!.userPrompt).toBe(req.userPrompt);
      expect(captured!.negativePrompt).toBe('no text in image');
      expect(captured!.width).toBe(1280);
      expect(captured!.height).toBe(720);
      expect(captured!.seed).toBe(42);
    });

    test('provider can return webp', async () => {
      const provider: NanoBananaProviderFn = async () =>
        fakeResponse({ mimeType: 'image/webp', model: 'dalle-3' });

      const client = new NanoBananaClientService('test', provider);
      const result = await client.generate(validRequest());

      expect(result.mimeType).toBe('image/webp');
      expect(result.model).toBe('dalle-3');
    });

    test('validation still runs before provider is called', async () => {
      let called = false;
      const provider: NanoBananaProviderFn = async () => {
        called = true;
        return fakeResponse();
      };

      const client = new NanoBananaClientService('test', provider);

      // Bad prompt - should fail validation BEFORE reaching provider
      await expect(client.generate(validRequest({ systemPrompt: '' }))).rejects.toMatchObject({
        code: 'INVALID_PROMPT',
      });
      expect(called).toBe(false);

      // Bad dimensions - should fail validation BEFORE reaching provider
      await expect(client.generate(validRequest({ width: -1 }))).rejects.toMatchObject({
        code: 'INVALID_DIMENSIONS',
      });
      expect(called).toBe(false);
    });

    test('provider errors propagate unchanged', async () => {
      const provider: NanoBananaProviderFn = async () => {
        throw new Error('Stability AI rate limit exceeded');
      };

      const client = new NanoBananaClientService('test', provider);
      await expect(client.generate(validRequest())).rejects.toThrow('Stability AI rate limit exceeded');
    });

    test('provider can be async and slow', async () => {
      const provider: NanoBananaProviderFn = async (req) => {
        await new Promise((r) => setTimeout(r, 50));
        return fakeResponse({ latencyMs: 50 });
      };

      const client = new NanoBananaClientService('test', provider);
      const result = await client.generate(validRequest());

      expect(result.latencyMs).toBe(50);
    });
  });
});
