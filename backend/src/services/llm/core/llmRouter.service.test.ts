import { jest } from "@jest/globals";
import { LlmRouterService, type BankLoader } from "./llmRouter.service";
import providerCapabilitiesBank from "../../../data_banks/llm/provider_capabilities.any.json";
import providerFallbacksBank from "../../../data_banks/llm/provider_fallbacks.any.json";
import compositionLanePolicyBank from "../../../data_banks/llm/composition_lane_policy.any.json";

function makePolicyAwareLoader(): BankLoader {
  return {
    getBank(bankId: string) {
      if (bankId === "provider_capabilities" || bankId === "providerCapabilities") {
        return providerCapabilitiesBank;
      }
      if (bankId === "provider_fallbacks" || bankId === "providerFallbacks") {
        return providerFallbacksBank;
      }
      if (
        bankId === "composition_lane_policy" ||
        bankId === "compositionLanePolicy"
      ) {
        return compositionLanePolicyBank;
      }
      throw new Error(`bank_missing:${bankId}`);
    },
  };
}

describe("LlmRouterService", () => {
  test("final stage defaults to GPT-5.2 authority lane", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const out = router.route({
      env: "production",
      stage: "final",
      answerMode: "general_answer",
      requireStreaming: true,
      allowTools: false,
    });

    expect(out.provider).toBe("openai");
    expect(out.model).toBe("gpt-5.2-2026-01-15");
    expect(out.lane).toBe("final_authority_default");
    expect(out.modelFamily).toBe("gpt-5.2");
    expect(out.stage).toBe("final");
  });

  test("quality_finish routes to gpt-5.2 authority lane", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const out = router.route({
      env: "production",
      stage: "final",
      answerMode: "doc_grounded_single",
      requireStreaming: true,
      allowTools: false,
    });

    expect(out.provider).toBe("openai");
    expect(out.model).toBe("gpt-5.2-2026-01-15");
    expect(out.lane).toBe("final_authority_default");
  });

  test("final-stage fallback from gemini resolves to gpt-5.2", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const out = router.listFallbackTargets({
      primary: {
        provider: "gemini",
        model: "gemini-2.5-flash",
        stage: "final",
      },
      requireStreaming: true,
      allowTools: false,
    });

    expect(out[0]).toEqual({ provider: "openai", model: "gpt-5.2" });
  });

  test("fallback from openai gpt-5.2 resolves to gemini cross-provider", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const out = router.listFallbackTargets({
      primary: {
        provider: "openai",
        model: "gpt-5.2",
        stage: "final",
      },
      requireStreaming: true,
      allowTools: false,
    });

    expect(out[0]).toEqual({ provider: "gemini", model: "gemini-2.5-flash" });
  });

  test("logs warning when no provider health data is available", () => {
    const mockLogger = { warn: jest.fn() };
    const router = new LlmRouterService(makePolicyAwareLoader(), mockLogger);
    router.route({
      env: "production",
      stage: "final",
      providerHealth: undefined,
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("No provider health data"),
      expect.any(Object),
    );
  });

  test("draft stage with no specific signals returns reason 'unknown'", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const plan = router.route({
      env: "production",
      stage: "draft",
    });
    expect(plan.reason).toBe("unknown");
  });

  test("rejects model when estimatedInputTokens exceeds maxInputTokens", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const plan = router.route({
      env: "production",
      stage: "final",
      estimatedInputTokens: 200000, // exceeds GPT-5.2's 128K
    });
    // Should fall back to gemini which has 1M context
    expect(plan.provider).toBe("gemini");
  });

  test("accepts model when estimatedInputTokens is within maxInputTokens", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const plan = router.route({
      env: "production",
      stage: "final",
      estimatedInputTokens: 50000, // within GPT-5.2's 128K
    });
    expect(plan.provider).toBe("openai");
  });

  test("draft stage routing selects gemini-2.5-flash by default", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const plan = router.route({ env: "production", stage: "draft" });
    expect(plan.provider).toBe("gemini");
    expect(plan.model).toContain("gemini-2.5-flash");
  });

  test("numericStrict reason routes to final-stage authority", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const plan = router.route({
      env: "production",
      stage: "draft",
      numericStrict: true,
    });
    expect(plan.reason).toBe("numeric_strict");
    expect(plan.stage).toBe("final");
  });

  test("hallucinationGuard reason routes to final-stage authority", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const plan = router.route({
      env: "production",
      stage: "draft",
      hallucinationGuard: true,
    });
    expect(plan.reason).toBe("hallucination_guard");
    expect(plan.stage).toBe("final");
  });

  test("unhealthy primary triggers fallback to alternative provider", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const plan = router.route({
      env: "production",
      stage: "final",
      providerHealth: [{ provider: "openai", ok: false, models: {} }],
    });
    expect(plan.provider).toBe("gemini");
  });
});
