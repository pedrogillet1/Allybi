import * as crypto from "crypto";

export interface NanoBananaRequest {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
}

export interface NanoBananaResponse {
  imageBuffer: Buffer;
  mimeType: "image/png" | "image/webp";
  model: string;
  providerRequestId: string;
  latencyMs: number;
  promptHash: string;
}

export class NanoBananaClientError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "NanoBananaClientError";
    this.code = code;
  }
}

/**
 * Nano Banana image generation client.
 * Default implementation is an adapter shell: wire real API call in one place.
 */
export type NanoBananaProviderFn = (
  request: NanoBananaRequest,
) => Promise<NanoBananaResponse>;

export class NanoBananaClientService {
  private readonly providerFn?: NanoBananaProviderFn;

  constructor(
    private readonly modelName: string = process.env.NANO_BANANA_MODEL ||
      "nano-banana-v1",
    providerFn?: NanoBananaProviderFn,
  ) {
    this.providerFn = providerFn;
  }

  async generate(request: NanoBananaRequest): Promise<NanoBananaResponse> {
    if (!request.systemPrompt.trim() || !request.userPrompt.trim()) {
      throw new NanoBananaClientError(
        "systemPrompt and userPrompt are required.",
        "INVALID_PROMPT",
      );
    }

    if (
      !Number.isInteger(request.width) ||
      !Number.isInteger(request.height) ||
      request.width <= 0 ||
      request.height <= 0
    ) {
      throw new NanoBananaClientError(
        "width and height must be positive integers.",
        "INVALID_DIMENSIONS",
      );
    }

    if (this.providerFn) {
      return this.providerFn(request);
    }

    // Adapter shell intentionally throws until provider call is configured.
    // This keeps pipeline deterministic and fail-fast in production.
    throw new NanoBananaClientError(
      "Nano Banana provider is not configured yet. Inject a provider-specific implementation into NanoBananaClientService.generate().",
      "NANO_BANANA_NOT_CONFIGURED",
    );
  }

  protected promptHash(request: NanoBananaRequest): string {
    const payload = JSON.stringify({
      systemPrompt: request.systemPrompt,
      userPrompt: request.userPrompt,
      negativePrompt: request.negativePrompt,
      width: request.width,
      height: request.height,
      seed: request.seed,
    });

    return crypto.createHash("sha256").update(payload).digest("hex");
  }
}

export default NanoBananaClientService;
