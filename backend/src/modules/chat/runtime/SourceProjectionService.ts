import type { AnswerMode } from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";
import { getSourceButtonsService } from "../../../services/core/retrieval/sourceButtons.service";
import { normalizeChatLanguage } from "./chatRuntimeLanguage";
import {
  buildSourcesFromEvidence,
  ensureFallbackSourceCoverage,
} from "./chatRuntimeSourcePolicy";

export class SourceProjectionService {
  buildSources(params: {
    retrievalPack: EvidencePack | null;
    answerMode: AnswerMode;
    attachedDocumentIds: string[];
  }) {
    return ensureFallbackSourceCoverage({
      sources: buildSourcesFromEvidence(params.retrievalPack?.evidence ?? []),
      answerMode: params.answerMode,
      attachedDocumentIds: params.attachedDocumentIds,
      retrievalPack: params.retrievalPack,
    });
  }

  buildSourceButtonsAttachment(
    retrievalPack: EvidencePack | null,
    preferredLanguage?: string,
  ): unknown | null {
    if (!retrievalPack || retrievalPack.evidence.length === 0) return null;
    const sourceButtonsService = getSourceButtonsService();
    const rawSources = retrievalPack.evidence.map((item, idx) => {
      const source = buildSourcesFromEvidence([item])[0];
      return {
        documentId: item.docId,
        filename: source?.filename || `Document ${idx + 1}`,
        locationKey: source?.locationKey || undefined,
        pageNumber: source?.page ?? undefined,
        sheetName: source?.sheet ?? undefined,
        cellReference: source?.cell ?? undefined,
        slideNumber: source?.slide ?? undefined,
        sectionTitle: source?.section ?? undefined,
        locationLabel: source?.locationLabel || undefined,
        snippet: String(item.snippet || "").trim() || undefined,
        score: item.score.finalScore,
      };
    });
    return sourceButtonsService.buildSourceButtons(rawSources, {
      context: "qa",
      language: normalizeChatLanguage(preferredLanguage),
    });
  }

  buildSourceButtonsFromSources(
    sources: Array<{
      documentId: string;
      docId?: string;
      filename: string;
      mimeType: string | null;
      page: number | null;
      slide?: number | null;
      sheet?: string | null;
      cell?: string | null;
      section?: string | null;
      locationKey?: string | null;
      locationLabel?: string | null;
      snippet?: string | null;
    }>,
    preferredLanguage?: string,
  ): unknown | null {
    if (sources.length === 0) return null;
    const sourceButtonsService = getSourceButtonsService();
    const rawSources = sources
      .map((source, idx) => {
        const documentId = String(source.documentId || source.docId || "").trim();
        if (!documentId) return null;
        return {
          documentId,
          filename:
            String(source.filename || "").trim() || `Document ${idx + 1}`,
          mimeType: source.mimeType || undefined,
          locationKey: String(source.locationKey || "").trim() || undefined,
          pageNumber:
            Number.isFinite(Number(source.page)) && source.page != null
              ? Number(source.page)
              : undefined,
          sheetName: String(source.sheet || "").trim() || undefined,
          cellReference:
            String(source.cell || "").trim().toUpperCase() || undefined,
          slideNumber:
            Number.isFinite(Number(source.slide)) && source.slide != null
              ? Number(source.slide)
              : undefined,
          sectionTitle: String(source.section || "").trim() || undefined,
          locationLabel: String(source.locationLabel || "").trim() || undefined,
          snippet: String(source.snippet || "").trim() || undefined,
        };
      })
      .filter((source): source is NonNullable<typeof source> => Boolean(source));
    return sourceButtonsService.buildSourceButtons(rawSources, {
      context: "qa",
      language: normalizeChatLanguage(preferredLanguage),
    });
  }
}
