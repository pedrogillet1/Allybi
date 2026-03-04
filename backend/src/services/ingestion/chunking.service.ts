export interface ChunkingPolicy {
  targetChars: number;
  overlapChars: number;
  minBoundaryRatio: number;
  dedupeSimilarityThreshold: number;
  dedupeMinWordLength: number;
  customAbbreviations?: string[];
}

const DEFAULT_POLICY: ChunkingPolicy = {
  targetChars: Number(process.env.CHUNK_TARGET_CHARS || 1500),
  overlapChars: Number(process.env.CHUNK_OVERLAP_CHARS || 150),
  minBoundaryRatio: Number(process.env.CHUNK_MIN_BOUNDARY_RATIO || 0.5),
  dedupeSimilarityThreshold: Number(process.env.CHUNK_DEDUPE_SIMILARITY || 0.8),
  dedupeMinWordLength: Number(process.env.CHUNK_DEDUPE_MIN_WORD_LENGTH || 3),
};

function toSafePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function toSafeRatio(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  if (parsed >= 1) return 1;
  return parsed;
}

function resolvePolicy(
  overrides: Partial<ChunkingPolicy> | undefined,
): ChunkingPolicy {
  const base = {
    targetChars: toSafePositiveInt(DEFAULT_POLICY.targetChars, 1500),
    overlapChars: toSafePositiveInt(DEFAULT_POLICY.overlapChars, 150),
    minBoundaryRatio: toSafeRatio(DEFAULT_POLICY.minBoundaryRatio, 0.5),
    dedupeSimilarityThreshold: toSafeRatio(
      DEFAULT_POLICY.dedupeSimilarityThreshold,
      0.8,
    ),
    dedupeMinWordLength: toSafePositiveInt(
      DEFAULT_POLICY.dedupeMinWordLength,
      3,
    ),
    customAbbreviations: [] as string[],
  };
  if (!overrides) return base;

  const resolved = {
    targetChars: toSafePositiveInt(overrides.targetChars, base.targetChars),
    overlapChars: toSafePositiveInt(overrides.overlapChars, base.overlapChars),
    minBoundaryRatio: toSafeRatio(
      overrides.minBoundaryRatio,
      base.minBoundaryRatio,
    ),
    dedupeSimilarityThreshold: toSafeRatio(
      overrides.dedupeSimilarityThreshold,
      base.dedupeSimilarityThreshold,
    ),
    dedupeMinWordLength: toSafePositiveInt(
      overrides.dedupeMinWordLength,
      base.dedupeMinWordLength,
    ),
    customAbbreviations: overrides?.customAbbreviations ?? base.customAbbreviations ?? [],
  };

  // Safety: overlapChars must be < targetChars to avoid infinite loops
  if (resolved.overlapChars >= resolved.targetChars) {
    resolved.overlapChars = Math.floor(resolved.targetChars * 0.1);
  }

  return resolved;
}

