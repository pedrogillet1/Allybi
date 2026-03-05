import { postProcessText } from "../pdfExtractor.service";

describe("postProcessText", () => {
  // -------------------------------------------------------------------------
  // Edge cases / empty input
  // -------------------------------------------------------------------------
  it("returns empty string unchanged", () => {
    expect(postProcessText("")).toBe("");
  });

  it("returns whitespace-only string unchanged", () => {
    expect(postProcessText("   ")).toBe("   ");
  });

  it("returns null/undefined guard (falsy)", () => {
    // The function checks `!text` first
    expect(postProcessText(null as unknown as string)).toBe(null);
    expect(postProcessText(undefined as unknown as string)).toBe(undefined);
  });

  // -------------------------------------------------------------------------
  // Newline preservation
  // -------------------------------------------------------------------------
  it("preserves single newlines between lines", () => {
    const input = "line one\nline two\nline three";
    expect(postProcessText(input)).toBe("line one\nline two\nline three");
  });

  it("preserves double newlines (paragraph breaks)", () => {
    const input = "paragraph one\n\nparagraph two";
    expect(postProcessText(input)).toBe("paragraph one\n\nparagraph two");
  });

  it("collapses 3+ consecutive blank lines to 2 newlines", () => {
    const input = "first\n\n\n\nsecond";
    expect(postProcessText(input)).toBe("first\n\nsecond");
  });

  it("collapses many blank lines to 2 newlines", () => {
    const input = "first\n\n\n\n\n\n\nsecond";
    expect(postProcessText(input)).toBe("first\n\nsecond");
  });

  // -------------------------------------------------------------------------
  // Multi-space gap preservation (table column detection)
  // -------------------------------------------------------------------------
  it("preserves 3+ space gaps needed for table column detection", () => {
    const input = "Name   Age   City";
    const result = postProcessText(input);
    // The 3-space gaps must survive
    expect(result).toContain("Name   Age   City");
  });

  it("preserves large multi-space gaps (e.g. 5 spaces)", () => {
    const input = "Column A     Column B     Column C";
    const result = postProcessText(input);
    expect(result).toContain("Column A     Column B     Column C");
  });

  it("preserves tab characters within horizontal whitespace runs >= 3 chars", () => {
    // A tab + 2 spaces = 3 chars of horizontal whitespace -> preserved
    const input = "Val1\t  Val2";
    const result = postProcessText(input);
    expect(result).toContain("\t  ");
  });

  it("collapses runs of exactly 2 spaces to 1 space", () => {
    const input = "hello  world";
    expect(postProcessText(input)).toBe("hello world");
  });

  it("collapses single tab to single space", () => {
    const input = "hello\tworld";
    expect(postProcessText(input)).toBe("hello world");
  });

  // -------------------------------------------------------------------------
  // Realistic table layout
  // -------------------------------------------------------------------------
  it("preserves a multi-line table with multi-space column gaps", () => {
    const table = [
      "Item          Qty   Price",
      "Widget A      10    $5.00",
      "Widget B      20    $3.50",
    ].join("\n");

    const result = postProcessText(table);
    const lines = result.split("\n");

    // Each line should still have multi-space gaps detectable by \s{3,}
    for (const line of lines) {
      expect(/\s{3,}/.test(line)).toBe(true);
    }

    expect(lines).toHaveLength(3);
  });

  it("enables extractPDFWithTables column detection after processing", () => {
    // This is the key integration-level assertion: after postProcessText,
    // the \s{3,} pattern used by pdfTableExtractor must still match.
    const rawPdfLine = "Revenue     1,234,567   USD     2024";
    const processed = postProcessText(rawPdfLine);
    const columns = processed
      .split(/\s{3,}/)
      .filter((c) => c.trim().length > 0);
    expect(columns.length).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // Punctuation spacing
  // -------------------------------------------------------------------------
  it("removes extra spaces before punctuation", () => {
    expect(postProcessText("hello .")).toBe("hello.");
    expect(postProcessText("hello ,")).toBe("hello,");
    expect(postProcessText("hello ;")).toBe("hello;");
    expect(postProcessText("hello :")).toBe("hello:");
    expect(postProcessText("hello !")).toBe("hello!");
    expect(postProcessText("hello ?")).toBe("hello?");
  });

  it("adds space after punctuation when missing", () => {
    expect(postProcessText("hello.world")).toBe("hello. world");
    expect(postProcessText("hello,world")).toBe("hello, world");
  });

  it("does not double-space after punctuation that already has a space", () => {
    expect(postProcessText("hello. world")).toBe("hello. world");
  });

  // -------------------------------------------------------------------------
  // Trimming
  // -------------------------------------------------------------------------
  it("trims leading and trailing whitespace", () => {
    expect(postProcessText("  hello world  ")).toBe("hello world");
  });

  it("trims leading and trailing newlines", () => {
    expect(postProcessText("\n\nhello\n\n")).toBe("hello");
  });

  // -------------------------------------------------------------------------
  // Combined behaviour
  // -------------------------------------------------------------------------
  it("handles mixed newlines, double spaces, and multi-space gaps", () => {
    const input = "Header  A     Header B\n\nRow 1  val     123\n\n\n\nRow 2  val     456";
    const result = postProcessText(input);

    // Double spaces collapsed to single
    expect(result).not.toMatch(/Header {2}A/);
    expect(result).toContain("Header A");

    // Multi-space gap preserved
    expect(result).toMatch(/Header A {5}Header B/);

    // 4 newlines collapsed to 2
    expect(result).not.toContain("\n\n\n");
    expect(result).toContain("Row 2");
  });

  // -------------------------------------------------------------------------
  // Regression: old behaviour would destroy everything
  // -------------------------------------------------------------------------
  it("does NOT collapse all whitespace to single spaces (regression)", () => {
    const input = "A     B\nC     D";
    const result = postProcessText(input);

    // Old buggy behaviour would produce "A B C D"
    expect(result).not.toBe("A B C D");

    // Must preserve newline
    expect(result).toContain("\n");

    // Must preserve multi-space gap
    expect(result).toMatch(/A {5}B/);
    expect(result).toMatch(/C {5}D/);
  });
});
