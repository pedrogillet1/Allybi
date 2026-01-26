/**
 * Deduplication Library
 *
 * Removes exact duplicates and merges near-duplicates.
 * Ensures unique IDs across the entire repository.
 */

import * as crypto from "crypto";

// ============================================================================
// TYPES
// ============================================================================

export interface PatternItem {
  id: string | number;
  pattern?: string;
  term?: string;
  en?: string;
  pt?: string;
  [key: string]: any;
}

export interface DuplicateGroup {
  hash: string;
  pattern: string;
  occurrences: { source: string; id: string | number; item: PatternItem }[];
}

export interface DedupeResult {
  originalCount: number;
  deduplicatedCount: number;
  removedCount: number;
  duplicateGroups: DuplicateGroup[];
  items: PatternItem[];
}

// ============================================================================
// HASHING
// ============================================================================

function normalizePattern(pattern: string): string {
  return pattern
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/['"]/g, "")
    .replace(/[.,!?]/g, "");
}

function hashPattern(pattern: string): string {
  const normalized = normalizePattern(pattern);
  return crypto.createHash("md5").update(normalized).digest("hex").slice(0, 12);
}

function getPatternText(item: PatternItem): string {
  if (item.pattern) return item.pattern;
  if (item.term) return item.term;
  if (item.en && item.pt) return `${item.en}|${item.pt}`;
  return "";
}

// ============================================================================
// DEDUPLICATION FUNCTIONS
// ============================================================================

/**
 * Find duplicates across multiple sources
 */
export function findDuplicates(
  sources: { name: string; items: PatternItem[] }[]
): DuplicateGroup[] {
  const hashMap = new Map<string, DuplicateGroup>();

  for (const source of sources) {
    for (const item of source.items) {
      const pattern = getPatternText(item);
      if (!pattern) continue;

      const hash = hashPattern(pattern);
      const existing = hashMap.get(hash);

      if (existing) {
        existing.occurrences.push({
          source: source.name,
          id: item.id,
          item,
        });
      } else {
        hashMap.set(hash, {
          hash,
          pattern,
          occurrences: [{ source: source.name, id: item.id, item }],
        });
      }
    }
  }

  // Filter to only groups with duplicates
  return Array.from(hashMap.values())
    .filter((group) => group.occurrences.length > 1)
    .sort((a, b) => b.occurrences.length - a.occurrences.length);
}

/**
 * Deduplicate a single array of items
 */
export function deduplicateItems(
  items: PatternItem[],
  sourceName: string = "default"
): DedupeResult {
  const seen = new Map<string, { item: PatternItem; indices: number[] }>();
  const duplicateGroups: DuplicateGroup[] = [];

  // First pass: collect all patterns and their indices
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const pattern = getPatternText(item);
    if (!pattern) continue;

    const hash = hashPattern(pattern);
    const existing = seen.get(hash);

    if (existing) {
      existing.indices.push(i);
    } else {
      seen.set(hash, { item, indices: [i] });
    }
  }

  // Build duplicate groups and deduplicated list
  const deduplicatedItems: PatternItem[] = [];
  const usedIds = new Set<string>();

  for (const [hash, data] of seen) {
    const pattern = getPatternText(data.item);

    if (data.indices.length > 1) {
      // Record as duplicate group
      duplicateGroups.push({
        hash,
        pattern,
        occurrences: data.indices.map((idx) => ({
          source: sourceName,
          id: items[idx].id,
          item: items[idx],
        })),
      });
    }

    // Keep only the first occurrence with a unique ID
    const firstItem = items[data.indices[0]];
    const id = String(firstItem.id);

    if (!usedIds.has(id)) {
      deduplicatedItems.push(firstItem);
      usedIds.add(id);
    } else {
      // Generate new unique ID
      let newId = 1;
      while (usedIds.has(String(newId))) {
        newId++;
      }
      deduplicatedItems.push({ ...firstItem, id: newId });
      usedIds.add(String(newId));
    }
  }

  return {
    originalCount: items.length,
    deduplicatedCount: deduplicatedItems.length,
    removedCount: items.length - deduplicatedItems.length,
    duplicateGroups,
    items: deduplicatedItems,
  };
}

/**
 * Merge multiple banks with deduplication
 */
export function mergeBanksWithDedupe(
  banks: { name: string; items: PatternItem[] }[]
): {
  items: PatternItem[];
  duplicateGroups: DuplicateGroup[];
  stats: {
    inputCount: number;
    outputCount: number;
    removedCount: number;
  };
} {
  const allItems: PatternItem[] = [];
  const sources: { name: string; items: PatternItem[] }[] = [];

  for (const bank of banks) {
    allItems.push(...bank.items);
    sources.push(bank);
  }

  const duplicateGroups = findDuplicates(sources);

  // Build merged list keeping only first occurrence
  const seen = new Set<string>();
  const mergedItems: PatternItem[] = [];
  const usedIds = new Set<string>();
  let nextId = 1;

  for (const bank of banks) {
    for (const item of bank.items) {
      const pattern = getPatternText(item);
      if (!pattern) continue;

      const hash = hashPattern(pattern);
      if (seen.has(hash)) continue;

      seen.add(hash);

      // Ensure unique ID
      let id = item.id;
      if (usedIds.has(String(id))) {
        while (usedIds.has(String(nextId))) {
          nextId++;
        }
        id = nextId;
        nextId++;
      }

      mergedItems.push({ ...item, id });
      usedIds.add(String(id));
    }
  }

  return {
    items: mergedItems,
    duplicateGroups,
    stats: {
      inputCount: allItems.length,
      outputCount: mergedItems.length,
      removedCount: allItems.length - mergedItems.length,
    },
  };
}

/**
 * Renumber IDs to be sequential starting from 1
 */
export function renumberIds(items: PatternItem[]): PatternItem[] {
  return items.map((item, index) => ({
    ...item,
    id: index + 1,
  }));
}

/**
 * Check for near-duplicates using token set similarity
 */
export function findNearDuplicates(
  items: PatternItem[],
  threshold: number = 0.85
): { item1: PatternItem; item2: PatternItem; similarity: number }[] {
  const nearDuplicates: { item1: PatternItem; item2: PatternItem; similarity: number }[] = [];

  const tokenize = (text: string): Set<string> => {
    return new Set(
      normalizePattern(text)
        .split(/\s+/)
        .filter((t) => t.length > 2)
    );
  };

  const jaccardSimilarity = (set1: Set<string>, set2: Set<string>): number => {
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? intersection.size / union.size : 0;
  };

  // Compare all pairs (expensive, but needed for accuracy)
  for (let i = 0; i < items.length; i++) {
    const pattern1 = getPatternText(items[i]);
    if (!pattern1) continue;

    const tokens1 = tokenize(pattern1);

    for (let j = i + 1; j < items.length; j++) {
      const pattern2 = getPatternText(items[j]);
      if (!pattern2) continue;

      const tokens2 = tokenize(pattern2);
      const similarity = jaccardSimilarity(tokens1, tokens2);

      if (similarity >= threshold) {
        nearDuplicates.push({
          item1: items[i],
          item2: items[j],
          similarity,
        });
      }
    }
  }

  return nearDuplicates.sort((a, b) => b.similarity - a.similarity);
}
