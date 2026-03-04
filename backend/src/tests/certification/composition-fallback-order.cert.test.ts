import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";
import { LlmRouterService } from "../../services/llm/core/llmRouter.service";
import { writeCertificationGateReport } from "./reporting";

function loadBank(relPath: string): Record<string, unknown> {
  const abs = path.resolve(process.cwd(), "src/data_banks", relPath);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function makeRouter(): LlmRouterService {
  const banks: Record<string, Record<string, unknown>> = {
    provider_capabilities: loadBank("llm/provider_capabilities.any.json"),
    provider_fallbacks: loadBank("llm/provider_fallbacks.any.json"),
    composition_lane_policy: loadBank("llm/composition_lane_policy.any.json"),
  };
  return new LlmRouterService({
    getBank<T = unknown>(bankId: string): T {
      if (bankId in banks) return banks[bankId] as T;
      throw new Error(`missing_bank:${bankId}`);
    },
  });
}

describe("Certification: composition fallback order", () => {
  test("gemini fallback escalates to gpt-5.2", () => {
    const router = makeRouter();
    const failures: string[] = [];

    const order = router.listFallbackTargets({
      primary: {
        provider: "gemini",
        model: "gemini-2.5-flash",
        stage: "draft",
      },
      requireStreaming: true,
      allowTools: false,
    });

    const first = order[0];
    if (!first || first.provider !== "openai" || first.model !== "gpt-5.2") {
      failures.push(`FIRST_FALLBACK:${JSON.stringify(first || null)}`);
    }

    writeCertificationGateReport("composition-fallback-order", {
      passed: failures.length === 0,
      metrics: {
        fallbackCount: order.length,
        gpt52First: first?.provider === "openai" && first?.model === "gpt-5.2" ? 1 : 0,
      },
      thresholds: {
        gpt52First: 1,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });

  test("openai fallback escalates to gemini-2.5-flash", () => {
    const router = makeRouter();
    const failures: string[] = [];

    const order = router.listFallbackTargets({
      primary: {
        provider: "openai",
        model: "gpt-5.2",
        stage: "final",
      },
      requireStreaming: true,
      allowTools: false,
    });

    const first = order[0];
    if (!first || first.provider !== "gemini" || first.model !== "gemini-2.5-flash") {
      failures.push(`FIRST_FALLBACK:${JSON.stringify(first || null)}`);
    }

    writeCertificationGateReport("composition-fallback-order-reverse", {
      passed: failures.length === 0,
      metrics: {
        fallbackCount: order.length,
        geminiFirst: first?.provider === "gemini" && first?.model === "gemini-2.5-flash" ? 1 : 0,
      },
      thresholds: {
        geminiFirst: 1,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });

  test("context length oversized routes to higher-context model", () => {
    const router = makeRouter();
    const failures: string[] = [];

    const plan = router.route({
      env: "production",
      stage: "final",
      estimatedInputTokens: 200000, // exceeds GPT-5.2's 128K
    });

    // GPT-5.2 has 128K max, should fall back to Gemini with 1M
    if (plan.provider !== "gemini") {
      failures.push(`PROVIDER:${plan.provider} (expected gemini)`);
    }
    if (!plan.model.includes("gemini-2.5-flash")) {
      failures.push(`MODEL:${plan.model} (expected gemini-2.5-flash)`);
    }

    writeCertificationGateReport("context-length-routing", {
      passed: failures.length === 0,
      metrics: {
        selectedProvider: plan.provider === "gemini" ? 1 : 0,
        estimatedTokens: 200000,
        gpt52MaxTokens: 128000,
      },
      thresholds: {
        selectedProvider: 1,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
