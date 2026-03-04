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
import {
  hasPagesArray,
  hasSlidesArray,
  hasSectionsArray,
  hasSheets,
} from "../extraction/extractionResult.types";
import type { InputChunk, InputChunkMetadata } from "./pipelineTypes";
import { normalizeCellUnit } from "./tableUnitNormalization.service";

function parseCellRef(cellRef: string): {
  rowIndex: number | null;
  columnIndex: number | null;
} {
  const normalized = String(cellRef || "").trim().toUpperCase();
  if (!normalized) return { rowIndex: null, columnIndex: null };

  const match = normalized.match(/^([A-Z]+)(\d+)$/);
  if (!match) return { rowIndex: null, columnIndex: null };

  const letters = match[1];
  const rowIndex = Number(match[2]);
  if (!Number.isFinite(rowIndex)) {
    return { rowIndex: null, columnIndex: null };
  }

  let columnIndex = 0;
  for (let i = 0; i < letters.length; i += 1) {
    columnIndex = columnIndex * 26 + (letters.charCodeAt(i) - 64);
  }

  return {
    rowIndex,
    columnIndex: columnIndex > 0 ? columnIndex : null,
  };
}

function toHeaderPath(rowLabel: string, colHeader: string): string[] {
  return [String(rowLabel || "").trim(), String(colHeader || "").trim()].filter(
    Boolean,
  );
}

/**
 * Build input chunks from a typed extraction result.
 * Uses page/slide/section/sheet boundaries when available; falls back to plain text split.
 */
