/**
 * Chunk Assembly Service
 *
 * Builds input chunks from typed extraction results, with deduplication.
 */

import {
  deduplicateChunkRecords,
  splitTextIntoChunks,
  splitTextIntoChunksWithOffsets,
} from "../chunking.service";
import type { ChunkingPolicy } from "../chunking.service";
import { logger } from "../../../utils/logger";
import type { DispatchedExtractionResult, ExtractedTable } from "../extraction/extractionResult.types";
import {
  hasPagesArray,
  hasSlidesArray,
  hasSectionsArray,
  hasSheets,
} from "../extraction/extractionResult.types";
import type { InputChunk, InputChunkMetadata } from "./pipelineTypes";
import { normalizeCellUnit, checkRowUnitConsistency } from "./tableUnitNormalization.service";

/**
 * Infer a section heading from the first line of a PDF page.
 * Heuristic: short (<120 chars), no trailing period/comma, not all-lowercase.
 */
/**
 * Emit cell_fact chunks from structured extracted tables (PDF, DOCX, PPTX).
 * Mirrors the XLSX cell_fact pattern for cross-format table cell indexing.
 */
function emitCellFactChunks(
  tables: ExtractedTable[],
  ctxMeta: InputChunkMetadata,
  sourceType: string,
  startIdx: number,
): InputChunk[] {
  const out: InputChunk[] = [];
  let idx = startIdx;
  for (const table of tables) {
    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (!cell.text.trim()) continue;
        // Build headerPath from the first row (headers)
        const headerRow = table.rows.find((r) => r.isHeader);
        const colHeader = headerRow?.cells.find((c) => c.colIndex === cell.colIndex)?.text || "";
        out.push({
          chunkIndex: idx++,
          content: `${row.isHeader ? "Header" : "Cell"}: ${cell.text}`,
          pageNumber: table.pageOrSlide,
          metadata: {
            ...ctxMeta,
            chunkType: "cell_fact",
            tableChunkForm: "cell_centric",
            tableId: table.tableId,
            rowIndex: row.rowIndex,
            columnIndex: cell.colIndex,
            colHeader: colHeader || undefined,
            headerPath: colHeader ? [colHeader] : undefined,
            sourceType,
          },
        });
      }
    }
  }
  return out;
}

function inferPageHeading(pageText: string): string | undefined {
  const firstLine = pageText.split("\n")[0]?.trim();
  if (!firstLine) return undefined;
  if (
    firstLine.length > 0 &&
    firstLine.length <= 120 &&
    !firstLine.endsWith(".") &&
    !firstLine.endsWith(",") &&
    firstLine !== firstLine.toLowerCase()
  ) {
    return firstLine;
  }
  return undefined;
}

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

function toHeaderPath(
  rowLabel: string,
  colHeader: string,
  headerHierarchy?: string[],
): string[] {
  const row = String(rowLabel || "").trim();
  if (headerHierarchy && headerHierarchy.length > 0) {
    return [row, ...headerHierarchy].filter(Boolean);
  }
  return [row, String(colHeader || "").trim()].filter(Boolean);
}

/**
 * Build input chunks from a typed extraction result.
 * Uses page/slide/section/sheet boundaries when available; falls back to plain text split.
 */
