import "reflect-metadata";
import { describe, expect, test } from "@jest/globals";
import {
  CentralizedChatRuntimeDelegate,
  enforceLanguageContract,
  ensureFallbackSourceCoverage,
  resolveSourceInvariantFailureCode,
  shouldApplyPreEnforcerTrim,
} from "./CentralizedChatRuntimeDelegate";

describe("CentralizedChatRuntimeDelegate pre-enforcer trim", () => {
  test("returns false when requested output tokens are not provided", () => {
    expect(
      shouldApplyPreEnforcerTrim({
        telemetry: { finishReason: "length" },
        finalText: "Incomplete output from provider that stops abruptly at",
        requestedMaxOutputTokens: null,
      }),
    ).toBe(false);
  });

  test("returns false when provider did not overflow", () => {
    expect(
      shouldApplyPreEnforcerTrim({
        telemetry: { finishReason: "stop" },
        finalText: "Complete output.",
        requestedMaxOutputTokens: 1200,
      }),
    ).toBe(false);
  });

  test("returns false when provider overflow happened but semantic output is complete", () => {
    expect(
      shouldApplyPreEnforcerTrim({
        telemetry: { finishReason: "length" },
        finalText: "This answer is complete and ends cleanly with punctuation.",
        requestedMaxOutputTokens: 1200,
      }),
    ).toBe(false);
  });

  test("returns true when provider overflow and semantic incompleteness both occur", () => {
    expect(
      shouldApplyPreEnforcerTrim({
        telemetry: { finishReason: "max_tokens" },
        finalText:
          "This answer keeps listing evidence across sections and then abruptly stops in the middle of a",
        requestedMaxOutputTokens: 1200,
      }),
    ).toBe(true);
  });
});

describe("CentralizedChatRuntimeDelegate provider overflow repair", () => {
  test("replaces incomplete overflow narrative with complete localized fallback", () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as CentralizedChatRuntimeDelegate;

    const repaired = (delegate as any).repairProviderOverflowStructuredOutput(
      'Com base no documento "Trabalho_projeto_.',
      { finishReason: "length" },
      "pt",
    );

    expect(repaired).toBe(
      "A resposta foi interrompida antes de concluir. Posso reenviar em bullets para garantir completude.",
    );
  });

  test("does NOT replace enforcer-trimmed text that ends cleanly", () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as CentralizedChatRuntimeDelegate;

    const cleanText =
      "The budget was approved and all items were allocated correctly.";
    const repaired = (delegate as any).repairProviderOverflowStructuredOutput(
      cleanText,
      { finishReason: "length" },
      "en",
      ["SOFT_MAX_TOKENS_TRIMMED"],
    );

    // When enforcementRepairs are passed, the classifier sees the trim repair
    // and recognizes the text ends cleanly — so it should NOT be replaced.
    expect(repaired).toBe(cleanText);
  });

  test("truncated bullet list returns list-specific fallback", () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as CentralizedChatRuntimeDelegate;

    // Text ends mid-sentence after bullet items (not on a clean bullet line)
    const bulletText =
      "Key findings:\n- Revenue increased by 15%\n- Costs decreased by 8%\nThe margin improved but the detailed breakdown shows that";
    const repaired = (delegate as any).repairProviderOverflowStructuredOutput(
      bulletText,
      { finishReason: "length" },
      "en",
    );

    expect(repaired).toContain("list was cut");
  });

  test("truncated numbered list returns numbered-list-specific fallback", () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as CentralizedChatRuntimeDelegate;

    // Text ends mid-sentence after numbered items (not on a clean list line)
    const numberedText =
      "Steps to complete:\n1. Open the dashboard\n2. Navigate to settings\nUpdate the configuration for the";
    const repaired = (delegate as any).repairProviderOverflowStructuredOutput(
      numberedText,
      { finishReason: "length" },
      "en",
    );

    expect(repaired).toContain("numbered list was cut");
  });

  test("enforcer-trimmed text with surviving unclosed backtick takes enforcer path", () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as CentralizedChatRuntimeDelegate;

    // Enforcer trimmed text that still has an unclosed backtick
    const incompleteText = "The field `status is pending and the";
    const repaired = (delegate as any).repairProviderOverflowStructuredOutput(
      incompleteText,
      { finishReason: "length" },
      "en",
      ["HARD_MAX_TOKENS_TRIMMED"],
    );

    // The classifier detects enforcer trim + semantic incompleteness
    // and returns occurred:true with reason "enforcer_trimmed".
    // Since semantic truncation occurred, the overflow repair DOES fire.
    expect(repaired).not.toBe(incompleteText);
  });
});

