import { createHash } from "crypto";
import type {
  AnswerClass,
  AnswerMode,
  ChatProvenanceDTO,
} from "../../domain/chat.contracts";
import type { EvidencePack } from "../../../../services/core/retrieval/retrievalEngine.service";

function normalizeText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string): string[] {
  return normalizeText(input)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  let overlap = 0;
  for (const token of b) {
    if (setA.has(token)) overlap += 1;
  }
  return overlap / b.length;
}

function anchoredSnippetCoverage(
  normalizedAnswer: string,
  normalizedSnippet: string,
): number {
  if (!normalizedAnswer || !normalizedSnippet) return 0;
  const anchors: string[] = [];
  if (normalizedSnippet.length >= 20) {
    anchors.push(
      normalizedSnippet.slice(0, Math.min(90, normalizedSnippet.length)),
    );
  }
  if (normalizedSnippet.length >= 140) {
    anchors.push(normalizedSnippet.slice(-90));
  }
  if (anchors.length === 0) return 0;
  const matched = anchors.filter((anchor) =>
    normalizedAnswer.includes(anchor),
  ).length;
  return matched / anchors.length;
}

function hashSnippet(snippet: string): string {
  return createHash("sha256").update(snippet).digest("hex").slice(0, 16);
}

function requiresProvenance(
  answerMode?: AnswerMode,
  answerClass?: AnswerClass,
) {
  if (String(answerMode || "").startsWith("doc_grounded")) return true;
  return String(answerClass || "") === "DOCUMENT";
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function resolveMinSnippetCoverage(answerMode?: AnswerMode): number {
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

function isStrictProvenanceV2Enabled(): boolean {
  const raw = String(process.env.STRICT_PROVENANCE_V2 || "")
    .trim()
    .toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
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

  const normalizedAnswer = normalizeText(params.answerText);
  const answerTokens = tokenize(params.answerText);
  if (!isStrictProvenanceV2Enabled()) {
    const legacyRefs: ChatProvenanceDTO["snippetRefs"] = [];
    for (const item of evidence) {
      const snippet = String(item.snippet || "").trim();
      const docId = String(item.docId || "").trim();
      const locationKey = String(item.locationKey || "").trim();
      if (!snippet || !docId || !locationKey) continue;

      const normalizedSnippet = normalizeText(snippet);
      const directNeedle =
        normalizedSnippet.length > 90
          ? normalizedSnippet.slice(0, 90)
          : normalizedSnippet;
      const directMatch =
        directNeedle.length >= 18 && normalizedAnswer.includes(directNeedle);
      const lexicalCoverage = overlapRatio(answerTokens, tokenize(snippet));
      const legacyCoverageScore = directMatch
        ? Math.max(lexicalCoverage, 1)
        : lexicalCoverage;
      const legacyMinCoverage =
        params.answerMode === "doc_grounded_multi" ? 0.1 : 0.18;
      if (legacyCoverageScore < legacyMinCoverage) continue;

      legacyRefs.push({
        evidenceId: `${docId}:${locationKey}`,
        documentId: docId,
        locationKey,
        snippetHash: hashSnippet(normalizedSnippet),
        coverageScore: round3(Math.min(1, legacyCoverageScore)),
        anchorCoverage: directMatch ? 1 : 0,
        semanticCoverage: round3(Math.min(1, lexicalCoverage)),
      });
    }

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
          snippetHash: hashSnippet(normalizeText(snippet)),
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
  const snippetRefs: ChatProvenanceDTO["snippetRefs"] = [];
  const refAnchorCoverage: number[] = [];
  const refSemanticCoverage: number[] = [];
  const refCombinedCoverage: number[] = [];

  for (const item of evidence) {
    const snippet = String(item.snippet || "").trim();
    const docId = String(item.docId || "").trim();
    const locationKey = String(item.locationKey || "").trim();
    if (!snippet || !docId || !locationKey) continue;

    const normalizedSnippet = normalizeText(snippet);
    const lexicalCoverage = overlapRatio(answerTokens, tokenize(snippet));
    const anchorCoverage = anchoredSnippetCoverage(
      normalizedAnswer,
      normalizedSnippet,
    );
    const coverageScore = Math.max(lexicalCoverage, anchorCoverage);
    if (coverageScore < minCoverage) continue;

    const roundedAnchor = round3(Math.min(1, anchorCoverage));
    const roundedSemantic = round3(Math.min(1, lexicalCoverage));
    const roundedCoverage = round3(Math.min(1, coverageScore));

    snippetRefs.push({
      evidenceId: `${docId}:${locationKey}`,
      documentId: docId,
      locationKey,
      snippetHash: hashSnippet(normalizedSnippet),
      coverageScore: roundedCoverage,
      anchorCoverage: roundedAnchor,
      semanticCoverage: roundedSemantic,
    });
    refAnchorCoverage.push(roundedAnchor);
    refSemanticCoverage.push(roundedSemantic);
    refCombinedCoverage.push(roundedCoverage);
  }

  const evidenceIdsUsed = Array.from(
    new Set(snippetRefs.map((ref) => ref.evidenceId)),
  );
  const sourceDocumentIds = Array.from(
    new Set(snippetRefs.map((ref) => ref.documentId)),
  );
  const coverageScore =
    refCombinedCoverage.length > 0
      ? round3(
          refCombinedCoverage.reduce((sum, score) => sum + score, 0) /
            refCombinedCoverage.length,
        )
      : 0;
  const anchorCoverage =
    refAnchorCoverage.length > 0
      ? round3(
          refAnchorCoverage.reduce((sum, score) => sum + score, 0) /
            refAnchorCoverage.length,
        )
      : 0;
  const semanticCoverage =
    refSemanticCoverage.length > 0
      ? round3(
          refSemanticCoverage.reduce((sum, score) => sum + score, 0) /
            refSemanticCoverage.length,
        )
      : 0;

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
