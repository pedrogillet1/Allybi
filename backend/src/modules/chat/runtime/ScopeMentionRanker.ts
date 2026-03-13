import type {
  DocumentReferenceDoc,
  DocumentReferenceResolution,
} from "../../../services/core/scope/documentReferenceResolver.service";
import type { ScopeRuntimeMentionConfig } from "./ScopeMentionResolver";
import {
  normSpace,
  normalizeForExactMention,
  tokenizeForScope,
} from "./scopeMentionShared";

function lexicalOverlapScore(
  messageTokens: Set<string>,
  docTokens: string[],
): number {
  if (docTokens.length === 0 || messageTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of docTokens) {
    if (messageTokens.has(token)) overlap += 1;
  }
  return overlap / docTokens.length;
}

export type ScopeMentionRankResult = {
  matchedDocIds: string[];
  debug: {
    lexicalMatches: Array<{ docId: string; score: number }>;
    docsChecked: number;
    confidence: number;
    method: string;
    candidates: string[];
    mentionSignals: string[];
  };
};

export class ScopeMentionRanker {
  rank(params: {
    message: string;
    mentionSignals: string[];
    referenceDocs: DocumentReferenceDoc[];
    resolution: DocumentReferenceResolution;
    config: Pick<
      ScopeRuntimeMentionConfig,
      "docNameMinLength" | "tokenMinLength" | "stopWords" | "tokenOverlapThreshold"
    >;
  }): ScopeMentionRankResult {
    const scopeTokens = new Set(
      tokenizeForScope(
        `${params.message}\n${params.mentionSignals.join(" ")}`,
        params.config,
      ),
    );
    const lexicalMatches = params.referenceDocs
      .map((doc) => {
        const docText = normSpace(`${doc.filename || ""} ${doc.title || ""}`);
        if (docText.length < params.config.docNameMinLength) return null;
        const docTokens = tokenizeForScope(docText, params.config);
        const score = lexicalOverlapScore(scopeTokens, docTokens);
        if (score < params.config.tokenOverlapThreshold) return null;
        return { docId: doc.docId, score };
      })
      .filter(
        (entry): entry is { docId: string; score: number } => Boolean(entry?.docId),
      )
      .sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId));

    const lexicalMatchedDocIds = new Set(lexicalMatches.map((entry) => entry.docId));
    const resolverCandidates = (params.resolution.matchedDocIds || []).filter(Boolean);
    const mentionSignalCorpus = normalizeForExactMention(
      `${params.message}\n${params.mentionSignals.join(" ")}`,
    );
    const resolverQualifiedDocIds = resolverCandidates
      .filter((docId: string) => {
        const doc = params.referenceDocs.find((item) => item.docId === docId);
        if (!doc) return false;
        const names = [doc.filename, doc.title]
          .map((value) => normalizeForExactMention(String(value || "")))
          .filter(Boolean);
        if (names.length === 0) return false;
        return names.some((name) => mentionSignalCorpus.includes(name));
      })
      .sort((a: string, b: string) => a.localeCompare(b));

    let matchedDocIds = Array.from(lexicalMatchedDocIds);
    if (matchedDocIds.length === 0) {
      const resolverOnlyAllowed =
        params.resolution.explicitDocRef &&
        params.resolution.method === "exact" &&
        params.resolution.confidence >= 0.9 &&
        resolverQualifiedDocIds.length > 0;
      if (!resolverOnlyAllowed) {
        return {
          matchedDocIds: [],
          debug: {
            lexicalMatches,
            docsChecked: params.referenceDocs.length,
            confidence: params.resolution.confidence,
            method: params.resolution.method,
            candidates: params.resolution.candidates.map((candidate) =>
              String(candidate.docId || "").trim(),
            ),
            mentionSignals: params.mentionSignals,
          },
        };
      }
      matchedDocIds = resolverQualifiedDocIds;
    }

    return {
      matchedDocIds,
      debug: {
        lexicalMatches,
        docsChecked: params.referenceDocs.length,
        confidence: params.resolution.confidence,
        method: params.resolution.method,
        candidates: params.resolution.candidates.map((candidate) =>
          String(candidate.docId || "").trim(),
        ),
        mentionSignals: params.mentionSignals,
      },
    };
  }
}
