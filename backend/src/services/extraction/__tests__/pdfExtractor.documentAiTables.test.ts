import { normalizeStructuredTableRows } from "../pdfExtractor.service";

describe("normalizeStructuredTableRows", () => {
  it("converts Document AI structured cells into dense row/cell layout", () => {
    const rows = normalizeStructuredTableRows({
      rowCount: 3,
      colCount: 3,
      markdown: "| H1 | H2 | H3 |\n| --- | --- | --- |\n| A | B | C |",
      cells: [
        { rowIndex: 0, colIndex: 0, text: "H1", isHeader: true },
        { rowIndex: 0, colIndex: 1, text: "H2", isHeader: true },
        { rowIndex: 0, colIndex: 2, text: "H3", isHeader: true },
        { rowIndex: 1, colIndex: 0, text: "A", isHeader: false },
        { rowIndex: 1, colIndex: 1, text: "B", isHeader: false },
        { rowIndex: 2, colIndex: 0, text: "C", isHeader: false },
      ],
    });

    expect(rows).toHaveLength(3);
    expect(rows[0].isHeader).toBe(true);
    expect(rows[0].cells.map((c) => c.text)).toEqual(["H1", "H2", "H3"]);
    expect(rows[1].cells.map((c) => c.text)).toEqual(["A", "B", ""]);
    expect(rows[2].cells.map((c) => c.text)).toEqual(["C", "", ""]);
  });

  it("is deterministic when duplicate coordinates arrive in different orders", () => {
    const base = {
      rowCount: 2,
      colCount: 2,
      markdown: "",
      cells: [
        { rowIndex: 0, colIndex: 0, text: "Header", isHeader: true },
        { rowIndex: 0, colIndex: 1, text: "Value", isHeader: true },
        { rowIndex: 1, colIndex: 0, text: "Revenue", isHeader: false },
        { rowIndex: 1, colIndex: 1, text: "1200", isHeader: false },
        { rowIndex: 1, colIndex: 1, text: "1,200", isHeader: false },
      ],
    };

    const rowsA = normalizeStructuredTableRows(base);
    const rowsB = normalizeStructuredTableRows({
      ...base,
      cells: [...base.cells].reverse(),
    });

    expect(rowsA).toEqual(rowsB);
    expect(rowsA[1]?.cells[1]?.text).toBe("1,200");
  });

  it("expands table dimensions when rowCount/colCount under-report cell coordinates", () => {
    const rows = normalizeStructuredTableRows({
      rowCount: 1,
      colCount: 1,
      markdown: "",
      cells: [
        { rowIndex: 0, colIndex: 0, text: "A", isHeader: true },
        { rowIndex: 2, colIndex: 3, text: "Z", isHeader: false },
      ],
    });

    expect(rows).toHaveLength(3);
    expect(rows[2]?.cells).toHaveLength(4);
    expect(rows[2]?.cells[3]?.text).toBe("Z");
  });

  it("preserves colSpan/rowSpan metadata and marks merged continuation cells", () => {
    const rows = normalizeStructuredTableRows({
      rowCount: 2,
      colCount: 2,
      markdown: "",
      cells: [
        { rowIndex: 0, colIndex: 0, text: "Region", isHeader: true, colSpan: 2 },
        { rowIndex: 0, colIndex: 2, text: "Q1", isHeader: true },
        { rowIndex: 1, colIndex: 0, text: "EMEA", isHeader: false, rowSpan: 2 },
        { rowIndex: 1, colIndex: 1, text: "Revenue", isHeader: false },
        { rowIndex: 1, colIndex: 2, text: "120", isHeader: false },
      ],
    } as any);

    expect(rows[0]?.cells[0]?.colSpan).toBe(2);
    expect(rows[0]?.cells[1]?.isMergedContinuation).toBe(true);
    expect(rows[1]?.cells[0]?.rowSpan).toBe(2);
    expect(rows[2]?.cells[0]?.isMergedContinuation).toBe(true);
  });
});
