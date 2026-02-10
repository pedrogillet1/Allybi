import { NanoBananaClientService } from './nanoBanana.client.service';
import { createGoogleImagenProvider } from './googleImagenProvider';

/**
 * Shared factory for Nano Banana (Imagen) client.
 * - Uses Gemini/Google API key already used elsewhere in the app.
 * - Returns null when not configured so callers can degrade gracefully.
 */
export function createNanoBananaClientFromEnv(modelName?: string): NanoBananaClientService | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  const provider = createGoogleImagenProvider({
    apiKey,
    model: modelName || process.env.NANO_BANANA_MODEL || 'nano-banana-pro-preview',
  });

  return new NanoBananaClientService(modelName || 'nano-banana-pro-preview', provider);
}

