import type { ChatResult } from "../domain/chat.contracts";
import { ContractNormalizer } from "../runtime/ContractNormalizer";
import { stableLocationKey } from "../../../services/core/retrieval/retrievalEngine.utils";

const normalizer = new ContractNormalizer();

function defaultCompletion(result: ChatResult) {
  return {
    answered: Boolean(String(result.assistantText || "").trim()),
    missingSlots: [],
    nextAction: null,
  };
}

function defaultTruncation() {
  return {
    occurred: false,
    reason: null,
    resumeToken: null,
    providerOccurred: false,
    providerReason: null,
    detectorVersion: null,
  };
}

function defaultEvidence(result: ChatResult) {
  const sources = Array.isArray(result.sources) ? result.sources : [];
  return {
    required: false,
    provided: sources.length > 0,
    sourceIds: sources
      .map((s) => String(s?.documentId || "").trim())
      .filter(Boolean),
  };
}

function defaultQualityGates() {
  return {
    allPassed: true,
    failed: [],
  };
}

function defaultWarnings() {
  return [];
}

function parseLocationFromLocationKey(rawValue: unknown): {
  page: number | null;
  slide: number | null;
  sheet: string | null;
  section: string | null;
} {
  const value = String(rawValue || "").trim();
  if (!value) {
    return { page: null, slide: null, sheet: null, section: null };
  }
  const pageMatch = value.match(/\|p:(-?\d+)/i);
  const slideMatch = value.match(/\|sl:(-?\d+)/i);
  const sheetMatch = value.match(/\|s:([^|]+)/i);
  const sectionMatch = value.match(/\|sec:([^|]+)/i);
  const page = pageMatch ? Number(pageMatch[1] || Number.NaN) : Number.NaN;
  const slide = slideMatch ? Number(slideMatch[1] || Number.NaN) : Number.NaN;
  return {
    page: Number.isFinite(page) && page > 0 ? page : null,
    slide: Number.isFinite(slide) && slide > 0 ? slide : null,
    sheet: sheetMatch ? String(sheetMatch[1] || "").trim() || null : null,
    section: sectionMatch ? String(sectionMatch[1] || "").trim() || null : null,
  };
}

function deriveSourcesFromAttachments(attachments: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(attachments)) return [];
  const sourceAttachment = attachments.find((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as Record<string, unknown>).type === "source_buttons";
  }) as Record<string, unknown> | undefined;
  if (!sourceAttachment) return [];
  const buttons = Array.isArray(sourceAttachment.buttons)
    ? sourceAttachment.buttons
    : [];
  return buttons
    .map((button) => {
      if (!button || typeof button !== "object") return null;
      const b = button as Record<string, unknown>;
      const documentId = String(
        b.documentId ?? b.docId ?? b.id ?? "",
      ).trim();
      if (!documentId) return null;
      const title = String(b.title || b.filename || "").trim();
      const location =
        b.location && typeof b.location === "object"
          ? (b.location as Record<string, unknown>)
          : null;
      const locationType = String(location?.type || "").trim().toLowerCase();
      const locationValue = location?.value;
      const locationKeyRaw = String(b.locationKey || "").trim();
      let page: number | null = null;
      let slide: number | null = null;
      let sheet: string | null = null;
      let cell: string | null = null;
      let section: string | null = null;

      if (locationType === "page" && Number.isFinite(Number(locationValue))) {
        page = Number(locationValue);
      }
      if (locationType === "sheet" && String(locationValue || "").trim()) {
        sheet = String(locationValue || "").trim();
      }
      if (locationType === "slide" && Number.isFinite(Number(locationValue))) {
        slide = Number(locationValue);
      }
      if (locationType === "cell" && String(locationValue || "").trim()) {
        cell = String(locationValue || "").trim();
      }
      if (locationType === "section" && String(locationValue || "").trim()) {
        section = String(locationValue || "").trim();
      }

      const parsedFromKey = parseLocationFromLocationKey(locationKeyRaw);
      if (!page && parsedFromKey.page) page = parsedFromKey.page;
      if (!slide && parsedFromKey.slide) slide = parsedFromKey.slide;
      if (!sheet && parsedFromKey.sheet) sheet = parsedFromKey.sheet;
      if (!section && parsedFromKey.section) section = parsedFromKey.section;

      const synthesizedLocationKey =
        documentId && (page || slide || sheet || cell || section)
          ? stableLocationKey(
              documentId,
              {
                page: page ?? undefined,
                slide: slide ?? undefined,
                sheet: sheet ?? undefined,
                sectionKey: cell || section || undefined,
              },
              "1",
            )
          : "";
      const locationKey = locationKeyRaw || synthesizedLocationKey || "";
      const source: Record<string, unknown> = {
        documentId,
        docId: documentId,
        filename: title || null,
        mimeType: b.mimeType ?? null,
        page,
        slide,
        sheet,
        cell,
        section,
      };
      const locationLabel = String(location?.label || "").trim();
      const snippet = String(b.snippet || "").trim();
      if (locationKey) source.locationKey = locationKey;
      if (locationLabel) source.locationLabel = locationLabel;
      if (snippet) source.snippet = snippet;
      return source;
    })
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

