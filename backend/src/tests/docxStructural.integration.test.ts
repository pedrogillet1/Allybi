/**
 * DOCX Structural Editing — Integration Tests
 * =============================================
 * Exercises the structural mutation methods on DocxEditorService:
 *   - mergeParagraphs
 *   - splitParagraphToList
 *   - setTextCase
 *   - restartListNumbering
 *   - deleteParagraph
 *
 * Each test builds a minimal DOCX in memory, applies a structural
 * mutation, then re-extracts anchors to verify the outcome.
 */

import AdmZip from "adm-zip";
import { DocxAnchorsService } from "../services/editing/docx/docxAnchors.service";
import { DocxEditorService } from "../services/editing/docx/docxEditor.service";

/* ------------------------------------------------------------------ */
/*  Fixture builder                                                    */
/* ------------------------------------------------------------------ */

function buildStructuralDocx(): Buffer {
  const zip = new AdmZip();

  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="\u2022"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="2">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>
</w:numbering>`;

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Project Overview</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>This project covers three main areas of work.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>Requirements</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>First requirement item</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Second requirement item</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Third requirement item</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Fourth requirement item</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>Timeline</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>
      <w:r><w:t>Phase one starts in January</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>
      <w:r><w:t>Phase two starts in March</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>
      <w:r><w:t>Phase three starts in June</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>The timeline is subject to change based on resource availability.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>Budget</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Total budget is estimated at fifty thousand dollars. Additional funding may be required for phase three.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  zip.addFile("word/document.xml", Buffer.from(docXml, "utf8"));
  zip.addFile("word/numbering.xml", Buffer.from(numberingXml, "utf8"));
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`,
      "utf8",
    ),
  );

  return zip.toBuffer();
}

/* ------------------------------------------------------------------ */
/*  Shared services (constructed once per suite)                       */
/* ------------------------------------------------------------------ */

const anchors = new DocxAnchorsService();
const editor = new DocxEditorService();

async function extractTexts(buf: Buffer): Promise<string[]> {
  const nodes = await anchors.extractParagraphNodes(buf);
  return nodes.map((n) => n.text);
}

async function findPid(buf: Buffer, textSubstr: string): Promise<string> {
  const nodes = await anchors.extractParagraphNodes(buf);
  const match = nodes.find((n) => n.text.includes(textSubstr));
  if (!match) throw new Error(`Paragraph containing "${textSubstr}" not found`);
  return match.paragraphId;
}

