import type {
  AnswerClass,
  AnswerMode,
  ChatProvenanceDTO,
} from "../../domain/chat.contracts";
import type { EvidencePack } from "../../../../services/core/retrieval/retrieval.types";
import { resolveProvenanceRuntimeConfig } from "../../config/chatRuntimeConfig";
import {
  buildLegacySnippetRefs,
  buildStrictSnippetRefs,
} from "./provenanceCoverage";
import { hashSnippetForProvenance } from "./provenanceHash";

function requiresProvenance(
  answerMode?: AnswerMode,
  answerClass?: AnswerClass,
) {
  if (String(answerMode || "").startsWith("doc_grounded")) return true;
  return String(answerClass || "") === "DOCUMENT";
}

function resolveMinSnippetCoverage(answerMode?: AnswerMode): number {
  if (!resolveProvenanceRuntimeConfig().thresholdsV3) {
    switch (answerMode) {
      case "doc_grounded_quote":
        return 0.55;
      case "doc_grounded_table":
        return 0.28;
      case "doc_grounded_multi":
        return 0.24;
      case "doc_grounded_single":
        return 0.22;
      case "help_steps":
        return 0.2;
      default:
        return 0.22;
    }
  }
  switch (answerMode) {
    case "doc_grounded_quote":
      return 0.3;
    case "doc_grounded_table":
      return 0.14;
    case "doc_grounded_multi":
      return 0.12;
    case "doc_grounded_single":
      return 0.1;
    case "help_steps":
      return 0.12;
    default:
      return 0.1;
  }
}

function resolveMinSnippetRefs(answerMode?: AnswerMode): number {
  return answerMode === "doc_grounded_multi" ? 2 : 1;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function buildChatProvenance(params: {
  answerText: string;
  answerMode?: AnswerMode;
  answerClass?: AnswerClass;
  retrievalPack: EvidencePack | null;
}): ChatProvenanceDTO {
  const required = requiresProvenance(params.answerMode, params.answerClass);
  const evidence = params.retrievalPack?.evidence ?? [];

  if (!required || evidence.length === 0) {
    return {
      mode: "hidden_map",
      required,
      validated: !required,
      failureCode: required ? "missing_provenance" : null,
      evidenceIdsUsed: [],
      sourceDocumentIds: [],
      snippetRefs: [],
      coverageScore: 0,
      anchorCoverage: 0,
      semanticCoverage: 0,
      minimumCoverage: resolveMinSnippetCoverage(params.answerMode),
    };
  }

  if (!resolveProvenanceRuntimeConfig().strictV2) {
    const legacyRefs = buildLegacySnippetRefs({
      answerText: params.answerText,
      evidence,
      answerMode: params.answerMode,
    });

    if (required && legacyRefs.length === 0 && evidence.length > 0) {
      for (const item of evidence.slice(0, 3)) {
        const snippet = String(item.snippet || "").trim();
        const docId = String(item.docId || "").trim();
        const locationKey = String(item.locationKey || "").trim();
        if (!snippet || !docId || !locationKey) continue;
        legacyRefs.push({
          evidenceId: `${docId}:${locationKey}`,
          documentId: docId,
          locationKey,
          snippetHash: hashSnippetForProvenance(snippet),
          coverageScore: 0,
          anchorCoverage: 0,
          semanticCoverage: 0,
        });
      }
    }

    const evidenceIdsUsed = Array.from(
      new Set(legacyRefs.map((ref) => ref.evidenceId)),
    );
    const sourceDocumentIds = Array.from(
      new Set(legacyRefs.map((ref) => ref.documentId)),
    );
    const coverageScore = round3(
      legacyRefs.length / Math.max(1, Math.min(evidence.length, 12)),
    );
    return {
      mode: "hidden_map",
      required,
      validated: false,
      failureCode: null,
      evidenceIdsUsed,
      sourceDocumentIds,
      snippetRefs: legacyRefs,
      coverageScore,
      anchorCoverage: coverageScore,
      semanticCoverage: coverageScore,
      minimumCoverage: params.answerMode === "doc_grounded_multi" ? 0.1 : 0.18,
    };
  }

  const minCoverage = resolveMinSnippetCoverage(params.answerMode);
  const {
    snippetRefs,
    coverageScore,
    anchorCoverage,
    semanticCoverage,
  } = buildStrictSnippetRefs({
    answerText: params.answerText,
    evidence,
    minCoverage,
  });

  const evidenceIdsUsed = Array.from(
    new Set(snippetRefs.map((ref) => ref.evidenceId)),
  );
  const sourceDocumentIds = Array.from(
    new Set(snippetRefs.map((ref) => ref.documentId)),
  );

  return {
    mode: "hidden_map",
    required,
    validated: false,
    failureCode: null,
    evidenceIdsUsed,
    sourceDocumentIds,
    snippetRefs,
    coverageScore,
    anchorCoverage,
    semanticCoverage,
    minimumCoverage: minCoverage,
  };
}
