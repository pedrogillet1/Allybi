import type { LlmModelId, LlmProviderId } from "../types/llm.types";
import type { ProviderFallbacksBank } from "./llmRouter.shared";

export function computeFallbackList(
  primary: {
    provider: LlmProviderId;
    model: LlmModelId;
    stage: "draft" | "final";
  },
  needStreaming: boolean,
  needTools: boolean,
  fallbacks: ProviderFallbacksBank | null,
  enableMultiProvider: boolean,
): Array<{ provider: LlmProviderId; model: LlmModelId }> {
  const out: Array<{ provider: LlmProviderId; model: LlmModelId }> = [];
  const fallbackRules =
    fallbacks?.config?.enabled !== false && Array.isArray(fallbacks?.fallbacks)
      ? fallbacks.fallbacks
      : [];

  if (fallbackRules.length) {
    for (const rule of fallbackRules) {
      const w = rule.when ?? {};
      const matchProvider = !w.provider || w.provider === primary.provider;
      const matchModel = !w.model || w.model === primary.model;
      const matchStreaming =
        w.needStreaming == null ? true : w.needStreaming === needStreaming;
      const matchTools = w.needTools == null ? true : w.needTools === needTools;
      if (matchProvider && matchModel && matchStreaming && matchTools) {
        for (const t of rule.try ?? []) {
          out.push({ provider: t.provider, model: t.model });
        }
      }
    }
  }

  const primaryKey = `${primary.provider}:${primary.model}`;
  const add = (provider: LlmProviderId, model: LlmModelId) => {
    const key = `${provider}:${model}`;
    if (key === primaryKey) return;
    if (out.some((item) => `${item.provider}:${item.model}` === key)) return;
    out.push({ provider, model });
  };

  if (enableMultiProvider) {
    if (primary.provider === "gemini") {
      if (primary.stage === "final") {
        add("openai", "gpt-5.2");
        add("openai", "gpt-5-mini");
      } else {
        add("openai", "gpt-5-mini");
        add("openai", "gpt-5.2");
      }
      add("local", "local-default");
    } else if (primary.provider === "openai") {
      if (primary.model === "gpt-5-mini") {
        add("openai", "gpt-5.2");
        add("gemini", "gemini-2.5-flash");
      } else {
        add("gemini", "gemini-2.5-flash");
        add("openai", "gpt-5-mini");
      }
      add("local", "local-default");
    } else if (primary.stage === "final") {
      add("openai", "gpt-5.2");
      add("gemini", "gemini-2.5-flash");
      add("openai", "gpt-5-mini");
    } else {
      add("gemini", "gemini-2.5-flash");
      add("openai", "gpt-5-mini");
      add("openai", "gpt-5.2");
    }
  }

  return out;
}