async function findPids(buf: Buffer, textSubstrs: string[]): Promise<string[]> {
  const nodes = await anchors.extractParagraphNodes(buf);
  return textSubstrs.map((substr) => {
    const match = nodes.find((n) => n.text.includes(substr));
    if (!match) throw new Error(`Paragraph containing "${substr}" not found`);
    return match.paragraphId;
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("DOCX Structural Editing", () => {
  let docxBuffer: Buffer;

  beforeEach(() => {
    docxBuffer = buildStructuralDocx();
  });

  // ------- Fixture sanity -------

  test("fixture has expected paragraph count and structure", async () => {
    const nodes = await anchors.extractParagraphNodes(docxBuffer);
    // 14 paragraphs: 1 H1, 1 body, 1 H2, 4 bullets, 1 H2, 3 numbered, 1 body, 1 H2, 1 body
    expect(nodes.length).toBe(14);

    const headings = nodes.filter((n) => n.styleName?.startsWith("Heading"));
    expect(headings.length).toBe(4); // H1 + 3 H2s

    const bullets = nodes.filter((n) => n.text.includes("requirement item"));
    expect(bullets.length).toBe(4);

    const numbered = nodes.filter((n) => n.text.includes("Phase"));
    expect(numbered.length).toBe(3);
  });

  // ------- mergeParagraphs -------

  describe("mergeParagraphs", () => {
    test("merges 4 bullet items into a single paragraph", async () => {
      const pids = await findPids(docxBuffer, [
        "First requirement",
        "Second requirement",
        "Third requirement",
        "Fourth requirement",
      ]);

      const result = await editor.mergeParagraphs(docxBuffer, pids, " ");
      const texts = await extractTexts(result);

      // Should have 14 - 3 = 11 paragraphs (merged 4 → 1)
      expect(texts.length).toBe(11);

      // The merged paragraph should contain all 4 items' text
      const merged = texts.find((t) => t.includes("First requirement"));
      expect(merged).toBeDefined();
      expect(merged).toContain("Second requirement");
      expect(merged).toContain("Third requirement");
      expect(merged).toContain("Fourth requirement");
    });

    test("merges 2 numbered items", async () => {
      const pids = await findPids(docxBuffer, ["Phase one", "Phase two"]);

      const result = await editor.mergeParagraphs(docxBuffer, pids, ". ");
      const texts = await extractTexts(result);

      expect(texts.length).toBe(13); // 14 - 1

      const merged = texts.find((t) => t.includes("Phase one"));
      expect(merged).toContain("Phase two");
    });

    test("merge is a no-op with single paragraph", async () => {
      const pids = await findPids(docxBuffer, ["First requirement"]);

      const result = await editor.mergeParagraphs(docxBuffer, pids, " ");
      const texts = await extractTexts(result);
      expect(texts.length).toBe(14); // unchanged
    });

    test("merge with empty pids returns buffer unchanged", async () => {
      const result = await editor.mergeParagraphs(docxBuffer, [], " ");
      expect(result.equals(docxBuffer)).toBe(true);
    });
  });

  // ------- splitParagraphToList -------

  describe("splitParagraphToList", () => {
    test("splits a body paragraph into bulleted list items", async () => {
      const pid = await findPid(docxBuffer, "Total budget is estimated");
      const items = [
        "Total budget is estimated at fifty thousand dollars.",
        "Additional funding may be required for phase three.",
      ];

      const result = await editor.splitParagraphToList(
        docxBuffer,
        pid,
        items,
        "bulleted",
      );
      const texts = await extractTexts(result);

      // 14 - 1 + 2 = 15 paragraphs
      expect(texts.length).toBe(15);
      expect(texts.some((t) => t.includes("fifty thousand dollars"))).toBe(
        true,
      );
      expect(texts.some((t) => t.includes("Additional funding"))).toBe(true);
    });

    test("splits a paragraph into numbered list items", async () => {
      const pid = await findPid(docxBuffer, "three main areas");
      const items = [
        "Area one: design.",
        "Area two: development.",
        "Area three: testing.",
      ];

      const result = await editor.splitParagraphToList(
        docxBuffer,
        pid,
        items,
        "numbered",
      );
      const texts = await extractTexts(result);

      // 14 - 1 + 3 = 16 paragraphs
      expect(texts.length).toBe(16);
      expect(texts.filter((t) => t.includes("Area")).length).toBe(3);
    });

    test("split with empty items returns original buffer", async () => {
      const pid = await findPid(docxBuffer, "Total budget");
      const result = await editor.splitParagraphToList(
        docxBuffer,
        pid,
        [],
        "bulleted",
      );
      expect(result.equals(docxBuffer)).toBe(true);
    });
  });

  // ------- setTextCase -------

  describe("setTextCase", () => {
    test("converts heading to uppercase", async () => {
      const pid = await findPid(docxBuffer, "Project Overview");
      const result = await editor.setTextCase(docxBuffer, pid, "upper");
      const texts = await extractTexts(result);

      const heading = texts.find((t) => t.includes("PROJECT OVERVIEW"));
      expect(heading).toBeDefined();
    });

    test("converts heading to lowercase", async () => {
      const pid = await findPid(docxBuffer, "Requirements");
      const result = await editor.setTextCase(docxBuffer, pid, "lower");
      const texts = await extractTexts(result);

      expect(texts.some((t) => t === "requirements")).toBe(true);
    });

    test("converts to title case", async () => {
      const pid = await findPid(docxBuffer, "First requirement item");
      const result = await editor.setTextCase(docxBuffer, pid, "title");
      const texts = await extractTexts(result);

      expect(texts.some((t) => t === "First Requirement Item")).toBe(true);
    });

    test("accepts bank/pattern value forms (uppercase, title_case)", async () => {
      const pid = await findPid(docxBuffer, "Project Overview");
      const result = await editor.setTextCase(docxBuffer, pid, "uppercase");
      const texts = await extractTexts(result);
      expect(texts.some((t) => t.includes("PROJECT OVERVIEW"))).toBe(true);

      const pid2 = await findPid(docxBuffer, "Second requirement item");
      const result2 = await editor.setTextCase(docxBuffer, pid2, "title_case");
      const texts2 = await extractTexts(result2);
      expect(texts2.some((t) => t === "Second Requirement Item")).toBe(true);
    });

    test("paragraph count is preserved after text case change", async () => {
      const pid = await findPid(docxBuffer, "Budget");
      const result = await editor.setTextCase(docxBuffer, pid, "upper");
      const texts = await extractTexts(result);
      expect(texts.length).toBe(14);
    });
  });

  // ------- restartListNumbering -------

  describe("restartListNumbering", () => {
    test("creates a new w:num entry in numbering.xml", async () => {
      const pid = await findPid(docxBuffer, "Phase two");
      const result = await editor.restartListNumbering(docxBuffer, pid, 1);

      // Verify numbering.xml was updated
      const zip = new AdmZip(result);
      const numberingEntry = zip.getEntry("word/numbering.xml");
      expect(numberingEntry).not.toBeNull();

      const xml = numberingEntry!.getData().toString("utf8");
      // Should now have 3 w:num entries (original 2 + new one with lvlOverride)
      const numMatches = xml.match(/<w:num\b/g);
      expect(numMatches).not.toBeNull();
      expect(numMatches!.length).toBe(3);

      // The new entry should have a lvlOverride with startOverride
      expect(xml).toContain("lvlOverride");
      expect(xml).toContain("startOverride");
    });

    test("paragraph count is preserved", async () => {
      const pid = await findPid(docxBuffer, "Phase two");
      const result = await editor.restartListNumbering(docxBuffer, pid, 5);
      const texts = await extractTexts(result);
      expect(texts.length).toBe(14);
    });

    test("non-list paragraph is a no-op", async () => {
      const pid = await findPid(docxBuffer, "three main areas");
      const result = await editor.restartListNumbering(docxBuffer, pid, 1);
      // Should return unchanged buffer (no-op for non-list paragraphs)
      const texts = await extractTexts(result);
      expect(texts.length).toBe(14);
    });
  });

  // ------- deleteParagraph -------

  describe("deleteParagraph", () => {
    test("deletes a single body paragraph", async () => {
      const pid = await findPid(docxBuffer, "timeline is subject to change");
      const result = await editor.deleteParagraph(docxBuffer, pid);
      const texts = await extractTexts(result);

      expect(texts.length).toBe(13);
      expect(texts.some((t) => t.includes("timeline is subject"))).toBe(false);
    });

    test("deletes a bullet item without affecting others", async () => {
      const pid = await findPid(docxBuffer, "Third requirement");
      const result = await editor.deleteParagraph(docxBuffer, pid);
      const texts = await extractTexts(result);

      expect(texts.length).toBe(13);
      expect(texts.some((t) => t.includes("Third requirement"))).toBe(false);
      // Others still present
      expect(texts.some((t) => t.includes("First requirement"))).toBe(true);
      expect(texts.some((t) => t.includes("Second requirement"))).toBe(true);
      expect(texts.some((t) => t.includes("Fourth requirement"))).toBe(true);
    });
  });

  // ------- Composition: merge then verify XML integrity -------

  describe("composition", () => {
    test("merge + subsequent edit on same buffer succeeds", async () => {
      // Step 1: Merge bullets
      const bulletPids = await findPids(docxBuffer, [
        "First requirement",
        "Second requirement",
        "Third requirement",
      ]);
      const afterMerge = await editor.mergeParagraphs(
        docxBuffer,
        bulletPids,
        " ",
      );

      // Step 2: Edit the "Budget" heading on the merged buffer
      const budgetPid = await findPid(afterMerge, "Budget");
      const afterEdit = await editor.setTextCase(
        afterMerge,
        budgetPid,
        "upper",
      );

      const texts = await extractTexts(afterEdit);
      expect(texts.some((t) => t.includes("BUDGET"))).toBe(true);
      // Merged paragraph still present
      expect(
        texts.some(
          (t) =>
            t.includes("First requirement") && t.includes("Third requirement"),
        ),
      ).toBe(true);
    });

    test("split then merge round-trips paragraph count correctly", async () => {
      // Split body paragraph into 2 items
      const pid = await findPid(docxBuffer, "Total budget is estimated");
      const afterSplit = await editor.splitParagraphToList(
        docxBuffer,
        pid,
        [
          "Total budget is estimated at fifty thousand dollars.",
          "Additional funding may be required.",
        ],
        "bulleted",
      );
      const splitTexts = await extractTexts(afterSplit);
      expect(splitTexts.length).toBe(15); // 14 - 1 + 2

      // Now merge those 2 back
      const splitPids = await findPids(afterSplit, [
        "fifty thousand",
        "Additional funding",
      ]);
      const afterMerge = await editor.mergeParagraphs(
        afterSplit,
        splitPids,
        " ",
      );
      const mergeTexts = await extractTexts(afterMerge);
      expect(mergeTexts.length).toBe(14); // back to original count
    });
  });
});
