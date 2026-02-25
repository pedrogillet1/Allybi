import "reflect-metadata";
import { describe, expect, it } from "@jest/globals";

import { buildAttachmentDocScopeSignals } from "./CentralizedChatRuntimeDelegate";

describe("buildAttachmentDocScopeSignals", () => {
  it("builds strict docset lock for multiple attachments", () => {
    const out = buildAttachmentDocScopeSignals(["doc-1", "doc-2", "doc-1"]);

    expect(out.docScopeLock?.mode).toBe("docset");
    expect(out.docScopeLock?.allowedDocumentIds).toEqual(["doc-1", "doc-2"]);
    expect(out.explicitDocLock).toBe(true);
    expect(out.hardScopeActive).toBe(true);
    expect(out.activeDocId).toBeNull();
    expect(out.singleDocIntent).toBe(false);
  });

  it("builds strict single-doc lock for one attachment", () => {
    const out = buildAttachmentDocScopeSignals(["doc-1"]);

    expect(out.docScopeLock?.mode).toBe("single_doc");
    expect(out.docScopeLock?.allowedDocumentIds).toEqual(["doc-1"]);
    expect(out.activeDocId).toBe("doc-1");
    expect(out.explicitDocRef).toBe(true);
    expect(out.resolvedDocId).toBe("doc-1");
    expect(out.singleDocIntent).toBe(true);
  });
});
