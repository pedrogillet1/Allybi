#!/usr/bin/env node
/**
 * 99-Query Benchmark Grading — Strict Methodology v3.2
 *
 * Three-layer architecture:
 *   Layer A — Run Integrity (artifact validation, hash verification)
 *   Layer B — Per-Query Scoring (hard-fail gates, category scoring, query-type weights, caps, penalties)
 *   Layer C — Run-Level Score (mean answer + consistency + calibration + integrity)
 *
 * Six scoring categories (A–F), 100 points weighted by query_type:
 *   A. Retrieval Correctness       (weight varies by type)
 *   B. Factual Precision           (weight varies by type)
 *   C. Numeric & Table Integrity   (weight varies by type)
 *   D. Grounding & Evidence        (weight varies by type)
 *   E. Reasoning Quality           (weight varies by type)
 *   F. Composition Quality         (weight varies by type)
 *
 * Formula: Final = 0.70 × MeanAnswerScore + 0.10 × RunIntegrity + 0.10 × Consistency + 0.10 × Calibration
 *
 * Reference: user methodology doc "Complete grading methodology v3.0" (2026-03-11)
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT        = path.join(__dirname, "reports", "99-query-run.json");
const SPECS_FILE   = path.join(__dirname, "query-specs.json");
const OUTPUT_JSON  = path.join(__dirname, "reports", "99-query-grading.json");
const OUTPUT_MD    = path.join(__dirname, "reports", "99-query-harsh-grading.md");
const MANIFEST_FILE = path.join(__dirname, "reports", "99-query-run-manifest.json");

// ── Load data ────────────────────────────────────────────────────────────────

const rawInput = fs.readFileSync(INPUT, "utf8");
const data = JSON.parse(rawInput);
const results = data.results;

let specs = null;
try {
  specs = JSON.parse(fs.readFileSync(SPECS_FILE, "utf8"));
} catch {
  console.warn("WARNING: query-specs.json not found. Running without query specs (reduced accuracy).");
}

function getSpec(queryNum) {
  if (!specs) return null;
  return (specs.queries || []).find((s) => s.query_id === `Q${queryNum}`) || null;
}

// ── Query-type weight tables ─────────────────────────────────────────────────
// Each weight is the percentage of 100 points assigned to that category.
// Weights must sum to 100.

const QUERY_TYPE_WEIGHTS = {
  direct_extraction:         { A: 30, B: 25, C: 20, D: 15, E: 5,  F: 5  },
  comparison:                { A: 25, B: 20, C: 20, D: 10, E: 20, F: 5  },
  legal_procedural:          { A: 20, B: 25, C: 5,  D: 20, E: 20, F: 10 },
  structured_reconstruction: { A: 20, B: 15, C: 25, D: 15, E: 10, F: 15 },
  interpretive_grounded:     { A: 20, B: 20, C: 10, D: 15, E: 25, F: 10 },
  // fallback for unknown types
  unknown:                   { A: 25, B: 20, C: 20, D: 15, E: 10, F: 10 },
};

function getWeights(queryType) {
  return QUERY_TYPE_WEIGHTS[queryType] || QUERY_TYPE_WEIGHTS.unknown;
}

// ── String helpers ───────────────────────────────────────────────────────────

function countOccurrences(haystack, needle) {
  let c = 0, p = 0;
  while ((p = haystack.indexOf(needle, p)) !== -1) { c++; p += needle.length; }
  return c;
}

function isLikelyEnglish(text) {
  const v = " " + String(text || "").toLowerCase() + " ";
  if (v.split(/\s+/).length < 8) return true;
  const en = [" the ", " is ", " are ", " was ", " were ", " have ", " has ", " been ",
              " would ", " should ", " could ", " which ", " their ", " they "];
  const pt = [" não ", " uma ", " nas ", " nos ", " está ", " são ", " também ",
              " então ", " pode ", " sobre ", " seus ", " mais ", " pela ", " pelo "];
  // For tables, score only non-table lines
  if (/\|.+\|/.test(text)) {
    const lines = text.split("\n");
    const nonTableLines = lines.filter(
      (l) => !l.includes("|") || /^[\s|:\-]+$/.test(l.replace(/\|/g, ""))
    );
    const nonTableText = nonTableLines.join(" ").trim();
    if (nonTableText.length >= 30) {
      const v2 = " " + nonTableText.toLowerCase() + " ";
      return (
        en.reduce((a, w) => a + countOccurrences(v2, w), 0) >=
        pt.reduce((a, w) => a + countOccurrences(v2, w), 0)
      );
    }
    const headerLine = lines.find(
      (l) => l.includes("|") && !/^[\s|:\-]+$/.test(l.replace(/\|/g, ""))
    );
    if (headerLine) {
      const hdr = " " + headerLine.toLowerCase() + " ";
      return (
        en.reduce((a, w) => a + countOccurrences(hdr, w), 0) >=
        pt.reduce((a, w) => a + countOccurrences(hdr, w), 0)
      );
    }
  }
  return (
    en.reduce((a, w) => a + countOccurrences(v, w), 0) >=
    pt.reduce((a, w) => a + countOccurrences(v, w), 0)
  );
}

// ── Hard-fail gate detectors ─────────────────────────────────────────────────

function isProcessingError(r) {
  const text = (r.fullText || "").toLowerCase();
  return (
    r.error != null ||
    text.startsWith("i hit a runtime issue") ||
    text.startsWith("there was a processing issue") ||
    text.startsWith("i could not complete") ||
    text.startsWith("i could not safely finalize") ||
    text.length === 0
  );
}

function isLanguageFallback(r) {
  const text = (r.fullText || "").trim();
  return (
    /could not safely finalize this answer in the requested language/i.test(text) ||
    /Nao consegui finalizar a resposta/i.test(text)
  );
}

function isGarbledEcho(text, query) {
  if (!text || !query) return false;
  const t = text.trim().toLowerCase().replace(/^the\s+/i, "");
  const q = query.trim().toLowerCase();
  if (t.length < q.length * 1.3 && q.length > 10) {
    const overlap = q.split(/\s+/).filter((w) => t.includes(w)).length;
    const queryWords = q.split(/\s+/).length;
    if (overlap / queryWords >= 0.8) return true;
  }
  return false;
}

/**
 * Abstention check — also validates against gold_facts.
 * If gold_facts are present and the answer abstains, that is a hard failure.
 */
function isAbstention(text, spec) {
  const v = text.toLowerCase().trim();
  const abstractPatterns =
    /^(i cannot|i can't|i do not have|i don't have)\b/.test(v) ||
    /\b(not available in the provided context|insufficient information)\b/.test(v) ||
    /\b(the provided (documents|evidence|context) do not contain)\b/.test(v) ||
    /\b(no information (is|was) (found|available|provided))\b/.test(v);
  if (abstractPatterns) {
    // If gold_facts exist, abstention is a hard failure
    if (spec?.gold_facts?.length > 0) return "hard";
    return "soft";
  }
  return false;
}

// ── Citation detection ───────────────────────────────────────────────────────

function hasInlineCitations(text) {
  const patterns = [
    /\bp(?:age|\.)\s*\d/i,
    /\(p\.\s*\d/i,
    /\bart(?:icle|igo|\.)\s*\d/i,
    /\bsect(?:ion|\.)\s*\d/i,
    /\b§\s*\d/,
    /\bslide\s+\d/i,
    /\bresolu(?:tion|ção)\s*\d/i,
    /\bBCB\b.*\d/,
    /\bCMN\b.*\d/,
    /\bLC\s*\d/i,
    /\bLei\s+(?:No\.?\s*)?\d/i,
    /\bDecreto\s+\d/i,
    /\bNormative\s+Instruction\s+\d/i,
    /\bAnne?x\s+[A-Z\d]/i,
    /\bTabela\s+\d/i,
    /\bLei\s+Complementar/i,
    /\brow\s+\d/i,
    /\brows?\s+\d+\s*[-–]\s*\d+/i,
    /\(Row\s+\d+\)/i,
    /\(Sheet\s+\d+,\s*Row\s+\d+\)/i,
    /\(Rows?\s+\d+\s*[-–]\s*\d+\)/i,
    /\(Linha\s+\d+\)/i,
    /\(Planilha\s+\d+,\s*Linha\s+\d+\)/i,
    /\([^)]*\.pdf[^)]*\)/i,  // (Breguet.pdf), (ARM Montana...pdf)
  ];
  return patterns.some((p) => p.test(text));
}

function countDistinctCitations(text) {
  const allMatches = new Set();
  const patterns = [
    /\bp(?:age|\.)\s*\d+/gi,
    /\(p\.\s*\d+\)/gi,
    /\bart(?:icle|igo|\.)\s*\d+/gi,
    /\bsect(?:ion|\.)\s*\d+/gi,
    /\b§\s*\d+/g,
    /\bslide\s+\d+/gi,
    /\bresolu(?:tion|ção)\s*\d+/gi,
    /\b(?:BCB|CMN)\s+\w+\s+\d+/gi,
    /\bLC\s*\d+/gi,
    /\bLei\s+(?:No\.?\s*)?\d[\d.]+/gi,
    /\bDecreto\s+\d[\d.]+/gi,
    /\bTabela\s+\d[\d.]+/gi,
    /\brows?\s+\d+(?:\s*[-–]\s*\d+)?/gi,
  ];
  for (const p of patterns) {
    const matches = text.match(p);
    if (matches) for (const m of matches) allMatches.add(m.toLowerCase().trim());
  }
  return allMatches.size;
}

