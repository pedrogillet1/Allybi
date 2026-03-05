import {
  extractTablesFromText,
  formatAsMarkdownTable,
} from "../pdfTableExtractor";

describe("pdfTableExtractor", () => {
  describe("isLikelyTableRow (via extractTablesFromText)", () => {
    it("detects table with 3+ space columns", () => {
      const text = [
        "Revenue     2024   2023",
        "Growth      15%    12%",
        "Margin      22%    19%",
      ].join("\n");
      const result = extractTablesFromText(text);
      expect(result.tableCount).toBeGreaterThanOrEqual(1);
      expect(result.tables[0].rows.length).toBe(3);
    });

    it("detects table with tab-separated columns", () => {
      const text = [
        "Name\tAge\tCity",
        "Alice\t30\tNY",
        "Bob\t25\tSF",
      ].join("\n");
      const result = extractTablesFromText(text);
      expect(result.tableCount).toBe(1);
    });

    it("does not detect numbered lists as tables", () => {
      const text = [
        "1. First item in the list     with some extra space",
        "2. Second item in the list    with some extra space",
        "3. Third item in the list     with some extra space",
      ].join("\n");
      const result = extractTablesFromText(text);
      expect(result.tableCount).toBe(0);
    });

    it("does not detect bullet lists as tables", () => {
      const text = [
        "- Item alpha                  description here",
        "- Item beta                   description here",
        "- Item gamma                  description here",
      ].join("\n");
      const result = extractTablesFromText(text);
      expect(result.tableCount).toBe(0);
    });

    it("does not detect plain prose as a table", () => {
      const text = [
        "This is a paragraph of text that discusses various topics.",
        "It continues across multiple lines with normal spacing.",
        "There is nothing tabular about this content at all.",
      ].join("\n");
      const result = extractTablesFromText(text);
      expect(result.tableCount).toBe(0);
    });

    it("detects table preceded and followed by prose", () => {
      const text = [
        "Here is the quarterly report summary.",
        "",
        "Revenue     2024   2023",
        "Growth      15%    12%",
        "Margin      22%    19%",
        "",
        "As shown above, growth improved.",
      ].join("\n");
      const result = extractTablesFromText(text);
      expect(result.tableCount).toBe(1);
      expect(result.tables[0].rows.length).toBe(3);
    });
  });

  describe("formatAsMarkdownTable", () => {
    it("formats rows into valid markdown", () => {
      const rows = [
        ["Header A", "Header B"],
        ["Value 1", "Value 2"],
      ];
      const md = formatAsMarkdownTable(rows);
      expect(md).toContain("| Header A");
      expect(md).toContain("| Value 1");
      expect(md).toContain("---");
    });

    it("normalizes uneven row lengths", () => {
      const rows = [
        ["A", "B", "C"],
        ["1", "2"],
      ];
      const md = formatAsMarkdownTable(rows);
      const lines = md.trim().split("\n");
      // Header + separator + 1 data row = 3 lines
      expect(lines.length).toBe(3);
    });
  });

  describe("table marker cleanup", () => {
    it("does not inject TABLE START/END markers into output", () => {
      const text = [
        "Revenue     2024   2023",
        "Growth      15%    12%",
        "Margin      22%    19%",
      ].join("\n");
      const result = extractTablesFromText(text);
      expect(result.text).not.toContain("[TABLE START]");
      expect(result.text).not.toContain("[TABLE END]");
    });

    it("output contains pipe-delimited markdown table", () => {
      const text = [
        "Revenue     2024   2023",
        "Growth      15%    12%",
      ].join("\n");
      const result = extractTablesFromText(text);
      expect(result.text).toContain("|");
      expect(result.text).toContain("---");
    });
  });

  describe("column position detection", () => {
    it("correctly splits rows by detected column positions", () => {
      const text = [
        "Item         Qty   Price",
        "Widget       100   9.99",
        "Gadget       50    19.99",
      ].join("\n");
      const result = extractTablesFromText(text);
      expect(result.tableCount).toBe(1);
      const firstRow = result.tables[0].rows[0];
      expect(firstRow.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("deterministic replacement", () => {
    it("replaces repeated table blocks without collapsing distinct regions", () => {
      const block = [
        "Metric     2024   2023",
        "Revenue    120    100",
      ].join("\n");
      const text = [block, "", "Narrative line", "", block].join("\n");
      const result = extractTablesFromText(text);

      expect(result.tableCount).toBe(2);
      const firstIdx = result.text.indexOf("| Metric");
      const secondIdx = result.text.indexOf("| Metric", firstIdx + 1);
      expect(firstIdx).toBeGreaterThanOrEqual(0);
      expect(secondIdx).toBeGreaterThan(firstIdx);
      expect(result.text).toContain("Narrative line");
    });
  });
});
