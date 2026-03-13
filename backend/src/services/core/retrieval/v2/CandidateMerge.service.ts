/**
 * CandidateMerge — v2 extraction from RetrievalEngineService
 *
 * Standalone functions for merging phase results into CandidateChunks
 * with provenance tracking, stable IDs, and deduplication.
 *
 * BUG FIX #2: Replaced fragile dedupe key (docId|locationKey|candidateId)
 * with content-based dedupe using a sha256 hash of the normalized snippet
 * prefix. This prevents near-duplicate snippets from different phases
 * from being treated as distinct candidates.
 */

import { logger } from "../../../../utils/logger";
import { parseLocaleNumber } from "./ConflictDetection.service";
import type {
  CandidateChunk,
  CandidateSource,
  CandidateType,
  ChunkLocation,
  RetrievalPhaseResult,
  RetrievalRequest,
  RetrievalScope,
  BankLoader,
} from "../retrieval.types";
import {
  clamp01,
  safeNumber,
  sha256,
  stableLocationKey,
} from "../retrievalEngine.utils";
import { normalizeDocType } from "./DocumentClassification.service";
import { BANK_IDS } from "./retrieval.config";

// ── Candidate Merging ───────────────────────────────────────────────

/**
 * Merge raw phase results into a unified list of CandidateChunks.
 *
 * Each hit from each phase is converted to a CandidateChunk. When the
 * same logical chunk appears in multiple phases (e.g. semantic + lexical),
 * scores are merged via max-per-source and the longest snippet wins.
 *
 * BUG FIX #2: The legacy code used `${docId}|${locationKey}|${candidateId}`
 * as the dedupe key, which could allow near-duplicate snippets through
 * when candidateIds differed across phases. The new key hashes the first
 * 200 characters of the normalized snippet to catch content-level duplicates.
 */
export function mergePhaseCandidates(
  phaseResults: RetrievalPhaseResult[],
  scope: RetrievalScope,
  req: RetrievalRequest,
  bankLoader: BankLoader,
): CandidateChunk[] {
  try {
    return mergePhaseCandidatesCore(phaseResults, scope, req, bankLoader);
  } catch (err) {
    logger.error("[retrieval:candidateMerge] Error in mergePhaseCandidates", {
      error: err instanceof Error ? err.message : String(err),
    });
    const error = new Error("candidate_merge_failed");
    (error as Error & { cause?: unknown; code?: string }).cause = err;
    (error as Error & { cause?: unknown; code?: string }).code =
      "candidate_merge_failed";
    throw error;
  }
}

function mergePhaseCandidatesCore(
  phaseResults: RetrievalPhaseResult[],
  scope: RetrievalScope,
  req: RetrievalRequest,
  bankLoader: BankLoader,
): CandidateChunk[] {
  const out: CandidateChunk[] = [];
  const seen = new Map<string, CandidateChunk>();

  for (const phase of phaseResults) {
    for (let i = 0; i < phase.hits.length; i++) {
      const hit = phase.hits[i] as Record<string, any>;
      const docId = String(hit.docId);
      const score = clamp01(safeNumber(hit.score, 0));
      const loc: ChunkLocation = hit.location ?? {};
      const locationKey =
        hit.locationKey ??
        stableLocationKey(
          docId,
          loc,
          String(hit.chunkId ?? `${phase.phaseId}:${i}`),
        );
      const candidateId = String(
        hit.chunkId ??
          sha256(
            `${phase.source}|${docId}|${locationKey}|${hit.snippet ?? ""}`,
          ).slice(0, 16),
      );

      // BUG FIX #2: content-based dedupe key
      const normalizedSnippet = String(hit.snippet ?? "").trim().toLowerCase();
      const dedupeKey = `${docId}|${loc.page ?? ""}|${sha256(normalizedSnippet.slice(0, 200)).slice(0, 16)}`;

      const existing = seen.get(dedupeKey);
      if (existing) {
        if (phase.source === "semantic") {
          existing.scores.semantic = Math.max(
            existing.scores.semantic ?? 0,
            score,
          );
        } else if (phase.source === "lexical") {
          existing.scores.lexical = Math.max(
            existing.scores.lexical ?? 0,
            score,
          );
        } else if (phase.source === "structural") {
          existing.scores.structural = Math.max(
            existing.scores.structural ?? 0,
            score,
          );
          existing.signals.isAnchorMatch = true;
        }
        if ((hit.snippet ?? "").length > (existing.snippet ?? "").length) {
          existing.snippet = String(hit.snippet ?? "").trim();
        }
        continue;
      }

      const tablePayload = extractTablePayload(hit, req, bankLoader);
      const inferredType: CandidateType = tablePayload ? "table" : "text";
      const snippet = resolveCandidateSnippet(
        String(hit.snippet ?? "").trim(),
        tablePayload,
      );
      // Minimal provenance requirement: docId + (location OR stable locationKey) + snippet
      const provenanceOk = Boolean(docId && locationKey && snippet);

      const candidate: CandidateChunk = {
        candidateId,
        type: inferredType,
        source: phase.source,

        docId,
        docType:
          normalizeDocType(
            (hit as Record<string, any>).docType ??
              (hit as Record<string, any>).documentType ??
              (hit as Record<string, any>).mimeType,
          ) ?? null,
        title: hit.title ?? null,
        filename: hit.filename ?? null,

        location: loc,
        locationKey,

        snippet,
        rawText: null,
        table: tablePayload,

        scores: {
          semantic: phase.source === "semantic" ? score : 0,
          lexical: phase.source === "lexical" ? score : 0,
          structural: phase.source === "structural" ? score : 0,
          penalties: 0,
          final: 0,
        },

        signals: {
          isScopedMatch: scope.hardScopeActive,
          isAnchorMatch: phase.source === "structural",
          tableValidated: tablePayload
            ? !tablePayload?.warnings?.length
            : false,
        },

        provenanceOk,
      };
      seen.set(dedupeKey, candidate);
      out.push(candidate);
    }
  }

  return out;
}

