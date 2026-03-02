import { describe, expect, test } from "@jest/globals";

import EditingCapabilityMatrixService from "../../services/editing/capabilities/capabilityMatrix.service";
import { safeEditingBank } from "../../services/editing/banks/bankService";

describe("Editing capability matrix consistency", () => {
  const service = new EditingCapabilityMatrixService();

  test("builds non-empty matrix for docx + sheets + python", () => {
    const matrix = service.build();
    expect(matrix.summary.total).toBeGreaterThan(0);
    expect(matrix.rows.some((row) => row.domain === "docx")).toBe(true);
    expect(matrix.rows.some((row) => row.domain === "sheets")).toBe(true);
    expect(matrix.rows.some((row) => row.domain === "python")).toBe(true);
    expect(matrix.versionHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("contains every operator_catalog docx/excel canonical operator", () => {
    const matrix = service.build();
    const byCanonical = new Set(
      matrix.rows.map((row) => row.canonicalOperator),
    );
    const operatorCatalog = safeEditingBank<any>("operator_catalog");
    const entries = Object.entries(operatorCatalog?.operators || {});
    for (const [canonicalOperator, entry] of entries) {
      const domain = String((entry as any)?.domain || "").toLowerCase();
      if (domain !== "docx" && domain !== "excel") continue;
      expect(byCanonical.has(String(canonicalOperator).toUpperCase())).toBe(
        true,
      );
    }
  });

  test("supported rows should not carry unsupportedReason", () => {
    const matrix = service.build();
    for (const row of matrix.rows) {
      if (row.supported) {
        expect(row.unsupportedReason).toBeNull();
      } else {
        expect(typeof row.unsupportedReason).toBe("string");
      }
    }
  });

  test("contains every operator_catalog python canonical operator", () => {
    const matrix = service.build();
    const byCanonical = new Set(
      matrix.rows
        .filter((row) => row.domain === "python")
        .map((row) => row.canonicalOperator),
    );
    const operatorCatalog = safeEditingBank<any>("operator_catalog");
    const entries = Object.entries(operatorCatalog?.operators || {});
    for (const [canonicalOperator, entry] of entries) {
      const domain = String((entry as any)?.domain || "").toLowerCase();
      if (domain !== "python") continue;
      expect(byCanonical.has(String(canonicalOperator).toUpperCase())).toBe(
        true,
      );
    }
  });
});
