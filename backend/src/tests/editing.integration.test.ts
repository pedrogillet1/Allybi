import fs from "fs/promises";
import path from "path";

import { extractDocxWithAnchors } from "../services/extraction/docxExtractor.service";
import { extractPptxWithAnchors } from "../services/extraction/pptxExtractor.service";
import { extractXlsxWithAnchors } from "../services/extraction/xlsxExtractor.service";
import { DocxAnchorsService } from "../services/editing/docx/docxAnchors.service";
import { DiffBuilderService } from "../services/editing/diffBuilder.service";
import { ensureFixtures } from "./_fixtures";

describe("editing + extraction integration", () => {
  it("extracts DOCX headings/sections and resolves paragraph anchors", async () => {
    const { fixturesDir } = ensureFixtures();
    const buf = await fs.readFile(path.join(fixturesDir, "sample.docx"));

    const extracted = await extractDocxWithAnchors(buf);
    expect(extracted.sourceType).toBe("docx");
    expect(extracted.paragraphCount).toBeGreaterThan(2);
    expect(extracted.headings.length).toBeGreaterThanOrEqual(2);
    expect(extracted.sections.length).toBeGreaterThanOrEqual(1);
    expect(extracted.text.length).toBeGreaterThan(10);

    const anchors = new DocxAnchorsService();
    const nodes = await anchors.extractParagraphNodes(buf);
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    expect(nodes[0]?.paragraphId).toMatch(/^docx:p:/);
  });

  it("extracts PPTX slides and titles/bullets", async () => {
    const { fixturesDir } = ensureFixtures();
    const buf = await fs.readFile(path.join(fixturesDir, "sample.pptx"));

    const extracted = await extractPptxWithAnchors(buf);
    expect(extracted.sourceType).toBe("pptx");
    expect(extracted.slideCount).toBeGreaterThanOrEqual(1);
    expect(extracted.slides.length).toBeGreaterThanOrEqual(1);
    expect(extracted.slides[0]?.title).toContain("Sample Deck Title");
    expect(extracted.text.length).toBeGreaterThan(5);
  });

  it("extracts XLSX structured facts", async () => {
    const { fixturesDir } = ensureFixtures();
    const buf = await fs.readFile(path.join(fixturesDir, "sample.xlsx"));

    const extracted = await extractXlsxWithAnchors(buf);
    expect(extracted.sourceType).toBe("xlsx");
    expect(extracted.sheetCount).toBe(1);
    expect(extracted.cellFacts.length).toBeGreaterThan(3);
    expect(extracted.text.length).toBeGreaterThan(10);
  });

  it("builds safe diffs", () => {
    const diff = new DiffBuilderService();
    const out = diff.buildParagraphDiff(
      "This document is used for fixture testing only.",
      "This document is used for integration testing only.",
    );
    expect(out.kind).toBe("paragraph");
    expect(out.changed).toBe(true);
    expect(out.before).toContain("fixture");
    expect(out.after).toContain("integration");
  });
});