export function buildInputChunks(
  extraction: DispatchedExtractionResult,
  fullText: string,
  policyOverrides?: Partial<ChunkingPolicy>,
  documentContext?: {
    documentId?: string;
    versionId?: string;
    rootDocumentId?: string;
    isLatestVersion?: boolean;
  },
): InputChunk[] {
  const ctxMeta: Partial<InputChunkMetadata> = {};
  if (documentContext?.documentId) ctxMeta.documentId = documentContext.documentId;
  if (documentContext?.versionId) ctxMeta.versionId = documentContext.versionId;
  if (documentContext?.rootDocumentId) ctxMeta.rootDocumentId = documentContext.rootDocumentId;
  if (documentContext?.isLatestVersion !== undefined) ctxMeta.isLatestVersion = documentContext.isLatestVersion;

  // DOCX: Section-boundary chunking
  if (hasSectionsArray(extraction) && extraction.sections.length > 0) {
    const out: InputChunk[] = [];
    let idx = 0;
    let charOffset = 0;

    const emitSection = (
      section: { heading?: string; level?: number; content?: string; path?: string[]; pageStart?: number },
      parentPath: string[],
    ) => {
      const pageNumber = section.pageStart ?? undefined;
      const sectionName = section.heading || undefined;
      const sectionLevel = section.level ?? 1;
      const sectionPath = section.path ?? (sectionName ? [...parentPath, sectionName] : parentPath);

      // Heading chunk
      if (sectionName) {
        const headingContent = sectionName;
        out.push({
          chunkIndex: idx++,
          content: headingContent,
          pageNumber,
          metadata: {
            ...ctxMeta,
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
        for (const seg of splitTextIntoChunksWithOffsets(bodyText, charOffset, policyOverrides)) {
          out.push({
            chunkIndex: idx++,
            content: seg.content,
            pageNumber,
            metadata: {
              ...ctxMeta,
              sectionName,
              sectionLevel,
              sectionPath,
              chunkType: "text",
              startChar: seg.startChar,
              endChar: seg.endChar,
              sourceType: "docx",
            },
          });
        }
        charOffset += bodyText.length;
      }
    };

    for (const section of extraction.sections) {
      emitSection(section, []);
    }

    // Fall back to plain-text split if sections yielded nothing
    if (out.length === 0) {
      const segments = splitTextIntoChunks(fullText.trim(), policyOverrides);
      const fallback = segments.map((content, i) => ({
        chunkIndex: i,
        content,
        metadata: { ...ctxMeta, chunkType: "text" as const, sourceType: "docx" as const },
      }));
      // Emit cell_fact chunks from structured tables even in fallback
      if (extraction.extractedTables?.length) {
        fallback.push(...emitCellFactChunks(extraction.extractedTables, ctxMeta, "docx", fallback.length));
      }
      return fallback;
    }
    // Emit cell_fact chunks from structured tables
    if (extraction.extractedTables?.length) {
      out.push(...emitCellFactChunks(extraction.extractedTables, ctxMeta, "docx", idx));
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
        for (const segment of splitTextIntoChunks(textContent, policyOverrides)) {
          out.push({
            chunkIndex: idx++,
            content: segment,
            metadata: {
              ...ctxMeta,
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
      // Build per-sheet isFinancial lookup
      const sheetFinancialMap = new Map<string, boolean>();
      for (const sheet of extraction.sheets) {
        const name = sheet.sheetName || sheet.name || "Sheet";
        sheetFinancialMap.set(name, sheet.isFinancial ?? extraction.isFinancial ?? false);
      }

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
        const headerPath = toHeaderPath(rowLabel, colHeader, fact.headerHierarchy);
        const summaryLeft = headerPath.length
          ? headerPath.join(" / ")
          : cell || "Cell";

        const metadata: InputChunkMetadata = {
          ...ctxMeta,
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
          isFinancial: sheetFinancialMap.get(sheetName) ?? extraction.isFinancial ?? false,
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

        // Aggregate dominant unit from row's cell facts
        const unitCounts = new Map<string, number>();
        let dominantUnit: { unitRaw?: string; unitNormalized?: string } = {};
        for (const f of facts) {
          const u = normalizeCellUnit({
            value: String(f.displayValue || f.value || ""),
            colHeader: String(f.colHeader || ""),
            rowLabel: String(f.rowLabel || ""),
          });
          if (u.unitNormalized) {
            const count = (unitCounts.get(u.unitNormalized) || 0) + 1;
            unitCounts.set(u.unitNormalized, count);
            if (!dominantUnit.unitNormalized || count > (unitCounts.get(dominantUnit.unitNormalized!) || 0)) {
              dominantUnit = { unitRaw: u.unitRaw ?? undefined, unitNormalized: u.unitNormalized };
            }
          }
        }

        const cellUnits = facts.map((f) => {
          const u = normalizeCellUnit({
            value: String(f.displayValue || f.value || ""),
            colHeader: String(f.colHeader || ""),
            rowLabel: String(f.rowLabel || ""),
          });
          return { unitNormalized: u.unitNormalized, cellRef: String(f.cell || "") };
        });
        const consistency = checkRowUnitConsistency(cellUnits);

        out.push({
          chunkIndex: idx++,
          content,
          metadata: {
            ...ctxMeta,
            sheetName,
            chunkType: "cell_fact",
            tableChunkForm: "row_aggregate",
            tableId,
            rowLabel,
            headerPath: rowLabel ? [rowLabel] : undefined,
            unitRaw: dominantUnit.unitRaw,
            unitNormalized: dominantUnit.unitNormalized,
            isFinancial: sheetFinancialMap.get(sheetName) ?? extraction.isFinancial ?? false,
            sourceType: "xlsx",
            unitConsistencyWarning: consistency.consistent
              ? undefined
              : `mixed_units:${consistency.conflicts.map((c) => c.unit).join(",")}`,
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

    // Build a lookup from 0-based pageIndex to outline entries when available.
    // outlines[].pageIndex is 0-based; extraction.pages[].page is 1-based.
    const outlinesByPage = new Map<number, { title: string; level: number }>();
    const outlines = (extraction as any).outlines as
      | Array<{ title: string; level: number; pageIndex: number }>
      | undefined;
    if (outlines && outlines.length > 0) {
      for (const entry of outlines) {
        // Use the first (highest-level) outline entry per page
        if (!outlinesByPage.has(entry.pageIndex)) {
          outlinesByPage.set(entry.pageIndex, {
            title: entry.title,
            level: entry.level,
          });
        }
      }
    }

    for (const p of extraction.pages) {
      const pageText = (p.text || "").trim();
      if (!pageText) {
        continue;
      }

      // Prefer outline-derived section name; fall back to heuristic heading
      const pageIndex = p.page - 1; // convert 1-based page to 0-based index
      const outlineEntry = outlinesByPage.get(pageIndex);
      const sectionName = outlineEntry?.title ?? inferPageHeading(pageText);
      const sectionLevel = outlineEntry?.level;

      for (const seg of splitTextIntoChunksWithOffsets(pageText, charOffset, policyOverrides)) {
        out.push({
          chunkIndex: idx++,
          content: seg.content,
          pageNumber: p.page,
          metadata: {
            ...ctxMeta,
            chunkType: "text",
            sectionName,
            ...(sectionLevel !== undefined ? { sectionLevel } : {}),
            startChar: seg.startChar,
            endChar: seg.endChar,
            ocrConfidence: extraction.ocrConfidence ?? undefined,
            sourceType: "pdf",
          },
        });
      }
      charOffset += pageText.length + 1; // +1 for page separator
    }
    // Emit cell_fact chunks from structured tables
    if (extraction.extractedTables?.length) {
      out.push(...emitCellFactChunks(extraction.extractedTables, ctxMeta, "pdf", idx));
    }
    return out;
  }

  // PPTX: Slide-boundary chunking with metadata
  if (hasSlidesArray(extraction) && extraction.slides.length > 0) {
    const out: InputChunk[] = [];
    let idx = 0;
    let charOffset = 0;
    for (const s of extraction.slides) {
      const slideTitle = s.title || undefined;

      // Slide title as heading chunk
      if (slideTitle) {
        out.push({
          chunkIndex: idx++,
          content: slideTitle,
          pageNumber: s.slide,
          metadata: {
            ...ctxMeta,
            chunkType: "heading",
            slideTitle,
            startChar: charOffset,
            endChar: charOffset + slideTitle.length,
            sourceType: "pptx",
          },
        });
        charOffset += slideTitle.length + 1;
      }

      // Slide body text
      const bodyText = (s.text || "").trim();
      if (bodyText) {
        for (const seg of splitTextIntoChunksWithOffsets(bodyText, charOffset, policyOverrides)) {
          out.push({
            chunkIndex: idx++,
            content: seg.content,
            pageNumber: s.slide,
            metadata: {
              ...ctxMeta,
              chunkType: "text",
              slideTitle,
              startChar: seg.startChar,
              endChar: seg.endChar,
              sourceType: "pptx",
            },
          });
        }
        charOffset += bodyText.length + 1;
      }

      // Slide notes as separate chunk
      if (s.notes) {
        const notesText = s.notes.trim();
        if (notesText) {
          const notesContent = `Notes: ${notesText}`;
          for (const seg of splitTextIntoChunksWithOffsets(notesContent, charOffset, policyOverrides)) {
            out.push({
              chunkIndex: idx++,
              content: seg.content,
              pageNumber: s.slide,
              metadata: {
                ...ctxMeta,
                chunkType: "notes",
                slideTitle,
                hasNotes: true,
                startChar: seg.startChar,
                endChar: seg.endChar,
                sourceType: "pptx",
              },
            });
          }
          charOffset += notesContent.length + 1;
        }
      }
    }
    // Emit cell_fact chunks from structured tables
    if (extraction.extractedTables?.length) {
      out.push(...emitCellFactChunks(extraction.extractedTables, ctxMeta, "pptx", idx));
    }
    return out;
  }

  // Fallback: For plain text / unknown formats
  const segments = splitTextIntoChunks(fullText.trim(), policyOverrides);
  return segments.map((content, idx) => ({
    chunkIndex: idx,
    content,
    metadata: { ...ctxMeta, chunkType: "text" as const, sourceType: "text" as const },
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
