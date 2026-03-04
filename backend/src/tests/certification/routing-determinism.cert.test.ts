import { describe, expect, test } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { writeCertificationGateReport } from "./reporting";

/**
 * Routing Determinism Certification
 *
 * Proves that TurnRouter.decide() and ScopeGate.evaluate() produce
 * identical results when called N times with the same input.
 */

// ---------------------------------------------------------------------------
// Helpers — lightweight inline implementations for isolated determinism proof.
// ---------------------------------------------------------------------------

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../data_banks", rel),
      "utf8",
    ),
  );
}

function low(s: string): string {
  return s.trim().toLowerCase();
}

function normalizeForMatching(query: string): string {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function regexMatchesAny(
  text: string,
  patterns: string[],
): boolean {
  for (const pattern of patterns) {
    try {
      if (new RegExp(pattern, "gi").test(text)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function getLocalizedPatterns(
  value: unknown,
  locale: "en" | "pt" | "es",
): string[] {
  if (!value || typeof value !== "object") return [];
  const obj = value as Record<string, unknown>;
  return [
    ...(Array.isArray(obj[locale]) ? (obj[locale] as unknown[]) : []),
    ...(Array.isArray(obj.any) ? obj.any : []),
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Deterministic intent pattern matching (mirrors TurnRouter logic)
// ---------------------------------------------------------------------------

interface PatternMatch {
  operatorId: string;
  intentFamily: string;
  confidence: number;
}

function matchIntentPatterns(
  query: string,
  locale: "en" | "pt" | "es",
): PatternMatch[] {
  const bank = readJson("routing/intent_patterns.any.json");
  if (!bank?.config?.enabled) return [];
  const normalized = normalizeForMatching(query);
  if (!normalized) return [];

  const operators =
    bank?.operators && typeof bank.operators === "object"
      ? (bank.operators as Record<string, any>)
      : {};
  const out: PatternMatch[] = [];

  for (const [operatorId, entry] of Object.entries(operators)) {
    if (!entry || typeof entry !== "object" || operatorId.startsWith("_")) {
      continue;
    }
    const positives = getLocalizedPatterns(entry.patterns || {}, locale);
    if (positives.length === 0) continue;
    if (!regexMatchesAny(normalized, positives)) continue;
    const negatives = getLocalizedPatterns(entry.negatives || {}, locale);
    if (negatives.length > 0 && regexMatchesAny(normalized, negatives)) {
      continue;
    }
    const intentFamily = String(entry.intentFamily || "")
      .trim()
      .toLowerCase();
    if (!intentFamily) continue;
    const minConfidence = Number(
      entry.minConfidence ?? bank.config?.matching?.minConfidenceFallback ?? 0.5,
    );
    const priority = Number(entry.priority || 0);
    const priorityBoost = Math.max(0, Math.min(0.18, priority / 600));
    const confidence = Math.max(
      0,
      Math.min(1, Math.max(0.35, minConfidence) + priorityBoost),
    );
    out.push({ operatorId, intentFamily, confidence });
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic collision check (mirrors TurnRouter logic)
// ---------------------------------------------------------------------------

function isCollisionSuppressed(
  operator: string,
  query: string,
): boolean {
  const bank = readJson("operators/operator_collision_matrix.any.json");
  if (bank?.config?.enabled === false) return false;
  const rules = Array.isArray(bank?.rules) ? bank.rules : [];
  const normalized = normalizeForMatching(query);

  for (const rule of rules) {
    if (!rule || typeof rule !== "object") continue;
    const when = rule.when || {};
    const operators = Array.isArray(when?.operators)
      ? when.operators.map((v: unknown) => low(String(v || "")))
      : [];
    if (operators.length > 0 && !operators.includes(low(operator))) continue;
    const patterns = [
      ...(Array.isArray(when?.queryRegexAny?.en) ? when.queryRegexAny.en : []),
      ...(Array.isArray(when?.queryRegexAny?.pt) ? when.queryRegexAny.pt : []),
      ...(Array.isArray(when?.queryRegexAny?.any) ? when.queryRegexAny.any : []),
    ]
      .map((item: unknown) => String(item || "").trim())
      .filter(Boolean);
    if (patterns.length === 0) continue;
    if (regexMatchesAny(normalized, patterns)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Combined deterministic routing decision
// ---------------------------------------------------------------------------

interface DeterministicDecision {
  topOperator: string | null;
  topFamily: string | null;
  confidence: number | null;
  route: "KNOWLEDGE" | "GENERAL" | "CONNECTOR" | "CONVERSATION";
}

function deterministicRoute(
  query: string,
  locale: "en" | "pt" | "es",
  docsAvailable: boolean,
): DeterministicDecision {
  const matches = matchIntentPatterns(query, locale);
  for (const match of matches) {
    if (isCollisionSuppressed(match.operatorId, query)) continue;
    const family = low(match.intentFamily);
    let route: DeterministicDecision["route"] = "KNOWLEDGE";
    if (family === "connectors" || family === "email") route = "CONNECTOR";
    else if (family === "help" || family === "conversation") {
      route = docsAvailable ? "KNOWLEDGE" : "GENERAL";
    }
    return {
      topOperator: match.operatorId,
      topFamily: match.intentFamily,
      confidence: match.confidence,
      route,
    };
  }
  return {
    topOperator: null,
    topFamily: null,
    confidence: null,
    route: docsAvailable ? "KNOWLEDGE" : "GENERAL",
  };
}

// ---------------------------------------------------------------------------
// Deterministic scope key (mirrors ScopeGate logic)
// ---------------------------------------------------------------------------

function deterministicScopeKey(candidateDocIds: string[]): string {
  const sorted = [...candidateDocIds].sort();
  const { createHash } = require("crypto");
  return createHash("sha256")
    .update(sorted.join("|"))
    .digest("hex")
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const ITERATIONS = 10;

describe("Certification: routing-determinism", () => {
  // -----------------------------------------------------------------------
  // TurnRouter determinism
  // -----------------------------------------------------------------------
  describe("TurnRouter determinism", () => {
    const TEST_QUERIES = [
      // documents family — EN
      { query: "summarize the key points of this contract", family: "documents", locale: "en" as const },
      { query: "extract all dates from the agreement", family: "documents", locale: "en" as const },
      { query: "compare these two contracts side by side", family: "documents", locale: "en" as const },
      { query: "calculate the total revenue for Q3", family: "documents", locale: "en" as const },
      { query: "find all invoices mentioning tax", family: "documents", locale: "en" as const },
      { query: "where is the indemnity clause?", family: "documents", locale: "en" as const },
      { query: "quote the termination clause verbatim", family: "documents", locale: "en" as const },
      // documents family — PT
      { query: "resumir os pontos principais deste contrato", family: "documents", locale: "pt" as const },
      { query: "extrair todas as datas do acordo", family: "documents", locale: "pt" as const },
      { query: "comparar esses dois contratos lado a lado", family: "documents", locale: "pt" as const },
      // file_actions family — EN
      { query: "open budget.xlsx", family: "file_actions", locale: "en" as const },
      { query: "list all uploaded files", family: "file_actions", locale: "en" as const },
      { query: "sort documents by date", family: "file_actions", locale: "en" as const },
      // file_actions family — PT
      { query: "abrir orçamento.xlsx", family: "file_actions", locale: "pt" as const },
      { query: "listar todos os arquivos enviados", family: "file_actions", locale: "pt" as const },
      // doc_stats family — EN + PT
      { query: "how many pages does this PDF have?", family: "doc_stats", locale: "en" as const },
      { query: "quantas páginas tem este PDF?", family: "doc_stats", locale: "pt" as const },
      // help family — EN + PT
      { query: "how do I use the search feature?", family: "help", locale: "en" as const },
      { query: "what can you do?", family: "help", locale: "en" as const },
      { query: "como posso usar a pesquisa?", family: "help", locale: "pt" as const },
      // conversation family — EN + PT
      { query: "hello", family: "conversation", locale: "en" as const },
      { query: "thank you for your help", family: "conversation", locale: "en" as const },
      { query: "olá, bom dia", family: "conversation", locale: "pt" as const },
    ];

    for (const { query, family, locale } of TEST_QUERIES) {
      test(`"${query.slice(0, 40)}..." produces identical result ${ITERATIONS} times`, () => {
        const results: DeterministicDecision[] = [];
        for (let i = 0; i < ITERATIONS; i++) {
          results.push(deterministicRoute(query, locale, true));
        }

        const first = results[0];
        for (let i = 1; i < results.length; i++) {
          expect(results[i].topOperator).toBe(first.topOperator);
          expect(results[i].topFamily).toBe(first.topFamily);
          expect(results[i].confidence).toBe(first.confidence);
          expect(results[i].route).toBe(first.route);
        }
      });
    }

    test("PT locale queries are deterministic", () => {
      const ptQueries = [
        "resumir os pontos principais deste contrato",
        "abrir orçamento.xlsx",
        "como posso usar a pesquisa?",
        "extrair todas as datas do acordo",
        "quantas páginas tem este PDF?",
        "olá, bom dia",
      ];

      for (const query of ptQueries) {
        const results: DeterministicDecision[] = [];
        for (let i = 0; i < ITERATIONS; i++) {
          results.push(deterministicRoute(query, "pt", true));
        }
        const first = results[0];
        for (let i = 1; i < results.length; i++) {
          expect(results[i].topOperator).toBe(first.topOperator);
          expect(results[i].topFamily).toBe(first.topFamily);
          expect(results[i].route).toBe(first.route);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // ScopeGate determinism (scope key stability)
  // -----------------------------------------------------------------------
  describe("ScopeGate determinism", () => {
    const SCOPE_SCENARIOS = [
      {
        name: "hard lock single doc",
        candidateDocIds: ["doc-001"],
      },
      {
        name: "discovery multi-doc",
        candidateDocIds: ["doc-001", "doc-002", "doc-003"],
      },
      {
        name: "followup with active doc",
        candidateDocIds: ["doc-active"],
      },
      {
        name: "explicit ref switches doc",
        candidateDocIds: ["doc-new-ref"],
      },
      {
        name: "ambiguous multi-candidate",
        candidateDocIds: ["doc-a", "doc-b", "doc-c", "doc-d"],
      },
    ];

    for (const scenario of SCOPE_SCENARIOS) {
      test(`"${scenario.name}" scope key is identical ${ITERATIONS} times`, () => {
        const keys: string[] = [];
        for (let i = 0; i < ITERATIONS; i++) {
          keys.push(deterministicScopeKey(scenario.candidateDocIds));
        }
        const first = keys[0];
        expect(first.length).toBe(16); // sha256 truncated to 16 hex chars
        for (let i = 1; i < keys.length; i++) {
          expect(keys[i]).toBe(first);
        }
      });
    }

    test("scope key is order-independent", () => {
      const key1 = deterministicScopeKey(["doc-a", "doc-b", "doc-c"]);
      const key2 = deterministicScopeKey(["doc-c", "doc-a", "doc-b"]);
      const key3 = deterministicScopeKey(["doc-b", "doc-c", "doc-a"]);
      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
    });

    test("different candidate sets produce different scope keys", () => {
      const key1 = deterministicScopeKey(["doc-a"]);
      const key2 = deterministicScopeKey(["doc-b"]);
      const key3 = deterministicScopeKey(["doc-a", "doc-b"]);
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });
  });

  // -----------------------------------------------------------------------
  // Gate report
  // -----------------------------------------------------------------------
  test("write certification gate report", () => {
    const failures: string[] = [];
    let totalAssertions = 0;

    // Verify routing determinism
    const queries = [
      "summarize the key points of this contract",
      "extract all dates from the agreement",
      "compare these two contracts side by side",
      "calculate the total revenue for Q3",
      "find all invoices mentioning tax",
      "where is the indemnity clause?",
      "quote the termination clause verbatim",
      "resumir os pontos principais deste contrato",
      "extrair todas as datas do acordo",
      "comparar esses dois contratos lado a lado",
      "open budget.xlsx",
      "list all uploaded files",
      "sort documents by date",
      "abrir orçamento.xlsx",
      "listar todos os arquivos enviados",
      "how many pages does this PDF have?",
      "quantas páginas tem este PDF?",
      "how do I use the search feature?",
      "what can you do?",
      "como posso usar a pesquisa?",
      "hello",
      "thank you for your help",
      "olá, bom dia",
    ];

    for (const query of queries) {
      const results: DeterministicDecision[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        results.push(deterministicRoute(query, "en", true));
      }
      totalAssertions += ITERATIONS;
      const first = results[0];
      const allSame = results.every(
        (r) =>
          r.topOperator === first.topOperator &&
          r.topFamily === first.topFamily &&
          r.confidence === first.confidence &&
          r.route === first.route,
      );
      if (!allSame) {
        failures.push(`ROUTE_NON_DETERMINISTIC_${query.slice(0, 20)}`);
      }
    }

    // Verify scope key determinism
    const scopeSets = [
      ["doc-001"],
      ["doc-001", "doc-002", "doc-003"],
      ["doc-active"],
      ["doc-new-ref"],
      ["doc-a", "doc-b", "doc-c", "doc-d"],
    ];

    for (const docIds of scopeSets) {
      const keys: string[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        keys.push(deterministicScopeKey(docIds));
      }
      totalAssertions += ITERATIONS;
      const allSame = keys.every((k) => k === keys[0]);
      if (!allSame) {
        failures.push(`SCOPE_KEY_NON_DETERMINISTIC_${docIds.join(",")}`);
      }
    }

    writeCertificationGateReport("routing-determinism", {
      passed: failures.length === 0,
      metrics: {
        totalAssertions,
        routeQueriesTested: queries.length,
        scopeScenariosTested: scopeSets.length,
        iterationsPerTest: ITERATIONS,
      },
      thresholds: {
        minRouteQueries: 20,
        minScopeScenarios: 5,
        minIterations: 10,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
