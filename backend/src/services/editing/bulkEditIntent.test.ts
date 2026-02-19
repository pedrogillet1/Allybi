import { detectBulkEditIntent } from "./bulkEditIntent";

describe("detectBulkEditIntent", () => {
  test("does NOT misroute insertion below last bullet into bullets->paragraph bulk intent", () => {
    const msg =
      "add a paragraph below the last bullet point in the AI understanding section summarizing everything";
    expect(detectBulkEditIntent(msg)).toBeNull();
  });

  test("extracts heading from 'in the <heading> section' bullets->paragraph", () => {
    const msg =
      "summarize all of the bullet points in the ai understanding section into one paragraph";
    expect(detectBulkEditIntent(msg)).toEqual({
      kind: "section_bullets_to_paragraph",
      heading: "ai understanding",
    });
  });

  test("extracts heading with newline 'into one\\nparagraph' phrasing", () => {
    const msg =
      "edit summarize all of the AI understanding bullet points into one\nparagraph";
    expect(detectBulkEditIntent(msg)).toEqual({
      kind: "section_bullets_to_paragraph",
      heading: "AI understanding",
    });
  });

  test("tolerates 'nparagraph' typo", () => {
    const msg =
      "edit summarize all of the AI understanding bullet points into one nparagraph";
    expect(detectBulkEditIntent(msg)).toEqual({
      kind: "section_bullets_to_paragraph",
      heading: "AI understanding",
    });
  });

  test("extracts quoted heading for bullets->paragraph", () => {
    const msg =
      'turn the bullet points under "AI understanding" into one paragraph';
    expect(detectBulkEditIntent(msg)).toEqual({
      kind: "section_bullets_to_paragraph",
      heading: "AI understanding",
    });
  });

  test("does not treat pointer-word 'selected' as a heading", () => {
    const msg =
      "convert the selected bullets into one paragraph. if no bullets are selected, do not guess.";
    expect(detectBulkEditIntent(msg)).toBeNull();
  });

  test("extracts section rewrite heading", () => {
    const msg = 'rewrite the section "AI understanding" to be more concise';
    expect(detectBulkEditIntent(msg)).toEqual({
      kind: "section_rewrite",
      heading: "AI understanding",
    });
  });

  test("detects global replace", () => {
    const msg = 'replace "Allybi" with "Pedro AI" throughout the document';
    expect(detectBulkEditIntent(msg)).toEqual({
      kind: "global_replace",
      from: "Allybi",
      to: "Pedro AI",
    });
  });
});
