// backend/src/services/core/inputs/boldingNormalizer.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { clamp } from "../../../utils";
import { normalizeWhitespace } from "../../../utils/markdown/markdownUtils";

/**
 * BoldingNormalizerService (ChatGPT-parity, deterministic)
 * -------------------------------------------------------
 * Purpose:
 *  - Apply ChatGPT-style semantic bolding to model output:
 *    A) Key entity in first sentence (headline bolding)
 *    B) Currency / numeric values with units
 *    C) List label bolding (the lead phrase before description)
 *    D) First-occurrence domain terms
 *    E) Section lead-ins ending with colon
 *  - Normalize bold usage (unwrap overlong, cap density)
 *  - Preserve markdown correctness (balanced **, protected regions)
 *
 * Processing order:
 *  1. Protect code blocks, inline code, blockquotes, koda://source links
 *  2. Fix unbalanced markers
 *  3. Unwrap overlong bold spans
 *  4. Apply semantic bolding rules (A-E)
 *  5. Enforce bold density cap
 *  6. Restore protected regions
 *
 * Notes:
 *  - This is a post-compose text transform.
 *  - It does not add "Sources:" labels or any user-facing boilerplate.
 *  - It is idempotent (running twice doesn't double-bold).
 */

export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

type NormalizeInput = {
  text: string;
  // Optional: doc names from evidence/sources for safer bolding of filenames
  documentNames?: string[]; // e.g. ["Report_Q4_2024.pdf", "analysis_mezanino.docx"]
  // Optional: language hint (not required)
  lang?: "any" | "en" | "pt" | "es";
  // Optional: the user's original query (used for headline entity detection)
  userQuery?: string;
};

type NormalizeOutput = {
  text: string;
  meta: {
    changed: boolean;
    transformations: string[];
    stats: {
      boldSpanCount: number;
      boldCharCount: number;
      boldDensity: number; // 0..1
    };
  };
};

// ─── Utility functions ───────────────────────────────────────────────────────

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return clamp(x, 0, 1);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countBoldSpans(text: string): { spans: number; chars: number } {
  const re = /\*\*([^*]+)\*\*/g;
  let spans = 0;
  let chars = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    spans += 1;
    chars += (m[1] ?? "").length;
  }
  return { spans, chars };
}

function isAlreadyBolded(text: string, term: string): boolean {
  return new RegExp(`\\*\\*${escapeRegex(term)}\\*\\*`, "i").test(text);
}

// ─── Protection: code blocks, inline code, blockquotes, koda links ──────────

interface ProtectedRegions {
  text: string;
  restore: (s: string) => string;
}

