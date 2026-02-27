import { describe, test, expect } from "@jest/globals";
import {
  createDocScopeLock,
  buildAttachmentDocScopeLock,
  resolveDocScopeLockFromSignals,
} from "./docScopeLock";
import type { DocScopeLock } from "./docScopeLock";

describe("Retrieval: DocScopeLock benchmark", () => {
  describe("createDocScopeLock", () => {
    test("mode=none when mode is empty", () => {
      const lock = createDocScopeLock({});
      expect(lock.mode).toBe("none");
      expect(lock.allowedDocumentIds).toEqual([]);
    });

    test("mode=docset with multiple allowed document IDs", () => {
      const lock = createDocScopeLock({
        mode: "docset",
        allowedDocumentIds: ["doc-1", "doc-2", "doc-3"],
        source: "attachments",
      });
      expect(lock.mode).toBe("docset");
      expect(lock.allowedDocumentIds).toEqual(["doc-1", "doc-2", "doc-3"]);
      expect(lock.source).toBe("attachments");
    });

    test("mode=single_doc sets activeDocumentId", () => {
      const lock = createDocScopeLock({
        mode: "single_doc",
        allowedDocumentIds: ["doc-1", "doc-2"],
        activeDocumentId: "doc-1",
      });
      expect(lock.mode).toBe("single_doc");
      expect(lock.activeDocumentId).toBe("doc-1");
      expect(lock.allowedDocumentIds).toEqual(["doc-1"]);
    });

    test("mode=single_doc falls back to first allowedDocumentId", () => {
      const lock = createDocScopeLock({
        mode: "single_doc",
        allowedDocumentIds: ["doc-A"],
      });
      expect(lock.activeDocumentId).toBe("doc-A");
    });

    test("mode=single_doc with no doc IDs degrades to none", () => {
      const lock = createDocScopeLock({
        mode: "single_doc",
        allowedDocumentIds: [],
      });
      expect(lock.mode).toBe("none");
    });

    test("normalizes source to system for unknown values", () => {
      const lock = createDocScopeLock({ source: "unknown_source" });
      expect(lock.source).toBe("system");
    });

    test("deduplicates allowedDocumentIds", () => {
      const lock = createDocScopeLock({
        mode: "docset",
        allowedDocumentIds: ["doc-1", "doc-1", "doc-2"],
      });
      expect(lock.allowedDocumentIds).toEqual(["doc-1", "doc-2"]);
    });

    test("trims and filters empty document IDs", () => {
      const lock = createDocScopeLock({
        mode: "docset",
        allowedDocumentIds: ["  doc-1  ", "", null, "doc-2"],
      });
      expect(lock.allowedDocumentIds).toEqual(["doc-1", "doc-2"]);
    });
  });

  describe("buildAttachmentDocScopeLock", () => {
    test("returns none for empty attachments", () => {
      const lock = buildAttachmentDocScopeLock([]);
      expect(lock.mode).toBe("none");
      expect(lock.source).toBe("attachments");
    });

    test("returns single_doc for one attachment", () => {
      const lock = buildAttachmentDocScopeLock(["doc-1"]);
      expect(lock.mode).toBe("single_doc");
      expect(lock.activeDocumentId).toBe("doc-1");
      expect(lock.allowedDocumentIds).toEqual(["doc-1"]);
    });

    test("returns docset for multiple attachments", () => {
      const lock = buildAttachmentDocScopeLock(["doc-1", "doc-2"]);
      expect(lock.mode).toBe("docset");
      expect(lock.allowedDocumentIds).toEqual(["doc-1", "doc-2"]);
      expect(lock.activeDocumentId).toBeUndefined();
    });

    test("deduplicates attachment IDs", () => {
      const lock = buildAttachmentDocScopeLock(["doc-1", "doc-1"]);
      expect(lock.mode).toBe("single_doc");
      expect(lock.allowedDocumentIds).toEqual(["doc-1"]);
    });
  });

  describe("resolveDocScopeLockFromSignals", () => {
    test("returns none when no signals", () => {
      const lock = resolveDocScopeLockFromSignals({});
      expect(lock.mode).toBe("none");
      expect(lock.source).toBe("system");
    });

    test("uses docScopeLock signal when present", () => {
      const lock = resolveDocScopeLockFromSignals({
        docScopeLock: {
          mode: "docset",
          allowedDocumentIds: ["a", "b"],
          source: "user_explicit",
        },
      });
      expect(lock.mode).toBe("docset");
      expect(lock.allowedDocumentIds).toEqual(["a", "b"]);
      expect(lock.source).toBe("user_explicit");
    });

    test("falls back to allowedDocumentIds signal for docset", () => {
      const lock = resolveDocScopeLockFromSignals({
        allowedDocumentIds: ["x", "y"],
      });
      expect(lock.mode).toBe("docset");
      expect(lock.allowedDocumentIds).toEqual(["x", "y"]);
    });

    test("falls back to allowedDocumentIds signal for single_doc", () => {
      const lock = resolveDocScopeLockFromSignals({
        allowedDocumentIds: ["only-one"],
      });
      expect(lock.mode).toBe("single_doc");
      expect(lock.activeDocumentId).toBe("only-one");
    });

    test("falls back to explicitDocRef + resolvedDocId", () => {
      const lock = resolveDocScopeLockFromSignals({
        explicitDocRef: true,
        resolvedDocId: "resolved-doc",
      });
      expect(lock.mode).toBe("single_doc");
      expect(lock.activeDocumentId).toBe("resolved-doc");
      expect(lock.source).toBe("user_explicit");
    });

    test("falls back to explicitDocLock + activeDocId", () => {
      const lock = resolveDocScopeLockFromSignals({
        explicitDocLock: true,
        activeDocId: "active-doc",
      });
      expect(lock.mode).toBe("single_doc");
      expect(lock.activeDocumentId).toBe("active-doc");
    });

    test("falls back to singleDocIntent + activeDocId", () => {
      const lock = resolveDocScopeLockFromSignals({
        singleDocIntent: true,
        activeDocId: "intent-doc",
      });
      expect(lock.mode).toBe("single_doc");
      expect(lock.activeDocumentId).toBe("intent-doc");
    });

    test("signal priority: docScopeLock > allowedDocumentIds > explicitDocRef", () => {
      const lock = resolveDocScopeLockFromSignals({
        docScopeLock: { mode: "docset", allowedDocumentIds: ["priority"] },
        allowedDocumentIds: ["lower"],
        explicitDocRef: true,
        resolvedDocId: "lowest",
      });
      expect(lock.mode).toBe("docset");
      expect(lock.allowedDocumentIds).toEqual(["priority"]);
    });
  });

  describe("benchmark: scope lock throughput", () => {
    test("processes 10k lock creations without error", () => {
      const modes = ["none", "single_doc", "docset"] as const;
      const results: DocScopeLock[] = [];
      for (let i = 0; i < 10_000; i++) {
        results.push(
          createDocScopeLock({
            mode: modes[i % 3],
            allowedDocumentIds: [`doc-${i}`, `doc-${i + 1}`],
            activeDocumentId: `doc-${i}`,
            source: "attachments",
          }),
        );
      }
      expect(results.length).toBe(10_000);
      expect(results[0].mode).toBe("none");
      expect(results[1].mode).toBe("single_doc");
      expect(results[2].mode).toBe("docset");
    });
  });
});
