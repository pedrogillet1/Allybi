import type { AnswerMode } from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";
import { getSourceButtonsService } from "../../../services/core/retrieval/sourceButtons.service";
import { normalizeChatLanguage } from "./chatRuntimeLanguage";
import {
  buildSourcesFromEvidence,
  ensureFallbackSourceCoverage,
} from "./chatRuntimeSourcePolicy";

export class SourceAssemblyService {
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
}
