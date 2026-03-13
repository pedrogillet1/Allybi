import type { ChatResult } from "../domain/chat.types";

export type ResponseEnvelope = {
  ok: boolean;
  data?: ChatResult;
  errorCode?: string;
  message?: string;
  cards?: unknown[];
  worklog?: unknown[];
  revisionId?: string;
};

export function normalizeTurnSuccess(result: ChatResult): ResponseEnvelope {
  return {
    ok: true,
    data: result,
    revisionId: extractRevisionId(result.attachmentsPayload),
  };
}

export function normalizeTurnError(
  errorCode: string,
  message: string,
): ResponseEnvelope {
  return { ok: false, errorCode, message };
}

function extractRevisionId(payload: unknown): string | undefined {
  const readRevisionId = (value: unknown): string | undefined => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const revisionId = (value as { revisionId?: unknown }).revisionId;
    if (typeof revisionId !== "string") return undefined;
    const trimmed = revisionId.trim();
    return trimmed || undefined;
  };

  if (!payload) return undefined;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const revisionId = readRevisionId(item);
      if (revisionId) return revisionId;
    }
  }
  return readRevisionId(payload);
}
