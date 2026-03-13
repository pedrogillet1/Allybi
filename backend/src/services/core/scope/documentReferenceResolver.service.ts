import { getBankLoaderInstance } from "../banks/bankLoader.service";
import { getDocumentIntelligenceBanksInstance } from "../banks/documentIntelligenceBanks.service";

export interface DocumentReferenceDoc {
  docId: string;
  title?: string | null;
  filename?: string | null;
  aliases?: string[] | null;
}

type MatchMethod =
  | "exact"
  | "substring"
  | "token_overlap"
  | "alias_overlap"
  | "none";

export interface DocumentReferenceCandidate {
  docId: string;
  score: number;
  method: MatchMethod;
}

export interface DocumentReferenceResolution {
  explicitDocRef: boolean;
  resolvedDocId: string | null;
  matchedDocIds: string[];
  confidence: number;
  method: MatchMethod;
  candidates: DocumentReferenceCandidate[];
}

type ResolverConfig = {
  tokenMinLength: number;
  docNameMinLength: number;
  tokenOverlapThreshold: number;
  minAliasConfidence: number;
  autopickConfidence: number;
  autopickGap: number;
  filenamePatterns: RegExp[];
  docReferencePatterns: RegExp[];
  stopWords: Set<string>;
};

const DEFAULT_FILENAME_PATTERN =
  "\\b[\\w][\\w\\-_. ]{0,160}\\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpe?g|webp)\\b";

const DEFAULT_DOC_REF_PATTERNS = [
  "(?:usando\\s+(?:o\\s+)?documento|using\\s+(?:the\\s+)?(?:document|file)|no\\s+(?:documento|arquivo)|from\\s+(?:the\\s+)?(?:document|file)|about\\s+(?:the\\s+)?(?:document|file)|(?:documento|arquivo)\\s+chamado)\\s+[\"“”']?([^\"“”'\\n]{3,120})[\"“”']?",
  "(?:(?:d|D)ocs?\\s+que\\s+(?:anexei|enviei|carreguei|subi)|(?:o|O)s\\s+documentos?\\s+(?:que\\s+)?(?:anexei|enviei|carreguei|subi))\\s*(?:[:(]\\s*)?([^\"\\u201c\\u201d\\'\\n)]{3,200})",
  "(?:(?:e|E)m\\s+rela[çc][ãa]o\\s+a[o]?s?\\s+(?:docs?|documentos?|arquivos?))\\s*(?:[:(]\\s*)?([^\"\\u201c\\u201d\\'\\n)]{3,200})",
  "(?:(?:n|N)os?\\s+(?:docs?|documentos?|arquivos?)\\s+(?:que|de|do|da)\\s+)([^\"\\u201c\\u201d\\'\\n]{3,200})",
  "(?:come[cç]a\\s+pelo|comecar\\s+pelo|agora\\s+(?:no|na|nos|nas)|vamos\\s+para\\s+o?|sobre\\s+o?|foca\\s+no?)\\s+([^\\n,.!?;:]{3,140})",
];

const DEFAULT_STOP_WORDS = [
  "file",
  "document",
  "doc",
  "report",
  "spreadsheet",
  "sheet",
  "arquivo",
  "documento",
  "relatorio",
  "planilha",
  "usando",
  "using",
  "from",
  "about",
  "the",
  "no",
  "el",
  "la",
  "de",
  "del",
  "archivo",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "txt",
  "png",
  "jpg",
  "jpeg",
  "webp",
];

