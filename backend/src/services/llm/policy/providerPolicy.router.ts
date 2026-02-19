// src/services/llm/policy/providerPolicy.router.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ProviderPolicyRouter (Allybi, ChatGPT-parity)
 * ------------------------------------------
 * This router applies provider-level policy decisions BEFORE the LLM call:
 *  - capability checks (streaming/tools/developer role/images)
 *  - model allowlists
 *  - provider preference rules (Gemini Flash for draft, OpenAI GPT-5.2 for final, Local fallback)
 *  - safety shaping hints (no images, no debug dumps)
 *
 * It is NOT the same as llmRouter.service.ts:
 *  - llmRouter.service.ts chooses provider/model based on Allybi gates and stage.
 *  - This policy router enforces provider constraints and chooses safe fallbacks if needed.
 *
 * Inputs:
 *  - LlmRequest (route already chosen)
 *  - Provider capabilities bank + fallback bank
 *
 * Outputs:
 *  - Potentially rewritten LlmRequest.route (provider/model)
 *  - Constraints updated (e.g. disallowTools)
 *
 * Banks:
 *  - llm/policy/providerCapabilities.any.json
 *  - llm/policy/providerFallbacks.any.json
 *  - manifest/feature_flags.any.json (optional)
 */

import type { LlmRequest, LlmRoutePlan } from "../types/llm.types";

export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

type ProviderCapabilitiesBank = {
  config?: { enabled?: boolean };
  providers?: Record<
    string,
    {
      enabled?: boolean;
      defaults?: { draft?: string; final?: string };
      models?: Record<
        string,
        {
          supportsStreaming?: boolean;
          supportsTools?: boolean;
          supportsDeveloperRole?: boolean;
          supportsImages?: boolean;
        }
      >;
    }
  >;
};

type ProviderFallbacksBank = {
  config?: { enabled?: boolean };
  fallbacks?: Array<{
    when: {
      provider?: string;
      model?: string;
      needStreaming?: boolean;
      needTools?: boolean;
      needDeveloperRole?: boolean;
      needImages?: boolean;
    };
    try: Array<{ provider: string; model: string }>;
  }>;
};

type FeatureFlagsBank = {
  flags?: Record<string, any>;
};

function bool(v: any): boolean {
  return v === true;
}

function uniqKey(p: string, m: string) {
  return `${p}:${m}`;
}

function matchesWhen(when: any, ctx: any): boolean {
  if (!when) return true;

  const okProvider = !when.provider || when.provider === ctx.provider;
  const okModel = !when.model || when.model === ctx.model;
  const okStreaming =
    when.needStreaming == null
      ? true
      : when.needStreaming === ctx.needStreaming;
  const okTools =
    when.needTools == null ? true : when.needTools === ctx.needTools;
  const okDev =
    when.needDeveloperRole == null
      ? true
      : when.needDeveloperRole === ctx.needDeveloperRole;
  const okImages =
    when.needImages == null ? true : when.needImages === ctx.needImages;

  return okProvider && okModel && okStreaming && okTools && okDev && okImages;
}

export class ProviderPolicyRouter {
  constructor(private readonly bankLoader: BankLoader) {}

