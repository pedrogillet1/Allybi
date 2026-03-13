import { createHash } from "crypto";

import type {
  AnswerMode,
  ChatProvenanceDTO,
  ChatResult,
} from "../domain/chat.contracts";
import type { EvidenceItem, EvidencePack } from "../../../services/core/retrieval/retrieval.types";
import { stableLocationKey } from "../../../services/core/retrieval/retrievalEngine.utils";
import {
  filterSourceButtonsByUsage,
  type SourceButtonsAttachment,
} from "../../../services/core/retrieval/sourceButtons.service";

const CELL_REFERENCE_REGEX =
  /^[A-Za-z]{1,4}[0-9]{1,7}(?::[A-Za-z]{1,4}[0-9]{1,7})?$/;

type ChatSourceEntry = NonNullable<ChatResult["sources"]>[number];

type NormalizedEvidenceLocation = {
  page: number | null;
  slide: number | null;
  sheet: string | null;
  cell: string | null;
  section: string | null;
  locationLabel: string | null;
  locationKey: string | null;
};

function fallbackSourceLabel(docId: string): string {
  const shortId = String(docId || "")
    .trim()
    .slice(0, 8);
  return shortId ? `Document ${shortId}` : "Document";
}

function toPositiveIntegerOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function normalizeEvidenceLocation(
  item: EvidenceItem,
  fallbackChunkIndex: number,
): NormalizedEvidenceLocation {
  const page = toPositiveIntegerOrNull(item.location.page);
  const slide = toPositiveIntegerOrNull(item.location.slide);
  const sheet = String(item.location.sheet || "").trim() || null;
  const sectionKey = String(item.location.sectionKey || "").trim();
  const isCellReference = CELL_REFERENCE_REGEX.test(sectionKey);
  const cell = isCellReference ? sectionKey.toUpperCase() : null;
  const section = !isCellReference ? sectionKey || null : null;
  const locationLabel = page
    ? `Page ${page}`
    : slide
      ? `Slide ${slide}`
      : sheet && cell
        ? `${sheet}!${cell}`
        : sheet
          ? sheet
          : section || null;
  const rawLocationKey = String(item.locationKey || "").trim();
  const locationKey =
    rawLocationKey ||
    stableLocationKey(
      item.docId,
      {
        page,
        sheet,
        slide,
        sectionKey: cell || section || null,
      },
      String(Math.max(1, fallbackChunkIndex)),
    );

  return {
    page,
    slide,
    sheet,
    cell,
    section,
    locationLabel,
    locationKey: String(locationKey || "").trim() || null,
  };
}

function isDocGroundedAnswerMode(answerMode: AnswerMode): boolean {
  return String(answerMode || "").startsWith("doc_grounded");
}

export function buildSourcesFromEvidence(evidence: EvidenceItem[]): ChatSourceEntry[] {
  const seen = new Set<string>();
  const out: ChatSourceEntry[] = [];

  for (const item of evidence) {
    if (!item.docId) continue;
    const normalizedLocation = normalizeEvidenceLocation(item, out.length + 1);
    const dedupeKey = [
      item.docId,
      String(normalizedLocation.locationKey || "").trim().toLowerCase(),
      String(normalizedLocation.page ?? ""),
      String(normalizedLocation.slide ?? ""),
      String(normalizedLocation.sheet || "").trim().toLowerCase(),
      String(normalizedLocation.cell || "").trim().toLowerCase(),
      String(normalizedLocation.section || "").trim().toLowerCase(),
    ].join("|");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      documentId: item.docId,
      docId: item.docId,
      filename: String(
        item.filename || item.title || fallbackSourceLabel(item.docId),
      ),
      mimeType: null,
      page: normalizedLocation.page,
      slide: normalizedLocation.slide,
      sheet: normalizedLocation.sheet,
      cell: normalizedLocation.cell,
      section: normalizedLocation.section,
      locationKey: normalizedLocation.locationKey,
      locationLabel: normalizedLocation.locationLabel,
      snippet: item.snippet || null,
    });
    if (out.length >= 6) break;
  }

  return out;
}