export function normalizeChatResult(result: ChatResult): ChatResult {
  return normalizer.normalize(result);
}

export function toChatFinalEvent(result: ChatResult): Record<string, unknown> {
  const normalized = normalizeChatResult(result);
  const attachmentsPayload = normalized.attachmentsPayload || [];
  const explicitSources = Array.isArray(normalized.sources)
    ? normalized.sources
    : [];
  const synthesizedSources =
    explicitSources.length > 0
      ? explicitSources
      : deriveSourcesFromAttachments(attachmentsPayload);
  return {
    type: "final",
    conversationId: normalized.conversationId,
    messageId: normalized.assistantMessageId,
    traceId: normalized.traceId || null,
    content: normalized.assistantText,
    answerMode: normalized.answerMode || "general_answer",
    answerClass: normalized.answerClass || null,
    navType: normalized.navType || null,
    sources: synthesizedSources,
    provenance: (normalized as any).provenance || null,
    attachments: attachmentsPayload,
    answerProvisional: Boolean((normalized as any).answerProvisional),
    answerSourceMode: (normalized as any).answerSourceMode || "chunk",
    indexingInProgress: Boolean((normalized as any).indexingInProgress),
    scopeRelaxed: Boolean((normalized as any).scopeRelaxed),
    status: (normalized as any).status || "success",
    failureCode: (normalized as any).failureCode || null,
    completion: (normalized as any).completion || defaultCompletion(normalized),
    truncation: (normalized as any).truncation || defaultTruncation(),
    evidence: (normalized as any).evidence || defaultEvidence(normalized),
    qualityGates: (normalized as any).qualityGates || defaultQualityGates(),
    userWarning: (normalized as any).userWarning || null,
    warnings: (normalized as any).warnings || defaultWarnings(),
    assistantTelemetry: (normalized as any).assistantTelemetry || null,
    ...(String((normalized as any).scopeRelaxReason || "").trim()
      ? { scopeRelaxReason: (normalized as any).scopeRelaxReason }
      : {}),
    ...(String((normalized as any).fallbackReasonCode || "").trim()
      ? { fallbackReasonCode: (normalized as any).fallbackReasonCode }
      : {}),
    ...(normalized.listing?.length ? { listing: normalized.listing } : {}),
    ...(normalized.breadcrumb?.length
      ? { breadcrumb: normalized.breadcrumb }
      : {}),
    ...(normalized.followups?.length
      ? { followups: normalized.followups }
      : {}),
    ...(normalized.generatedTitle
      ? { generatedTitle: normalized.generatedTitle }
      : {}),
  };
}

export function toChatHttpEnvelope(result: ChatResult): {
  ok: true;
  data: ChatResult;
} {
  return {
    ok: true,
    data: normalizeChatResult(result),
  };
}
