import { afterEach, describe, expect, test } from "@jest/globals";
import {
  buildLLMFactoryFromEnv,
  resolveFactoryKey,
  resolveRuntimeEnvName,
} from "./llmGatewayRuntime.factory";

const ORIGINAL_ENV = { ...process.env };

function resetKeys() {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.OPENAI_API_KEY;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("llmGatewayRuntime.factory", () => {
  test("resolveRuntimeEnvName maps known NODE_ENV values", () => {
    expect(resolveRuntimeEnvName("production")).toBe("production");
    expect(resolveRuntimeEnvName("staging")).toBe("staging");
    expect(resolveRuntimeEnvName("test")).toBe("dev");
    expect(resolveRuntimeEnvName("development")).toBe("local");
    const originalNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    expect(resolveRuntimeEnvName(undefined)).toBe("local");
    if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
  });

  test("resolveFactoryKey normalizes provider aliases", () => {
    expect(resolveFactoryKey("openai")).toBe("openai");
    expect(resolveFactoryKey("google")).toBe("google");
    expect(resolveFactoryKey("gemini")).toBe("google");
    expect(resolveFactoryKey("local")).toBeNull();
    expect(resolveFactoryKey("unknown")).toBeNull();
  });

  test("buildLLMFactoryFromEnv throws when no provider keys are configured", () => {
    resetKeys();
    expect(() => buildLLMFactoryFromEnv("local")).toThrow("No LLM API key found");
  });

  test("buildLLMFactoryFromEnv wires both providers when both keys exist", () => {
    resetKeys();
    process.env.GEMINI_API_KEY = "gemini-test-key";
    process.env.OPENAI_API_KEY = "openai-test-key";

    const factory = buildLLMFactoryFromEnv("local");
    expect(factory.listConfigured()).toEqual(["openai", "google"]);
  });

  test("buildLLMFactoryFromEnv wires Gemini-only runtime", () => {
    resetKeys();
    process.env.GEMINI_API_KEY = "gemini-test-key";

    const factory = buildLLMFactoryFromEnv("local");
    expect(factory.listConfigured()).toEqual(["google"]);
  });

  test("buildLLMFactoryFromEnv wires OpenAI-only runtime", () => {
    resetKeys();
    process.env.OPENAI_API_KEY = "openai-test-key";

    const factory = buildLLMFactoryFromEnv("local");
    expect(factory.listConfigured()).toEqual(["openai"]);
  });

  test("buildLLMFactoryFromEnv enforces OPENAI strict allowlist in production/staging", () => {
    resetKeys();
    process.env.OPENAI_API_KEY = "openai-test-key";
    process.env.OPENAI_STRICT_ALLOWLIST = "false";

    expect(() => buildLLMFactoryFromEnv("production")).toThrow(
      "OPENAI_STRICT_ALLOWLIST must remain enabled in production/staging",
    );
  });
});