export function buildInputChunks(
  extraction: DispatchedExtractionResult,
  fullText: string,
): InputChunk[] {
  // DOCX: Section-boundary chunking
  if (hasSectionsArray(extraction) && extraction.sections.length > 0) {
    const out: InputChunk[] = [];
    let idx = 0;
    let charOffset = 0;

    const emitSection = (
      section: { heading?: string; level?: number; content?: string; path?: string[] },
      parentPath: string[],
    ) => {
      const sectionName = section.heading || undefined;
      const sectionLevel = section.level ?? 1;
      const sectionPath = section.path ?? (sectionName ? [...parentPath, sectionName] : parentPath);

      // Heading chunk
      if (sectionName) {
        const headingContent = sectionName;
        out.push({
          chunkIndex: idx++,
          content: headingContent,
          metadata: {
            sectionName,
            sectionLevel,
            sectionPath,
            chunkType: "heading",
            startChar: charOffset,
            endChar: charOffset + headingContent.length,
            sourceType: "docx",
          },
        });
        charOffset += headingContent.length + 1;
      }

      // Section body text chunks
      const bodyText = (section.content || "").trim();
      if (bodyText) {
        for (const segment of splitTextIntoChunks(bodyText)) {
          const startChar = charOffset;
          charOffset += segment.length;
          out.push({
            chunkIndex: idx++,
            content: segment,
            metadata: {
              sectionName,
              sectionLevel,
              sectionPath,
              chunkType: "text",
              startChar,
              endChar: charOffset,
              sourceType: "docx",
            },
          });
        }
      }
    };

    for (const section of extraction.sections) {
      emitSection(section, []);
    }

    // Fall back to plain-text split if sections yielded nothing
    if (out.length === 0) {
      const segments = splitTextIntoChunks(fullText.trim());
      return segments.map((content, i) => ({
        chunkIndex: i,
        content,
        metadata: { chunkType: "text" as const, sourceType: "docx" as const },
      }));
    }
    return out;
  }

  // XLSX: Sheet-aware chunking
  if (hasSheets(extraction) && extraction.sheets.length > 0) {
    const out: InputChunk[] = [];
    let idx = 0;

    for (const sheet of extraction.sheets) {
      const sheetName = sheet.sheetName || sheet.name || "Sheet";
      const isFinancial = sheet.isFinancial ?? extraction.isFinancial ?? false;
      const tableId = `sheet:${sheetName}`;

      // Sheet text content chunks
      const textContent = (sheet.textContent || "").trim();
      if (textContent) {
        for (const segment of splitTextIntoChunks(textContent)) {
          out.push({
            chunkIndex: idx++,
            content: segment,
            metadata: {
              sheetName,
              chunkType: "table",
              tableChunkForm: "table_summary",
              tableId,
              isFinancial,
              sourceType: "xlsx",
            },
          });
        }
      }
    }

    // Cell facts: group by row label per sheet
    if (extraction.cellFacts && extraction.cellFacts.length > 0) {
      const bySheetRow = new Map<string, typeof extraction.cellFacts>();
      for (const fact of extraction.cellFacts) {
        const key = `${fact.sheet}||${fact.rowLabel}`;
        const group = bySheetRow.get(key) || [];
        group.push(fact);
        bySheetRow.set(key, group);

        const value = String(fact.displayValue || fact.value || "").trim();
        if (!value) continue;
        const cell = String(fact.cell || "").trim();
        const rowLabel = String(fact.rowLabel || "").trim();
        const colHeader = String(fact.colHeader || "").trim();
        const sheetName = String(fact.sheet || "Sheet").trim();
        const tableId = `sheet:${sheetName}`;
        const location = parseCellRef(cell);
        const unit = normalizeCellUnit({
          value,
          colHeader,
          rowLabel,
        });
        const headerPath = toHeaderPath(rowLabel, colHeader);
        const summaryLeft = headerPath.length
          ? headerPath.join(" / ")
          : cell || "Cell";

        const metadata: InputChunkMetadata = {
          sheetName,
          chunkType: "cell_fact",
          tableChunkForm: "cell_centric",
          tableId,
          rowLabel: rowLabel || undefined,
          colHeader: colHeader || undefined,
          headerPath: headerPath.length ? headerPath : undefined,
          rowIndex: location.rowIndex ?? undefined,
          columnIndex: location.columnIndex ?? undefined,
          cellRef: cell || undefined,
          valueRaw: value || undefined,
          unitRaw: unit.unitRaw ?? undefined,
          unitNormalized: unit.unitNormalized ?? undefined,
          numericValue: unit.numericValue ?? undefined,
          isFinancial: extraction.isFinancial ?? false,
          sourceType: "xlsx",
        };

        out.push({
          chunkIndex: idx++,
          content: `${summaryLeft} = ${value}`,
          metadata,
        });
      }

      for (const [, facts] of bySheetRow) {
        if (facts.length === 0) continue;
        const rowLabel = facts[0].rowLabel;
        const sheetName = facts[0].sheet;
        const tableId = `sheet:${sheetName}`;
        const cellParts = facts.map(
          (f) => `${f.colHeader}: ${f.displayValue || f.value}`,
        );
        const content = `${rowLabel}: ${cellParts.join(" | ")}`;
        out.push({
          chunkIndex: idx++,
          content,
          metadata: {
            sheetName,
            chunkType: "cell_fact",
            tableChunkForm: "row_aggregate",
            tableId,
            rowLabel,
            headerPath: rowLabel ? [rowLabel] : undefined,
            isFinancial: extraction.isFinancial ?? false,
            sourceType: "xlsx",
          },
        });
      }
    }

    if (out.length > 0) return out;
    // Fall through to fallback if sheets yielded nothing
  }

  // PDF: Page-boundary chunking with metadata
  if (hasPagesArray(extraction) && extraction.pages.length > 0) {
    const out: InputChunk[] = [];
    let idx = 0;
    let charOffset = 0;
    for (const p of extraction.pages) {
      const pageText = (p.text || "").trim();
      if (!pageText) continue;
      for (const segment of splitTextIntoChunks(pageText)) {
        const startChar = charOffset;
        charOffset += segment.length;
        out.push({
          chunkIndex: idx++,
          content: segment,
          pageNumber: p.page,
          metadata: {
            chunkType: "text",
            startChar,
            endChar: charOffset,
            ocrConfidence: extraction.ocrConfidence ?? undefined,
            sourceType: "pdf",
          },
        });
      }
    }
    return out;
  }

  // PPTX: Slide-boundary chunking with metadata
  if (hasSlidesArray(extraction) && extraction.slides.length > 0) {
    const out: InputChunk[] = [];
    let idx = 0;
    for (const s of extraction.slides) {
      const slideTitle = s.title || undefined;

      // Slide title as heading chunk
      if (slideTitle) {
        out.push({
          chunkIndex: idx++,
          content: slideTitle,
          pageNumber: s.slide,
          metadata: {
            chunkType: "heading",
            slideTitle,
            sourceType: "pptx",
          },
        });
      }

      // Slide body text
      const bodyText = (s.text || "").trim();
      if (bodyText) {
        for (const segment of splitTextIntoChunks(bodyText)) {
          out.push({
            chunkIndex: idx++,
            content: segment,
            pageNumber: s.slide,
            metadata: {
              chunkType: "text",
              slideTitle,
              sourceType: "pptx",
            },
          });
        }
      }

      // Slide notes as separate chunk
      if (s.notes) {
        const notesText = s.notes.trim();
        if (notesText) {
          for (const segment of splitTextIntoChunks(`Notes: ${notesText}`)) {
            out.push({
              chunkIndex: idx++,
              content: segment,
              pageNumber: s.slide,
              metadata: {
                chunkType: "notes",
                slideTitle,
                hasNotes: true,
                sourceType: "pptx",
              },
            });
          }
        }
      }
    }
    return out;
  }

  // Fallback: For plain text / unknown formats
  const segments = splitTextIntoChunks(fullText.trim());
  return segments.map((content, idx) => ({
    chunkIndex: idx,
    content,
    metadata: { chunkType: "text" as const, sourceType: "text" as const },
  }));
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