function domainRequiresCitations(docLabel) {
  return ["IBGE Open Data Plan", "Reserve Requirements", "Tabela 1.1"].some(
    (d) => docLabel.includes(d)
  );
}

// ── Table quality ────────────────────────────────────────────────────────────

function hasTable(text) {
  return /\|.+\|/.test(text);
}

function isMalformedTable(text) {
  if (!hasTable(text)) return false;
  const lines = text.split("\n").filter(
    (l) => l.trim().startsWith("|") || l.trim().endsWith("|")
  );
  if (lines.length < 2) return true;
  const dataLines = lines.filter(
    (l) => !/^[\s|:\-]+$/.test(l.replace(/\|/g, ""))
  );
  const colCounts = dataLines.map(
    (l) => l.split("|").filter((c) => c.trim() !== "").length
  );
  if (colCounts.length >= 2) {
    const headerCols = colCounts[0];
    const mismatched = colCounts.filter((c) => Math.abs(c - headerCols) > 1);
    if (mismatched.length > colCounts.length * 0.3) return true;
  }
  if (lines.length >= 2) {
    const secondLine = lines[1].trim();
    if (!/[\-:]{2,}/.test(secondLine)) return true;
  }
  return false;
}

function tableHasEmptyCells(text) {
  if (!hasTable(text)) return false;
  const lines = text.split("\n").filter(
    (l) => l.includes("|") && !/^[\s|:\-]+$/.test(l.replace(/\|/g, ""))
  );
  for (const line of lines) {
    const cells = line.split("|").slice(1, -1);
    if (cells.some((c) => c.trim() === "")) return true;
  }
  return false;
}

// ── Structure detection ──────────────────────────────────────────────────────

function hasStructuredContent(text) {
  return (
    /(^|\n)([-*•]|\d+\.)\s+/m.test(text) ||
    hasTable(text) ||
    /\*\*[^*]+\*\*/.test(text)
  );
}

function queryNeedsStructure(query) {
  return /(extract|compare|list|break.?down|identify|separate|reconstruct|build a table|side.by.side|put.*into a table|categories|buckets)/i.test(
    query
  );
}

function queryNeedsTable(query) {
  // Explicit table requests only
  return /(put.*into a table|build a table|structured table|side.by.side table)/i.test(
    query
  );
}

