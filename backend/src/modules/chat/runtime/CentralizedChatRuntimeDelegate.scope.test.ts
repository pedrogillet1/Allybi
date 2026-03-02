import "reflect-metadata";
import { describe, expect, test } from "@jest/globals";

import {
  applyConversationHistoryDocScopeFallback,
  buildAttachmentDocScopeSignals,
} from "./CentralizedChatRuntimeDelegate";

describe("CentralizedChatRuntimeDelegate doc scope lock behavior", () => {
  test("buildAttachmentDocScopeSignals uses strict docset lock for multi-attachment", () => {
    const signals = buildAttachmentDocScopeSignals(["doc-a", "doc-b"]);
    expect(signals.docScopeLock.mode).toBe("docset");
    expect(signals.docScopeLock.allowedDocumentIds).toEqual(["doc-a", "doc-b"]);
    expect(signals.activeDocId).toBeNull();
    expect(signals.singleDocIntent).toBe(false);
  });

  test("conversation-history fallback does not narrow multi-attachment scope but sets activeDocId hint", () => {
    const baseSignals = buildAttachmentDocScopeSignals(["doc-a", "doc-b"]);
    const merged = applyConversationHistoryDocScopeFallback({
      signals: baseSignals,
      attachedDocumentIds: ["doc-a", "doc-b"],
      lastDocumentId: "doc-a",
    });
    expect(merged.docScopeLock.mode).toBe("docset");
    expect(merged.docScopeLock.allowedDocumentIds).toEqual(["doc-a", "doc-b"]);
    expect(merged.activeDocId).toBe("doc-a");
    expect(merged.singleDocIntent).toBe(false);
  });

  test("conversation-history fallback narrows single-attachment follow-up", () => {
    const baseSignals = buildAttachmentDocScopeSignals(["doc-a"]);
    const merged = applyConversationHistoryDocScopeFallback({
      signals: {
        ...baseSignals,
        resolvedDocId: null,
        explicitDocRef: false,
        singleDocIntent: false,
      },
      attachedDocumentIds: ["doc-a"],
      lastDocumentId: "doc-a",
    });
    expect(merged.docScopeLock.mode).toBe("single_doc");
    expect(merged.docScopeLock.allowedDocumentIds).toEqual(["doc-a"]);
    expect(merged.activeDocId).toBe("doc-a");
    expect(merged.explicitDocRef).toBe(true);
    expect(merged.singleDocIntent).toBe(true);
  });
});