export function splitTextIntoChunks(
  text: string,
  overrides?: Partial<ChunkingPolicy>,
): string[] {
  const clean = String(text || "").trim();
  if (!clean) return [];

  const policy = resolvePolicy(overrides);
  const extraAbbreviations = policy.customAbbreviations?.length
    ? new Set(policy.customAbbreviations.map((a) => a.toLowerCase()))
    : undefined;

  if (clean.length <= policy.targetChars) return [clean];

  const chunks: string[] = [];
  let offset = 0;

  while (offset < clean.length) {
    let end = Math.min(offset + policy.targetChars, clean.length);

    if (end < clean.length) {
      const minBoundaryOffset =
        offset + policy.targetChars * policy.minBoundaryRatio;
      const paragraphBreak = clean.lastIndexOf("\n\n", end);
      if (paragraphBreak > minBoundaryOffset) {
        end = paragraphBreak;
      } else {
        const sentenceBreak = findSentenceBoundary(
          clean,
          end,
          minBoundaryOffset,
          extraAbbreviations,
        );
        if (sentenceBreak > minBoundaryOffset) {
          end = sentenceBreak;
        }
      }
    }

    const chunk = clean.slice(offset, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;

    const nextOffset = end - policy.overlapChars;
    if (nextOffset <= offset) break;
    offset = nextOffset;
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

export interface ChunkWithOffset {
  content: string;
  startChar: number;
  endChar: number;
}

export function splitTextIntoChunksWithOffsets(
  text: string,
  baseOffset: number = 0,
  overrides?: Partial<ChunkingPolicy>,
): ChunkWithOffset[] {
  const clean = String(text || "").trim();
  if (!clean) return [];

  const policy = resolvePolicy(overrides);
  const extraAbbreviations = policy.customAbbreviations?.length
    ? new Set(policy.customAbbreviations.map((a) => a.toLowerCase()))
    : undefined;

  if (clean.length <= policy.targetChars) {
    return [
      { content: clean, startChar: baseOffset, endChar: baseOffset + clean.length },
    ];
  }

  const chunks: ChunkWithOffset[] = [];
  let offset = 0;

  while (offset < clean.length) {
    let end = Math.min(offset + policy.targetChars, clean.length);

    if (end < clean.length) {
      const minBoundaryOffset =
        offset + policy.targetChars * policy.minBoundaryRatio;
      const paragraphBreak = clean.lastIndexOf("\n\n", end);
      if (paragraphBreak > minBoundaryOffset) {
        end = paragraphBreak;
      } else {
        const sentenceBreak = findSentenceBoundary(
          clean,
          end,
          minBoundaryOffset,
          extraAbbreviations,
        );
        if (sentenceBreak > minBoundaryOffset) {
          end = sentenceBreak;
        }
      }
    }

    const chunk = clean.slice(offset, end).trim();
    if (chunk) {
      // Find actual start position (trim may have removed leading whitespace)
      const trimmedStart = clean.indexOf(chunk, offset);
      const actualStart = trimmedStart >= 0 ? trimmedStart : offset;
      chunks.push({
        content: chunk,
        startChar: baseOffset + actualStart,
        endChar: baseOffset + actualStart + chunk.length,
      });
    }
    if (end >= clean.length) break;

    const nextOffset = end - policy.overlapChars;
    if (nextOffset <= offset) break;
    offset = nextOffset;
  }

  return chunks.filter((c) => c.content.length > 0);
}

const ABBREVIATIONS = new Set([
  "dr", "mr", "mrs", "ms", "prof", "sr", "jr", "st", "ave", "blvd",
  "inc", "corp", "ltd", "co", "dept", "univ", "govt", "approx",
  "vs", "etc", "al", "fig", "vol", "no", "op", "ed", "rev",
  "gen", "gov", "sgt", "cpl", "pvt", "capt", "col", "maj", "lt",
]);

const ABBREVIATION_PATTERNS = [
  /^[A-Z]\.$/,          // Single letter: "U." "S." "A."
  /^[A-Z]\.[A-Z]\.$/,   // Multi-letter: "U.S." "E.U."
  /^e\.g$/i, /^i\.e$/i, /^a\.m$/i, /^p\.m$/i, /^vs$/i,
];

function isAbbreviationDot(
  text: string,
  dotIndex: number,
  extraAbbreviations?: Set<string>,
): boolean {
  let wordStart = dotIndex - 1;
  while (wordStart >= 0 && /[a-zA-Z.]/.test(text[wordStart])) {
    wordStart--;
  }
  wordStart++;
  const wordBeforeDot = text.slice(wordStart, dotIndex).toLowerCase();

  if (ABBREVIATIONS.has(wordBeforeDot)) return true;
  if (extraAbbreviations?.has(wordBeforeDot)) return true;

  const wordWithDot = text.slice(wordStart, dotIndex + 1);
  for (const pat of ABBREVIATION_PATTERNS) {
    if (pat.test(wordWithDot)) return true;
  }

  // If the character after the dot+space is lowercase, likely not a sentence end
  const afterDot = text[dotIndex + 1];
  const twoAfterDot = text[dotIndex + 2];
  if (afterDot === " " && twoAfterDot && /[a-z]/.test(twoAfterDot)) return true;

  return false;
}

function findSentenceBoundary(
  text: string,
  endOffset: number,
  minBoundaryOffset: number,
  extraAbbreviations?: Set<string>,
): number {
  const end = Math.min(endOffset, text.length - 1);
  for (let i = end; i > minBoundaryOffset; i -= 1) {
    const current = text[i];
    if (!/[.!?;:。！？；]/.test(current)) continue;

    // Skip abbreviation dots
    if (current === "." && isAbbreviationDot(text, i, extraAbbreviations)) continue;

    const next = text[i + 1];
    if (!next || /\s/.test(next)) return i + 1;
  }
  return -1;
}

function tokenizeForDedupe(text: string, minWordLength: number): Set<string> {
  const normalized = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const words = normalized
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  const tokens = new Set<string>();
  for (const word of words) {
    // Always include numeric tokens regardless of length (even "5", "10")
    if (/\d/.test(word)) {
      tokens.add(word);
      continue;
    }
    if (word.length >= minWordLength) {
      tokens.add(word);
    }
  }
  return tokens;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

export function deduplicateChunkRecords<
  T extends { content: string; metadata?: { sectionName?: string; sheetName?: string } },
>(
  records: T[],
  overrides?: Partial<ChunkingPolicy>,
): T[] {
  const policy = resolvePolicy(overrides);
  if (!Array.isArray(records) || records.length <= 1) return records || [];

  // Namespace dedup by section/sheet — same text in different sections survives
  const accepted: T[] = [];
  const tokensByNamespace = new Map<string, Set<string>[]>();

  for (const record of records) {
    const ns =
      record.metadata?.sectionName ||
      record.metadata?.sheetName ||
      "__default__";
    const tokens = tokenizeForDedupe(
      record.content,
      policy.dedupeMinWordLength,
    );
    let duplicate = false;

    const nsTokens = tokensByNamespace.get(ns) || [];
    for (const existing of nsTokens) {
      if (
        jaccardSimilarity(tokens, existing) > policy.dedupeSimilarityThreshold
      ) {
        duplicate = true;
        break;
      }
    }

    if (!duplicate) {
      accepted.push(record);
      nsTokens.push(tokens);
      tokensByNamespace.set(ns, nsTokens);
    }
  }

  return accepted;
}
