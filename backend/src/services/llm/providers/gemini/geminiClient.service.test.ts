import { GeminiClientService } from "./geminiClient.service";

describe("GeminiClientService", () => {
  describe("ping()", () => {
    it("should not include API key as a URL query parameter", async () => {
      const calls: { url: string; init?: RequestInit }[] = [];
      const originalFetch = globalThis.fetch;

      // Mock fetch to capture the URL
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      };

      try {
        const client = new GeminiClientService({
          apiKey: "test-secret-key-12345",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          timeoutMs: 5000,
        });

        await client.ping();

        expect(calls.length).toBe(1);
        expect(calls[0].url).not.toContain("?key=");
        expect(calls[0].url).not.toContain("test-secret-key");
        // API key should be in headers instead
        const headers = calls[0].init?.headers as Record<string, string>;
        expect(headers?.["X-Goog-Api-Key"]).toBe("test-secret-key-12345");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
