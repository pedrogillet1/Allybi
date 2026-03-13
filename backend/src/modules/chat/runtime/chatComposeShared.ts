import type {
  ChatRole,
} from "../domain/chat.contracts";
import type { EvidencePack } from "../../../services/core/retrieval/retrieval.types";
import type {
  EngineEvidencePack,
} from "./chatCompose.types";

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function toPositiveInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
}

export function hashSeed(input: string): number {
  let hash = 0;
  const text = String(input || "");
  for (let idx = 0; idx < text.length; idx += 1) {
    hash = (hash * 31 + text.charCodeAt(idx)) >>> 0;
  }
  return hash >>> 0;
}

export function textForRoleHistory(
  messages: Array<{ role: ChatRole; content: string }>,
): Array<{ role: ChatRole; content: string }> {
  return messages
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").trim(),
    }))
    .filter((message) => message.content.length > 0);
}

export function mergeAttachments(
  modelAttachments: unknown,
  sourceButtonsAttachment: unknown | null,
): unknown[] {
  const model = Array.isArray(modelAttachments)
    ? modelAttachments
    : modelAttachments
      ? [modelAttachments]
      : [];
  if (!sourceButtonsAttachment) return model;
  const hasSourceButtons = model.some((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as Record<string, unknown>).type === "source_buttons";
  });
  if (hasSourceButtons) return model;
  return [sourceButtonsAttachment, ...model];
}

export function toEngineEvidencePack(
  pack: EvidencePack | null,
): EngineEvidencePack | undefined {
  if (!pack || !Array.isArray(pack.evidence) || pack.evidence.length === 0) {
    return undefined;
  }

  return {
    query: {
      original: pack.query.original,
      normalized: pack.query.normalized,
    },
    scope: {
      activeDocId: pack.scope.activeDocId ?? null,
      explicitDocLock: Boolean(pack.scope.explicitDocLock),
    },
    stats: {
      evidenceItems: pack.stats.evidenceItems,
      uniqueDocsInEvidence: pack.stats.uniqueDocsInEvidence,
      topScore: pack.stats.topScore,
      scoreGap: pack.stats.scoreGap,
    },
    evidence: pack.evidence.map((item) => ({
      docId: item.docId,
      title: item.title ?? null,
      filename: item.filename ?? null,
      location: {
        page: item.location.page ?? null,
        sheet: item.location.sheet ?? null,
        slide: item.location.slide ?? null,
        sectionKey: item.location.sectionKey ?? null,
      },
      locationKey: item.locationKey,
      snippet: item.snippet ?? "",
      score: {
        finalScore: item.score.finalScore,
      },
      evidenceType:
        item.evidenceType === "table" ||
        item.evidenceType === "image" ||
        item.evidenceType === "text"
          ? item.evidenceType
          : "text",
    })),
    conflicts: pack.conflicts,
  };
}