// ── Snippet Resolution ──────────────────────────────────────────────

/**
 * Resolve a snippet string for a candidate. Falls back to table header/row
 * text if the primary snippet is empty.
 */
export function resolveCandidateSnippet(
  snippet: string,
  tablePayload: CandidateChunk["table"],
): string {
  const cleanSnippet = String(snippet || "").trim();
  if (cleanSnippet) return cleanSnippet;
  if (!tablePayload) return "";
  const header = Array.isArray(tablePayload.header)
    ? tablePayload.header
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];
  const firstRow = Array.isArray(tablePayload.rows?.[0])
    ? tablePayload.rows?.[0]
        ?.map((value) => String(value ?? "").trim())
        .filter(Boolean)
    : [];
  const pieces = [header.join(" | "), firstRow.join(" | ")]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return pieces.join(" || ").trim();
}

// ── Table Extraction ────────────────────────────────────────────────

/**
 * Extract a structured table payload from a raw hit, either from an
 * explicit `hit.table` object or by heuristically parsing pipe/tab-
 * delimited text in the snippet.
 */
export function extractTablePayload(
  hit: any,
  req: RetrievalRequest,
  bankLoader: BankLoader,
): CandidateChunk["table"] {
  // Read cap from table_render_policy bank, default 140
  let maxRows = 140;
  try {
    const trp = bankLoader.getBank<any>(BANK_IDS.tableRenderPolicy);
    maxRows = safeNumber(trp?.config?.maxRowsPerChunk, 140);
  } catch { /* bank may not exist; use default */ }

  const explicitTable = hit?.table;
  if (explicitTable && typeof explicitTable === "object") {
    const header = Array.isArray(explicitTable.header)
      ? explicitTable.header
          .map((value: unknown) => String(value ?? "").trim())
          .filter(Boolean)
      : [];

    const rows = Array.isArray(explicitTable.rows)
      ? explicitTable.rows
          .filter((row: unknown) => Array.isArray(row))
          .slice(0, maxRows)
          .map((row: any[]) =>
            row.map((value) =>
              value == null
                ? null
                : typeof value === "number"
                  ? value
                  : String(value),
            ),
          )
      : [];

    if (header.length || rows.length) {
      return {
        header,
        rows,
        structureScore: clamp01(
          safeNumber(explicitTable.structureScore, 0.9),
        ),
        numericIntegrityScore: clamp01(
          safeNumber(explicitTable.numericIntegrityScore, 0.9),
        ),
        warnings: Array.isArray(explicitTable.warnings)
          ? explicitTable.warnings
              .map((value: unknown) => String(value || "").trim())
              .filter(Boolean)
          : undefined,
      };
    }
  }

  const tableExpected = Boolean(
    req.signals.tableExpected || req.signals.userAskedForTable,
  );
  const snippet = String(hit?.snippet || "").trim();
  if (!tableExpected || !snippet) return null;
  const lines = snippet
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  // Only use pipe or tab delimiters — comma is too noisy (conflicts with
  // numeric formatting like "$1,250") and produces false-positive tables.
  const delimiter = lines.some((line) => line.includes("|"))
    ? "|"
    : lines.some((line) => line.includes("\t"))
      ? "\t"
      : "";
  if (!delimiter) return null;

  const parsed = lines
    .map((line) =>
      line
        .split(delimiter)
        .map((value) => value.trim())
        .filter(Boolean),
    )
    .filter((cells) => cells.length >= 2);
  if (parsed.length < 2) return null;
  const header = parsed[0];
  const rows = parsed.slice(1, maxRows + 1).map((row) =>
    row.map((cell) => {
      // Preserve cells that contain unit indicators (currency, percent, etc.)
      const hasUnitIndicator = /[$%€£¥R\$]/.test(cell);
      if (hasUnitIndicator) return cell;
      // Use locale-aware parsing to handle BR/EU formats (e.g. "1.250,00")
      if (/[0-9]/.test(cell)) {
        const numeric = parseLocaleNumber(cell);
        if (Number.isFinite(numeric)) return numeric;
      }
      return cell;
    }),
  );
  return {
    header,
    rows,
    structureScore: 0.65,
    numericIntegrityScore: 0.6,
    warnings: ["heuristic_table_from_snippet"],
  };
}
