// file: src/analytics/rollups/hourlyRollup.job.test.ts
// Alignment tests: verify that event types used in the hourly rollup
// match the canonical USAGE_EVENT_TYPES constant.

import * as fs from "fs";
import * as path from "path";
import { USAGE_EVENT_TYPES } from "../../services/telemetry/telemetry.constants";
import { getUtcHourStart } from "./hourlyRollup.job";

// ─────────────────────────────────────────────────────────────
// Alignment: SQL event types vs USAGE_EVENT_TYPES
// ─────────────────────────────────────────────────────────────

describe("hourlyRollup event-type alignment", () => {
  const sourceFile = fs.readFileSync(
    path.resolve(__dirname, "hourlyRollup.job.ts"),
    "utf-8",
  );

  /**
   * Extract all single-quoted string literals used in eventType
   * comparisons from the raw SQL in the source file.
   */
  function extractSqlEventTypes(src: string): string[] {
    const types = new Set<string>();
    // Match patterns like "eventType" = 'VALUE' or "eventType" IN ('V1', 'V2', ...)
    const inClauseRegex =
      /"eventType"\s+IN\s*\(([^)]+)\)/g;
    const eqRegex =
      /"eventType"\s*=\s*'([^']+)'/g;

    let match: RegExpExecArray | null;

    // Extract from IN (...) clauses
    while ((match = inClauseRegex.exec(src)) !== null) {
      const inner = match[1];
      const valueRegex = /'([^']+)'/g;
      let valueMatch: RegExpExecArray | null;
      while ((valueMatch = valueRegex.exec(inner)) !== null) {
        types.add(valueMatch[1]);
      }
    }

    // Extract from = 'value' clauses
    while ((match = eqRegex.exec(src)) !== null) {
      types.add(match[1]);
    }

    return Array.from(types).sort();
  }

  const sqlEventTypes = extractSqlEventTypes(sourceFile);

  it("should use at least one event type in SQL queries", () => {
    expect(sqlEventTypes.length).toBeGreaterThan(0);
  });

  it.each(sqlEventTypes)(
    "SQL event type '%s' must exist in USAGE_EVENT_TYPES",
    (eventType) => {
      expect(USAGE_EVENT_TYPES).toContain(eventType);
    },
  );

  it("should not contain dot-notation event types (old format)", () => {
    for (const et of sqlEventTypes) {
      expect(et).not.toMatch(
        /\./,
      );
    }
  });

  it("should only use SCREAMING_SNAKE_CASE event types", () => {
    for (const et of sqlEventTypes) {
      expect(et).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Smoke: helper function
// ─────────────────────────────────────────────────────────────

describe("hourlyRollup helpers", () => {
  it("getUtcHourStart truncates to the hour", () => {
    const input = new Date("2025-06-15T14:37:22.456Z");
    const result = getUtcHourStart(input);
    expect(result.toISOString()).toBe("2025-06-15T14:00:00.000Z");
  });

  it("getUtcHourStart handles exact hour boundary", () => {
    const input = new Date("2025-06-15T14:00:00.000Z");
    const result = getUtcHourStart(input);
    expect(result.toISOString()).toBe("2025-06-15T14:00:00.000Z");
  });
});
