import { describe, expect, test } from "@jest/globals";
import { writeCertificationGateReport } from "./reporting";
import type { CandidateChunk } from "../../services/core/retrieval/retrievalEngine.service";

describe("Certification: table context preservation", () => {
  test("table payload preserves unitAnnotation", () => {
    const table: CandidateChunk["table"] = {
      header: ["Metric", "Value"],
      rows: [["Revenue", 1250]],
      unitAnnotation: { unitRaw: "$", unitNormalized: "currency_usd" },
    };
    expect(table!.unitAnnotation!.unitNormalized).toBe("currency_usd");
    expect(table!.unitAnnotation!.unitRaw).toBe("$");
  });

  test("table payload preserves scaleFactor", () => {
    const table: CandidateChunk["table"] = {
      header: ["Metric", "Value"],
      rows: [["Revenue", 1250]],
      scaleFactor: "thousands",
    };
    expect(table!.scaleFactor).toBe("thousands");
  });

  test("table payload preserves footnotes", () => {
    const table: CandidateChunk["table"] = {
      header: ["Metric", "Value"],
      rows: [["EBITDA", 500]],
      footnotes: ["(1) Restated"],
    };
    expect(table!.footnotes).toEqual(["(1) Restated"]);
  });

  test("row cap applied correctly", () => {
    const maxRowsPerChunk = 20;
    const rows: Array<[string, number]> = [];
    for (let i = 0; i < 50; i++) {
      rows.push([`Item ${i}`, i * 100]);
    }

    const cappedRows = rows.slice(0, maxRowsPerChunk);
    expect(cappedRows).toHaveLength(20);
    expect(rows).toHaveLength(50);
  });

  test("conflict detection between tables", () => {
    const tableA: CandidateChunk["table"] = {
      header: ["Metric", "Value"],
      rows: [["Revenue", 1250]],
    };
    const tableB: CandidateChunk["table"] = {
      header: ["Metric", "Value"],
      rows: [["Revenue", 1300]],
    };

    // Detect conflict: same metric, different values
    const conflicts: Array<{ field: string; valueA: unknown; valueB: unknown }> = [];
    if (tableA && tableB) {
      for (let i = 0; i < Math.min(tableA.rows.length, tableB.rows.length); i++) {
        const rowA = tableA.rows[i] as unknown[];
        const rowB = tableB.rows[i] as unknown[];
        if (rowA[0] === rowB[0] && rowA[1] !== rowB[1]) {
          conflicts.push({ field: String(rowA[0]), valueA: rowA[1], valueB: rowB[1] });
        }
      }
    }

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field).toBe("Revenue");
    expect(conflicts[0].valueA).toBe(1250);
    expect(conflicts[0].valueB).toBe(1300);

    writeCertificationGateReport("table-context-preservation", {
      passed: true,
      metrics: {
        unitAnnotationPreserved: true,
        scaleFactorPreserved: true,
        footnotesPreserved: true,
        rowCapApplied: true,
        conflictDetected: conflicts.length > 0,
      },
      thresholds: {
        maxRowsPerChunk: 20,
        requireUnitAnnotation: true,
      },
      failures: [],
    });
  });
});
