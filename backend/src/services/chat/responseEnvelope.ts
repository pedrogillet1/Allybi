import type { ChatResult } from "./chat.types";

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

export function normalizeTurnError(errorCode: string, message: string): ResponseEnvelope {
  return { ok: false, errorCode, message };
}

function extractRevisionId(payload: unknown): string | undefined {
  if (!payload) return undefined;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const revisionId = (item as any)?.revisionId;
      if (typeof revisionId === "string" && revisionId.trim()) return revisionId.trim();
    }
  }
  const single = (payload as any)?.revisionId;
  if (typeof single === "string" && single.trim()) return single.trim();
  return undefined;
}
