import type { RetrievalRequest } from "../../../services/core/retrieval/retrieval.types";
import {
  buildAttachmentDocScopeLock,
  createDocScopeLock,
} from "../../../services/core/retrieval/docScopeLock";

type DocScopeSignals = Pick<
  RetrievalRequest["signals"],
  | "docScopeLock"
  | "explicitDocLock"
  | "activeDocId"
  | "explicitDocRef"
  | "resolvedDocId"
  | "hardScopeActive"
  | "singleDocIntent"
>;

export function buildAttachmentDocScopeSignals(
  attachedDocumentIds: string[],
): DocScopeSignals {
  const docScopeLock = buildAttachmentDocScopeLock(attachedDocumentIds);
  const activeDocId =
    docScopeLock.mode === "single_doc"
      ? docScopeLock.activeDocumentId || null
      : null;

  return {
    docScopeLock,
    explicitDocLock: docScopeLock.mode !== "none",
    activeDocId,
    explicitDocRef: docScopeLock.mode === "single_doc",
    resolvedDocId: activeDocId,
    hardScopeActive: docScopeLock.mode !== "none",
    singleDocIntent: docScopeLock.mode === "single_doc",
  };
}

export function applyConversationHistoryDocScopeFallback(params: {
  signals: DocScopeSignals;
  attachedDocumentIds: string[];
  lastDocumentId?: string | null;
}): DocScopeSignals {
  const signals = { ...params.signals };
  const lastDocumentId = String(params.lastDocumentId || "").trim();
  if (!lastDocumentId) return signals;
  if (signals.resolvedDocId || signals.singleDocIntent) return signals;
  if (!params.attachedDocumentIds.includes(lastDocumentId)) return signals;
  if (params.attachedDocumentIds.length !== 1) return signals;

  signals.docScopeLock = createDocScopeLock({
    mode: "single_doc",
    allowedDocumentIds: [lastDocumentId],
    activeDocumentId: lastDocumentId,
    source: "system",
  });
  signals.explicitDocLock = true;
  signals.activeDocId = lastDocumentId;
  signals.explicitDocRef = true;
  signals.resolvedDocId = lastDocumentId;
  signals.hardScopeActive = true;
  signals.singleDocIntent = true;
  return signals;
}