describe("CentralizedChatRuntimeDelegate answer mode routing", () => {
  test("forces nav_pills for open operator", () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as any;
    delegate.collectSemanticSignals = () => ({
      userAskedForTable: false,
      tableExpected: false,
      userAskedForQuote: false,
    });

    const mode = delegate.resolveAnswerMode(
      {
        userId: "user-1",
        message: "open the budget sheet",
        meta: { operator: "open" },
      },
      { evidence: [] },
    );

    expect(mode).toBe("nav_pills");
  });

  test("forces nav_pills for navigate operator", () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as any;
    delegate.collectSemanticSignals = () => ({
      userAskedForTable: false,
      tableExpected: false,
      userAskedForQuote: false,
    });

    const mode = delegate.resolveAnswerMode(
      {
        userId: "user-1",
        message: "navigate to indemnity clause",
        meta: { operator: "navigate" },
      },
      { evidence: [{ docId: "doc-1" }] },
    );

    expect(mode).toBe("nav_pills");
  });
});

describe("CentralizedChatRuntimeDelegate fallback signal resolution", () => {
  function createDelegateForFallbackTests() {
    return Object.create(CentralizedChatRuntimeDelegate.prototype) as any;
  }

  test("suppresses low_confidence fallback prompt when evidence exists", () => {
    const delegate = createDelegateForFallbackTests();
    delegate.fallbackDecisionPolicy = {
      resolve: () => ({
        reasonCode: "low_confidence",
        selectedBankId: "fallback_processing",
        selectedRuleId: "fp_low_confidence",
        severity: "medium",
        fallbackType: null,
        routerAction: "regen_with_stricter_model",
        routerTelemetryReason: "low_confidence",
      }),
    };

    const signal = (delegate as any).resolveFallbackSignal(
      { userId: "u1", message: "What does this mean?" },
      { evidence: [{ docId: "doc-1" }] },
    );

    expect(signal.reasonCode).toBeUndefined();
    expect(signal.telemetryReasonCode).toBe("low_confidence");
    expect(signal.policyMeta?.reasonCode).toBe("low_confidence");
    expect(signal.policyMeta?.suppressedForPrompt).toBe(true);
    expect(signal.policyMeta?.suppressionReason).toBe(
      "low_confidence_with_evidence",
    );
    expect(signal.policyMeta?.userFacingReasonCode).toBeNull();
  });

  test("keeps low_confidence fallback prompt when there is no evidence", () => {
    const delegate = createDelegateForFallbackTests();
    delegate.fallbackDecisionPolicy = {
      resolve: () => ({
        reasonCode: "low_confidence",
        selectedBankId: "fallback_processing",
        selectedRuleId: "fp_low_confidence",
        severity: "medium",
        fallbackType: null,
        routerAction: "regen_with_stricter_model",
        routerTelemetryReason: "low_confidence",
      }),
    };

    const signal = (delegate as any).resolveFallbackSignal(
      { userId: "u1", message: "Need an answer" },
      { evidence: [] },
    );

    expect(signal.reasonCode).toBe("low_confidence");
    expect(signal.telemetryReasonCode).toBe("low_confidence");
    expect(signal.policyMeta?.suppressedForPrompt).toBe(false);
    expect(signal.policyMeta?.userFacingReasonCode).toBe("low_confidence");
  });

  test("does not suppress non-low-confidence fallback reasons", () => {
    const delegate = createDelegateForFallbackTests();
    delegate.fallbackDecisionPolicy = {
      resolve: () => ({
        reasonCode: "scope_hard_constraints_empty",
        selectedBankId: "fallback_scope_empty",
        selectedRuleId: "scope_empty",
        severity: "high",
        fallbackType: "scoped_not_found",
        routerAction: "fallback",
        routerTelemetryReason: "scope_hard_constraints_empty",
      }),
    };

    const signal = (delegate as any).resolveFallbackSignal(
      { userId: "u1", message: "Find this in my doc" },
      { evidence: [{ docId: "doc-1" }] },
    );

    expect(signal.reasonCode).toBe("scope_hard_constraints_empty");
    expect(signal.policyMeta?.suppressedForPrompt).toBe(false);
    expect(signal.policyMeta?.userFacingReasonCode).toBe(
      "scope_hard_constraints_empty",
    );
  });

  test("keeps unknown fallback reasons telemetry-only", () => {
    const delegate = createDelegateForFallbackTests();
    delegate.fallbackDecisionPolicy = {
      resolve: () => ({
        reasonCode: "unknown_reason",
        selectedBankId: "fallback_processing",
        selectedRuleId: "unknown",
        severity: "medium",
        fallbackType: null,
        routerAction: "ask_one_question",
        routerTelemetryReason: "UNKNOWN",
      }),
    };

    const signal = (delegate as any).resolveFallbackSignal(
      { userId: "u1", message: "Need help" },
      { evidence: [] },
    );

    expect(signal.reasonCode).toBeUndefined();
    expect(signal.telemetryReasonCode).toBe("unknown_reason");
    expect(signal.policyMeta?.suppressedForPrompt).toBe(true);
    expect(signal.policyMeta?.suppressionReason).toBe("non_user_facing_reason");
  });

  test("buildRuntimeMeta carries telemetry fallback separately from user-facing reason", () => {
    const delegate = createDelegateForFallbackTests();
    const meta = (delegate as any).buildRuntimeMeta(
      { preferredLanguage: "en", meta: {} },
      { evidence: [{ docId: "doc-1" }] },
      "doc_grounded_single",
      null,
      {
        reasonCode: undefined,
        telemetryReasonCode: "low_confidence",
        policyMeta: { reasonCode: "low_confidence", routerAction: "regen" },
      },
    );

    expect(meta.fallbackReasonCode).toBeUndefined();
    expect(meta.fallbackTelemetry).toEqual({
      reasonCode: "low_confidence",
      policy: { reasonCode: "low_confidence", routerAction: "regen" },
    });
  });
});