function protectUnsafeRegions(text: string): ProtectedRegions {
  const placeholders: Array<{ key: string; original: string }> = [];
  let idx = 0;

  function replace(match: string): string {
    const key = `__BOLD_PROTECT_${idx++}__`;
    placeholders.push({ key, original: match });
    return key;
  }

  let result = text;

  // Protect code blocks (```...```)
  result = result.replace(/```[\s\S]*?```/g, replace);

  // Protect inline code (`...`)
  result = result.replace(/`[^`]+`/g, replace);

  // Protect blockquotes (> lines)
  result = result.replace(/^>\s+.+$/gm, replace);

  // Protect koda://source links ([label](koda://source?...))
  result = result.replace(/\[[^\]]+\]\(koda:\/\/source\?[^)]+\)/g, replace);

  // Protect existing markdown links ([label](url))
  result = result.replace(/\[[^\]]+\]\([^)]+\)/g, replace);

  // Protect table separator rows (|---|---|)
  result = result.replace(/^\|[\s:-]+\|$/gm, replace);

  return {
    text: result,
    restore: (s: string) => {
      let out = s;
      // Restore in reverse order to handle nested replacements
      for (let i = placeholders.length - 1; i >= 0; i--) {
        out = out.split(placeholders[i].key).join(placeholders[i].original);
      }
      return out;
    },
  };
}

// ─── Cleanup passes (existing logic, preserved) ─────────────────────────────

function unwrapOverlongBold(
  text: string,
  maxBoldSpanChars: number,
): { text: string; changed: boolean } {
  const re = /\*\*([^*]+)\*\*/g;
  let changed = false;
  const out = text.replace(re, (_m, inner) => {
    const s = String(inner ?? "");
    const sentenceCount = (s.match(/[.!?](\s|$)/g) ?? []).length;
    if (s.length > maxBoldSpanChars || sentenceCount >= 2) {
      changed = true;
      return s; // unwrap
    }
    return `**${s}**`;
  });
  return { text: out, changed };
}

function fixUnbalancedBold(text: string): { text: string; changed: boolean } {
  const count = (text.match(/\*\*/g) ?? []).length;
  if (count % 2 === 0) return { text, changed: false };
  const idx = text.lastIndexOf("**");
  if (idx === -1) return { text, changed: false };
  return { text: text.slice(0, idx) + text.slice(idx + 2), changed: true };
}

// ─── Semantic bolding rules (ChatGPT-style) ─────────────────────────────────

/**
 * Rule B: Bold currency values and numeric values with units.
 * Matches: $24,972,043.79, ($383,893.23), 11.2 months, 2,400 m², 20.29%
 * Only bolds values NOT already inside **...**.
 */
function boldNumericValues(text: string): { text: string; changed: boolean } {
  let changed = false;
  let result = text;

  // Currency: $24,972,043.79 or ($383,893.23)
  result = result.replace(
    /(?<!\*\*)\(?\$\d[\d,]*(?:\.\d{1,2})?\)?(?!\*\*)/g,
    (match) => {
      // Skip if already bolded (check surrounding context)
      if (match.startsWith("**") || match.endsWith("**")) return match;
      changed = true;
      return `**${match}**`;
    },
  );

  // Percentages: 20.29%, 47.7%
  result = result.replace(
    /(?<!\*\*)\b\d[\d,]*(?:\.\d+)?%(?!\*\*)/g,
    (match) => {
      changed = true;
      return `**${match}**`;
    },
  );

  // Numbers with units: 11.2 months, 2,400 m², 900 sqm, 24 days, 3 years
  result = result.replace(
    /(?<!\*\*)\b(\d[\d,.]*)\s+(months?|days?|years?|weeks?|hours?|minutes?|m²|sqm|sq\s?m|km|gb|mb|tb)(?!\*\*)/gi,
    (match) => {
      changed = true;
      return `**${match}**`;
    },
  );

  return { text: result, changed };
}

/**
 * Rule C: Bold list lead-in labels (the phrase before " – " or " — " in bullets).
 * E.g. "- **Cost per user** – average infrastructure cost per active user"
 */
function boldBulletLabels(text: string): { text: string; changed: boolean } {
  let changed = false;

  const result = text.replace(
    /^(\s*-\s+)(?!\*\*)([^–—:\n]{3,40}?)(\s*[–—]\s+)/gm,
    (_match, prefix, label, separator) => {
      // Skip if label is already bolded or looks like a number/currency
      if (/^\*\*/.test(label) || /^\$/.test(label.trim())) return _match;
      changed = true;
      return `${prefix}**${label.trim()}**${separator}`;
    },
  );

  return { text: result, changed };
}

/**
 * Rule E: Bold section lead-ins ending with colon.
 * E.g. "The cost metrics include:" → "**The cost metrics include:**"
 * Only targets standalone phrases (not inside bullets or table cells).
 */
function boldSectionLeadIns(text: string): { text: string; changed: boolean } {
  let changed = false;

  const result = text.replace(
    /^(?!\s*[-|>#*\d])(?!\*\*)([A-Z][^:\n]{3,60}):\s*$/gm,
    (_match, phrase) => {
      // Don't bold if it looks like a URL or already inside bold
      if (/https?:/.test(phrase) || /\*\*/.test(phrase)) return _match;
      changed = true;
      return `**${phrase.trim()}:**`;
    },
  );

  return { text: result, changed };
}

/**
 * Rule A: Bold the key noun phrase in the first sentence of the answer.
 * Uses the user query to identify what the answer is about.
 * E.g. "The EBITDA margin for FY2025 is 22.54%." → "The **EBITDA margin** for FY2025 is 22.54%."
 */
function boldHeadlineEntity(
  text: string,
  userQuery: string,
): { text: string; changed: boolean } {
  if (!userQuery || !text) return { text, changed: false };

  // Extract key noun phrases from the query (2-4 word phrases that look like entities)
  const queryLower = userQuery.toLowerCase();
  const candidateTerms: string[] = [];

  // Financial/business terms commonly asked about
  const knownPatterns = [
    /\b(ebitda(?:\s+(?:margin|adjusted))?)(?:\b|$)/i,
    /\b(net\s+(?:income|profit|loss|revenue))(?:\b|$)/i,
    /\b(gross\s+(?:profit|margin|revenue))(?:\b|$)/i,
    /\b(operating\s+(?:revenue|expenses?|income|profit))(?:\b|$)/i,
    /\b(total\s+(?:revenue|expenses?|cost|income|assets))(?:\b|$)/i,
    /\b(payroll|salaries?\s*(?:and|&)\s*wages?)(?:\b|$)/i,
    /\b(f&b\s+expenses?)(?:\b|$)/i,
    /\b(income\s+before\s+[\w\s]+expenses?)(?:\b|$)/i,
    /\b(bottom\s+line)(?:\b|$)/i,
    /\b(revenue\s+streams?)(?:\b|$)/i,
    /\b(expense\s+categor(?:y|ies))(?:\b|$)/i,
    /\b(cost\s+per\s+\w+)(?:\b|$)/i,
    /\b(monthly\s+cost\s+estimate)(?:\b|$)/i,
    /\b(api\s+calls?)(?:\b|$)/i,
    /\b(storage\s+(?:cost|gb))(?:\b|$)/i,
  ];

  for (const pattern of knownPatterns) {
    const m = pattern.exec(queryLower);
    if (m) candidateTerms.push(m[1]);
  }

  if (candidateTerms.length === 0) return { text, changed: false };

  // Find first sentence
  const firstSentenceEnd = text.search(/[.!?]\s/);
  if (firstSentenceEnd === -1 || firstSentenceEnd > 300)
    return { text, changed: false };
  const firstSentence = text.slice(0, firstSentenceEnd + 1);

  // Try to bold the term in the first sentence only (first occurrence)
  let changed = false;
  let result = text;

  for (const term of candidateTerms) {
    const termRegex = new RegExp(
      `(?<!\\*\\*)\\b(${escapeRegex(term)})\\b(?!\\*\\*)`,
      "i",
    );
    const firstMatch = termRegex.exec(firstSentence);
    if (firstMatch) {
      // Bold only in the first sentence region of the full text
      const before = result.slice(0, firstMatch.index);
      const matched = result.slice(
        firstMatch.index,
        firstMatch.index + firstMatch[0].length,
      );
      const after = result.slice(firstMatch.index + firstMatch[0].length);

      // Don't double-bold
      if (!isAlreadyBolded(result, matched)) {
        result = `${before}**${matched}**${after}`;
        changed = true;
        break; // Only bold one headline entity
      }
    }
  }

  return { text: result, changed };
}

/**
 * Rule D: Bold first occurrence of domain terms.
 * Uses a small whitelist of common domain terms. Only bolds the first occurrence.
 */
function boldFirstOccurrenceDomainTerms(text: string): {
  text: string;
  changed: boolean;
} {
  const DOMAIN_TERMS = [
    // Financial
    "EBITDA",
    "EBITDA Adjusted",
    "Gross Operating Profit",
    "Net Income",
    "Net Loss",
    "Net Profit",
    "Operating Revenue",
    "Operating Expenses",
    "Total Revenue",
    "Total Expenses",
    // Tech/analytics
    "Analytics Dashboard",
    "API calls",
    "vector embeddings",
    "Pinecone",
    "S3 storage",
    // Agile/Scrum
    "Sprint",
    "Product Backlog",
    "Scrum Master",
    "Sprint Review",
    "Sprint Retrospective",
    "Daily Scrum",
    "Product Owner",
    "Development Team",
  ];

  let changed = false;
  let result = text;
  const alreadyBolded = new Set<string>();

  for (const term of DOMAIN_TERMS) {
    // Skip if already bolded anywhere
    if (isAlreadyBolded(result, term)) {
      alreadyBolded.add(term.toLowerCase());
      continue;
    }
    if (alreadyBolded.has(term.toLowerCase())) continue;

    // Bold only the first occurrence
    const regex = new RegExp(
      `(?<!\\*\\*)\\b(${escapeRegex(term)})\\b(?!\\*\\*)`,
      "i",
    );
    const match = regex.exec(result);
    if (match) {
      const before = result.slice(0, match.index);
      const after = result.slice(match.index + match[0].length);
      result = `${before}**${match[0]}**${after}`;
      alreadyBolded.add(term.toLowerCase());
      changed = true;
    }
  }

  return { text: result, changed };
}

// ─── Document name bolding (preserved from original) ────────────────────────

function boldDocumentNames(
  text: string,
  names: string[],
  maxAdds: number,
): { text: string; changed: boolean } {
  if (!names || !names.length) return { text, changed: false };

  let changed = false;
  let added = 0;
  let out = text;

  const sorted = [...names].filter(Boolean).sort((a, b) => b.length - a.length);

  for (const name of sorted) {
    if (added >= maxAdds) break;
    const n = String(name).trim();
    if (!n) continue;

    if (isAlreadyBolded(out, n)) continue;

    const re = new RegExp(`(^|[^\\w])(${escapeRegex(n)})(?=$|[^\\w])`, "g");
    const next = out.replace(re, (m, p1, p2) => {
      if (added >= maxAdds) return m;
      added += 1;
      changed = true;
      return `${p1}**${p2}**`;
    });

    out = next;
  }

  return { text: out, changed };
}

// ─── Density cap (preserved from original) ──────────────────────────────────

function enforceDensityCap(
  text: string,
  maxBoldDensity: number,
  maxBoldSpansPerMessage: number,
  ensureDocNamesBold: boolean,
): { text: string; changed: boolean } {
  const statsBefore = countBoldSpans(text);
  const totalChars = Math.max(1, text.length);
  let density = statsBefore.chars / totalChars;

  if (
    density <= maxBoldDensity &&
    statsBefore.spans <= maxBoldSpansPerMessage
  ) {
    return { text, changed: false };
  }

  // Collect all bold spans
  const re = /\*\*([^*]+)\*\*/g;
  const spans: Array<{ start: number; end: number; inner: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, inner: m[1] });
  }

  // Remove bold from rightmost spans first (least likely to be headline entities)
  let out = text;
  for (let i = spans.length - 1; i >= 0; i--) {
    const after = countBoldSpans(out);
    density = after.chars / totalChars;
    if (density <= maxBoldDensity && after.spans <= maxBoldSpansPerMessage)
      break;

    const span = spans[i];
    // Preserve filename bold and currency bold
    const looksLikeFile = /\b[^ ]+\.(pdf|docx?|xlsx?|pptx?|txt|csv)\b/i.test(
      span.inner,
    );
    const looksLikeCurrency = /^\(?[$€£]\d/.test(span.inner);
    if ((looksLikeFile && ensureDocNamesBold) || looksLikeCurrency) continue;

    const before = out.slice(0, span.start);
    const middle = span.inner;
    const afterText = out.slice(span.end);
    out = before + middle + afterText;
  }

  return { text: out, changed: out !== text };
}

// ─── Main service ───────────────────────────────────────────────────────────

export class BoldingNormalizerService {
  constructor(private readonly bankLoader: BankLoader) {}

  normalize(input: NormalizeInput): NormalizeOutput {
    const transformations: string[] = [];
    let text = normalizeWhitespace(input.text || "");

    // Load rules bank (soft defaults)
    const rules = this.safeGetBank<any>("bolding_rules");
    const cfg = rules?.config ?? {};

    const maxBoldDensity = clamp01(Number(cfg.maxBoldDensity ?? 0.12));
    const maxBoldSpanChars = Number(cfg.maxBoldSpanChars ?? 120);
    const maxBoldSpansPerMessage = Number(cfg.maxBoldSpansPerMessage ?? 18);
    const ensureDocNamesBold = Boolean(cfg.ensureDocNamesBold ?? false); // Off by default — sources are pills now
    const maxDocNameBoldAdds = Number(cfg.maxDocNameBoldAdds ?? 6);

    // ── Phase 1: Protect unsafe regions ──────────────────────────────────
    const { text: safeText, restore } = protectUnsafeRegions(text);
    text = safeText;

    // ── Phase 2: Fix + cleanup existing bold ─────────────────────────────
    const ub = fixUnbalancedBold(text);
    if (ub.changed) {
      text = ub.text;
      transformations.push("fix_unbalanced_bold");
    }

    const ol = unwrapOverlongBold(text, maxBoldSpanChars);
    if (ol.changed) {
      text = ol.text;
      transformations.push("unwrap_overlong_bold");
    }

    // ── Phase 3: Apply semantic bolding rules (A → E) ────────────────────
    // Only apply if text doesn't already have significant bolding (idempotency)
    const existingBold = countBoldSpans(text);
    const existingDensity = existingBold.chars / Math.max(1, text.length);
    const shouldApplySemanticBolding = existingDensity < 0.08; // Only add bold if <8% already

    if (shouldApplySemanticBolding) {
      // Rule A: Headline entity
      if (input.userQuery) {
        const ha = boldHeadlineEntity(text, input.userQuery);
        if (ha.changed) {
          text = ha.text;
          transformations.push("bold_headline_entity");
        }
      }

      // Rule B: Currency / numeric values
      const nb = boldNumericValues(text);
      if (nb.changed) {
        text = nb.text;
        transformations.push("bold_numeric_values");
      }

      // Rule C: Bullet labels
      const bl = boldBulletLabels(text);
      if (bl.changed) {
        text = bl.text;
        transformations.push("bold_bullet_labels");
      }

      // Rule D: First-occurrence domain terms
      const dt = boldFirstOccurrenceDomainTerms(text);
      if (dt.changed) {
        text = dt.text;
        transformations.push("bold_domain_terms");
      }

      // Rule E: Section lead-ins
      const sl = boldSectionLeadIns(text);
      if (sl.changed) {
        text = sl.text;
        transformations.push("bold_section_lead_ins");
      }
    }

    // Document name bolding (legacy, now mostly handled by source pills)
    if (ensureDocNamesBold && input.documentNames?.length) {
      const bd = boldDocumentNames(
        text,
        input.documentNames,
        maxDocNameBoldAdds,
      );
      if (bd.changed) {
        text = bd.text;
        transformations.push("bold_document_names");
      }
    }

    // ── Phase 4: Enforce density cap ─────────────────────────────────────
    const dc = enforceDensityCap(
      text,
      maxBoldDensity,
      maxBoldSpansPerMessage,
      ensureDocNamesBold,
    );
    if (dc.changed) {
      text = dc.text;
      transformations.push("enforce_bold_density_cap");
    }

    // ── Phase 5: Restore protected regions ───────────────────────────────
    text = restore(text);

    // Fix any newly-unbalanced markers from edge cases
    const finalUb = fixUnbalancedBold(text);
    if (finalUb.changed) {
      text = finalUb.text;
      transformations.push("fix_unbalanced_bold_final");
    }

    // Final stats
    const statsAfter = countBoldSpans(text);
    const boldDensity = clamp01(statsAfter.chars / Math.max(1, text.length));

    return {
      text,
      meta: {
        changed: transformations.length > 0,
        transformations,
        stats: {
          boldSpanCount: statsAfter.spans,
          boldCharCount: statsAfter.chars,
          boldDensity,
        },
      },
    };
  }

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}

// Convenience singleton accessor for answerComposer
let instance: BoldingNormalizerService | null = null;
export function getBoldingNormalizer(): BoldingNormalizerService {
  if (!instance)
    instance = new BoldingNormalizerService({ getBank: () => null } as any);
  return instance;
}

export default BoldingNormalizerService;
