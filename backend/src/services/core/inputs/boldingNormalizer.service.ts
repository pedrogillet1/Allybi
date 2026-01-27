// backend/src/services/core/boldingNormalizer.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { clamp } from '../../../utils';
import { normalizeWhitespace } from '../../../utils/markdown/markdownUtils';

/**
 * BoldingNormalizerService (ChatGPT-parity, deterministic)
 * -------------------------------------------------------
 * Purpose:
 *  - Normalize bold usage in model output to match Koda formatting policy:
 *      - allow bold for key terms + key numbers, but cap density
 *      - avoid bolding entire paragraphs or bullet walls
 *      - ensure document names appear as **DocumentName.ext** (frontend clickability)
 *      - preserve markdown correctness (balanced **)
 *
 * Banks used:
 *  - formatting/bolding_rules.any.json
 *  - formatting/banned_phrases.any.json (optional: strip bad patterns)
 *  - normalizers/filename_normalization.any.json (optional: normalize doc name matching)
 *
 * Notes:
 *  - This is a post-compose text transform (before OutputContractService).
 *  - It does not add "Sources:" labels or any user-facing boilerplate.
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

/**
 * Remove bold that covers too much text:
 * - If a bold span is extremely long or contains multiple sentences,
 *   unwrap it.
 */
function unwrapOverlongBold(text: string, maxBoldSpanChars: number): { text: string; changed: boolean } {
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

/**
 * Fix unbalanced bold markers by removing stray '**' at ends.
 * This is conservative: we avoid heavy markdown parsing here.
 */
function fixUnbalancedBold(text: string): { text: string; changed: boolean } {
  const count = (text.match(/\*\*/g) ?? []).length;
  if (count % 2 === 0) return { text, changed: false };
  // remove last occurrence of '**'
  const idx = text.lastIndexOf("**");
  if (idx === -1) return { text, changed: false };
  return { text: text.slice(0, idx) + text.slice(idx + 2), changed: true };
}

/**
 * Ensure filenames appear as bold (for frontend clickability), but do NOT over-bold.
 */
function boldDocumentNames(text: string, names: string[], maxAdds: number): { text: string; changed: boolean } {
  if (!names || !names.length) return { text, changed: false };

  let changed = false;
  let added = 0;
  let out = text;

  // Sort longer first to avoid partial matches
  const sorted = [...names].filter(Boolean).sort((a, b) => b.length - a.length);

  for (const name of sorted) {
    if (added >= maxAdds) break;

    const n = String(name).trim();
    if (!n) continue;

    // If already bolded, skip
    const already = new RegExp(`\\*\\*${escapeRegex(n)}\\*\\*`, "i").test(out);
    if (already) continue;

    // Replace plain occurrences that look like standalone tokens
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

export class BoldingNormalizerService {
  constructor(private readonly bankLoader: BankLoader) {}

  normalize(input: NormalizeInput): NormalizeOutput {
    const transformations: string[] = [];
    let text = normalizeWhitespace(input.text || "");

    // Load rules bank (soft defaults)
    const rules = this.safeGetBank<any>("bolding_rules");
    const cfg = rules?.config ?? {};

    const maxBoldDensity = clamp01(Number(cfg.maxBoldDensity ?? 0.12)); // % of chars bolded
    const maxBoldSpanChars = Number(cfg.maxBoldSpanChars ?? 120);
    const maxBoldSpansPerMessage = Number(cfg.maxBoldSpansPerMessage ?? 18);
    const ensureDocNamesBold = Boolean(cfg.ensureDocNamesBold ?? true);
    const maxDocNameBoldAdds = Number(cfg.maxDocNameBoldAdds ?? 6);

    // 1) Fix unbalanced markers
    const ub = fixUnbalancedBold(text);
    if (ub.changed) {
      text = ub.text;
      transformations.push("fix_unbalanced_bold");
    }

    // 2) Unwrap overlong bold spans (prevent whole paragraphs being bold)
    const ol = unwrapOverlongBold(text, maxBoldSpanChars);
    if (ol.changed) {
      text = ol.text;
      transformations.push("unwrap_overlong_bold");
    }

    // 3) Ensure document names are bolded (for clickable doc names)
    if (ensureDocNamesBold && input.documentNames?.length) {
      const bd = boldDocumentNames(text, input.documentNames, maxDocNameBoldAdds);
      if (bd.changed) {
        text = bd.text;
        transformations.push("bold_document_names");
      }
    }

    // 4) Enforce bold density cap by unbolding least important spans (right-to-left)
    const statsBefore = countBoldSpans(text);
    const totalChars = Math.max(1, text.length);
    let density = statsBefore.chars / totalChars;

    if (density > maxBoldDensity || statsBefore.spans > maxBoldSpansPerMessage) {
      // Remove bold from rightmost spans until within limits
      const re = /\*\*([^*]+)\*\*/g;
      const spans: Array<{ start: number; end: number; inner: string }> = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        spans.push({ start: m.index, end: m.index + m[0].length, inner: m[1] });
      }

      // Remove bold from the last spans first (least likely to include doc names at top)
      let out = text;
      for (let i = spans.length - 1; i >= 0; i--) {
        const after = countBoldSpans(out);
        density = after.chars / totalChars;
        if (density <= maxBoldDensity && after.spans <= maxBoldSpansPerMessage) break;

        const span = spans[i];
        // Skip if looks like a filename and docNamesBold is enabled (we want those clickable)
        const looksLikeFile = /\b[^ ]+\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpe?g|gif|webp)\b/i.test(span.inner);
        if (looksLikeFile && ensureDocNamesBold) continue;

        // Unwrap this span by replacing the exact substring
        const before = out.slice(0, span.start);
        const middle = span.inner;
        const afterText = out.slice(span.end);
        out = before + middle + afterText;
      }

      if (out !== text) {
        text = out;
        transformations.push("enforce_bold_density_cap");
      }
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
  if (!instance) instance = new BoldingNormalizerService({ getBank: () => null } as any);
  return instance;
}

export default BoldingNormalizerService;
