import type { PrismaClient } from "@prisma/client";

import {
  resolveDocumentReference,
} from "../../../services/core/scope/documentReferenceResolver.service";
import { getBankLoaderInstance } from "../../../services/core/banks/bankLoader.service";
import { ScopeMentionMatcher } from "./ScopeMentionMatcher";
import { ScopeMentionParser } from "./ScopeMentionParser";
import { ScopeMentionRanker } from "./ScopeMentionRanker";
import { lower } from "./scopeMentionShared";

export type ScopeRuntimeMentionConfig = {
  tokenMinLength: number;
  docNameMinLength: number;
  tokenOverlapThreshold: number;
  candidateFilenameRegex: RegExp[];
  candidateDocRefRegex: RegExp[];
  docStatusesAllowed: string[];
  stopWords: Set<string>;
};

type ScopeMentionResolverDependencies = {
  prismaClient: Pick<PrismaClient, "document">;
  config: ScopeRuntimeMentionConfig;
  logger?: Pick<Console, "debug">;
};

export class ScopeMentionResolver {
  private readonly parser = new ScopeMentionParser();
  private readonly matcher: ScopeMentionMatcher;
  private readonly ranker = new ScopeMentionRanker();

  constructor(private readonly deps: ScopeMentionResolverDependencies) {
    this.matcher = new ScopeMentionMatcher({
      prismaClient: deps.prismaClient,
      config: deps.config,
    });
  }

  async detect(
    userId: string,
    message: string,
    options?: {
      restrictToDocumentIds?: string[];
    },
  ): Promise<string[]> {
    if (!message || !userId) return [];
    const mentionSignals = this.parser.extractMentionSignals(
      message,
      this.deps.config,
    );
    if (mentionSignals.length === 0) return [];

    const referenceDocs = await this.matcher.loadReferenceDocs({
      userId,
      restrictToDocumentIds: options?.restrictToDocumentIds,
    });
    if (!referenceDocs.length) return [];
    const resolution = resolveDocumentReference(message, referenceDocs);
    const ranked = this.ranker.rank({
      message,
      mentionSignals,
      referenceDocs,
      resolution,
      config: this.deps.config,
    });
    if (ranked.matchedDocIds.length === 0) return [];

    this.deps.logger?.debug?.("[Scope] document mention matches", {
      matchedIds: ranked.matchedDocIds,
      lexicalMatches: ranked.debug.lexicalMatches,
      docsChecked: ranked.debug.docsChecked,
      confidence: ranked.debug.confidence,
      method: ranked.debug.method,
      candidates: ranked.debug.candidates,
      mentionSignals: ranked.debug.mentionSignals,
    });

    return ranked.matchedDocIds;
  }
}

export function resolveScopeRuntimeMentionConfig(
  bankLoader: Pick<
    ReturnType<typeof getBankLoaderInstance>,
    "getBank"
  > = getBankLoaderInstance(),
): ScopeRuntimeMentionConfig {
  const bank = bankLoader.getBank<any>("memory_policy");
  const runtime = bank?.config?.runtimeTuning?.scopeRuntime;
  if (!runtime || typeof runtime !== "object") {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime is required",
    );
  }

  const tokenMinLength = Number(runtime.tokenMinLength);
  const docNameMinLength = Number(runtime.docNameMinLength);
  const tokenOverlapThreshold = Number(runtime.tokenOverlapThreshold);
  if (!Number.isFinite(tokenMinLength) || tokenMinLength < 1) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.tokenMinLength is required",
    );
  }
  if (!Number.isFinite(docNameMinLength) || docNameMinLength < 1) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.docNameMinLength is required",
    );
  }
  if (
    !Number.isFinite(tokenOverlapThreshold) ||
    tokenOverlapThreshold <= 0 ||
    tokenOverlapThreshold > 1
  ) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.tokenOverlapThreshold is required",
    );
  }

  const filenamePatterns = Array.isArray(runtime?.candidatePatterns?.filename)
    ? runtime.candidatePatterns.filename
    : [];
  const phrasePatterns = Array.isArray(
    runtime?.candidatePatterns?.docReferencePhrase,
  )
    ? runtime.candidatePatterns.docReferencePhrase
    : [];
  if (filenamePatterns.length === 0 || phrasePatterns.length === 0) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.candidatePatterns is required",
    );
  }

  const candidateFilenameRegex = filenamePatterns.map((pattern: unknown) => {
    const source = String(pattern || "").trim();
    if (!source) {
      throw new Error(
        "memory_policy scopeRuntime candidate filename regex cannot be empty",
      );
    }
    try {
      return new RegExp(source, "gi");
    } catch {
      throw new Error(`Invalid scopeRuntime filename regex: ${source}`);
    }
  });
  const candidateDocRefRegex = phrasePatterns.map((pattern: unknown) => {
    const source = String(pattern || "").trim();
    if (!source) {
      throw new Error(
        "memory_policy scopeRuntime doc reference regex cannot be empty",
      );
    }
    try {
      return new RegExp(source, "gi");
    } catch {
      throw new Error(`Invalid scopeRuntime doc reference regex: ${source}`);
    }
  });

  const docStatusesAllowed = (
    Array.isArray(runtime.docStatusesAllowed) ? runtime.docStatusesAllowed : []
  )
    .map((value: unknown) => String(value || "").trim())
    .filter(Boolean);
  if (docStatusesAllowed.length === 0) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.docStatusesAllowed is required",
    );
  }

  const stopWords = new Set<string>(
    (Array.isArray(runtime.docStopWords) ? runtime.docStopWords : [])
      .map((value: unknown) => lower(String(value || "")))
      .filter((value: string): value is string => value.length > 0),
  );
  if (stopWords.size === 0) {
    throw new Error(
      "memory_policy.config.runtimeTuning.scopeRuntime.docStopWords is required",
    );
  }

  return {
    tokenMinLength: Math.floor(tokenMinLength),
    docNameMinLength: Math.floor(docNameMinLength),
    tokenOverlapThreshold,
    candidateFilenameRegex,
    candidateDocRefRegex,
    docStatusesAllowed,
    stopWords,
  };
}
