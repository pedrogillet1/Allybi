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
    expect(out.model).toBe("gpt-5.2");
    expect(out.lane).toBe("final_authority_default");
    expect(out.modelFamily).toBe("gpt-5.2");
    expect(out.stage).toBe("final");
  });

  test("quality_finish no longer demotes final model to gpt-5-mini", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const out = router.route({
      env: "production",
      stage: "final",
      answerMode: "doc_grounded_single",
      requireStreaming: true,
      allowTools: false,
    });

    expect(out.provider).toBe("openai");
    expect(out.model).not.toBe("gpt-5-mini");
    expect(out.model).toBe("gpt-5.2");
    expect(out.lane).toBe("final_authority_default");
  });

  test("final-stage fallback from gemini prioritizes gpt-5.2 over gpt-5-mini", () => {
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

  test("fallback from openai mini prioritizes same-provider gpt-5.2 before cross-provider", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const out = router.listFallbackTargets({
      primary: {
        provider: "openai",
        model: "gpt-5-mini",
        stage: "final",
      },
      requireStreaming: true,
      allowTools: false,
    });

    expect(out[0]).toEqual({ provider: "openai", model: "gpt-5.2" });
    expect(out[1]).toEqual({ provider: "gemini", model: "gemini-2.5-flash" });
  });

  test("groundingWeak escalates draft route into authority lane", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const out = router.route({
      env: "production",
      stage: "draft",
      answerMode: "doc_grounded_multi",
      groundingWeak: true,
      requireStreaming: true,
      allowTools: false,
    });

    expect(out.reason).toBe("hallucination_guard");
    expect(out.stage).toBe("final");
    expect(out.provider).toBe("openai");
    expect(out.model).toBe("gpt-5.2-2026-01-15");
  });

  test("unhealthy primary provider falls back using policy ladder", () => {
    const router = new LlmRouterService(makePolicyAwareLoader());
    const out = router.route({
      env: "production",
      stage: "draft",
      answerMode: "nav_pills",
      requireStreaming: true,
      allowTools: false,
      providerHealth: [
        {
          provider: "gemini",
          ok: false,
        },
      ],
    });

    expect(out.provider).toBe("openai");
    expect(out.model).toBe("gpt-5.2-2026-01-15");
    expect(out.policyRuleId).toBe("provider_fallbacks");
  });
});
