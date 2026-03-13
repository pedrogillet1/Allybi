import type {
  EnvName,
  LlmProviderId,
  LlmModelId,
  LlmRouteReason,
} from "../types/llm.types";

export interface BankLoader {
  getBank<T = unknown>(bankId: string): T;
}

export interface ProviderHealth {
  provider: LlmProviderId;
  ok: boolean;
  models?: Record<string, { ok: boolean }>;
}

export interface RouteContext {
  env: EnvName;
  stage: "draft" | "final";
  intentFamily?: string | null;
  operator?: string | null;
  operatorFamily?: string | null;
  answerMode?: string | null;
  reasonCodes?: string[];
  numericStrict?: boolean;
  quoteStrict?: boolean;
  hallucinationGuard?: boolean;
  groundingWeak?: boolean;
  requireStreaming?: boolean;
  allowTools?: boolean;
  latencyBudgetMs?: number;
  providerHealth?: ProviderHealth[];
  force?: { provider: LlmProviderId; model: LlmModelId } | null;
}

export type CapModel = {
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  maxOutputTokens?: number;
  maxInputTokens?: number;
  pinnedVersion?: string;
};

export type CapProvider = {
  enabled?: boolean;
  models?: Record<string, CapModel>;
  defaults?: {
    draft?: string;
    final?: string;
  };
};

export type ProviderCapabilitiesBank = {
  _meta?: Record<string, unknown>;
  config?: { enabled?: boolean };
  defaults?: {
    draft?: { provider: LlmProviderId; model: LlmModelId };
    final?: { provider: LlmProviderId; model: LlmModelId };
  };
  providers?: Record<string, CapProvider>;
};

export type ProviderFallbacksBank = {
  _meta?: Record<string, unknown>;
  config?: { enabled?: boolean };
  fallbacks?: Array<{
    when: {
      provider?: LlmProviderId;
      model?: LlmModelId;
      needStreaming?: boolean;
      needTools?: boolean;
    };
    try: Array<{ provider: LlmProviderId; model: LlmModelId }>;
  }>;
};

export type CompositionLanePolicyBank = {
  _meta?: Record<string, unknown>;
  config?: { enabled?: boolean };
  lanes?: Array<{
    id?: string;
    when?: {
      stage?: "draft" | "final";
      reasons?: LlmRouteReason[];
      answerModes?: string[];
      answerModePrefixes?: string[];
    };
    route?: {
      provider?: LlmProviderId;
      model?: LlmModelId;
      modelFamily?: string;
    };
    qualityReason?: string;
    policyRuleId?: string;
  }>;
};

export type FeatureFlagsBank = {
  _meta?: Record<string, unknown>;
  config?: { enabled?: boolean };
  flags?: Record<string, unknown>;
};

export interface RouterLogger {
  warn(msg: string, meta?: Record<string, unknown>): void;
}

export type PrimaryTarget = {
  provider: LlmProviderId;
  model: LlmModelId;
  stage: "draft" | "final";
  lane?: string;
  modelFamily?: string;
  policyRuleId?: string;
  qualityReason?: string;
};

export function bool(v: unknown): boolean {
  return v === true;
}

export function isNavPills(ctx: RouteContext): boolean {
  return (
    (ctx.answerMode ?? "") === "nav_pills" ||
    (ctx.operatorFamily ?? "") === "file_actions"
  );
}

export function hasAnyReason(ctx: RouteContext, codes: string[]): boolean {
  const s = new Set((ctx.reasonCodes ?? []).map(String));
  return codes.some((c) => s.has(c));
}

export function pickHealth(
  health: ProviderHealth[] | undefined,
  provider: LlmProviderId,
  model: LlmModelId,
): { ok: boolean } {
  if (!health || !health.length) return { ok: true };
  const p = health.find((h) => h.provider === provider);
  if (!p) return { ok: true };
  if (p.ok === false) return { ok: false };
  const m = p.models?.[model];
  if (m && m.ok === false) return { ok: false };
  return { ok: true };
}