export function ensureFallbackSourceCoverage(params: {
  sources: ChatSourceEntry[];
  answerMode: AnswerMode;
  attachedDocumentIds: string[];
  retrievalPack: EvidencePack | null;
}): ChatSourceEntry[] {
  if (params.sources.length > 0) return params.sources;
  const allowFallbackCoverage =
    params.answerMode === "fallback" || params.answerMode === "help_steps";
  if (!allowFallbackCoverage) return params.sources;

  const attachedDocIds = (params.attachedDocumentIds || [])
    .map((id) => String(id || "").trim())
    .filter((id) => id.length > 0);
  if (attachedDocIds.length === 0) return params.sources;

  const attachedSet = new Set(attachedDocIds);
  const activeDocId = String(
    params.retrievalPack?.scope?.activeDocId || "",
  ).trim();
  const candidateDocIds = Array.isArray(params.retrievalPack?.scope?.candidateDocIds)
    ? params.retrievalPack?.scope?.candidateDocIds
        .map((id) => String(id || "").trim())
        .filter((id) => id.length > 0)
    : [];

  const searchOrder = [activeDocId, ...candidateDocIds, ...attachedDocIds];
  let selectedDocId = "";
  for (const docId of searchOrder) {
    if (!docId || !attachedSet.has(docId)) continue;
    selectedDocId = docId;
    break;
  }
  if (!selectedDocId) {
    selectedDocId = attachedDocIds[0];
  }
  if (!selectedDocId) return params.sources;

  return [
    {
      documentId: selectedDocId,
      filename: fallbackSourceLabel(selectedDocId),
      mimeType: null,
      page: null,
    },
  ];
}

export function resolveSourceInvariantFailureCode(params: {
  answerMode: AnswerMode;
  filteredSources: Array<{ documentId?: string | null }>;
}): "missing_provenance" | null {
  if (!isDocGroundedAnswerMode(params.answerMode)) return null;
  return Array.isArray(params.filteredSources) &&
    params.filteredSources.length === 0
    ? "missing_provenance"
    : null;
}

export function buildEvidenceMapForEnforcer(
  retrievalPack: EvidencePack | null,
): Array<{
  evidenceId: string;
  documentId: string;
  locationKey: string;
  snippetHash: string;
}> {
  const evidence = retrievalPack?.evidence || [];
  const out: Array<{
    evidenceId: string;
    documentId: string;
    locationKey: string;
    snippetHash: string;
  }> = [];
  for (const item of evidence) {
    const documentId = String(item.docId || "").trim();
    const locationKey = String(item.locationKey || "").trim();
    const snippet = String(item.snippet || "").trim();
    if (!documentId || !locationKey || !snippet) continue;
    const evidenceId = `${documentId}:${locationKey}`;
    const snippetHash = createHash("sha256")
      .update(
        String(snippet)
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim(),
      )
      .digest("hex")
      .slice(0, 16);
    out.push({ evidenceId, documentId, locationKey, snippetHash });
  }
  return out;
}

export function filterSourcesByProvenance(
  sources: ChatSourceEntry[],
  provenance: ChatProvenanceDTO | undefined,
  answerText: string,
  options: { enforceScopedSources?: boolean } = {},
): ChatSourceEntry[] {
  if (!provenance || sources.length === 0) {
    return options.enforceScopedSources ? [] : dedupeSourcesByDocId(sources);
  }

  if (provenance.sourceDocumentIds.length > 0) {
    const allowed = new Set(provenance.sourceDocumentIds);
    const filtered = sources.filter((source) => allowed.has(source.documentId));
    const deduped = dedupeSourcesByDocId(filtered.length > 0 ? filtered : sources);

    if (deduped.length > 1 && answerText) {
      const mentioned = deduped.filter((source) => {
        const name = String(source.filename || "").replace(/\.[^.]+$/, "");
        return Boolean(name) && answerText.includes(name);
      });
      if (mentioned.length > 0) return mentioned;
    }

    return deduped.length > 0
      ? deduped
      : options.enforceScopedSources
        ? []
        : dedupeSourcesByDocId(sources).slice(0, 1);
  }

  return options.enforceScopedSources ? [] : dedupeSourcesByDocId(sources);
}

export function filterAttachmentByProvenance(
  attachment: unknown | null,
  provenance: ChatProvenanceDTO | undefined,
  options: { enforceScopedSources?: boolean } = {},
): unknown | null {
  if (!attachment || !provenance) {
    return options.enforceScopedSources ? null : attachment;
  }

  const allowedDocIds = new Set(provenance.sourceDocumentIds);
  if (allowedDocIds.size === 0) {
    return options.enforceScopedSources ? null : attachment;
  }
  return filterSourceButtonsByUsage(
    attachment as SourceButtonsAttachment,
    allowedDocIds,
  );
}

function dedupeSourcesByDocId(sources: ChatSourceEntry[]): ChatSourceEntry[] {
  const seen = new Set<string>();
  const out: ChatSourceEntry[] = [];
  for (const source of sources) {
    if (seen.has(source.documentId)) continue;
    seen.add(source.documentId);
    out.push(source);
  }
  return out;
}
