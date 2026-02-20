import { describe, expect, it } from "@jest/globals";

import { MemoryPolicyEngine } from "./memoryPolicyEngine.service";
import { RuntimePolicyError } from "../../modules/chat/runtime/runtimePolicyError";

function makeLoader(banks: Record<string, any>) {
  return {
    getBank<T = unknown>(bankId: string): T {
      if (!(bankId in banks)) throw new Error(`missing ${bankId}`);
      return banks[bankId] as T;
    },
    getOptionalBank<T = unknown>(bankId: string): T | null {
      return (banks[bankId] as T) || null;
    },
  };
}

function buildPolicyBank(overrides: Record<string, unknown> = {}) {
  return {
    config: {
      strict: true,
      failClosedInProd: true,
      integrationHooks: {
        conversationStateSchemaBankId: "conversation_state_schema",
        stateUpdateRulesBankId: "state_update_rules",
        memoryDecayRulesBankId: "memory_decay_rules",
        scopeResolutionBankId: "scope_resolution",
        followupDetectionBankId: "followup_detection",
        qualityGatesBankId: "quality_gates",
      },
      runtimeTuning: {
        recentContextLimit: 180,
        historyClampMax: 320,
      },
    },
    privacy: {
      doNotPersistExtractedPIIValues: true,
      doNotPersistRawNumbersFromDocs: true,
      persistOnlyStructuralHints: ["activeDocRef"],
      debugTracesNotPersisted: true,
    },
    ...overrides,
  };
}

describe("MemoryPolicyEngine", () => {
  it("fails closed in production when integration hook banks are missing", () => {
    const engine = new MemoryPolicyEngine({
      env: "production",
      bankLoader: makeLoader({
        memory_policy: buildPolicyBank(),
      }),
    });

    expect(() => engine.resolveRuntimeConfig()).toThrow(RuntimePolicyError);
  });

  it("allows missing hook banks in dev and exposes the missing list", () => {
    const engine = new MemoryPolicyEngine({
      env: "dev",
      bankLoader: makeLoader({
        memory_policy: buildPolicyBank(),
      }),
    });

    const runtime = engine.resolveRuntimeConfig();
    expect(runtime.missingHookBanks.length).toBeGreaterThan(0);
    expect(runtime.strict).toBe(true);
  });

  it("passes when all integration hook banks exist", () => {
    const banks = {
      memory_policy: buildPolicyBank(),
      conversation_state_schema: {},
      state_update_rules: {},
      memory_decay_rules: {},
      scope_resolution: {},
      followup_detection: {},
      quality_gates: {},
    };
    const engine = new MemoryPolicyEngine({
      env: "production",
      bankLoader: makeLoader(banks),
    });
    const runtime = engine.resolveRuntimeConfig();
    expect(runtime.missingHookBanks).toEqual([]);
    expect(runtime.privacy.doNotPersistExtractedPIIValues).toBe(true);
  });
});
