import "reflect-metadata";
import { describe, expect, test } from "@jest/globals";

import { enforceLanguageContract } from "./chatRuntimeLanguage";
import { shouldApplyPreEnforcerTrim } from "./chatRuntimeTruncation";
import {
  applySentenceBoundaryRecovery,
  repairProviderOverflowStructuredOutput,
} from "./chatRuntimeOverflowRepair";
import {
  ensureFallbackSourceCoverage,
  resolveSourceInvariantFailureCode,
} from "./chatRuntimeSourcePolicy";

describe("chatRuntimeOutputPolicies", () => {
  test("returns false when requested output tokens are not provided", () => {
    expect(
      shouldApplyPreEnforcerTrim({
        telemetry: { finishReason: "length" },
        finalText: "Incomplete output from provider that stops abruptly at",
        requestedMaxOutputTokens: null,
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

  test("falls back to earlier complete sentence when latest sentence is broken", () => {
    const truncated =
      'The 2024 operating statement does not include unusual items. The "214 Move Out Statement (2).';
    expect(
      applySentenceBoundaryRecovery(truncated, { finishReason: "length" }),
    ).toBe("The 2024 operating statement does not include unusual items.");
  });

  test("preserves incomplete narrative text instead of replacing with generic fallback", () => {
    const truncatedNarrative = 'Com base no documento "Trabalho_projeto_.';
    expect(
      repairProviderOverflowStructuredOutput(
        truncatedNarrative,
        { finishReason: "length" },
        "pt",
      ),
    ).toBe(truncatedNarrative);
  });

  test("reports missing provenance for doc-grounded answers without filtered sources", () => {
    expect(
      resolveSourceInvariantFailureCode({
        answerMode: "doc_grounded_single",
        filteredSources: [],
      }),
    ).toBe("missing_provenance");
  });

  test("adds fallback coverage for help_steps with attached docs", () => {
    expect(
      ensureFallbackSourceCoverage({
        sources: [],
        answerMode: "help_steps",
        attachedDocumentIds: ["doc-a", "doc-b"],
        retrievalPack: {
          query: { original: "q", normalized: "q" },
          scope: {
            activeDocId: "doc-b",
            explicitDocLock: false,
            candidateDocIds: ["doc-b"],
            hardScopeActive: false,
            sheetName: null,
            rangeA1: null,
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
      })[0]?.documentId,
    ).toBe("doc-b");
  });

  test("soft-repairs mixed-language lead-ins before failing closed", () => {
    const result = enforceLanguageContract({
      text: "Here is what I found in the documents: O saldo final está correto.",
      preferredLanguage: "pt",
    });
    expect(result.text).toContain("saldo final");
    expect(result.failClosed).toBe(false);
  });
});
