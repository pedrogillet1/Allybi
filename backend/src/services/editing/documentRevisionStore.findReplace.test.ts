import fs from "fs";
import path from "path";
import { describe, expect, test, jest } from "@jest/globals";

jest.mock("../../queues/document.queue", () => ({
  addDocumentJob: jest.fn(),
  processDocumentJobData: jest.fn(),
}));

jest.mock("../jobs/pubsubPublisher.service", () => ({
  isPubSubAvailable: jest.fn(() => false),
  publishExtractJob: jest.fn(),
}));

import DocumentRevisionStoreService from "./documentRevisionStore.service";
import { DocxAnchorsService } from "./docx/docxAnchors.service";

describe("DocumentRevisionStoreService DOCX find/replace patch", () => {
  test("applies docx_find_replace patch across DOCX paragraphs", async () => {
    const fixturePath = path.resolve(
      process.cwd(),
      "src/tests/fixtures/sample.docx",
    );
    const original = fs.readFileSync(fixturePath);
    const anchorsService = new DocxAnchorsService();
    const anchors = await anchorsService.extractParagraphNodes(original);
    const seed = anchors.find((node) => {
      const text = String(node.text || "").trim();
      return text.split(/\s+/).filter(Boolean).length >= 2;
    });
    expect(seed).toBeTruthy();
    const baseText = String(seed?.text || "").trim();
    const sourceWord = baseText.split(/\s+/)[0];
    expect(sourceWord).toBeTruthy();

    const replacementWord = `${sourceWord}_ALLYBI_TEST`;
    const service = new DocumentRevisionStoreService();
    const out = await (service as any).applyDocxFindReplacePatch(original, {
      kind: "docx_find_replace",
      findText: sourceWord,
      replaceText: replacementWord,
      wholeWord: true,
      matchCase: false,
      useRegex: false,
    });

    expect(Buffer.isBuffer(out.buffer)).toBe(true);
    expect(out.buffer.equals(original)).toBe(false);
    expect(Array.isArray(out.affectedParagraphIds)).toBe(true);
    expect(out.affectedParagraphIds.length).toBeGreaterThan(0);
    expect(Number(out.replacements || 0)).toBeGreaterThan(0);

    const editedAnchors = await anchorsService.extractParagraphNodes(
      out.buffer,
    );
    const hasReplacement = editedAnchors.some((node) =>
      String(node.text || "").includes(replacementWord),
    );
    expect(hasReplacement).toBe(true);
  });
});