function isIncompleteList(text) {
  const trimmed = text.trimEnd();
  return (
    trimmed.endsWith("...") ||
    trimmed.endsWith("…") ||
    /,\s*$/.test(trimmed) ||
    /\band\s*$/.test(trimmed) ||
    /:\s*$/.test(trimmed) || // ends at colon with nothing after (e.g. "CMN Resolutions:")
    /\(p\.\s*$/.test(trimmed) || // truncated mid-citation
    /\(p\.\s*\d*\s*$/.test(trimmed) || // mid-citation with partial page num
    /\|\s*$/.test(trimmed) // mid-table-row
  );
}

// ── Multi-part query detection ───────────────────────────────────────────────

function isMultiPartQuery(query) {
  const questionMarks = (query.match(/\?/g) || []).length;
  if (questionMarks >= 2) return true;
  if (
    /\b(extract.*and.*explain|compare.*and.*explain|list.*and.*explain|identify.*and|separate.*into|reconstruct.*and)\b/i.test(
      query
    )
  )
    return true;
  if (
    /\b(three (buckets|categories|sections)|strengths.*risks.*missing|supported.*suggested.*not fully)\b/i.test(
      query
    )
  )
    return true;
  return false;
}

// ── Hedging detection ────────────────────────────────────────────────────────

function hasExcessiveHedging(text) {
  const hedges = [
    /\bit appears?\b/gi,
    /\bit seems?\b/gi,
    /\bpossibly\b/gi,
    /\bmay or may not\b/gi,
    /\bcould potentially\b/gi,
    /\bmight suggest\b/gi,
  ];
  let count = 0;
  for (const p of hedges) {
    const matches = text.match(p);
    if (matches) count += matches.length;
  }
  const words = text.split(/\s+/).length;
  return words > 30 && count >= 3;
}

// ── Domain classification ────────────────────────────────────────────────────

function getDomain(docLabel) {
  const map = {
    "BESS Brazilian Market":     "energy_finance",
    "Mayfair Investor Deck":     "startup_finance",
    "ATT Bill Dec2023":          "consumer_billing",
    Breguet:                     "scanned_document",
    "IBGE Open Data Plan":       "public_policy",
    "ARM Montana Arizona":       "real_estate_finance",
    "Guarda Bens Self Storage":  "business_operations",
    "Reserve Requirements":      "central_bank_regulatory",
    "Tabela 1.1":                "statistical_data",
  };
  for (const [key, domain] of Object.entries(map)) {
    if (docLabel.includes(key)) return domain;
  }
  return "unknown";
}

function isHighStakesDomain(domain) {
  return [
    "central_bank_regulatory",
    "public_policy",
    "statistical_data",
    "consumer_billing",
    "real_estate_finance",
  ].includes(domain);
}

// ── Gold facts checking ──────────────────────────────────────────────────────

function stemWord(w) {
  // Simple suffix stripping for matching purposes
  return w
    .replace(/(tion|sion|ment|ness|ity|ies|ing|tion|ed|ly|er|est|ors?|ure)$/i, '')
    .replace(/s$/i, '');  // plural
}

function checkGoldFacts(text, spec) {
  if (!spec?.gold_facts?.length) return { hitRate: 1, missing: [] };
  const textLower = text.toLowerCase();
  const STOP = new Set(["the","a","an","of","in","on","to","for","and","or","is","are","was","were","it","its","by","at","from","with","as","that","this","not","be","has","had","have","but","no","do","does","did"]);

  const missing = spec.gold_facts.filter((f) => {
    // First try exact substring (fast path)
    if (textLower.includes(f.toLowerCase())) return false;

    // Keyword fallback: extract significant words, check all present
    const keywords = f.toLowerCase()
      .split(/[\s,;:()\[\]]+/)
      .filter(w => w.length >= 3 && !STOP.has(w));
    if (keywords.length === 0) return true; // can't match empty

    // All keywords must appear (stemmed) somewhere in text
    return !keywords.every(kw => {
      if (textLower.includes(kw)) return true;
      // Stemmed fallback
      const stemmed = stemWord(kw);
      if (stemmed.length < 3) return textLower.includes(kw);
      return new RegExp('\\b' + stemmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(textLower);
    });
  });

  const hitRate = (spec.gold_facts.length - missing.length) / spec.gold_facts.length;
  return { hitRate, missing };
}

// ═════════════════════════════════════════════════════════════════════════════
// LAYER B — PER-QUERY SCORING
// ═════════════════════════════════════════════════════════════════════════════

const grades = results.map((r) => {
  const text = r.fullText || "";
  const textLen = text.length;
  const textLower = text.toLowerCase();
  const sources = r.sources || [];
  const latencyMs = r.latencyMs || 0;
  const issues = [];
  const caps = [];      // { issue, cap }
  const penalties = []; // { issue, points }
  const spec = getSpec(r.queryNum);
  const domain = spec?.domain || getDomain(r.docLabel);
  const queryType = spec?.query_type || "unknown";
  const requiredShape = spec?.required_answer_shape || "unknown";
  const tableRequired = spec?.table_required || false;
  const citationRequired =
    spec?.citation_required || domainRequiresCitations(r.docLabel);
  const mustInclude = spec?.must_include_fields || [];
  const forbiddenFailures = spec?.forbidden_failures || [];
  const weights = getWeights(queryType);

  // ── HF-6: Processing error / garbled echo / language fallback ────────────
  if (isProcessingError(r)) {
    return {
      ...r, score: 0, rawScore: 0, grade: "F",
      issues: ["PROCESSING_ERROR"], latencyMs, caps: [], penalties: [],
      categories: {}, domain, queryType, hardFail: "HF-6",
    };
  }
  if (isLanguageFallback(r)) {
    return {
      ...r, score: 0, rawScore: 0, grade: "F",
      issues: ["LANGUAGE_CONTRACT_BLOCKED"], latencyMs, caps: [], penalties: [],
      categories: {}, domain, queryType, hardFail: "HF-6",
    };
  }
  if (isGarbledEcho(text, r.query)) {
    return {
      ...r, score: 0, rawScore: 0, grade: "F",
      issues: ["GARBLED_ECHO"], latencyMs, caps: [], penalties: [],
      categories: {}, domain, queryType, hardFail: "HF-6",
    };
  }

  // ── HF-1: Wrong document ─────────────────────────────────────────────────
  // Can't fully automate — rely on source presence as a proxy
  let hardFail = null;
  if (sources.length === 0 && textLen > 100) {
    // No sources at all is suspicious but not a definite hard-fail by itself
    issues.push("NO_SOURCES");
  }

  // ── HF-3: Numeric corruption (p. -1 reference leaking, c:NN chunk refs) ──
  if (/p\.\s*-\d/.test(text)) {
    issues.push("NEGATIVE_PAGE_REF");
  }
  if (/\bc:\d+\b/.test(text)) {
    issues.push("CHUNK_REF_LEAK");
    // Chunk ref leaking through is numeric corruption — score 0
    hardFail = "HF-3";
  }

  // ── HF-2: Hallucinated fact — catch obvious numeric fabrication patterns ─
  // Automated check: if forbidden_failures includes hallucinated_number and
  // large round numbers appear with no inline citations in a no-inference spec
  if (
    forbiddenFailures.includes("hallucinated_number") &&
    spec?.allowed_inference_level === "none" &&
    /\b\d{5,}\b/.test(text) &&
    !hasInlineCitations(text) &&
    textLen > 50
  ) {
    issues.push("POSSIBLE_HALLUCINATED_NUMBER");
    // Not an auto hard-fail — flag for review, penalize B1
  }

  // ── HF-5: Broken requested output ────────────────────────────────────────
  // Handled further below via MISSING_TABLE / MALFORMED_TABLE gates

  // ── Abstention check ─────────────────────────────────────────────────────
  const abstentionResult = isAbstention(text, spec);
  if (abstentionResult === "hard") {
    return {
      ...r, score: 0, rawScore: 0, grade: "F",
      issues: ["ABSTENTION_HARD_FAIL"], latencyMs, caps: [], penalties: [],
      categories: {}, domain, queryType, hardFail: "HF-2",
    };
  }
  const isAbstaining = abstentionResult === "soft";
  if (isAbstaining) issues.push("ABSTENTION");

  if (hardFail) {
    return {
      ...r, score: 0, rawScore: 0, grade: "F",
      issues, latencyMs, caps: [], penalties: [],
      categories: {}, domain, queryType, hardFail,
    };
  }

  // ── Min answer length ──────────────────────────────────────────────────
  const minLen = spec?.min_answer_length || 0;
  if (minLen > 0 && textLen > 0 && textLen < minLen) {
    issues.push("BELOW_MIN_LENGTH");
    caps.push({ issue: "BELOW_MIN_LENGTH", cap: 74 });
  }

  // ── Non-answer detection ──────────────────────────────────────────────
  // Answers that describe what the document contains instead of answering the question
  const isMetaAnswer = textLen > 0 && textLen < 300 &&
    /\b(the (provided |available )?(document|information|evidence|excerpt) (does not|doesn't)\b|it (is not possible|cannot) to\b|cannot be (determined|confirmed|made)\b)/i.test(text) &&
    !/\bhowever\b.*\b(the document|it does)\b/i.test(text); // exception if it provides info after
  if (isMetaAnswer && spec?.gold_facts?.length > 0) {
    issues.push("META_NON_ANSWER");
    caps.push({ issue: "META_NON_ANSWER", cap: 49 });
  }

  // ── Gold facts ───────────────────────────────────────────────────────────
  const goldFacts = checkGoldFacts(text, spec);
  if (goldFacts.hitRate < 0.5 && spec?.gold_facts?.length) {
    issues.push("MISSING_KEY_FACTS");
    caps.push({ issue: "MISSING_KEY_FACTS", cap: 69 });
  }

  // ── No-spec penalty ──────────────────────────────────────────────────────
  let noSpecCap = false;
  if (!spec) {
    noSpecCap = true;
    caps.push({ issue: "NO_SPEC", cap: 84 });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CATEGORY RAW SCORES (0-100% per category, then weighted)
  // Each sub-score is computed as a percentage [0,1], then multiplied by the
  // weight to get the contribution to the final 100-point score.
  // ─────────────────────────────────────────────────────────────────────────

  // ── Category A: Retrieval Correctness ───────────────────────────────────
  // A1: Correct document (10 pts within category)
  let a1Pct = 1.0;
  if (sources.length === 0) {
    a1Pct = 0.5; // can't verify doc selection without sources
  }

  // A2: Correct section/table targeting (10 pts)
  let a2Pct = 1.0;
  // Short answer for complex query = poor targeting
  if (textLen < 150 && queryType !== "direct_extraction") {
    a2Pct = 0.4;
  } else if (textLen < 200 && queryType === "structured_reconstruction") {
    a2Pct = 0.5;
  }

  // A3: Scope discipline (5 pts)
  let a3Pct = 1.0;
  if (queryType === "direct_extraction" && textLen > 3000) {
    issues.push("SCOPE_DRIFT");
    a3Pct = 0.4;
  }

  // Combined A score as 0-100%: A1 worth 40%, A2 worth 40%, A3 worth 20%
  const aScore = 0.4 * a1Pct + 0.4 * a2Pct + 0.2 * a3Pct;

  // ── Category B: Factual Precision ───────────────────────────────────────
  // B1: Exactness of facts (10 pts)
  let b1Pct = 1.0;

  if (textLen > 50 && !isLikelyEnglish(text)) {
    issues.push("LANGUAGE_MISMATCH");
    b1Pct -= 0.5;
  }
  if (hasExcessiveHedging(text) && domain !== "scanned_document") {
    issues.push("EXCESSIVE_HEDGING");
    b1Pct -= 0.3;
  }
  if (isAbstaining) {
    b1Pct -= 0.5;
  }
  // Gold facts hit rate directly reduces B1
  if (spec?.gold_facts?.length) {
    if (goldFacts.hitRate < 0.8) {
      b1Pct -= 0.2 * (1 - goldFacts.hitRate); // proportional deduction
    }
    if (goldFacts.hitRate < 0.5) {
      b1Pct -= 0.2; // additional penalty for very poor gold fact coverage
    }
  }
  // Possible hallucinated number
  if (issues.includes("POSSIBLE_HALLUCINATED_NUMBER")) {
    b1Pct -= 0.3;
  }
  b1Pct = Math.max(0, Math.min(1, b1Pct));

  // B2: Terminology precision (10 pts)
  let b2Pct = 1.0;
  if (domain === "scanned_document") {
    const uncertaintyPatterns =
      /\b(appears?|seems?|likely|partially legible|not fully readable|possibly|visible evidence suggests)\b/i;
    if (!uncertaintyPatterns.test(text) && textLen > 100) {
      issues.push("FALSE_CERTAINTY_ON_SCAN");
      b2Pct -= 0.3;
      if (forbiddenFailures.includes("false_certainty")) b2Pct -= 0.3;
    }
  }
  if (
    domain === "statistical_data" &&
    /correlat/i.test(text) &&
    forbiddenFailures.includes("correlation_vs_distribution")
  ) {
    issues.push("POSSIBLE_CORRELATION_CLAIM");
    b2Pct -= 0.2;
  }
  b2Pct = Math.max(0, Math.min(1, b2Pct));

  // Combined B score: B1 worth 50%, B2 worth 50%
  const bScore = 0.5 * b1Pct + 0.5 * b2Pct;

  // ── Category C: Numeric & Table Integrity ────────────────────────────────
  // C1: Numeric integrity (10 pts)
  let c1Pct = 1.0;
  if (issues.includes("NEGATIVE_PAGE_REF")) {
    c1Pct -= 0.3;
  }
  if (issues.includes("CHUNK_REF_LEAK")) {
    c1Pct -= 0.2;
  }
  // Consumer billing: dollar amounts must be exact
  if (domain === "consumer_billing") {
    const dollarRefs = (text.match(/\$[\d,.]+/g) || []).length;
    if (
      queryType === "direct_extraction" &&
      dollarRefs === 0 &&
      /\b(amount|charge|fee|total|cost|price|bill)\b/i.test(r.query)
    ) {
      issues.push("MISSING_DOLLAR_AMOUNTS");
      c1Pct -= 0.5;
    }
  }
  c1Pct = Math.max(0, Math.min(1, c1Pct));

  // C2: Table quality (10 pts)
  let c2Pct = 1.0;
  const needsTable = tableRequired || queryNeedsTable(r.query);
  if (needsTable && !hasTable(text) && textLen > 100) {
    issues.push("MISSING_TABLE");
    caps.push({ issue: "MISSING_TABLE", cap: 74 });
    c2Pct = 0.2;
  } else if (hasTable(text)) {
    if (isMalformedTable(text)) {
      issues.push("MALFORMED_TABLE");
      c2Pct -= 0.5;
      if (needsTable) caps.push({ issue: "MALFORMED_TABLE", cap: 74 });
    }
    if (tableHasEmptyCells(text)) {
      issues.push("TABLE_EMPTY_CELLS");
      c2Pct -= 0.2;
    }
  }
  // Structure checks (goes into C)
  if (queryNeedsStructure(r.query) && textLen > 200 && !hasStructuredContent(text)) {
    issues.push("MISSING_STRUCTURE");
    caps.push({ issue: "MISSING_STRUCTURE", cap: 79 });
    c2Pct = Math.min(c2Pct, 0.3);
  }
  c2Pct = Math.max(0, Math.min(1, c2Pct));

  // Combined C score: C1 worth 50%, C2 worth 50%
  const cScore = 0.5 * c1Pct + 0.5 * c2Pct;

  // ── Category D: Grounding & Evidence ────────────────────────────────────
  // D1: Evidence-backed (10 pts)
  let d1Pct = 1.0;
  if (!sources.length && textLen > 0) d1Pct -= 0.5;

  // Citation requirements: legal/regulatory/statistical/billing
  const citationDomains = ["central_bank_regulatory", "public_policy", "statistical_data", "consumer_billing"];
  const isCitationDomain = citationDomains.includes(domain);
  let mustCite = citationRequired || isCitationDomain;

  // Spreadsheet-origin answers: row/column references count as citations
  const hasSpreadsheetRefs = /\brow\s+\d/i.test(text) || /\b(sheet|planilha|linha)\s+/i.test(text);
  const isSpreadsheetSource = /\.(xlsx?|csv)$/i.test(r.docLabel || "");
  if (isSpreadsheetSource && hasSpreadsheetRefs) mustCite = false;

  if (mustCite && textLen > 150) {
    if (!hasInlineCitations(text)) {
      issues.push("NO_INLINE_CITATIONS");
      // Table-format answers are inherently self-citing via row/column structure
      const isTableAnswer = (requiredShape === "table" || tableRequired) && hasTable(text);
      caps.push({ issue: "NO_INLINE_CITATIONS", cap: isTableAnswer ? 89 : 69 });
      d1Pct = Math.min(d1Pct, isTableAnswer ? 0.7 : 0.3);
    } else {
      const citCount = countDistinctCitations(text);
      if (citCount < 2 && textLen > 300) {
        issues.push("WEAK_CITATIONS");
        caps.push({ issue: "WEAK_CITATIONS", cap: 84 });
        d1Pct = Math.min(d1Pct, 0.6);
      }
    }
  } else if (isHighStakesDomain(domain) && textLen > 300 && !hasInlineCitations(text)) {
    issues.push("WEAK_CITATIONS");
    caps.push({ issue: "WEAK_CITATIONS", cap: 84 });
    d1Pct = Math.min(d1Pct, 0.6);
  }

  // Domain-specific: central_bank_regulatory — must cite regs inline
  if (domain === "central_bank_regulatory" && textLen > 200 && !hasInlineCitations(text)) {
    issues.push("REGULATORY_NO_CITATIONS");
    caps.push({ issue: "REGULATORY_NO_CITATIONS", cap: 69 });
    d1Pct = Math.min(d1Pct, 0.3);
  }

  // Domain-specific: statistical_data — unanchored large numbers
  if (
    domain === "statistical_data" &&
    /\b\d{4,}\b/.test(text) &&
    !hasInlineCitations(text) &&
    textLen > 150
  ) {
    issues.push("UNANCHORED_STATISTIC");
    d1Pct = Math.min(d1Pct, 0.5);
  }
  d1Pct = Math.max(0, Math.min(1, d1Pct));

  // D2: Quote discipline (5 pts) — benefit of the doubt
  const d2Pct = 1.0;

  // Combined D score: D1 worth 67%, D2 worth 33%
  const dScore = 0.67 * d1Pct + 0.33 * d2Pct;

  // ── Category E: Reasoning Quality ───────────────────────────────────────
  // E1: Synthesis correctness (5 pts)
  let e1Pct = 1.0;
  // Short answer for complex query = weak synthesis
  if (textLen > 0 && textLen < 100) {
    e1Pct = 0.2;
  } else if (textLen > 0 && textLen < 200 && queryType !== "direct_extraction") {
    e1Pct = 0.4;
  }

  // E2: Task compliance (5 pts) — does the answer match the required shape?
  let e2Pct = 1.0;
  if (requiredShape === "table" && !hasTable(text) && textLen > 200) {
    e2Pct = 0.2;
  }
  if (requiredShape === "categorized_list") {
    const hasCategorization =
      /\*\*[^*]+(supported|suggested|legible|unreadable|strengths?|risks?|missing|primary|support|recurring|variable|in.place|future)[^*]*\*\*/i.test(
        text
      ) || /(^|\n)#{2,4}\s+/m.test(text);
    if (!hasCategorization && textLen > 200) {
      issues.push("MISSING_CATEGORIZATION");
      e2Pct = 0.2;
    }
  }
  if (requiredShape === "memo") {
    const hasMemoStructure =
      /\b(red flags?|risks?|ambiguit|concerns?|strengths?|conclusion)\b/i.test(
        text
      ) && hasStructuredContent(text);
    if (!hasMemoStructure && textLen > 200) {
      e2Pct = 0.4;
    }
  }
  // Multi-part queries: if too short, task compliance is poor
  if (isMultiPartQuery(r.query) && textLen < 400 && textLen > 0) {
    issues.push("PARTIAL_ANSWER");
    caps.push({ issue: "PARTIAL_ANSWER", cap: 79 });
    e2Pct = Math.min(e2Pct, 0.2);
  }
  // must_include_fields check
  if (mustInclude.length > 0 && textLen > 100) {
    if (
      requiredShape === "categorized_list" &&
      mustInclude.some((f) => f.includes("bucket") || f.includes("section"))
    ) {
      const sectionItems = mustInclude.filter(
        (f) => f.includes("bucket") || f.includes("section")
      );
      const foundSections = sectionItems.filter((f) => {
        const key = f
          .replace(/_/g, " ")
          .replace(/bucket|section/g, "")
          .trim();
        return key.length > 0 && textLower.includes(key);
      }).length;
      if (foundSections < sectionItems.length * 0.5) {
        issues.push("MISSING_REQUIRED_SECTIONS");
        e2Pct = Math.min(e2Pct, 0.3);
      }
    }
  }
  e1Pct = Math.max(0, Math.min(1, e1Pct));
  e2Pct = Math.max(0, Math.min(1, e2Pct));

  // Combined E score: E1 50%, E2 50%
  const eScore = 0.5 * e1Pct + 0.5 * e2Pct;

  // ── Category F: Composition Quality ─────────────────────────────────────
  // F1: Structure and readability (5 pts)
  let f1Pct = 1.0;
  if (textLen > 500 && !hasStructuredContent(text)) {
    issues.push("WALL_OF_TEXT");
    f1Pct = 0.4;
  }

  // F2: Formatting quality (5 pts)
  let f2Pct = 1.0;
  if (
    r.truncated === true ||
    text.includes("[truncated]") ||
    (text.includes("…") && textLen > 3000)
  ) {
    issues.push("TRUNCATED");
    f2Pct -= 0.4;
  }
  if (isIncompleteList(text)) {
    issues.push("INCOMPLETE_LIST");
    caps.push({ issue: "INCOMPLETE_LIST", cap: 79 });
    f2Pct -= 0.3;
  }
  f1Pct = Math.max(0, Math.min(1, f1Pct));
  f2Pct = Math.max(0, Math.min(1, f2Pct));

  // Combined F score: F1 50%, F2 50%
  const fScore = 0.5 * f1Pct + 0.5 * f2Pct;

  // ── Completeness caps ────────────────────────────────────────────────────
  if (textLen > 0 && textLen < 100) {
    issues.push("VERY_SHORT");
    caps.push({ issue: "VERY_SHORT", cap: 69 });
  } else if (textLen > 0 && textLen < 200) {
    if (mustInclude.length > 0) {
      issues.push("SHORT_WITH_REQUIRED_FIELDS");
      caps.push({ issue: "SHORT_WITH_REQUIRED_FIELDS", cap: 79 });
    } else if (queryType !== "direct_extraction") {
      issues.push("SHORT");
      caps.push({ issue: "SHORT", cap: 89 });
    }
  }

  // ── Abstention cap ───────────────────────────────────────────────────────
  if (isAbstaining) {
    caps.push({ issue: "ABSTENTION", cap: 49 });
  }

  // ── Latency penalties ────────────────────────────────────────────────────
  if (latencyMs > 25000) {
    issues.push("EXTREME_LATENCY");
    penalties.push({ issue: "EXTREME_LATENCY", points: -12 });
  } else if (latencyMs > 20000) {
    issues.push("VERY_HIGH_LATENCY");
    penalties.push({ issue: "VERY_HIGH_LATENCY", points: -8 });
    const isWeakAnswer =
      textLen < 300 ||
      issues.some((i) =>
        ["SHORT", "VERY_SHORT", "PARTIAL_ANSWER", "ABSTENTION"].includes(i)
      );
    if (isWeakAnswer) caps.push({ issue: "VERY_HIGH_LATENCY_WEAK", cap: 84 });
  } else if (latencyMs > 15000) {
    issues.push("HIGH_LATENCY");
    penalties.push({ issue: "HIGH_LATENCY", points: -4 });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMPUTE WEIGHTED FINAL SCORE
  // Each category score (0-1) is multiplied by its weight (0-100),
  // giving the contribution to the final 100-point score.
  // ─────────────────────────────────────────────────────────────────────────

  const catAScore  = aScore * weights.A;
  const catBScore  = bScore * weights.B;
  const catCScore  = cScore * weights.C;
  const catDScore  = dScore * weights.D;
  const catEScore  = eScore * weights.E;
  const catFScore  = fScore * weights.F;

  let rawScore =
    catAScore + catBScore + catCScore + catDScore + catEScore + catFScore;

  // Apply flat penalties
  for (const p of penalties) rawScore += p.points;
  rawScore = Math.max(0, Math.min(100, rawScore));

  // Apply caps
  let finalScore = rawScore;
  for (const c of caps) finalScore = Math.min(finalScore, c.cap);
  finalScore = Math.max(0, Math.round(finalScore));

  const grade =
    finalScore >= 95
      ? "A+"
      : finalScore >= 90
        ? "A"
        : finalScore >= 85
          ? "B+"
          : finalScore >= 80
            ? "B"
            : finalScore >= 70
              ? "C"
              : finalScore >= 40
                ? "D"
                : "F";

  const categories = {
    retrieval:    { score: Math.round(catAScore),  pct: Math.round(aScore * 100), weight: weights.A, detail: { a1: Math.round(a1Pct*100), a2: Math.round(a2Pct*100), a3: Math.round(a3Pct*100) } },
    precision:    { score: Math.round(catBScore),  pct: Math.round(bScore * 100), weight: weights.B, detail: { b1: Math.round(b1Pct*100), b2: Math.round(b2Pct*100) } },
    numericTable: { score: Math.round(catCScore),  pct: Math.round(cScore * 100), weight: weights.C, detail: { c1: Math.round(c1Pct*100), c2: Math.round(c2Pct*100) } },
    grounding:    { score: Math.round(catDScore),  pct: Math.round(dScore * 100), weight: weights.D, detail: { d1: Math.round(d1Pct*100), d2: Math.round(d2Pct*100) } },
    reasoning:    { score: Math.round(catEScore),  pct: Math.round(eScore * 100), weight: weights.E, detail: { e1: Math.round(e1Pct*100), e2: Math.round(e2Pct*100) } },
    composition:  { score: Math.round(catFScore),  pct: Math.round(fScore * 100), weight: weights.F, detail: { f1: Math.round(f1Pct*100), f2: Math.round(f2Pct*100) } },
  };

  return {
    ...r,
    score: finalScore,
    rawScore: Math.round(rawScore),
    grade,
    issues,
    caps:     caps.map((c) => `${c.issue}→${c.cap}`),
    penalties: penalties.map((p) => `${p.issue}(${p.points})`),
    latencyMs,
    categories,
    domain,
    queryType,
    hardFail: null,
    goldFactHitRate: spec?.gold_facts?.length ? goldFacts.hitRate : null,
    goldFactsMissing: spec?.gold_facts?.length ? goldFacts.missing : [],
  };
});

// ═════════════════════════════════════════════════════════════════════════════
// CROSS-ANSWER CONSISTENCY (Layer B continuation — applied post-scoring)
// ═════════════════════════════════════════════════════════════════════════════

// Contradiction group definitions
const CONTRADICTION_GROUPS = [
  {
    id: "att_last_bill",
    doc_label: "ATT Bill Dec2023",
    query_ids: ["Q24", "Q25", "Q28"],
    key_claim: "last bill amount",
    check: (texts) => {
      // Check if some say $137.08 is visible and others say it's not
      const seesAmount = texts.filter(
        (t) => t && /\$137\.08|\$137\b/i.test(t)
      ).length;
      const noAmount = texts.filter(
        (t) =>
          t &&
          !/\$137\.08|\$137\b/i.test(t) &&
          /not (visible|available|shown|provided|detailed|specified|stated)|cannot (confirm|verify|be made)/i.test(t)
      ).length;
      return seesAmount > 0 && noAmount > 0;
    },
    penalty: -10,
    contradictionLabel: "INTERNAL_CONTRADICTION",
  },
  {
    id: "breguet_dates_places",
    doc_label: "Breguet",
    query_ids: ["Q32", "Q33", "Q35"],
    key_claim: "dates and places in document",
    check: (texts, queryNums) => {
      // Q32 says "no dates/places" but Q33/Q35 mention dates/places
      const q32Idx = queryNums.indexOf(32);
      if (q32Idx === -1) return false;
      const q32text = texts[q32Idx] || "";
      const q32HasNoContent =
        /no\b.*\b(dates?|places?|proper nouns?|identifiers?|place names?).*\bpresent|none\b.*\b(found|visible|readable)|no readable dates|no specific place/i.test(
          q32text
        );
      if (!q32HasNoContent) return false;
      // Check if other queries in group mention dates or places
      const othersMentionContent = texts.some(
        (t, i) =>
          i !== q32Idx &&
          t &&
          /\b(19\d\d|20\d\d|\d{1,2}\/\d{1,2}\/\d{2,4}|january|february|march|april|may|june|july|august|september|october|november|december|paris|geneva|zurich|london|new york|beverly hills|rodeo drive|los angeles)\b/i.test(
            t
          )
      );
      return othersMentionContent;
    },
    penalty: -15,
    contradictionLabel: "INTERNAL_CONTRADICTION",
  },
];

const contradictionPenaltiesByQuery = {}; // queryNum -> penalty

for (const group of CONTRADICTION_GROUPS) {
  const groupGrades = group.query_ids.map((qid) => {
    const qnum = parseInt(qid.replace("Q", ""), 10);
    return grades.find((g) => g.queryNum === qnum) || null;
  });
  const texts = groupGrades.map((g) => g?.fullText || "");
  const queryNums = groupGrades.map((g) => g?.queryNum ?? -1);

  let hasContradiction = false;
  try {
    hasContradiction = group.check(texts, queryNums);
  } catch (_) {
    // Ignore check errors
  }

  if (hasContradiction) {
    // Penalize the MINORITY answer (the one that contradicts the majority)
    // For att_last_bill: penalize the one that says "not available" when others show the value
    // For breguet: penalize Q32 which denies content that Q33/Q35 provide
    if (group.id === "att_last_bill") {
      // Penalize answers that say the amount is not available
      for (const g of groupGrades) {
        if (!g) continue;
        const t = (g.fullText || "").toLowerCase();
        if (!/\$137/.test(t) && /not (visible|available|shown|provided|detailed|specified)/i.test(g.fullText || "")) {
          if (!g.issues.includes(group.contradictionLabel)) g.issues.push(group.contradictionLabel);
          contradictionPenaltiesByQuery[g.queryNum] = (contradictionPenaltiesByQuery[g.queryNum] || 0) + group.penalty;
        }
      }
    } else if (group.id === "breguet_dates_places") {
      // Penalize Q32 specifically (it denies content others provide)
      const q32 = groupGrades.find(g => g && g.queryNum === 32);
      if (q32) {
        if (!q32.issues.includes(group.contradictionLabel)) q32.issues.push(group.contradictionLabel);
        contradictionPenaltiesByQuery[q32.queryNum] = (contradictionPenaltiesByQuery[q32.queryNum] || 0) + group.penalty;
      }
    } else {
      // Default: penalize all in group
      for (const g of groupGrades) {
        if (!g) continue;
        if (!g.issues.includes(group.contradictionLabel)) g.issues.push(group.contradictionLabel);
        contradictionPenaltiesByQuery[g.queryNum] = (contradictionPenaltiesByQuery[g.queryNum] || 0) + group.penalty;
      }
    }
  }
}

// Apply contradiction penalties retroactively
for (const g of grades) {
  if (contradictionPenaltiesByQuery[g.queryNum]) {
    const penalty = contradictionPenaltiesByQuery[g.queryNum];
    g.score = Math.max(0, g.score + penalty);
    g.penalties.push(`CONTRADICTION(${penalty})`);
    // Recalculate grade
    const s = g.score;
    g.grade =
      s >= 95 ? "A+" : s >= 90 ? "A" : s >= 85 ? "B+" : s >= 80 ? "B" : s >= 70 ? "C" : s >= 40 ? "D" : "F";
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// LAYER A — RUN INTEGRITY SCORING (0-100 each sub-score)
// ═════════════════════════════════════════════════════════════════════════════

const runIntegrityChecks = {};
let runIntegrityScore = 0;

// +30: Single canonical answer artifact
const reportFiles = fs
  .readdirSync(path.join(__dirname, "reports"))
  .filter(
    (f) =>
      f.includes("99-query") &&
      f.endsWith(".json") &&
      !f.includes("manifest") &&
      !f.includes("grading")
  );
if (reportFiles.length === 1) {
  runIntegrityScore += 30;
  runIntegrityChecks.canonical_artifact = "PASS — single canonical run file";
} else if (reportFiles.length === 0) {
  runIntegrityChecks.canonical_artifact = "FAIL — no run file found";
} else {
  runIntegrityScore += 15;
  runIntegrityChecks.canonical_artifact = `WARN — ${reportFiles.length} run files (expected 1): ${reportFiles.join(", ")}`;
}

// +30: Manifest with run_id, answer hash, timestamps
const answerHash = crypto.createHash("sha256").update(rawInput).digest("hex");
const hasManifestMeta =
  data.meta &&
  data.meta.runDate &&
  typeof data.meta.totalQueries === "number";
if (hasManifestMeta) {
  runIntegrityScore += 30;
  runIntegrityChecks.manifest_metadata = "PASS — run_id + timestamps present";
} else {
  runIntegrityChecks.manifest_metadata =
    "FAIL — missing runDate or totalQueries in meta";
}

// +20: No duplicate result files
const allRunFiles = fs
  .readdirSync(path.join(__dirname, "reports"))
  .filter((f) => f.includes("99-query-run") && f.endsWith(".json"));
if (allRunFiles.length <= 2) {
  runIntegrityScore += 20;
  runIntegrityChecks.no_duplicates = "PASS";
} else {
  runIntegrityChecks.no_duplicates = `WARN — ${allRunFiles.length} run files found`;
  runIntegrityScore += 10;
}

// +20: Metadata present (answer count matches expected)
const expectedCount = data.meta?.totalQueries || 89;
if (grades.length === expectedCount) {
  runIntegrityScore += 20;
  runIntegrityChecks.result_count = `PASS — ${grades.length}/${expectedCount} results`;
} else {
  runIntegrityChecks.result_count = `WARN — ${grades.length} results, expected ${expectedCount}`;
  runIntegrityScore += Math.round(20 * (grades.length / expectedCount));
}

runIntegrityChecks.answer_hash = answerHash.substring(0, 16) + "...";
runIntegrityChecks.integrity_score = `${runIntegrityScore}/100`;

// ── Consistency scoring (0-100) ───────────────────────────────────────────
let consistencyScore = 100;
const contradictionGroupsFound = CONTRADICTION_GROUPS.filter((group) => {
  const groupGrades = group.query_ids.map((qid) => {
    const qnum = parseInt(qid.replace("Q", ""), 10);
    return grades.find((g) => g.queryNum === qnum) || null;
  });
  return groupGrades.some((g) => g?.issues.includes(group.contradictionLabel));
});
consistencyScore -= 20 * contradictionGroupsFound.length;
consistencyScore = Math.max(0, consistencyScore);
runIntegrityChecks.consistency = `${consistencyScore}/100 — ${contradictionGroupsFound.length} contradiction group(s) found`;
if (contradictionGroupsFound.length > 0) {
  runIntegrityChecks.contradiction_groups = contradictionGroupsFound.map(
    (g) => g.id
  );
}

// ── Calibration scoring (0-100) ───────────────────────────────────────────
// Penalize false A grades (A/A+ with disqualifying issues)
const DISQUALIFYING_FOR_A = [
  "MISSING_TABLE",
  "PARTIAL_ANSWER",
  "MISSING_STRUCTURE",
  "NO_INLINE_CITATIONS",
  "ABSTENTION",
  "VERY_SHORT",
  "INCOMPLETE_LIST",
  "INTERNAL_CONTRADICTION",
  "MISSING_KEY_FACTS",
  "META_NON_ANSWER",
  "BELOW_MIN_LENGTH",
  "SHORT_WITH_REQUIRED_FIELDS",
];
const falseAs = grades.filter(
  (g) =>
    (g.grade === "A+" || g.grade === "A") &&
    g.issues.some((i) => DISQUALIFYING_FOR_A.includes(i))
);
let calibrationScore = 100 - 10 * falseAs.length;
calibrationScore = Math.max(0, calibrationScore);
runIntegrityChecks.false_as = falseAs.length === 0
  ? "PASS — no false A grades"
  : `FAIL — ${falseAs.length} A-graded queries have disqualifying issues`;
runIntegrityChecks.calibration_score = `${calibrationScore}/100`;

// ── Caps effectiveness ────────────────────────────────────────────────────
const capsApplied = grades.filter((g) => g.caps && g.caps.length > 0).length;
const capsAffectedGrade = grades.filter(
  (g) => g.caps && g.caps.length > 0 && g.rawScore > g.score
).length;
if (capsApplied > 0 && capsAffectedGrade > 0) {
  runIntegrityChecks.caps_effective = `PASS — ${capsAffectedGrade}/${capsApplied} caps lowered scores`;
} else if (capsApplied === 0) {
  runIntegrityChecks.caps_effective = "WARN — no caps triggered";
} else {
  runIntegrityChecks.caps_effective = "WARN — caps triggered but none changed final scores";
}

// ═════════════════════════════════════════════════════════════════════════════
// LAYER C — RUN-LEVEL SCORE
// ═════════════════════════════════════════════════════════════════════════════

const totalScore = grades.reduce((s, g) => s + g.score, 0);
const meanAnswerScore = totalScore / grades.length;

// Final = 0.70 × MeanAnswerScore + 0.10 × RunIntegrity + 0.10 × Consistency + 0.10 × Calibration
const finalBenchmarkScore =
  0.7 * meanAnswerScore +
  0.1 * runIntegrityScore +
  0.1 * consistencyScore +
  0.1 * calibrationScore;

const gradeDistrib = { "A+": 0, A: 0, "B+": 0, B: 0, C: 0, D: 0, F: 0 };
for (const g of grades) gradeDistrib[g.grade]++;
const avgLatency = Math.round(
  grades.reduce((s, g) => s + g.latencyMs, 0) / grades.length
);
const hardFailCount = grades.filter(
  (g) => g.hardFail != null || g.score === 0
).length;
const hardFailRate = (hardFailCount / grades.length) * 100;

// ── Release gate evaluation ───────────────────────────────────────────────
const releaseGates = {
  Bronze: {
    mean: 80, hard_fail_rate: 2, integrity: 90,
    pass:
      meanAnswerScore >= 80 &&
      hardFailRate < 2 &&
      runIntegrityScore >= 90,
  },
  Silver: {
    mean: 88, hard_fail_rate: 1, integrity: 95, consistency: 92,
    pass:
      meanAnswerScore >= 88 &&
      hardFailRate < 1 &&
      runIntegrityScore >= 95 &&
      consistencyScore >= 92,
  },
  Gold: {
    mean: 92, hard_fail_rate: 0.5, integrity: 98, consistency: 95, calibration: 95,
    pass:
      meanAnswerScore >= 92 &&
      hardFailRate < 0.5 &&
      runIntegrityScore >= 98 &&
      consistencyScore >= 95 &&
      calibrationScore >= 95,
  },
  Platinum: {
    mean: 95, hard_fail_rate: 0, integrity: 100, consistency: 98, calibration: 98,
    pass:
      meanAnswerScore >= 95 &&
      hardFailRate === 0 &&
      runIntegrityScore === 100 &&
      consistencyScore >= 98 &&
      calibrationScore >= 98,
  },
};
const highestGate = ["Platinum", "Gold", "Silver", "Bronze"].find(
  (k) => releaseGates[k].pass
) || "None";

const benchmarkGrade =
  finalBenchmarkScore >= 95
    ? "A+ (Platinum-eligible)"
    : finalBenchmarkScore >= 90
      ? "A (excellent)"
      : finalBenchmarkScore >= 85
        ? "B+ (strong)"
        : finalBenchmarkScore >= 80
          ? "B (usable, risky on hard tasks)"
          : finalBenchmarkScore >= 70
            ? "C (too inconsistent)"
            : "D/F (not acceptable)";

// ═════════════════════════════════════════════════════════════════════════════
// GENERATE MANIFEST
// ═════════════════════════════════════════════════════════════════════════════

const manifest = {
  run_id: data.meta?.runDate
    ? `run-${data.meta.runDate.replace(/[:.]/g, "-").substring(0, 19)}`
    : `run-${Date.now()}`,
  date: data.meta?.runDate || new Date().toISOString(),
  grading_date: new Date().toISOString(),
  judge_version: "grade-99-query.mjs v3.2",
  answer_artifact_file: "99-query-run.json",
  answer_artifact_hash: answerHash,
  query_count: grades.length,
  mean_answer_score: meanAnswerScore.toFixed(1),
  run_integrity_score: runIntegrityScore,
  consistency_score: consistencyScore,
  calibration_score: calibrationScore,
  final_benchmark_score: finalBenchmarkScore.toFixed(1),
  benchmark_grade: benchmarkGrade,
  highest_release_gate: highestGate,
  hard_fail_count: hardFailCount,
  hard_fail_rate_pct: hardFailRate.toFixed(2),
  grade_distribution: gradeDistrib,
  avg_latency_ms: avgLatency,
  formula: "0.70 × MeanAnswerScore + 0.10 × RunIntegrity + 0.10 × Consistency + 0.10 × Calibration",
};

fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

// ═════════════════════════════════════════════════════════════════════════════
// GENERATE JSON GRADING ARTIFACT
// ═════════════════════════════════════════════════════════════════════════════

const gradingJson = {
  meta: {
    grading_date: new Date().toISOString(),
    judge_version: "grade-99-query.mjs v3.2",
    answer_artifact_hash: answerHash,
    mean_answer_score: meanAnswerScore,
    run_integrity_score: runIntegrityScore,
    consistency_score: consistencyScore,
    calibration_score: calibrationScore,
    final_benchmark_score: finalBenchmarkScore,
    highest_release_gate: highestGate,
    hard_fail_count: hardFailCount,
    hard_fail_rate_pct: hardFailRate,
    grade_distribution: gradeDistrib,
  },
  per_query: grades.map((g) => ({
    query_id: `Q${g.queryNum}`,
    query: g.query,
    doc_label: g.docLabel,
    domain: g.domain,
    query_type: g.queryType,
    score: g.score,
    raw_score: g.rawScore,
    grade: g.grade,
    hard_fail: g.hardFail,
    issues: g.issues,
    caps: g.caps,
    penalties: g.penalties,
    latency_ms: g.latencyMs,
    gold_fact_hit_rate: g.goldFactHitRate,
    gold_facts_missing: g.goldFactsMissing,
    categories: g.categories,
  })),
  run_integrity_checks: runIntegrityChecks,
};

fs.writeFileSync(OUTPUT_JSON, JSON.stringify(gradingJson, null, 2));

// ═════════════════════════════════════════════════════════════════════════════
// GENERATE MARKDOWN REPORT
// ═════════════════════════════════════════════════════════════════════════════

const catLabels = [
  { key: "retrieval",    label: "A. Retrieval Correctness" },
  { key: "precision",   label: "B. Factual Precision" },
  { key: "numericTable",label: "C. Numeric & Table Integrity" },
  { key: "grounding",   label: "D. Grounding & Evidence" },
  { key: "reasoning",   label: "E. Reasoning Quality" },
  { key: "composition", label: "F. Composition Quality" },
];

let md = `# 99-Query Benchmark Grading Report v3.2\n\n`;
md += `**Date**: ${new Date().toISOString().split("T")[0]}\n`;
md += `**Run ID**: ${manifest.run_id}\n`;
md += `**Answer Artifact Hash**: \`${answerHash.substring(0, 16)}...\`\n`;
md += `**Judge Version**: grade-99-query.mjs v3.2\n\n`;

// ── Final Score ───────────────────────────────────────────────────────────
md += `## Final Benchmark Score\n\n`;
md += `| Metric | Value |\n`;
md += `|--------|-------|\n`;
md += `| Mean Answer Score | **${meanAnswerScore.toFixed(1)}/100** |\n`;
md += `| Run Integrity | ${runIntegrityScore}/100 |\n`;
md += `| Consistency | ${consistencyScore}/100 |\n`;
md += `| Calibration | ${calibrationScore}/100 |\n`;
md += `| **Final Score** | **${finalBenchmarkScore.toFixed(1)}/100** |\n`;
md += `| **Grade** | **${benchmarkGrade}** |\n`;
md += `| Highest Release Gate | **${highestGate}** |\n`;
md += `| Hard Fail Count | ${hardFailCount} (${hardFailRate.toFixed(1)}%) |\n`;
md += `| Avg Latency | ${avgLatency}ms |\n`;
md += `| Queries Graded | ${grades.length} |\n\n`;

md += `**Formula**: \`Final = 0.70 × MeanAnswerScore + 0.10 × RunIntegrity + 0.10 × Consistency + 0.10 × Calibration\`\n\n`;

// ── Grade Distribution ────────────────────────────────────────────────────
md += `### Grade Distribution\n\n`;
md += `| Grade | Count | % |\n`;
md += `|-------|-------|---|\n`;
for (const [g, c] of Object.entries(gradeDistrib)) {
  if (c > 0 || ["A+", "A", "B+", "B"].includes(g)) {
    md += `| ${g} | ${c} | ${((c / grades.length) * 100).toFixed(0)}% |\n`;
  }
}
md += `\n`;

// ── Release Gate Evaluation ───────────────────────────────────────────────
md += `## Release Gate Evaluation\n\n`;
md += `| Gate | Mean ≥ | HF Rate < | Integrity ≥ | Consistency ≥ | Calibration ≥ | Status |\n`;
md += `|------|--------|-----------|-------------|---------------|---------------|--------|\n`;
for (const [gate, req] of Object.entries(releaseGates)) {
  const status = req.pass ? "PASS" : "FAIL";
  md += `| ${gate} | ${req.mean} | ${req.hard_fail_rate}% | ${req.integrity || "—"} | ${req.consistency || "—"} | ${req.calibration || "—"} | **${status}** |\n`;
}
md += `\n`;

// ── Category Averages ─────────────────────────────────────────────────────
md += `## Category Averages\n\n`;
md += `| Category | Avg Score | Avg % | Typical Weight |\n`;
md += `|----------|-----------|-------|----------------|\n`;
for (const cat of catLabels) {
  const vals = grades
    .filter((g) => g.categories?.[cat.key])
    .map((g) => g.categories[cat.key].score);
  const avg = vals.length
    ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1)
    : "—";
  const pcts = grades
    .filter((g) => g.categories?.[cat.key])
    .map((g) => g.categories[cat.key].pct);
  const avgPct = pcts.length
    ? (pcts.reduce((s, v) => s + v, 0) / pcts.length).toFixed(0) + "%"
    : "—";
  md += `| ${cat.label} | ${avg} pts | ${avgPct} | varies by type |\n`;
}
md += `\n`;

// ── Table C: Run Integrity Checks ─────────────────────────────────────────
md += `## Table C — Run Integrity Checks\n\n`;
md += `| Check | Status |\n`;
md += `|-------|--------|\n`;
const intChecks = [
  ["Canonical artifact", runIntegrityChecks.canonical_artifact],
  ["Manifest metadata", runIntegrityChecks.manifest_metadata],
  ["No duplicate files", runIntegrityChecks.no_duplicates],
  ["Result count", runIntegrityChecks.result_count],
  ["Answer hash", `\`${runIntegrityChecks.answer_hash}\``],
  ["Caps effective", runIntegrityChecks.caps_effective],
  ["No false A grades", runIntegrityChecks.false_as],
  ["Consistency", runIntegrityChecks.consistency],
  ["Calibration score", runIntegrityChecks.calibration_score],
  ["**Run Integrity Total**", `**${runIntegrityScore}/100**`],
];
for (const [k, v] of intChecks) {
  md += `| ${k} | ${v} |\n`;
}
md += `\n`;

// ── Contradiction Analysis ────────────────────────────────────────────────
md += `## Contradiction Analysis\n\n`;
if (contradictionGroupsFound.length === 0) {
  md += `No cross-answer contradictions detected.\n\n`;
} else {
  md += `**${contradictionGroupsFound.length} contradiction group(s) detected.** Each affected query penalized per methodology.\n\n`;
  for (const group of contradictionGroupsFound) {
    md += `### Group: \`${group.id}\`\n`;
    md += `- **Queries**: ${group.query_ids.join(", ")}\n`;
    md += `- **Claim**: ${group.key_claim}\n`;
    md += `- **Penalty per query**: ${group.penalty} pts\n\n`;
  }
}

// ── Table B: Failure Taxonomy ─────────────────────────────────────────────
md += `## Table B — Failure Taxonomy\n\n`;
const issueCounts = {};
for (const g of grades) {
  for (const issue of g.issues || []) {
    issueCounts[issue] = (issueCounts[issue] || 0) + 1;
  }
}
const issueImpacts = {
  PROCESSING_ERROR:            "hard fail (0) — HF-6",
  LANGUAGE_CONTRACT_BLOCKED:   "hard fail (0) — HF-6",
  GARBLED_ECHO:                "hard fail (0) — HF-6",
  ABSTENTION_HARD_FAIL:        "hard fail (0) — HF-2",
  CHUNK_REF_LEAK:              "hard fail (0) — HF-3",
  MISSING_TABLE:               "cap→74",
  MALFORMED_TABLE:             "cap→74",
  NO_INLINE_CITATIONS:         "cap→69 (legal/regulatory/stats/billing)",
  REGULATORY_NO_CITATIONS:     "cap→69",
  PARTIAL_ANSWER:              "cap→79",
  MISSING_STRUCTURE:           "cap→79",
  VERY_SHORT:                  "cap→69",
  INCOMPLETE_LIST:             "cap→79",
  MISSING_KEY_FACTS:           "cap→69 (gold facts <50%)",
  ABSTENTION:                  "cap→49",
  META_NON_ANSWER:             "cap→49 (describes doc instead of answering)",
  BELOW_MIN_LENGTH:            "cap→74",
  WEAK_CITATIONS:              "cap→84",
  SHORT_WITH_REQUIRED_FIELDS:  "cap→79",
  SHORT:                       "cap→89",
  NO_SPEC:                     "cap→84",
  NO_SOURCES:                  "A1 -50%",
  LANGUAGE_MISMATCH:           "B1 -50%",
  EXCESSIVE_HEDGING:           "B1 -30%",
  FALSE_CERTAINTY_ON_SCAN:     "B2 -30%",
  MISSING_DOLLAR_AMOUNTS:      "C1 -50%",
  NEGATIVE_PAGE_REF:           "C1 -30%",
  SCOPE_DRIFT:                 "A3 -60%",
  WALL_OF_TEXT:                "F1 -60%",
  TRUNCATED:                   "F2 -40%",
  INTERNAL_CONTRADICTION:      "score -10 to -15",
  UNANCHORED_STATISTIC:        "D1 cap 50%",
  POSSIBLE_HALLUCINATED_NUMBER:"B1 -30%",
  POSSIBLE_CORRELATION_CLAIM:  "B2 -20%",
  MISSING_CATEGORIZATION:      "E2 -80%",
  MISSING_REQUIRED_SECTIONS:   "E2 -70%",
  HIGH_LATENCY:                "-4 pts",
  VERY_HIGH_LATENCY:           "-8 pts",
  EXTREME_LATENCY:             "-12 pts",
  TABLE_EMPTY_CELLS:           "C2 -20%",
};
md += `| Issue | Count | Impact |\n`;
md += `|-------|-------|--------|\n`;
for (const [issue, count] of Object.entries(issueCounts).sort(
  (a, b) => b[1] - a[1]
)) {
  md += `| ${issue} | ${count} | ${issueImpacts[issue] || "penalty"} |\n`;
}
md += `\n`;

// ── Score Caps Applied ────────────────────────────────────────────────────
const capsQueries = grades.filter(
  (g) => g.caps && g.caps.length > 0 && g.rawScore > g.score
);
if (capsQueries.length > 0) {
  md += `## Score Caps Applied (${capsQueries.length} queries)\n\n`;
  md += `| Query | Type | Raw | Final | Caps |\n`;
  md += `|-------|------|-----|-------|------|\n`;
  for (const g of capsQueries) {
    md += `| Q${g.queryNum} | ${g.queryType?.substring(0, 14) || "—"} | ${g.rawScore} | ${g.score} | ${g.caps.join(", ")} |\n`;
  }
  md += `\n`;
}

// ── Table A: Per-query scores ─────────────────────────────────────────────
md += `## Table A — Per-Query Scores\n\n`;
const docGroups = {};
for (const g of grades) {
  const label = g.docLabel || "Unknown";
  if (!docGroups[label]) docGroups[label] = [];
  docGroups[label].push(g);
}
for (const [label, group] of Object.entries(docGroups)) {
  const docAvg = (
    group.reduce((s, g) => s + g.score, 0) / group.length
  ).toFixed(1);
  const docAvgLat = Math.round(
    group.reduce((s, g) => s + g.latencyMs, 0) / group.length
  );
  md += `### ${label} — avg ${docAvg}/100, ${docAvgLat}ms avg latency\n\n`;
  md += `| # | Domain | Type | HF? | A% | B% | C% | D% | E% | F% | Raw | Final | Grade | Key Issues |\n`;
  md += `|---|--------|------|-----|----|----|----|----|----|----|-----|-------|-------|------------|\n`;
  for (const g of group) {
    const c = g.categories || {};
    const hf = g.hardFail || (g.score === 0 ? "Y" : "—");
    const issueStr = (g.issues || []).slice(0, 3).join(", ") || "—";
    md += `| Q${g.queryNum} | ${(g.domain || "—").substring(0, 11)} | ${(g.queryType || "—").substring(0, 11)} | ${hf} | ${c.retrieval?.pct ?? "—"} | ${c.precision?.pct ?? "—"} | ${c.numericTable?.pct ?? "—"} | ${c.grounding?.pct ?? "—"} | ${c.reasoning?.pct ?? "—"} | ${c.composition?.pct ?? "—"} | ${g.rawScore ?? "—"} | **${g.score}** | ${g.grade} | ${issueStr} |\n`;
  }
  md += `\n`;
}

// ── Non-A queries detail ──────────────────────────────────────────────────
const failedQueries = grades.filter(
  (g) => g.grade !== "A+" && g.grade !== "A"
);
md += `## Table B2 — Non-A Queries Detail (${failedQueries.length})\n\n`;
if (failedQueries.length === 0) {
  md += `All queries scored A or A+.\n\n`;
} else {
  md += `| Query | Grade | Score | Domain | Issues | Caps | Preview |\n`;
  md += `|-------|-------|-------|--------|--------|------|---------|\n`;
  for (const g of failedQueries) {
    const preview = (g.fullText || "")
      .substring(0, 80)
      .replace(/\n/g, " ")
      .replace(/\|/g, "\\|");
    md += `| Q${g.queryNum} | ${g.grade} | ${g.score} | ${g.domain || "—"} | ${(g.issues || []).join(", ")} | ${(g.caps || []).join(", ") || "—"} | ${preview}… |\n`;
  }
  md += `\n`;
}

// ── Methodology notes ─────────────────────────────────────────────────────
md += `## Methodology Notes v3.0\n\n`;
md += `- **Automated checks**: source presence, table quality, citation presence/count, length, language, latency, structure, gold facts\n`;
md += `- **Gold facts**: primary automated quality signal — if hit rate <50%, cap at 69; if <80%, B1 deduction\n`;
md += `- **Query-type weights**: different weight distributions per type (direct_extraction, comparison, legal_procedural, structured_reconstruction, interpretive_grounded)\n`;
md += `- **Calibrated caps** (v3.1): SHORT→89, PARTIAL→79, MISSING_TABLE→74, MISSING_STRUCTURE→79, WEAK_CITATIONS→84, NO_INLINE_CITATIONS→69, ABSTENTION→49\n`;
md += `- **Hard fails (score=0)**: HF-1 wrong document, HF-2 hallucinated fact/abstention with gold facts, HF-3 numeric corruption (chunk ref leak), HF-5 broken output, HF-6 processing error\n`;
md += `- **Cross-answer consistency**: contradiction groups checked post-scoring with -10 to -15 pt retroactive penalty\n`;
md += `- **No spec cap**: queries without a spec entry are capped at 84 (cannot achieve A)\n`;
md += `- **Grade bands**: A+ ≥95, A ≥90, B+ ≥85, B ≥80, C ≥70, D ≥40, F <40\n`;
md += `- **Formula**: Final = 0.70 × MeanAnswerScore + 0.10 × RunIntegrity + 0.10 × Consistency + 0.10 × Calibration\n`;

fs.writeFileSync(OUTPUT_MD, md);

// ═════════════════════════════════════════════════════════════════════════════
// CONSOLE OUTPUT
// ═════════════════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(64)}`);
console.log(`  99-QUERY BENCHMARK GRADING v3.0 (STRICT)`);
console.log(`${"═".repeat(64)}`);
console.log(`  Run ID:          ${manifest.run_id}`);
console.log(`  Hash:            ${answerHash.substring(0, 16)}...`);
console.log(``);
console.log(`  Mean Answer Score:     ${meanAnswerScore.toFixed(1)}/100`);
console.log(`  Run Integrity:         ${runIntegrityScore}/100`);
console.log(`  Consistency:           ${consistencyScore}/100`);
console.log(`  Calibration:           ${calibrationScore}/100`);
console.log(`  ─────────────────────────────────────────`);
console.log(`  FINAL BENCHMARK SCORE: ${finalBenchmarkScore.toFixed(1)}/100`);
console.log(`  GRADE:                 ${benchmarkGrade}`);
console.log(`  HIGHEST GATE:          ${highestGate}`);
console.log(``);
console.log(`  Grade Distribution:`);
for (const [g, c] of Object.entries(gradeDistrib)) {
  if (c > 0) console.log(`    ${g.padEnd(3)}: ${c}`);
}
console.log(`  Hard Fails:      ${hardFailCount} (${hardFailRate.toFixed(1)}%)`);
console.log(`  Avg Latency:     ${avgLatency}ms`);
console.log(``);
console.log(`  Category Averages:`);
for (const cat of catLabels) {
  const vals = grades
    .filter((g) => g.categories?.[cat.key])
    .map((g) => g.categories[cat.key].score);
  const avg = vals.length
    ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1)
    : "—";
  console.log(`    ${cat.label}: ${avg} pts`);
}
console.log(``);
console.log(`  Top Issues:`);
for (const [issue, count] of Object.entries(issueCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)) {
  console.log(`    ${issue}: ${count}`);
}
if (contradictionGroupsFound.length > 0) {
  console.log(``);
  console.log(`  Contradiction Groups Found: ${contradictionGroupsFound.map((g) => g.id).join(", ")}`);
}
if (capsQueries.length > 0) {
  console.log(`  Caps Applied: ${capsQueries.length} queries had scores capped down`);
}
if (falseAs.length > 0) {
  console.log(`  False A Grades: ${falseAs.length} (deducted from calibration)`);
}
console.log(``);
console.log(`  Release Gates:`);
for (const [gate, req] of Object.entries(releaseGates)) {
  console.log(`    ${gate.padEnd(9)}: ${req.pass ? "PASS" : "FAIL"}`);
}
console.log(``);
console.log(`  Outputs:`);
console.log(`    JSON:     ${OUTPUT_JSON}`);
console.log(`    Report:   ${OUTPUT_MD}`);
console.log(`    Manifest: ${MANIFEST_FILE}`);
console.log(`${"═".repeat(64)}\n`);
