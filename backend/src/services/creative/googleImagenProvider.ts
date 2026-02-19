/**
 * googleImagenProvider.ts
 *
 * NanoBananaProviderFn backed by Gemini generateContent with image output.
 * Uses the same GEMINI_API_KEY already configured for chat.
 *
 * Endpoint: generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * with responseModalities: ["IMAGE", "TEXT"]
 */

import * as crypto from "crypto";
import type {
  NanoBananaRequest,
  NanoBananaResponse,
  NanoBananaProviderFn,
} from "./nanoBanana.client.service";

const DEFAULT_MODEL = "nano-banana-pro-preview";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function promptHash(req: NanoBananaRequest): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        s: req.systemPrompt,
        u: req.userPrompt,
        n: req.negativePrompt,
        w: req.width,
        h: req.height,
      }),
    )
    .digest("hex");
}

export function createGoogleImagenProvider(opts?: {
  apiKey?: string;
  model?: string;
}): NanoBananaProviderFn {
  const apiKey =
    opts?.apiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    "";
  const model = opts?.model || process.env.NANO_BANANA_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error(
      "[GoogleImagen] No API key. Set GEMINI_API_KEY or GOOGLE_API_KEY.",
    );
  }

  return async (request: NanoBananaRequest): Promise<NanoBananaResponse> => {
    const start = Date.now();

    // Build prompt parts — system instruction + user prompt
    const parts: Array<{ text: string }> = [];
    if (request.systemPrompt) {
      parts.push({ text: request.systemPrompt });
    }
    parts.push({ text: request.userPrompt });
    if (request.negativePrompt) {
      parts.push({ text: `Avoid: ${request.negativePrompt}` });
    }

    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;

    const body = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    };

    console.log(
      `[GoogleImagen] Generating image — model=${model} prompt="${request.userPrompt.slice(0, 80)}…"`,
    );

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `[GoogleImagen] API error ${res.status}: ${errText.slice(0, 400)}`,
      );
      throw new Error(
        `Gemini image API error ${res.status}: ${errText.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { mimeType?: string; data?: string };
          }>;
        };
      }>;
    };

    // Find the first part with inlineData (the generated image)
    const candidate = json.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find(
      (p) => p.inlineData?.data,
    );

    if (!imagePart?.inlineData?.data) {
      // Log what we got back for debugging
      const textParts = candidate?.content?.parts
        ?.filter((p) => p.text)
        .map((p) => p.text)
        .join(" ");
      console.error(
        "[GoogleImagen] No image in response. Text:",
        textParts?.slice(0, 200),
      );
      console.error(
        "[GoogleImagen] Full response:",
        JSON.stringify(json).slice(0, 500),
      );
      throw new Error(
        textParts
          ? `Model declined to generate image: ${textParts.slice(0, 150)}`
          : "Gemini returned no image data",
      );
    }

    const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
    const mimeType = (imagePart.inlineData.mimeType || "image/png") as
      | "image/png"
      | "image/webp";
    const latencyMs = Date.now() - start;

    console.log(
      `[GoogleImagen] Generated ${imageBuffer.length} bytes (${mimeType}) in ${latencyMs}ms`,
    );

    return {
      imageBuffer,
      mimeType,
      model,
      providerRequestId: crypto.randomUUID(),
      latencyMs,
      promptHash: promptHash(request),
    };
  };
}
