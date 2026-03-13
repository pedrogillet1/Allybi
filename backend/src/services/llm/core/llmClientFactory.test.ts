import { describe, expect, test } from "@jest/globals";

import type { LLMClient } from "./llmClient.interface";
import { LLMClientFactory } from "./llmClientFactory";
import { resolveFactoryResilienceConfig } from "./llmClientFactoryConfig";

function makeClient(provider: LLMClient["provider"]): LLMClient {
  return {
    provider,
    async complete() {
      throw new Error("not used");
    },
    async stream() {
      throw new Error("not used");
    },
  };
}

describe("LLMClientFactory", () => {
  test("lists configured prebuilt providers in stable order", () => {
    const factory = new LLMClientFactory({
      defaultProvider: "google",
      providers: {},
      prebuilt: {
        local: makeClient("local"),
        openai: makeClient("openai"),
        google: makeClient("google"),
      },
    });

    expect(factory.listConfigured()).toEqual(["openai", "google", "local"]);
    expect(factory.get().provider).toBe("google");
    expect(factory.get("openai").provider).toBe("openai");
  });

  test("resolves explicit resilience overrides outside the factory", () => {
    const resolved = resolveFactoryResilienceConfig({
      openai: {
        concurrency: 11,
        retry: {
          maxRetries: 4,
          baseDelayMs: 900,
          maxDelayMs: 12000,
        },
      },
    });

    expect(resolved.openai).toEqual({
      concurrency: 11,
      retry: {
        maxRetries: 4,
        baseDelayMs: 900,
        maxDelayMs: 12000,
      },
    });
    expect(resolved.google.concurrency).toBeGreaterThan(0);
    expect(resolved.local.retry.maxRetries).toBeGreaterThan(0);
  });
});
