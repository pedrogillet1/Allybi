import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../banks/bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "../banks/bankLoader.service";
import { FallbackDecisionPolicyService } from "./fallbackDecisionPolicy.service";

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

function buildPack(overrides?: Record<string, unknown>): any {
  return {
    scope: {
      candidateDocIds: [],
      hardScopeActive: false,
      activeDocId: null,
      ...(overrides?.scope || {}),
    },
    stats: {
      topScore: null,
      ...(overrides?.stats || {}),
    },
    evidence: Array.isArray(overrides?.evidence) ? overrides?.evidence : [],
    debug: {
      reasonCodes: [],
      ...(overrides?.debug || {}),
    },
  };
}

describe("FallbackDecisionPolicyService", () => {
  beforeEach(() => {
    mockedGetOptionalBank.mockReset();
    mockedGetOptionalBank.mockImplementation((bankId: string) => {
      if (bankId === "fallback_processing") {
        return {
          config: { enabled: true },
          rules: [
            {
              id: "fp_scope_hard_constraints_empty",
              priority: 110,
              when: {
                all: [
                  { path: "signals.hardScopeActive", op: "eq", value: true },
                  { path: "metrics.retrievedChunks", op: "eq", value: 0 },
                ],
              },
              reasonCode: "scope_hard_constraints_empty",
              severity: "high",
              action: { fallbackType: "scope_empty" },
            },
            {
              id: "fp_low_confidence",
              priority: 80,
              when: {
                all: [{ path: "metrics.topConfidence", op: "lt", value: 0.55 }],
              },
              reasonCode: "low_confidence",
              severity: "medium",
            },
          ],
        } as any;
      }
      if (bankId === "fallback_scope_empty") {
        return { config: { enabled: true }, rules: [] } as any;
      }
      if (bankId === "fallback_not_found_scope") {
        return { config: { enabled: true }, rules: [] } as any;
      }
      if (bankId === "fallback_extraction_recovery") {
        return { config: { enabled: true }, rules: [] } as any;
      }
      if (bankId === "fallback_router") {
        return {
          config: {
            enabled: true,
            defaults: { action: "ask_one_question", telemetryReason: "UNKNOWN" },
          },
          rules: [
            {
              when: { reasonCodeIn: ["scope_hard_constraints_empty"] },
              do: { action: "ask_one_question", telemetryReason: "SCOPE_LOCK" },
            },
            {
              when: { reasonCodeIn: ["low_confidence"] },
              do: {
                action: "regen_with_stricter_model",
                telemetryReason: "WEAK_EVIDENCE",
              },
            },
          ],
        } as any;
      }
      return null as any;
    });
  });

  test("prefers explicit retrieval debug reason codes", () => {
    const service = new FallbackDecisionPolicyService();
    const decision = service.resolve(
      {
        userId: "u_1",
        message: "help",
        attachedDocumentIds: [],
      } as any,
      buildPack({
        debug: { reasonCodes: ["no_docs_indexed"] },
      }),
    );
    expect(decision?.reasonCode).toBe("no_docs_indexed");
    expect(decision?.selectedBankId).toBe("retrieval_debug");
  });

  test("matches fallback rule banks for hard scope empty", () => {
    const service = new FallbackDecisionPolicyService();
    const decision = service.resolve(
      {
        userId: "u_1",
        message: "find this",
        context: { signals: { explicitDocRef: true } },
      } as any,
      buildPack({
        scope: { hardScopeActive: true, candidateDocIds: [] },
        evidence: [],
      }),
    );
    expect(decision?.reasonCode).toBe("scope_hard_constraints_empty");
    expect(decision?.selectedBankId).toBe("fallback_processing");
    expect(decision?.selectedRuleId).toBe("fp_scope_hard_constraints_empty");
  });

  test("supports low confidence fallback when retrieval returned no evidence", () => {
    const service = new FallbackDecisionPolicyService();
    const reason = service.resolveReasonCode(
      {
        userId: "u_1",
        message: "answer",
      } as any,
      buildPack({
        stats: { topScore: 0.3 },
        evidence: [],
      }),
    );
    expect(reason).toBe("low_confidence");
  });
});
