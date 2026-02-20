import { getBankLoaderInstance } from "../core/banks/bankLoader.service";
import { RuntimePolicyError } from "../../modules/chat/runtime/runtimePolicyError";

type EnvName = "production" | "staging" | "dev" | "local";

type MemoryPolicyBank = {
  config?: {
    strict?: boolean;
    failClosedInProd?: boolean;
    integrationHooks?: Record<string, unknown>;
    runtimeTuning?: Record<string, unknown>;
  };
  privacy?: Record<string, unknown>;
};

export interface MemoryPolicyIntegrationHookIds {
  conversationStateSchemaBankId: string;
  stateUpdateRulesBankId: string;
  memoryDecayRulesBankId: string;
  scopeResolutionBankId: string;
  followupDetectionBankId: string;
  qualityGatesBankId: string;
}

export interface MemoryPolicyPrivacyConfig {
  doNotPersistExtractedPIIValues: boolean;
  doNotPersistRawNumbersFromDocs: boolean;
  persistOnlyStructuralHints: string[];
  debugTracesNotPersisted: boolean;
}

export interface MemoryPolicyRuntimeConfig {
  env: EnvName;
  strict: boolean;
  failClosedInProd: boolean;
  runtimeTuning: Record<string, unknown>;
  integrationHooks: MemoryPolicyIntegrationHookIds;
  missingHookBanks: string[];
  privacy: MemoryPolicyPrivacyConfig;
}

interface BankLoaderLike {
  getBank<T = unknown>(bankId: string): T;
  getOptionalBank<T = unknown>(bankId: string): T | null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function normalizeEnv(input?: string): EnvName {
  const raw = String(input || "").toLowerCase();
  if (raw === "production") return "production";
  if (raw === "staging") return "staging";
  if (raw === "test" || raw === "development" || raw === "dev") return "dev";
  return "local";
}

const REQUIRED_HOOK_KEYS: Array<keyof MemoryPolicyIntegrationHookIds> = [
  "conversationStateSchemaBankId",
  "stateUpdateRulesBankId",
  "memoryDecayRulesBankId",
  "scopeResolutionBankId",
  "followupDetectionBankId",
  "qualityGatesBankId",
];

function shouldFailClosed(config: {
  env: EnvName;
  strict: boolean;
  failClosedInProd: boolean;
}): boolean {
  if (!config.strict) return false;
  if (config.env === "production" || config.env === "staging") {
    return config.failClosedInProd;
  }
  return false;
}

export class MemoryPolicyEngine {
  private readonly bankLoader: BankLoaderLike;
  private readonly env: EnvName;
  private cachedConfig: MemoryPolicyRuntimeConfig | null = null;

  constructor(opts?: { bankLoader?: BankLoaderLike; env?: EnvName }) {
    this.bankLoader = opts?.bankLoader || getBankLoaderInstance();
    this.env = opts?.env || normalizeEnv(process.env.NODE_ENV);
  }

  resolveRuntimeConfig(forceReload = false): MemoryPolicyRuntimeConfig {
    if (this.cachedConfig && !forceReload) return this.cachedConfig;

    let policyBank: MemoryPolicyBank;
    try {
      policyBank = this.bankLoader.getBank<MemoryPolicyBank>("memory_policy");
    } catch {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_MISSING",
        "Required bank missing: memory_policy",
      );
    }

    const config = asObject(policyBank?.config);
    const runtimeTuning = asObject(config.runtimeTuning);
    if (!Object.keys(runtimeTuning).length) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning is required",
      );
    }

    const strict = toBoolean(config.strict, true);
    const failClosedInProd = toBoolean(config.failClosedInProd, true);

    const integrationHooksRaw = asObject(config.integrationHooks);
    const integrationHooks = {} as MemoryPolicyIntegrationHookIds;
    for (const key of REQUIRED_HOOK_KEYS) {
      const bankId = String(integrationHooksRaw[key] || "").trim();
      if (!bankId) {
        throw new RuntimePolicyError(
          "RUNTIME_POLICY_INVALID",
          `memory_policy.config.integrationHooks.${key} is required`,
        );
      }
      integrationHooks[key] = bankId;
    }

    const missingHookBanks = Object.values(integrationHooks).filter(
      (bankId) => !this.bankLoader.getOptionalBank(bankId),
    );
    if (
      missingHookBanks.length > 0 &&
      shouldFailClosed({
        env: this.env,
        strict,
        failClosedInProd,
      })
    ) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_MISSING",
        `memory_policy integration hook banks missing: ${missingHookBanks.join(", ")}`,
      );
    }

    const privacyRaw = asObject(policyBank?.privacy);
    const persistOnlyStructuralHints = Array.isArray(
      privacyRaw.persistOnlyStructuralHints,
    )
      ? privacyRaw.persistOnlyStructuralHints
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      : [];

    const privacy: MemoryPolicyPrivacyConfig = {
      doNotPersistExtractedPIIValues: toBoolean(
        privacyRaw.doNotPersistExtractedPIIValues,
        true,
      ),
      doNotPersistRawNumbersFromDocs: toBoolean(
        privacyRaw.doNotPersistRawNumbersFromDocs,
        true,
      ),
      persistOnlyStructuralHints,
      debugTracesNotPersisted: toBoolean(
        privacyRaw.debugTracesNotPersisted,
        true,
      ),
    };

    this.cachedConfig = {
      env: this.env,
      strict,
      failClosedInProd,
      runtimeTuning,
      integrationHooks,
      missingHookBanks,
      privacy,
    };

    return this.cachedConfig;
  }
}
