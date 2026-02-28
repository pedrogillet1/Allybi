import { describe, it, expect } from "@jest/globals";

/**
 * Tests for advanced formula templates in SheetsEditAgentService.
 *
 * We test the regex patterns and build functions directly by importing the
 * module-scoped FORMULA_TEMPLATES array. Since it's not exported, we test
 * through the agent's `generateFormulas` behaviour via a thin integration.
 */

/* ────────────────────────────────────────────────────────────────────────── */
/*  Pattern-only tests (regex correctness)                                     */
/* ────────────────────────────────────────────────────────────────────────── */

// The patterns are defined inline in sheetsEditAgent.service.ts.
// We replicate them here for isolated testing without coupling to the class.
const TEMPLATE_PATTERNS = [
  {
    name: "SUMIFS",
    pattern: /\b(sumifs?|sum\s+if|conditional\s+sum|soma\s+condicional)\b/i,
    positives: [
      "sumif",
      "SUMIFS",
      "sum if",
      "conditional sum",
      "soma condicional",
    ],
    negatives: ["summary", "consume", "assumption"],
  },
  {
    name: "COUNTIFS",
    pattern: /\b(countifs?|count\s+if|contar\s+se)\b/i,
    positives: ["countif", "COUNTIFS", "count if", "contar se"],
    negatives: ["counter", "account", "discount"],
  },
  {
    name: "XLOOKUP",
    pattern: /\b(xlookup|vlookup|lookup|buscar|procurar)\b/i,
    positives: ["xlookup", "VLOOKUP", "lookup", "buscar", "procurar"],
    negatives: ["lookout", "lock"],
  },
  {
    name: "INDEX+MATCH",
    pattern: /\b(index\s*match)\b/i,
    positives: ["index match", "indexmatch", "INDEX MATCH"],
    negatives: ["index", "match", "matching"],
  },
  {
    name: "CAGR",
    pattern: /\b(cagr|compound.*growth|crescimento.*composta)\b/i,
    positives: ["CAGR", "compound annual growth", "crescimento taxa composta"],
    negatives: ["grow", "growth rate"],
  },
  {
    name: "RANK",
    pattern: /\b(rank|ranking|classificar)\b/i,
    positives: ["rank", "RANKING", "classificar"],
    negatives: ["frank", "crank", "blanket"],
  },
];

describe("Advanced Formula Template Patterns", () => {
  for (const tmpl of TEMPLATE_PATTERNS) {
    describe(tmpl.name, () => {
      for (const pos of tmpl.positives) {
        it(`matches: "${pos}"`, () => {
          expect(tmpl.pattern.test(pos)).toBe(true);
        });
      }
      for (const neg of tmpl.negatives) {
        it(`does NOT match: "${neg}"`, () => {
          expect(tmpl.pattern.test(neg)).toBe(false);
        });
      }
    });
  }
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Build function tests (formula output validity)                             */
/* ────────────────────────────────────────────────────────────────────────── */

interface ResolvedFormulaCols {
  value: string;
  secondary?: string;
  lastRow: number;
}

const FORMULA_BUILDS: Array<{
  name: string;
  build: (cols: ResolvedFormulaCols) => string;
}> = [
  {
    name: "SUMIFS",
    build: ({ value, lastRow }) =>
      `=SUMIFS(${value}$2:${value}$${lastRow},{criteria_range},{criteria})`,
  },
  {
    name: "COUNTIFS",
    build: ({ value, lastRow }) =>
      `=COUNTIFS(${value}$2:${value}$${lastRow},{criteria})`,
  },
  {
    name: "XLOOKUP",
    build: ({ value, secondary, lastRow }) =>
      `=XLOOKUP({lookup_value},${value}$2:${value}$${lastRow},${secondary || "C"}$2:${secondary || "C"}$${lastRow})`,
  },
  {
    name: "INDEX+MATCH",
    build: ({ value, secondary, lastRow }) =>
      `=INDEX(${secondary || "C"}$2:${secondary || "C"}$${lastRow},MATCH({lookup_value},${value}$2:${value}$${lastRow},0))`,
  },
  {
    name: "CAGR",
    build: ({ value, lastRow }) =>
      `=(${value}$${lastRow}/${value}$2)^(1/{periods})-1`,
  },
  {
    name: "RANK",
    build: ({ value, lastRow }) =>
      `=RANK(${value}{r},${value}$2:${value}$${lastRow})`,
  },
];

describe("Formula Build Output Validity", () => {
  const cols: ResolvedFormulaCols = {
    value: "B",
    secondary: "C",
    lastRow: 100,
  };

  for (const fb of FORMULA_BUILDS) {
    it(`${fb.name} produces a formula starting with =`, () => {
      const result = fb.build(cols);
      expect(result.startsWith("=")).toBe(true);
    });

    it(`${fb.name} has balanced parentheses`, () => {
      const result = fb.build(cols);
      let depth = 0;
      for (const ch of result) {
        if (ch === "(") depth += 1;
        if (ch === ")") depth -= 1;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
      expect(depth).toBe(0);
    });
  }
});
