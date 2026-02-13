import { describe, expect, test } from "@jest/globals";
import { buildDocumentCapabilities } from "./capabilities.service";

describe("buildDocumentCapabilities", () => {
  test("builds DOCX capabilities using allybi bank", () => {
    const out = buildDocumentCapabilities({
      documentId: "d1",
      filename: "a.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    expect(out.supports.docx).toBe(true);
    expect(out.operators.canonical).toContain("DOCX_SET_RUN_STYLE");
    expect(out.operators.runtime).toContain("EDIT_DOCX_BUNDLE");
  });

  test("builds XLSX capabilities using allybi bank", () => {
    const out = buildDocumentCapabilities({
      documentId: "d2",
      filename: "a.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(out.supports.sheets).toBe(true);
    expect(out.operators.canonical).toContain("XLSX_CHART_CREATE");
    expect(out.operators.runtime).toContain("CREATE_CHART");
  });
});
