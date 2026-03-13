import {
  hashSnippetForProvenance,
  normalizeSnippetForProvenanceHash,
} from "./provenanceHash";
import type { ChatProvenanceDTO } from "../../domain/chat.contracts";
import type { EvidencePack } from "../../../../services/core/retrieval/retrieval.types";

function normalizeText(input: string): string {
  return normalizeSnippetForProvenanceHash(input);
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
  const compactAnswer = normalizedAnswer.replace(/\s+/g, "");
  const anchors: string[] = [];
  if (normalizedSnippet.length >= 20) {
    anchors.push(normalizedSnippet.slice(0, Math.min(90, normalizedSnippet.length)));
  }
  if (normalizedSnippet.length >= 140) {
    anchors.push(normalizedSnippet.slice(-90));
  }
  if (anchors.length === 0) return 0;
  const matched = anchors.filter((anchor) => {
    if (normalizedAnswer.includes(anchor)) return true;
    const compactAnchor = anchor.replace(/\s+/g, "");
    if (compactAnchor.length < 24) return false;
    return compactAnswer.includes(
      compactAnchor.slice(0, Math.min(120, compactAnchor.length)),
    );
  }).length;
  return matched / anchors.length;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function buildLegacySnippetRefs(params: {
  answerText: string;
  evidence: EvidencePack["evidence"];
  answerMode?: string;
}): ChatProvenanceDTO["snippetRefs"] {
  const normalizedAnswer = normalizeText(params.answerText);
  const answerTokens = tokenize(params.answerText);
  const legacyRefs: ChatProvenanceDTO["snippetRefs"] = [];
  for (const item of params.evidence) {
    const snippet = String(item.snippet || "").trim();
    const docId = String(item.docId || "").trim();
    const locationKey = String(item.locationKey || "").trim();
    if (!snippet || !docId || !locationKey) continue;
    const normalizedSnippet = normalizeText(snippet);
    const directNeedle =
      normalizedSnippet.length > 90 ? normalizedSnippet.slice(0, 90) : normalizedSnippet;
    const directMatch = directNeedle.length >= 18 && normalizedAnswer.includes(directNeedle);
    const lexicalCoverage = overlapRatio(answerTokens, tokenize(snippet));
    const legacyCoverageScore = directMatch
      ? Math.max(lexicalCoverage, 1)
      : lexicalCoverage;
    const legacyMinCoverage = params.answerMode === "doc_grounded_multi" ? 0.1 : 0.18;
    if (legacyCoverageScore < legacyMinCoverage) continue;
    legacyRefs.push({
      evidenceId: `${docId}:${locationKey}`,
      documentId: docId,
      locationKey,
      snippetHash: hashSnippetForProvenance(snippet),
      coverageScore: round3(Math.min(1, legacyCoverageScore)),
      anchorCoverage: directMatch ? 1 : 0,
      semanticCoverage: round3(Math.min(1, lexicalCoverage)),
    });
  }
  return legacyRefs;
}

export function buildStrictSnippetRefs(params: {
  answerText: string;
  evidence: EvidencePack["evidence"];
  minCoverage: number;
}): {
  snippetRefs: ChatProvenanceDTO["snippetRefs"];
  coverageScore: number;
  anchorCoverage: number;
  semanticCoverage: number;
} {
  const normalizedAnswer = normalizeText(params.answerText);
  const answerTokens = tokenize(params.answerText);
  const snippetRefs: ChatProvenanceDTO["snippetRefs"] = [];
  const refAnchorCoverage: number[] = [];
  const refSemanticCoverage: number[] = [];
  const refCombinedCoverage: number[] = [];
  const addCandidate = (
    snippet: string,
    docId: string,
    locationKey: string,
    threshold: number,
  ) => {
    const normalizedSnippet = normalizeText(snippet);
    const lexicalCoverage = overlapRatio(answerTokens, tokenize(snippet));
    const anchorCoverage = anchoredSnippetCoverage(
      normalizedAnswer,
      normalizedSnippet,
    );
    const coverageScore = Math.max(lexicalCoverage, anchorCoverage);
    if (coverageScore < threshold) return;
    const roundedAnchor = round3(Math.min(1, anchorCoverage));
    const roundedSemantic = round3(Math.min(1, lexicalCoverage));
    const roundedCoverage = round3(Math.min(1, coverageScore));
    snippetRefs.push({
      evidenceId: `${docId}:${locationKey}`,
      documentId: docId,
      locationKey,
      snippetHash: hashSnippetForProvenance(snippet),
      coverageScore: roundedCoverage,
      anchorCoverage: roundedAnchor,
      semanticCoverage: roundedSemantic,
    });
    refAnchorCoverage.push(roundedAnchor);
    refSemanticCoverage.push(roundedSemantic);
    refCombinedCoverage.push(roundedCoverage);
  };

  for (const item of params.evidence) {
    const snippet = String(item.snippet || "").trim();
    const docId = String(item.docId || "").trim();
    const locationKey = String(item.locationKey || "").trim();
    if (!snippet || !docId || !locationKey) continue;
    addCandidate(snippet, docId, locationKey, params.minCoverage);
  }
  if (snippetRefs.length === 0 && params.evidence.length > 0) {
    const relaxedMin = params.minCoverage * 0.5;
    for (const item of params.evidence.slice(0, 3)) {
      const snippet = String(item.snippet || "").trim();
      const docId = String(item.docId || "").trim();
      const locationKey = String(item.locationKey || "").trim();
      if (!snippet || !docId || !locationKey) continue;
      addCandidate(snippet, docId, locationKey, relaxedMin);
    }
  }

  return {
    snippetRefs,
    coverageScore:
      refCombinedCoverage.length > 0
        ? round3(
            refCombinedCoverage.reduce((sum, score) => sum + score, 0) /
              refCombinedCoverage.length,
          )
        : 0,
    anchorCoverage:
      refAnchorCoverage.length > 0
        ? round3(
            refAnchorCoverage.reduce((sum, score) => sum + score, 0) /
              refAnchorCoverage.length,
          )
        : 0,
    semanticCoverage:
      refSemanticCoverage.length > 0
        ? round3(
            refSemanticCoverage.reduce((sum, score) => sum + score, 0) /
              refSemanticCoverage.length,
          )
        : 0,
  };
}
