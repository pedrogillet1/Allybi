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
import { recordTableExtractionMethod } from "./pipelineMetrics.service";

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
  sourceType: NonNullable<InputChunkMetadata["sourceType"]>,
  startIdx: number,
): InputChunk[] {
  const out: InputChunk[] = [];
  let idx = startIdx;
  for (const table of tables) {
    if (table.tableMethod) {
      recordTableExtractionMethod(table.tableMethod);
    }
    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (!cell.text.trim()) continue;
        // Build headerPath from the first row (headers)
        const headerRow = table.rows.find((r) => r.isHeader);
        const colHeader = headerRow?.cells.find((c) => c.colIndex === cell.colIndex)?.text || "";
        const rowLabel = row.isHeader
          ? ""
          : String(row.cells.find((c) => c.colIndex === 0)?.text || "").trim();
        const unit = normalizeCellUnit({
          value: cell.text,
          colHeader,
          rowLabel,
        });
        const headerPath = toHeaderPath(rowLabel, colHeader);
        const leftSide = headerPath.length ? headerPath.join(" / ") : "Cell";
        out.push({
          chunkIndex: idx++,
          content: `${leftSide} = ${cell.text}`,
          pageNumber: table.pageOrSlide,
          metadata: {
            ...ctxMeta,
            sectionId: buildSectionId({
              sourceType,
              pageNumber: table.pageOrSlide,
              tableId: table.tableId,
              rowLabel,
              rowIndex: row.rowIndex,
              columnIndex: cell.colIndex,
            }),
            chunkType: "cell_fact",
            tableChunkForm: "cell_centric",
            tableId: table.tableId,
            tableMethod: table.tableMethod,
            tableConfidence: table.tableConfidence,
            tableFallbackReason: table.fallbackReason,
            rowIndex: row.rowIndex,
            columnIndex: cell.colIndex,
            rowSpan: cell.rowSpan,
            colSpan: cell.colSpan,
            isMergedContinuation: cell.isMergedContinuation,
            rowLabel: rowLabel || undefined,
            colHeader: colHeader || undefined,
            headerPath: headerPath.length ? headerPath : undefined,
            valueRaw: cell.text,
            unitRaw: unit.unitRaw ?? undefined,
            unitNormalized: unit.unitNormalized ?? undefined,
            numericValue: unit.numericValue ?? undefined,
            scaleRaw: unit.scaleRaw ?? undefined,
            scaleMultiplier: unit.scaleMultiplier ?? undefined,
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

function compareTokens(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
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

type PeriodParts = { year?: number; month?: number; quarter?: number };

function toBoundedInt(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const normalized = Math.trunc(parsed);
  if (normalized < min || normalized > max) return undefined;
  return normalized;
}

function normalizePeriodParts(period: unknown): PeriodParts {
  if (!period || typeof period !== "object") return {};
  const source = period as Record<string, unknown>;
  const year = toBoundedInt(source.year, 1900, 2200);
  const month = toBoundedInt(source.month, 1, 12);
  const quarter = toBoundedInt(source.quarter, 1, 4);
  return { year, month, quarter };
}

function toCanonicalPeriodTokens(parts: PeriodParts): string[] {
  const out = new Set<string>();
  if (parts.year) out.add(`Y${parts.year}`);
  if (parts.quarter) {
    out.add(`Q${parts.quarter}`);
    if (parts.year) out.add(`Y${parts.year}Q${parts.quarter}`);
  }
  if (parts.month) {
    const padded = String(parts.month).padStart(2, "0");
    out.add(`M${padded}`);
    if (parts.year) out.add(`Y${parts.year}M${padded}`);
  }
  return [...out].sort();
}

function pickDominantNumeric(counts: Map<number, number>): number | undefined {
  let dominant: number | undefined;
  let maxCount = 0;
  for (const [value, count] of counts) {
    if (count > maxCount) {
      dominant = value;
      maxCount = count;
    }
  }
  return dominant;
}

function extractPeriodMetadataFromFact(
  fact: { period?: unknown },
): Pick<
  InputChunkMetadata,
  "periodYear" | "periodMonth" | "periodQuarter" | "periodTokens"
> {
  const period = normalizePeriodParts(fact.period);
  const periodTokens = toCanonicalPeriodTokens(period);
  return {
    periodYear: period.year,
    periodMonth: period.month,
    periodQuarter: period.quarter,
    periodTokens: periodTokens.length > 0 ? periodTokens : undefined,
  };
}

function extractRowAggregatePeriodMetadata(
  facts: Array<{ period?: unknown }>,
): Pick<
  InputChunkMetadata,
  "periodYear" | "periodMonth" | "periodQuarter" | "periodTokens"
> {
  const yearCounts = new Map<number, number>();
  const monthCounts = new Map<number, number>();
  const quarterCounts = new Map<number, number>();
  const tokenSet = new Set<string>();

  for (const fact of facts) {
    const period = normalizePeriodParts(fact.period);
    if (period.year) {
      yearCounts.set(period.year, (yearCounts.get(period.year) ?? 0) + 1);
    }
    if (period.month) {
      monthCounts.set(period.month, (monthCounts.get(period.month) ?? 0) + 1);
    }
    if (period.quarter) {
      quarterCounts.set(
        period.quarter,
        (quarterCounts.get(period.quarter) ?? 0) + 1,
      );
    }
    for (const token of toCanonicalPeriodTokens(period)) {
      tokenSet.add(token);
    }
  }

  return {
    periodYear: pickDominantNumeric(yearCounts),
    periodMonth: pickDominantNumeric(monthCounts),
    periodQuarter: pickDominantNumeric(quarterCounts),
    periodTokens: tokenSet.size > 0 ? [...tokenSet].sort() : undefined,
  };
}

function toSectionToken(value: unknown): string | null {
  const token = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9:_/.-]/g, "");
  return token || null;
}

function stableSectionHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildSectionId(params: {
  sourceType: string;
  sectionPath?: string[];
  sectionName?: string;
  pageNumber?: number;
  slideNumber?: number;
  sheetName?: string;
  tableId?: string;
  rowLabel?: string;
  rowIndex?: number | null;
  columnIndex?: number | null;
}): string | undefined {
  const parts: string[] = [params.sourceType];
  const sectionPath = Array.isArray(params.sectionPath)
    ? params.sectionPath
        .map((item) => toSectionToken(item))
        .filter((item): item is string => Boolean(item))
    : [];
  if (sectionPath.length > 0) parts.push(`path:${sectionPath.join("/")}`);

  const sectionName = toSectionToken(params.sectionName);
  if (sectionName) parts.push(`name:${sectionName}`);

  if (Number.isFinite(params.pageNumber)) {
    parts.push(`p:${Math.trunc(params.pageNumber as number)}`);
  }
  if (Number.isFinite(params.slideNumber)) {
    parts.push(`sl:${Math.trunc(params.slideNumber as number)}`);
  }

  const sheetName = toSectionToken(params.sheetName);
  if (sheetName) parts.push(`sheet:${sheetName}`);

  const tableId = toSectionToken(params.tableId);
  if (tableId) parts.push(`table:${tableId}`);

  const rowLabel = toSectionToken(params.rowLabel);
  if (rowLabel) parts.push(`row:${rowLabel}`);

  if (Number.isFinite(params.rowIndex)) {
    parts.push(`r:${Math.trunc(params.rowIndex as number)}`);
  }
  if (Number.isFinite(params.columnIndex)) {
    parts.push(`c:${Math.trunc(params.columnIndex as number)}`);
  }

  if (parts.length <= 1) return undefined;
  const canonical = parts.join("|");
  const hash = stableSectionHash(canonical).slice(0, 8);
  const base = canonical.length > 200 ? canonical.slice(0, 200) : canonical;
  return `sec:${base}|h:${hash}`;
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
      const sectionId = buildSectionId({
        sourceType: "docx",
        sectionPath,
        sectionName,
        pageNumber,
      });

      // Heading chunk
      if (sectionName) {
        const headingContent = sectionName;
        out.push({
          chunkIndex: idx++,
          content: headingContent,
          pageNumber,
          metadata: {
            ...ctxMeta,
            sectionId,
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
              sectionId,
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
      const fallback: InputChunk[] = segments.map((content, i) => ({
        chunkIndex: i,
        content,
        metadata: {
          ...ctxMeta,
          sectionId: buildSectionId({ sourceType: "docx", sectionName: "fallback" }),
          chunkType: "text" as const,
          sourceType: "docx" as const,
        },
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

    const orderedSheets = [...extraction.sheets].sort((a, b) => {
      const aName = String(a.sheetName || a.name || "Sheet").trim().toLowerCase();
      const bName = String(b.sheetName || b.name || "Sheet").trim().toLowerCase();
      return compareTokens(aName, bName);
    });

    for (const sheet of orderedSheets) {
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
              sectionId: buildSectionId({
                sourceType: "xlsx",
                sheetName,
                tableId,
              }),
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
      for (const sheet of orderedSheets) {
        const name = sheet.sheetName || sheet.name || "Sheet";
        sheetFinancialMap.set(name, sheet.isFinancial ?? extraction.isFinancial ?? false);
      }

      const orderedFacts = [...extraction.cellFacts].sort((a, b) => {
        const aSheet = String(a.sheet || "Sheet").trim().toLowerCase();
        const bSheet = String(b.sheet || "Sheet").trim().toLowerCase();
        const bySheet = compareTokens(aSheet, bSheet);
        if (bySheet !== 0) return bySheet;

        const aRowLabel = String(a.rowLabel || "").trim().toLowerCase();
        const bRowLabel = String(b.rowLabel || "").trim().toLowerCase();
        const byRow = compareTokens(aRowLabel, bRowLabel);
        if (byRow !== 0) return byRow;

        const aRef = parseCellRef(String(a.cell || ""));
        const bRef = parseCellRef(String(b.cell || ""));
        const aRowIndex = aRef.rowIndex ?? Number.MAX_SAFE_INTEGER;
        const bRowIndex = bRef.rowIndex ?? Number.MAX_SAFE_INTEGER;
        if (aRowIndex !== bRowIndex) return aRowIndex - bRowIndex;
        const aColIndex = aRef.columnIndex ?? Number.MAX_SAFE_INTEGER;
        const bColIndex = bRef.columnIndex ?? Number.MAX_SAFE_INTEGER;
        if (aColIndex !== bColIndex) return aColIndex - bColIndex;

        const aHeader = String(a.colHeader || "").trim().toLowerCase();
        const bHeader = String(b.colHeader || "").trim().toLowerCase();
        const byHeader = compareTokens(aHeader, bHeader);
        if (byHeader !== 0) return byHeader;

        const aValue = String(a.displayValue || a.value || "").trim().toLowerCase();
        const bValue = String(b.displayValue || b.value || "").trim().toLowerCase();
        return compareTokens(aValue, bValue);
      });

      const bySheetRow = new Map<string, typeof extraction.cellFacts>();
      for (const fact of orderedFacts) {
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
        const headerPath = toHeaderPath(
          rowLabel,
          colHeader,
          Array.isArray((fact as any).headerHierarchy)
            ? ((fact as any).headerHierarchy as string[])
            : undefined,
        );
        const summaryLeft = headerPath.length
          ? headerPath.join(" / ")
          : cell || "Cell";
        const periodMeta = extractPeriodMetadataFromFact(fact);

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
          periodYear: periodMeta.periodYear,
          periodMonth: periodMeta.periodMonth,
          periodQuarter: periodMeta.periodQuarter,
          periodTokens: periodMeta.periodTokens,
          scaleRaw: unit.scaleRaw ?? undefined,
          scaleMultiplier: unit.scaleMultiplier ?? undefined,
          isFinancial: sheetFinancialMap.get(sheetName) ?? extraction.isFinancial ?? false,
          sourceType: "xlsx",
          sectionId: buildSectionId({
            sourceType: "xlsx",
            sheetName,
            tableId,
            rowLabel,
            rowIndex: location.rowIndex,
            columnIndex: location.columnIndex,
          }),
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
        const scaleCounts = new Map<string, number>();
        let dominantUnit: { unitRaw?: string; unitNormalized?: string } = {};
        let dominantScale: { scaleRaw?: string; scaleMultiplier?: number } = {};
        let dominantScaleCount = 0;
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
          if (u.scaleRaw && typeof u.scaleMultiplier === "number") {
            const scaleKey = `${u.scaleRaw}:${u.scaleMultiplier}`;
            const scaleCount = (scaleCounts.get(scaleKey) || 0) + 1;
            scaleCounts.set(scaleKey, scaleCount);
            if (scaleCount > dominantScaleCount) {
              dominantScale = {
                scaleRaw: u.scaleRaw,
                scaleMultiplier: u.scaleMultiplier,
              };
              dominantScaleCount = scaleCount;
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
        const rowPeriodMeta = extractRowAggregatePeriodMetadata(facts);

        out.push({
          chunkIndex: idx++,
          content,
          metadata: {
            ...ctxMeta,
            sectionId: buildSectionId({
              sourceType: "xlsx",
              sheetName,
              tableId,
              rowLabel,
            }),
            sheetName,
            chunkType: "cell_fact",
            tableChunkForm: "row_aggregate",
            tableId,
            rowLabel,
            headerPath: rowLabel ? [rowLabel] : undefined,
            unitRaw: dominantUnit.unitRaw,
            unitNormalized: dominantUnit.unitNormalized,
            periodYear: rowPeriodMeta.periodYear,
            periodMonth: rowPeriodMeta.periodMonth,
            periodQuarter: rowPeriodMeta.periodQuarter,
            periodTokens: rowPeriodMeta.periodTokens,
            scaleRaw: dominantScale.scaleRaw,
            scaleMultiplier: dominantScale.scaleMultiplier,
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
      const sectionId = buildSectionId({
        sourceType: "pdf",
        sectionName,
        pageNumber: p.page,
      });

      for (const seg of splitTextIntoChunksWithOffsets(pageText, charOffset, policyOverrides)) {
        out.push({
          chunkIndex: idx++,
          content: seg.content,
          pageNumber: p.page,
          metadata: {
            ...ctxMeta,
            sectionId,
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
      const sectionId = buildSectionId({
        sourceType: "pptx",
        sectionName: slideTitle || "slide",
        slideNumber: s.slide,
      });

      // Slide title as heading chunk
      if (slideTitle) {
        out.push({
          chunkIndex: idx++,
          content: slideTitle,
          pageNumber: s.slide,
          metadata: {
            ...ctxMeta,
            sectionId,
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
              sectionId,
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
                sectionId,
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
    metadata: {
      ...ctxMeta,
      sectionId: buildSectionId({ sourceType: "text", sectionName: "plain_text" }),
      chunkType: "text" as const,
      sourceType: "text" as const,
    },
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
