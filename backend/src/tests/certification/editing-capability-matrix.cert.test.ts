import { describe, expect, test } from "@jest/globals";

import EditingCapabilityMatrixService from "../../services/editing/capabilities/capabilityMatrix.service";
import { writeCertificationGateReport } from "./reporting";

describe("Certification: editing capabilities matrix", () => {
  test("exports explicit supported/unsupported matrix for docx+xlsx", () => {
    const matrix = new EditingCapabilityMatrixService().build();
    const failures: string[] = [];

    const duplicateKeys = new Set<string>();
    const seenKeys = new Set<string>();
    for (const row of matrix.rows) {
      const key = `${row.domain}:${row.canonicalOperator}`;
      if (seenKeys.has(key)) duplicateKeys.add(key);
      seenKeys.add(key);
      if (row.supported && row.unsupportedReason) {
        failures.push(`SUPPORTED_ROW_HAS_REASON:${key}`);
      }
      if (!row.supported && !row.unsupportedReason) {
        failures.push(`UNSUPPORTED_ROW_WITHOUT_REASON:${key}`);
      }
      if (row.supported && !row.supportedInExecutor) {
        failures.push(`SUPPORTED_WITHOUT_EXECUTOR:${key}`);
      }
    }

    for (const dup of Array.from(duplicateKeys)) {
      failures.push(`DUPLICATE_ROW:${dup}`);
    }

    const docxRows = matrix.rows.filter((row) => row.domain === "docx");
    const xlsxRows = matrix.rows.filter((row) => row.domain === "sheets");
    const supportedRows = matrix.rows.filter((row) => row.supported);
    const unsupportedRows = matrix.rows.filter((row) => !row.supported);

    writeCertificationGateReport("editing-capabilities", {
      passed:
        failures.length === 0 &&
        docxRows.length >= 10 &&
        xlsxRows.length >= 10 &&
        supportedRows.length > 0 &&
        unsupportedRows.length > 0,
      metrics: {
        totalRows: matrix.rows.length,
        supportedRows: supportedRows.length,
        unsupportedRows: unsupportedRows.length,
        docxRows: docxRows.length,
        xlsxRows: xlsxRows.length,
        versionHash: matrix.versionHash,
      },
      thresholds: {
        minTotalRows: 20,
        requireBothDomains: true,
        requireSupportedAndUnsupportedRows: true,
        duplicateRowsAllowed: 0,
      },
      failures,
    });

    expect(matrix.rows.length).toBeGreaterThanOrEqual(20);
    expect(docxRows.length).toBeGreaterThan(0);
    expect(xlsxRows.length).toBeGreaterThan(0);
    expect(duplicateKeys.size).toBe(0);
    expect(failures).toEqual([]);
  });
});
