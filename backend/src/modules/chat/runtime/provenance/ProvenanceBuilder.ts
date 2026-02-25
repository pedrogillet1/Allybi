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
    };
  }

  const normalizedAnswer = normalizeText(params.answerText);
  const answerTokens = tokenize(params.answerText);
  const snippetRefs: ChatProvenanceDTO["snippetRefs"] = [];

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
    const coverageScore = directMatch
      ? Math.max(lexicalCoverage, 1)
      : lexicalCoverage;

    if (coverageScore < 0.18) continue;

    snippetRefs.push({
      evidenceId: `${docId}:${locationKey}`,
      documentId: docId,
      locationKey,
      snippetHash: hashSnippet(normalizedSnippet),
      coverageScore: round3(Math.min(1, coverageScore)),
    });
  }

  const evidenceIdsUsed = Array.from(
    new Set(snippetRefs.map((ref) => ref.evidenceId)),
  );
  const sourceDocumentIds = Array.from(
    new Set(snippetRefs.map((ref) => ref.documentId)),
  );
  const coverageScore = round3(
    snippetRefs.length / Math.max(1, Math.min(evidence.length, 12)),
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
  };
}
