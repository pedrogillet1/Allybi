import { describe, expect, test } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { writeCertificationGateReport } from "./reporting";

/**
 * Intent Precision Certification
 *
 * Proves that every one of the 24 operators routes correctly
 * with both EN and PT query variants.
 */

function readJson(rel: string) {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../data_banks", rel),
      "utf8",
    ),
  );
}

function normalizeForMatching(query: string): string {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function regexMatchesAny(text: string, patterns: string[]): boolean {
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

interface PrecisionVector {
  query: string;
  locale: "en" | "pt";
  expectedOperator: string;
  expectedFamily: string;
  mustNotMatchOperators?: string[];
}

const PRECISION_VECTORS: PrecisionVector[] = [
  // ──────────────────────────────────────────────────
  // documents family
  // ──────────────────────────────────────────────────
  // locate_docs — pattern: \bwhich documents?\b.*\b(has|contains)\b
  { query: "which document has the payment terms?", locale: "en", expectedOperator: "locate_docs", expectedFamily: "documents" },
  { query: "qual documento tem os termos de pagamento?", locale: "pt", expectedOperator: "locate_docs", expectedFamily: "documents" },
  // set_active_doc — pattern: \b(lock|pin)\b.*\b(this|current)\b.*\b(file|doc)\b
  { query: "lock this current document", locale: "en", expectedOperator: "set_active_doc", expectedFamily: "documents" },
  { query: "trava este documento atual", locale: "pt", expectedOperator: "set_active_doc", expectedFamily: "documents" },
  // summarize
  { query: "summarize this contract", locale: "en", expectedOperator: "summarize", expectedFamily: "documents" },
  { query: "resumir este contrato", locale: "pt", expectedOperator: "summarize", expectedFamily: "documents" },
  // quote
  { query: "quote the termination clause verbatim", locale: "en", expectedOperator: "quote", expectedFamily: "documents" },
  { query: "citar a cláusula de rescisão literalmente", locale: "pt", expectedOperator: "quote", expectedFamily: "documents" },
  // extract
  { query: "extract all dates from this document", locale: "en", expectedOperator: "extract", expectedFamily: "documents" },
  { query: "extrair todas as datas deste documento", locale: "pt", expectedOperator: "extract", expectedFamily: "documents" },
  // compare
  { query: "compare these two contracts", locale: "en", expectedOperator: "compare", expectedFamily: "documents" },
  { query: "comparar esses dois contratos", locale: "pt", expectedOperator: "compare", expectedFamily: "documents" },
  // compute
  { query: "calculate the total revenue for Q3", locale: "en", expectedOperator: "compute", expectedFamily: "documents" },
  { query: "calcular a receita total do terceiro trimestre", locale: "pt", expectedOperator: "compute", expectedFamily: "documents" },
  // locate_content — pattern: \bon which (page|slide|section)\b
  { query: "on which page is the liability clause?", locale: "en", expectedOperator: "locate_content", expectedFamily: "documents" },
  { query: "em qual página está a cláusula de responsabilidade?", locale: "pt", expectedOperator: "locate_content", expectedFamily: "documents" },

  // ──────────────────────────────────────────────────
  // file_actions family
  // ──────────────────────────────────────────────────
  // list — pattern: \blist my files\b, \ball files\b
  { query: "list my files", locale: "en", expectedOperator: "list", expectedFamily: "file_actions" },
  { query: "listar meus arquivos", locale: "pt", expectedOperator: "list", expectedFamily: "file_actions" },
  // filter
  { query: "filter documents by type PDF", locale: "en", expectedOperator: "filter", expectedFamily: "file_actions" },
  { query: "filtrar documentos por tipo PDF", locale: "pt", expectedOperator: "filter", expectedFamily: "file_actions" },
  // sort
  { query: "sort documents by date", locale: "en", expectedOperator: "sort", expectedFamily: "file_actions" },
  { query: "ordenar documentos por data", locale: "pt", expectedOperator: "sort", expectedFamily: "file_actions" },
  // group — pattern: \bgroup by\b
  { query: "group by type", locale: "en", expectedOperator: "group", expectedFamily: "file_actions" },
  { query: "agrupar por tipo", locale: "pt", expectedOperator: "group", expectedFamily: "file_actions" },
  // open
  { query: "open budget.xlsx", locale: "en", expectedOperator: "open", expectedFamily: "file_actions" },
  { query: "abrir orçamento.xlsx", locale: "pt", expectedOperator: "open", expectedFamily: "file_actions" },
  // locate_file — pattern: \bwhere is\b.*\b(file|document)\b
  { query: "where is my file called forecast?", locale: "en", expectedOperator: "locate_file", expectedFamily: "file_actions" },
  { query: "onde está meu arquivo chamado previsão?", locale: "pt", expectedOperator: "locate_file", expectedFamily: "file_actions" },
  // count_files
  { query: "how many files are uploaded?", locale: "en", expectedOperator: "count_files", expectedFamily: "file_actions" },
  { query: "quantos arquivos foram enviados?", locale: "pt", expectedOperator: "count_files", expectedFamily: "file_actions" },

  // ──────────────────────────────────────────────────
  // doc_stats family
  // ──────────────────────────────────────────────────
  // count_pages
  { query: "how many pages does this PDF have?", locale: "en", expectedOperator: "count_pages", expectedFamily: "doc_stats" },
  { query: "quantas páginas tem este PDF?", locale: "pt", expectedOperator: "count_pages", expectedFamily: "doc_stats" },
  // count_slides
  { query: "how many slides are in this presentation?", locale: "en", expectedOperator: "count_slides", expectedFamily: "doc_stats" },
  { query: "quantos slides tem esta apresentação?", locale: "pt", expectedOperator: "count_slides", expectedFamily: "doc_stats" },
  // count_sheets — pattern: \bhow many sheets\b
  { query: "how many sheets does this have?", locale: "en", expectedOperator: "count_sheets", expectedFamily: "doc_stats" },
  { query: "quantas abas tem isso?", locale: "pt", expectedOperator: "count_sheets", expectedFamily: "doc_stats" },

  // ──────────────────────────────────────────────────
  // help family
  // ──────────────────────────────────────────────────
  // capabilities
  { query: "what can you do?", locale: "en", expectedOperator: "capabilities", expectedFamily: "help" },
  { query: "o que você pode fazer?", locale: "pt", expectedOperator: "capabilities", expectedFamily: "help" },
  // how_to — pattern: \bhow do i\b, \bcomo eu\b
  { query: "how do i search for a keyword?", locale: "en", expectedOperator: "how_to", expectedFamily: "help" },
  { query: "como eu pesquiso uma palavra-chave?", locale: "pt", expectedOperator: "how_to", expectedFamily: "help" },

  // ──────────────────────────────────────────────────
  // conversation family
  // ──────────────────────────────────────────────────
  // greeting — pattern: ^\s*(hi|hello|hey)\s*[!?.]*\s*$
  { query: "hello", locale: "en", expectedOperator: "greeting", expectedFamily: "conversation" },
  { query: "olá", locale: "pt", expectedOperator: "greeting", expectedFamily: "conversation" },
  // thanks — pattern: ^\s*(thanks|thank you|thx)\s*$
  { query: "thanks", locale: "en", expectedOperator: "thanks", expectedFamily: "conversation" },
  { query: "obrigado", locale: "pt", expectedOperator: "thanks", expectedFamily: "conversation" },
  // goodbye — pattern: ^\s*(bye|goodbye|see you)\s*$
  { query: "goodbye", locale: "en", expectedOperator: "goodbye", expectedFamily: "conversation" },
  { query: "tchau", locale: "pt", expectedOperator: "goodbye", expectedFamily: "conversation" },
  // ack — pattern: ^\s*(ok|okay|got it|understood)\s*$
  { query: "ok", locale: "en", expectedOperator: "ack", expectedFamily: "conversation" },
  { query: "entendi", locale: "pt", expectedOperator: "ack", expectedFamily: "conversation" },
];

// ---------------------------------------------------------------------------
// Inline pattern matching (mirrors TurnRouter logic)
// ---------------------------------------------------------------------------

function matchOperator(
  query: string,
  locale: "en" | "pt",
): { operatorId: string; intentFamily: string } | null {
  const bank = readJson("routing/intent_patterns.any.json");
  if (!bank?.config?.enabled) return null;
  const normalized = normalizeForMatching(query);
  if (!normalized) return null;

  const operators =
    bank?.operators && typeof bank.operators === "object"
      ? (bank.operators as Record<string, any>)
      : {};

  const matches: Array<{ operatorId: string; intentFamily: string; confidence: number }> = [];

  for (const [operatorId, entry] of Object.entries(operators)) {
    if (!entry || typeof entry !== "object" || operatorId.startsWith("_")) continue;
    const positives = getLocalizedPatterns(entry.patterns || {}, locale);
    if (positives.length === 0) continue;
    if (!regexMatchesAny(normalized, positives)) continue;
    const negatives = getLocalizedPatterns(entry.negatives || {}, locale);
    if (negatives.length > 0 && regexMatchesAny(normalized, negatives)) continue;
    const intentFamily = String(entry.intentFamily || "").trim().toLowerCase();
    if (!intentFamily) continue;
    const minConfidence = Number(
      entry.minConfidence ?? bank.config?.matching?.minConfidenceFallback ?? 0.5,
    );
    const priority = Number(entry.priority || 0);
    const priorityBoost = Math.max(0, Math.min(0.18, priority / 600));
    const confidence = Math.max(0, Math.min(1, Math.max(0.35, minConfidence) + priorityBoost));
    matches.push({ operatorId, intentFamily, confidence });
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return matches.length > 0 ? { operatorId: matches[0].operatorId, intentFamily: matches[0].intentFamily } : null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Certification: intent-precision", () => {
  describe("all 24 operators × EN/PT precision vectors", () => {
    for (const vector of PRECISION_VECTORS) {
      test(`[${vector.locale}] "${vector.query.slice(0, 50)}" → ${vector.expectedOperator}`, () => {
        const result = matchOperator(vector.query, vector.locale);
        expect(result).not.toBeNull();
        expect(result!.operatorId).toBe(vector.expectedOperator);
        expect(result!.intentFamily).toBe(vector.expectedFamily);
      });
    }
  });

  describe("negative assertions (mustNotMatch)", () => {
    const negativeVectors: PrecisionVector[] = PRECISION_VECTORS.filter(
      (v) => v.mustNotMatchOperators && v.mustNotMatchOperators.length > 0,
    );

    for (const vector of negativeVectors) {
      for (const forbidden of vector.mustNotMatchOperators!) {
        test(`[${vector.locale}] "${vector.query.slice(0, 40)}" must NOT match ${forbidden}`, () => {
          const result = matchOperator(vector.query, vector.locale);
          if (result) {
            expect(result.operatorId).not.toBe(forbidden);
          }
        });
      }
    }
  });

  describe("operator coverage", () => {
    const ALL_OPERATORS = [
      "locate_docs", "set_active_doc", "summarize", "quote", "extract",
      "compare", "compute", "locate_content",
      "list", "filter", "sort", "group", "open", "locate_file", "count_files",
      "count_pages", "count_slides", "count_sheets",
      "capabilities", "how_to",
      "greeting", "thanks", "goodbye", "ack",
    ];

    test("every operator has at least one EN vector", () => {
      const coveredEN = new Set(
        PRECISION_VECTORS.filter((v) => v.locale === "en").map((v) => v.expectedOperator),
      );
      for (const op of ALL_OPERATORS) {
        expect(coveredEN.has(op)).toBe(true);
      }
    });

    test("every operator has at least one PT vector", () => {
      const coveredPT = new Set(
        PRECISION_VECTORS.filter((v) => v.locale === "pt").map((v) => v.expectedOperator),
      );
      for (const op of ALL_OPERATORS) {
        expect(coveredPT.has(op)).toBe(true);
      }
    });

    test("at least 48 precision vectors defined", () => {
      expect(PRECISION_VECTORS.length).toBeGreaterThanOrEqual(48);
    });
  });

  // -------------------------------------------------------------------------
  // Gate report
  // -------------------------------------------------------------------------
  test("write certification gate report", () => {
    const failures: string[] = [];
    let passed = 0;
    let failed = 0;

    for (const vector of PRECISION_VECTORS) {
      const result = matchOperator(vector.query, vector.locale);
      if (
        result &&
        result.operatorId === vector.expectedOperator &&
        result.intentFamily === vector.expectedFamily
      ) {
        passed++;
      } else {
        failed++;
        failures.push(
          `MISS_${vector.locale}_${vector.expectedOperator}: "${vector.query.slice(0, 30)}" → ${result?.operatorId ?? "null"}`,
        );
      }
    }

    writeCertificationGateReport("intent-precision", {
      passed: failures.length === 0,
      metrics: {
        totalVectors: PRECISION_VECTORS.length,
        passed,
        failed,
        operatorsCovered: new Set(PRECISION_VECTORS.map((v) => v.expectedOperator)).size,
        localesCovered: new Set(PRECISION_VECTORS.map((v) => v.locale)).size,
      },
      thresholds: {
        minVectors: 48,
        minOperatorsCovered: 24,
        minLocales: 2,
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
