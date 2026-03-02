export interface ChunkingPolicy {
  targetChars: number;
  overlapChars: number;
  minBoundaryRatio: number;
  dedupeSimilarityThreshold: number;
  dedupeMinWordLength: number;
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
  };
  if (!overrides) return base;

  return {
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
  };
}

export function splitTextIntoChunks(
  text: string,
  overrides?: Partial<ChunkingPolicy>,
): string[] {
  const clean = String(text || "").trim();
  if (!clean) return [];

  const policy = resolvePolicy(overrides);
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

function findSentenceBoundary(
  text: string,
  endOffset: number,
  minBoundaryOffset: number,
): number {
  const end = Math.min(endOffset, text.length - 1);
  for (let i = end; i > minBoundaryOffset; i -= 1) {
    const current = text[i];
    if (!/[.!?;:。！？；]/.test(current)) continue;
    const next = text[i + 1];
    if (!next || /\s/.test(next)) return i + 1;
  }
  return -1;
}

function tokenizeForDedupe(text: string, minWordLength: number): Set<string> {
  const normalized = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= minWordLength);
  return new Set(normalized);
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

export function deduplicateChunkRecords<T extends { content: string }>(
  records: T[],
  overrides?: Partial<ChunkingPolicy>,
): T[] {
  const policy = resolvePolicy(overrides);
  if (!Array.isArray(records) || records.length <= 1) return records || [];

  const accepted: T[] = [];
  const acceptedTokens: Set<string>[] = [];

  for (const record of records) {
    const tokens = tokenizeForDedupe(
      record.content,
      policy.dedupeMinWordLength,
    );
    let duplicate = false;

    for (const existing of acceptedTokens) {
      if (
        jaccardSimilarity(tokens, existing) > policy.dedupeSimilarityThreshold
      ) {
        duplicate = true;
        break;
      }
    }

    if (!duplicate) {
      accepted.push(record);
      acceptedTokens.push(tokens);
    }
  }

  return accepted;
}