function lower(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function splitDocReferenceCandidates(rawPhrase: string): string[] {
  const phrase = String(rawPhrase || "").trim();
  if (!phrase) return [];
  return phrase
    .split(/\s*(?:,|;|\band\b|\be\b|\by\b)\s*/i)
    .map((part) =>
      part
        .replace(
          /^(?:the|document|file|o|a|os|as|documento|arquivo|docs?|documentos?)\s+/i,
          "",
        )
        .replace(/[.?!:]+$/g, "")
        .trim(),
    )
    .filter((part) => part.length > 0);
}

function tokenOverlap(
  aTokens: string[],
  bTokens: string[],
  minTokenLength: number,
): number {
  const a = new Set(aTokens.filter((t) => t.length >= minTokenLength));
  const b = new Set(bTokens.filter((t) => t.length >= minTokenLength));
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / Math.min(a.size, b.size);
}

function parseRegexList(patterns: unknown, fallback: string[]): RegExp[] {
  const fromBank =
    Array.isArray(patterns) && patterns.length > 0
      ? patterns.map((p) => String(p || "").trim()).filter(Boolean)
      : fallback;
  const out: RegExp[] = [];
  for (const pattern of fromBank) {
    try {
      out.push(new RegExp(pattern, "gi"));
    } catch {
      // ignore invalid bank regex and continue with valid patterns
    }
  }
  return out.length > 0
    ? out
    : fallback.map((pattern) => new RegExp(pattern, "gi"));
}

function resolveConfig(): ResolverConfig {
  const loader = getBankLoaderInstance();
  const documentIntelligenceBanks = getDocumentIntelligenceBanksInstance();
  const docReferenceResolution =
    loader.getOptionalBank<Record<string, unknown>>("doc_reference_resolution");
  const memoryPolicy = loader.getBank<Record<string, unknown>>("memory_policy");
  const docAliases = documentIntelligenceBanks.getMergedDocAliasesBank();
  const aliasThresholds = documentIntelligenceBanks.getDocAliasThresholds();
  const runtime = asObject(
    asObject(asObject(memoryPolicy?.config).runtimeTuning).scopeRuntime,
  );
  const runtimeCandidatePatterns = asObject(runtime.candidatePatterns);

  const tokenMinLength = Number(runtime.tokenMinLength);
  const docNameMinLength = Number(runtime.docNameMinLength);
  const tokenOverlapThreshold = Number(runtime.tokenOverlapThreshold);
  const minAliasConfidence = Number(
    aliasThresholds.minAliasConfidence ??
      docAliases?.config?.minAliasConfidence,
  );
  const autopickConfidence = Number(
    aliasThresholds.autopickConfidence ??
      docAliases?.config?.actionsContract?.thresholds?.autopickConfidence,
  );
  const autopickGap = Number(
    aliasThresholds.autopickGap ??
      docAliases?.config?.actionsContract?.thresholds?.autopickGap,
  );

  const filenamePatterns = parseRegexList(
    runtimeCandidatePatterns.filename,
    [DEFAULT_FILENAME_PATTERN],
  );
  const docReferencePatterns = parseRegexList(
    runtimeCandidatePatterns.docReferencePhrase,
    DEFAULT_DOC_REF_PATTERNS,
  );

  const bankStopWords = Array.isArray(runtime.docStopWords)
    ? runtime.docStopWords.map((v: unknown) => lower(String(v || "")))
    : [];
  const stopWords = new Set(
    [...DEFAULT_STOP_WORDS, ...bankStopWords].filter((t) => t.length > 0),
  );

  return {
    tokenMinLength:
      Number.isFinite(tokenMinLength) && tokenMinLength >= 1
        ? Math.floor(tokenMinLength)
        : 2,
    docNameMinLength:
      Number.isFinite(docNameMinLength) && docNameMinLength >= 1
        ? Math.floor(docNameMinLength)
        : 3,
    tokenOverlapThreshold:
      Number.isFinite(tokenOverlapThreshold) &&
      tokenOverlapThreshold > 0 &&
      tokenOverlapThreshold <= 1
        ? tokenOverlapThreshold
        : 0.4,
    minAliasConfidence:
      Number.isFinite(minAliasConfidence) && minAliasConfidence > 0
        ? minAliasConfidence
        : 0.75,
    autopickConfidence: Number.isFinite(
      Number(asObject(docReferenceResolution?.config).autopickConfidence),
    ) && Number(asObject(docReferenceResolution?.config).autopickConfidence) > 0
      ? Number(asObject(docReferenceResolution?.config).autopickConfidence)
      : Number.isFinite(autopickConfidence) && autopickConfidence > 0
        ? autopickConfidence
        : 0.7,
    autopickGap: Number.isFinite(
      Number(asObject(docReferenceResolution?.config).autopickGap),
    ) && Number(asObject(docReferenceResolution?.config).autopickGap) >= 0
      ? Number(asObject(docReferenceResolution?.config).autopickGap)
      : Number.isFinite(autopickGap) && autopickGap >= 0
        ? autopickGap
        : 0.15,
    filenamePatterns,
    docReferencePatterns,
    stopWords,
  };
}

function tokenize(value: string, cfg: ResolverConfig): string[] {
  return lower(value)
    .split(/[\s,;:.!?()/_-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= cfg.docNameMinLength)
    .filter((t) => !cfg.stopWords.has(t));
}

function extractCandidatePhrases(query: string, cfg: ResolverConfig): string[] {
  const candidates = new Set<string>();
  const input = String(query || "");

  for (const pattern of cfg.filenamePatterns) {
    pattern.lastIndex = 0;
    for (const m of input.matchAll(pattern)) {
      const value = lower(m[0] || "");
      if (value.length >= cfg.docNameMinLength) candidates.add(value);
    }
  }

  for (const pattern of cfg.docReferencePatterns) {
    pattern.lastIndex = 0;
    for (const m of input.matchAll(pattern)) {
      const raw = String(m[1] || "").trim();
      for (const part of splitDocReferenceCandidates(raw)) {
        const value = lower(part);
        if (value.length >= cfg.docNameMinLength) candidates.add(value);
      }
    }
  }

  const normalizedQuery = lower(input);
  if (normalizedQuery.length >= cfg.docNameMinLength) {
    candidates.add(normalizedQuery);
  }
  return Array.from(candidates);
}

function scoreCandidateAgainstName(
  candidate: string,
  candidateTokens: string[],
  name: string,
  nameTokens: string[],
  cfg: ResolverConfig,
): { score: number; method: MatchMethod } {
  const n = lower(name);
  if (!n) return { score: 0, method: "none" };
  if (n === candidate) return { score: 1, method: "exact" };
  if (n.includes(candidate) || candidate.includes(n)) {
    return { score: 0.95, method: "substring" };
  }
  // Check if all name tokens are contained in the candidate (strong signal)
  const nameSet = new Set(
    nameTokens.filter((t) => t.length >= cfg.tokenMinLength),
  );
  const candSet = new Set(
    candidateTokens.filter((t) => t.length >= cfg.tokenMinLength),
  );
  if (nameSet.size > 0) {
    let allPresent = true;
    for (const t of nameSet) {
      if (!candSet.has(t)) {
        allPresent = false;
        break;
      }
    }
    if (allPresent) return { score: 0.9, method: "token_overlap" };
  }
  const overlap = tokenOverlap(candidateTokens, nameTokens, cfg.tokenMinLength);
  if (overlap <= 0) return { score: 0, method: "none" };
  return { score: overlap, method: "token_overlap" };
}

export function resolveDocumentReference(
  query: string,
  docs: DocumentReferenceDoc[],
): DocumentReferenceResolution {
  const cfg = resolveConfig();
  const normalizedDocs = docs
    .map((doc) => ({
      ...doc,
      docId: String(doc.docId || "").trim(),
    }))
    .filter((doc) => Boolean(doc.docId));

  if (!normalizedDocs.length) {
    return {
      explicitDocRef: false,
      resolvedDocId: null,
      matchedDocIds: [],
      confidence: 0,
      method: "none",
      candidates: [],
    };
  }

  const phrases = extractCandidatePhrases(query, cfg);
  const scored: DocumentReferenceCandidate[] = [];

  for (const doc of normalizedDocs) {
    const aliases = Array.isArray(doc.aliases)
      ? doc.aliases.filter((a) => typeof a === "string")
      : [];
    const names = [doc.title, doc.filename, ...aliases].filter(
      (n): n is string => typeof n === "string" && n.trim().length > 0,
    );
    if (!names.length) continue;

    let bestScore = 0;
    let bestMethod: MatchMethod = "none";

    for (const phrase of phrases) {
      const candidateTokens = tokenize(phrase, cfg);
      for (const name of names) {
        const nameTokens = tokenize(name, cfg);
        const next = scoreCandidateAgainstName(
          phrase,
          candidateTokens,
          name,
          nameTokens,
          cfg,
        );
        if (next.score > bestScore) {
          bestScore = next.score;
          bestMethod = aliases.includes(name) ? "alias_overlap" : next.method;
        }
      }
    }

    if (bestScore >= cfg.tokenOverlapThreshold) {
      scored.push({
        docId: doc.docId,
        score: Number(bestScore.toFixed(4)),
        method: bestMethod,
      });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.docId.localeCompare(b.docId);
  });

  const matchedDocIds = scored.map((item) => item.docId);
  const top = scored[0] || null;
  const second = scored[1] || null;
  const gap = top && second ? top.score - second.score : 1;

  let resolvedDocId: string | null = null;
  if (matchedDocIds.length === 1) {
    resolvedDocId = matchedDocIds[0];
  } else if (
    top &&
    top.score >= cfg.autopickConfidence &&
    gap >= cfg.autopickGap
  ) {
    resolvedDocId = top.docId;
  }

  return {
    explicitDocRef: matchedDocIds.length > 0,
    resolvedDocId,
    matchedDocIds,
    confidence: top?.score ?? 0,
    method: top?.method ?? "none",
    candidates: scored.slice(0, 5),
  };
}
