/**
 * Chunk Assembly Service
 *
 * Builds input chunks from typed extraction results, with deduplication.
 */

import {
  deduplicateChunkRecords,
  splitTextIntoChunks,
} from "../chunking.service";
import { logger } from "../../../utils/logger";
import type { DispatchedExtractionResult } from "../extraction/extractionResult.types";
import { hasPagesArray, hasSlidesArray } from "../extraction/extractionResult.types";
import type { InputChunk } from "./pipelineTypes";

/**
 * Build input chunks from a typed extraction result.
 * Uses page/slide boundaries when available; falls back to plain text split.
 */
export function buildInputChunks(
  extraction: DispatchedExtractionResult,
  fullText: string,
): InputChunk[] {
  // If extractor returned pages (PDF), use them as natural boundaries
  if (hasPagesArray(extraction) && extraction.pages.length > 0) {
    const out: InputChunk[] = [];
    let idx = 0;
    for (const p of extraction.pages) {
      const pageText = (p.text || "").trim();
      if (!pageText) continue;
      for (const segment of splitTextIntoChunks(pageText)) {
        out.push({ chunkIndex: idx++, content: segment, pageNumber: p.page });
      }
    }
    return out;
  }

  // If extractor returned slides (PPTX), use slide boundaries
  if (hasSlidesArray(extraction) && extraction.slides.length > 0) {
    const out: InputChunk[] = [];
    let idx = 0;
    for (const s of extraction.slides) {
      const parts: string[] = [];
      if (s.title) parts.push(s.title);
      if (s.text) parts.push(s.text);
      if (s.notes) parts.push(`Notes: ${s.notes}`);
      const slideText = parts.join("\n\n").trim();
      if (!slideText) continue;
      for (const segment of splitTextIntoChunks(slideText)) {
        out.push({ chunkIndex: idx++, content: segment, pageNumber: s.slide });
      }
    }
    return out;
  }

  // For DOCX / XLSX / plain text: split the full text
  const segments = splitTextIntoChunks(fullText.trim());
  return segments.map((content, idx) => ({ chunkIndex: idx, content }));
}

/**
 * Remove near-duplicate chunks using Jaccard word-set similarity.
 */
export function deduplicateChunks(chunks: InputChunk[]): InputChunk[] {
  if (chunks.length <= 1) return chunks;
  const accepted = deduplicateChunkRecords(chunks, {
    dedupeSimilarityThreshold: 0.8,
    dedupeMinWordLength: 3,
  });
  if (accepted.length < chunks.length) {
    logger.info("[deduplicateChunks] Removed near-duplicate chunks", {
      before: chunks.length,
      after: accepted.length,
      removed: chunks.length - accepted.length,
    });
  }

  return accepted;
}