describe("CentralizedChatRuntimeDelegate source invariants", () => {
  test("returns missing_provenance when doc-grounded answer has zero filtered sources", () => {
    const failure = resolveSourceInvariantFailureCode({
      answerMode: "doc_grounded_single",
      filteredSources: [],
    });
    expect(failure).toBe("missing_provenance");
  });

  test("returns null for non-doc-grounded answer even with zero sources", () => {
    const failure = resolveSourceInvariantFailureCode({
      answerMode: "general_answer",
      filteredSources: [],
    });
    expect(failure).toBeNull();
  });

  test("returns null when doc-grounded answer still has scoped sources", () => {
    const failure = resolveSourceInvariantFailureCode({
      answerMode: "doc_grounded_table",
      filteredSources: [{ documentId: "doc-1" }],
    });
    expect(failure).toBeNull();
  });
});

describe("CentralizedChatRuntimeDelegate language contract", () => {
  test("does not adjust short neutral english responses", () => {
    const result = enforceLanguageContract({
      text: "Yes.",
      preferredLanguage: "en",
    });
    expect(result.adjusted).toBe(false);
    expect(result.text).toBe("Yes.");
  });

  test("does not adjust short neutral portuguese responses", () => {
    const result = enforceLanguageContract({
      text: "Sim.",
      preferredLanguage: "pt",
    });
    expect(result.adjusted).toBe(false);
    expect(result.text).toBe("Sim.");
  });

  test("adjusts clear language mismatch", () => {
    const result = enforceLanguageContract({
      text: "Obrigado pelo envio do documento.",
      preferredLanguage: "en",
    });
    expect(result.adjusted).toBe(true);
    expect(result.text).toContain("requested language");
  });

  test("adjusts mixed portuguese output when preferred language is english", () => {
    const result = enforceLanguageContract({
      text: "The monthly amount was billed correctly for the selected period, and the detailed breakdown confirms each charge. Obrigado pelo envio do documento e pela confirmacao dos valores na tabela.",
      preferredLanguage: "en",
    });
    expect(result.adjusted).toBe(true);
    expect(result.text).toContain("requested language");
  });

  test("does not adjust mostly english output with a short portuguese phrase", () => {
    const result = enforceLanguageContract({
      text: "The invoice is complete, includes all charges, and the totals reconcile with the statement. Obrigado.",
      preferredLanguage: "en",
    });
    expect(result.adjusted).toBe(false);
    expect(result.text).toContain("invoice is complete");
  });

  test("can disable language contract v2 via feature flag", () => {
    const prev = process.env.LANGUAGE_CONTRACT_V2;
    process.env.LANGUAGE_CONTRACT_V2 = "0";
    try {
      const result = enforceLanguageContract({
        text: "Obrigado pelo envio do documento.",
        preferredLanguage: "en",
      });
      expect(result.adjusted).toBe(false);
      expect(result.text).toBe("Obrigado pelo envio do documento.");
    } finally {
      if (prev === undefined) delete process.env.LANGUAGE_CONTRACT_V2;
      else process.env.LANGUAGE_CONTRACT_V2 = prev;
    }
  });
});

describe("CentralizedChatRuntimeDelegate fallback source coverage", () => {
  test("injects scoped source for fallback turns with attached docs and zero evidence sources", () => {
    const sources = ensureFallbackSourceCoverage({
      sources: [],
      answerMode: "fallback",
      attachedDocumentIds: ["doc-1", "doc-2"],
      retrievalPack: {
        query: { original: "q", normalized: "q" },
        scope: {
          activeDocId: "doc-2",
          explicitDocLock: true,
          candidateDocIds: ["doc-2"],
        },
        stats: {
          candidatesConsidered: 0,
          candidatesAfterNegatives: 0,
          candidatesAfterBoosts: 0,
          candidatesAfterDiversification: 0,
          scopeCandidatesDropped: 0,
          scopeViolationsDetected: 0,
          scopeViolationsThrown: 0,
          evidenceItems: 0,
          uniqueDocsInEvidence: 0,
          topScore: null,
          scoreGap: null,
        },
        evidence: [],
      },
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]?.documentId).toBe("doc-2");
  });

  test("does not inject sources for non-fallback turns", () => {
    const sources = ensureFallbackSourceCoverage({
      sources: [],
      answerMode: "general_answer",
      attachedDocumentIds: ["doc-1"],
      retrievalPack: null,
    });
    expect(sources).toEqual([]);
  });
});