  /**
   * Enforce provider/model capability policy and apply deterministic fallbacks if needed.
   */
  enforce(request: LlmRequest): {
    request: LlmRequest;
    changed: boolean;
    notes: string[];
  } {
    const notes: string[] = [];
    let changed = false;

    const caps = this.safeGetBank<ProviderCapabilitiesBank>(
      "providerCapabilities",
    );
    const fallbacks =
      this.safeGetBank<ProviderFallbacksBank>("providerFallbacks");
    const flags = this.safeGetBank<FeatureFlagsBank>("feature_flags");

    const feature = flags?.flags ?? {};
    const enableMultiProvider = feature.enable_multi_provider !== false;

    // If banks disabled/missing, do minimal enforcement (no images)
    const provider = request.route.provider;
    const model = request.route.model;

    const needStreaming =
      bool(request.route.constraints?.requireStreaming) ||
      request.options?.stream !== false;
    const needTools = request.route.constraints?.disallowTools
      ? false
      : Array.isArray(request.tools) && request.tools.length > 0;
    const needDeveloperRole = this.containsDeveloperRole(request.messages);
    const needImages = this.containsImages(request.messages);

    // Hard rule: Allybi lane disallows images in LLM input by default.
    // If images exist, we enforce disallowImages, and caller should remove image parts upstream.
    if (needImages) {
      notes.push("images_present_in_messages");
    }

    // Check capability for current target
    const supported = this.isSupported(caps, provider, model, {
      needStreaming,
      needTools,
      needDeveloperRole,
      needImages,
    });

    if (supported) {
      // Enforce constraints if needed (e.g. model does not support tools)
      const route = { ...request.route };
      const modelCaps = this.getModelCaps(caps, provider, model);

      if (needTools && modelCaps && modelCaps.supportsTools === false) {
        route.constraints = {
          ...(route.constraints ?? {}),
          disallowTools: true,
        };
        notes.push("tools_disabled_by_capability");
        changed = true;
      }

      if (needImages && modelCaps && modelCaps.supportsImages === false) {
        route.constraints = {
          ...(route.constraints ?? {}),
          disallowImages: true,
        };
        notes.push("images_disabled_by_capability");
        changed = true;
      }

      if (changed) {
        return { request: { ...request, route }, changed: true, notes };
      }
      return { request, changed: false, notes };
    }

    // If multi-provider disabled, keep as-is (caller will error)
    if (!enableMultiProvider) {
      notes.push("target_not_supported_and_multiprovider_disabled");
      return { request, changed: false, notes };
    }

    // Build fallback candidates from bank
    const candidates: Array<{ provider: string; model: string }> = [];

    if (
      fallbacks?.config?.enabled !== false &&
      Array.isArray(fallbacks.fallbacks)
    ) {
      for (const rule of fallbacks.fallbacks) {
        if (
          matchesWhen(rule.when, {
            provider,
            model,
            needStreaming,
            needTools,
            needDeveloperRole,
            needImages,
          })
        ) {
          for (const t of rule.try ?? [])
            candidates.push({ provider: t.provider, model: t.model });
        }
      }
    }

    // Deterministic built-in fallback order (if bank empty)
    if (candidates.length === 0) {
      candidates.push(
        { provider: "gemini", model: "gemini-2.5-flash" },
        { provider: "openai", model: "gpt-5-mini" },
        { provider: "openai", model: "gpt-5.2" },
        { provider: "local", model: "local-default" },
      );
    }

    // Choose first supported candidate
    for (const c of candidates) {
      const ok = this.isSupported(caps, c.provider, c.model, {
        needStreaming,
        needTools,
        needDeveloperRole,
        needImages,
      });
      if (!ok) continue;

      notes.push(
        `fallback_applied:${provider}:${model}=>${c.provider}:${c.model}`,
      );
      changed = true;

      const nextRoute: LlmRoutePlan = {
        ...request.route,
        provider: c.provider as any,
        model: c.model as any,
        constraints: {
          ...(request.route.constraints ?? {}),
          requireStreaming: needStreaming,
          disallowTools: needTools ? false : true,
          disallowImages: true,
        },
      };

      return { request: { ...request, route: nextRoute }, changed, notes };
    }

    // No supported fallback found; keep original.
    notes.push("no_supported_fallback_found");
    return { request, changed: false, notes };
  }

  // -----------------------------
  // Capability checks
  // -----------------------------

  private isSupported(
    caps: ProviderCapabilitiesBank | null,
    provider: string,
    model: string,
    need: {
      needStreaming: boolean;
      needTools: boolean;
      needDeveloperRole: boolean;
      needImages: boolean;
    },
  ): boolean {
    if (!caps?.providers) return true;

    const p = caps.providers[provider];
    if (!p) return true;

    if (p.enabled === false) return false;

    const m = p.models?.[model];
    if (!m) return true;

    if (need.needStreaming && m.supportsStreaming === false) return false;
    if (need.needTools && m.supportsTools === false) return false;
    if (need.needDeveloperRole && m.supportsDeveloperRole === false)
      return false;
    if (need.needImages && m.supportsImages === false) return false;

    return true;
  }

  private getModelCaps(
    caps: ProviderCapabilitiesBank | null,
    provider: string,
    model: string,
  ): any | null {
    if (!caps?.providers) return null;
    const p = caps.providers[provider];
    if (!p?.models) return null;
    return p.models[model] ?? null;
  }

  private containsDeveloperRole(messages: any[]): boolean {
    return (
      Array.isArray(messages) && messages.some((m) => m?.role === "developer")
    );
  }

  private containsImages(messages: any[]): boolean {
    if (!Array.isArray(messages)) return false;
    for (const m of messages) {
      if (
        Array.isArray(m?.parts) &&
        m.parts.some((p: any) => p?.type === "image_url")
      )
        return true;
    }
    return false;
  }

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}

export default ProviderPolicyRouter;
