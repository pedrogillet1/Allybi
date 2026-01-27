// backend/src/services/normalizers/monthNormalization.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * MonthNormalizationService (ChatGPT-parity, deterministic)
 * --------------------------------------------------------
 * Purpose:
 *  - Normalize month references across languages (en/pt/es) into a canonical form
 *    used by routing, query rewrite, spreadsheet semantics, and retrieval.
 *
 * Canonical output formats (configurable):
 *  - month_index: "M01".."M12"
 *  - month_name_en: "January".."December"
 *  - month_iso: "01".."12"
 *
 * Behaviors:
 *  - Recognize:
 *      - full month names: "January", "janeiro", "enero"
 *      - common abbreviations: "Jan", "Fev", "sept", "set"
 *      - numeric forms: "1/2024", "01-2024", "2024-01" (month extraction only)
 *  - Avoid false positives in:
 *      - words that contain month fragments (e.g. "marché")
 *  - Deterministic: same input -> same normalized output
 *
 * Banks used:
 *  - normalizers/month_normalization.any.json
 *  - normalizers/language_indicators.any.json (optional: language hint usage)
 */

export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

export type LangCode = "any" | "en" | "pt" | "es";

export interface MonthNormalizationInput {
  text: string;
  langHint?: LangCode;
  outputFormat?: "month_index" | "month_name_en" | "month_iso";
}

export interface MonthMatch {
  raw: string;
  month: number; // 1..12
  start: number;
  end: number;
  normalized: string;
  language: "en" | "pt" | "es" | "any";
  confidence: number; // 0..1
}

export interface MonthNormalizationOutput {
  normalizedText: string;
  matches: MonthMatch[];
  meta: {
    changed: boolean;
    outputFormat: MonthNormalizationInput["outputFormat"];
  };
}

function normalizeWhitespace(s: string): string {
  return (s ?? "").replace(/\r\n|\r/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function monthNameEn(m: number): string {
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return names[m - 1] || "January";
}

function monthIso(m: number): string {
  return String(m).padStart(2, "0");
}

function monthIndex(m: number): string {
  return `M${monthIso(m)}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class MonthNormalizationService {
  constructor(private readonly bankLoader: BankLoader) {}

  normalize(input: MonthNormalizationInput): MonthNormalizationOutput {
    const bank = this.safeGetBank<any>("month_normalization");

    const cfg = bank?.config ?? {};
    const enabled = cfg.enabled !== false;

    const outputFormat: MonthNormalizationInput["outputFormat"] =
      input.outputFormat || cfg.defaultOutputFormat || "month_index";

    const textIn = normalizeWhitespace(input.text || "");
    if (!enabled || !textIn) {
      return { normalizedText: textIn, matches: [], meta: { changed: false, outputFormat } };
    }

    const maps = bank?.maps ?? bank?.months ?? null;

    // Build patterns from bank maps; fall back to a minimal built-in set if bank missing
    const dictionary = this.buildDictionary(maps);

    // Build regex for all tokens (longer first)
    const tokens = Object.keys(dictionary).sort((a, b) => b.length - a.length);
    const tokenRegex = tokens.length
      ? new RegExp(`\\b(${tokens.map(escapeRegex).join("|")})\\b`, "gi")
      : null;

    const matches: MonthMatch[] = [];
    let out = textIn;

    // 1) Normalize word months
    if (tokenRegex) {
      out = out.replace(tokenRegex, (m, token, offset) => {
        const raw = String(token);
        const entry = dictionary[raw.toLowerCase()];
        if (!entry) return m;

        const month = entry.month;
        const lang = entry.lang;
        const normalized = this.formatMonth(month, outputFormat);

        matches.push({
          raw,
          month,
          start: Number(offset),
          end: Number(offset) + raw.length,
          normalized,
          language: lang,
          confidence: 0.9,
        });

        return normalized;
      });
    }

    // 2) Normalize numeric month patterns (month/year, year-month)
    //    Keep conservative: only map when pattern strongly indicates month.
    const numericMatches = this.normalizeNumericMonthPatterns(out, outputFormat);
    if (numericMatches.changed) {
      out = numericMatches.text;
      matches.push(...numericMatches.matches);
    }

    const changed = out !== textIn;

    return {
      normalizedText: out,
      matches,
      meta: { changed, outputFormat },
    };
  }

  private formatMonth(month: number, fmt: MonthNormalizationInput["outputFormat"]): string {
    if (fmt === "month_iso") return monthIso(month);
    if (fmt === "month_name_en") return monthNameEn(month);
    return monthIndex(month);
  }

  private buildDictionary(maps: any): Record<string, { month: number; lang: "en" | "pt" | "es" | "any" }> {
    const dict: Record<string, { month: number; lang: "en" | "pt" | "es" | "any" }> = {};

    // If bank provides a structure like:
    // maps: { en: { january: 1, jan: 1, ... }, pt: {...}, es: {...} }
    if (maps && typeof maps === "object") {
      for (const lang of ["en", "pt", "es"] as const) {
        const m = maps[lang];
        if (!m || typeof m !== "object") continue;
        for (const [k, v] of Object.entries(m)) {
          const key = String(k).toLowerCase();
          const month = Number(v);
          if (!Number.isFinite(month) || month < 1 || month > 12) continue;
          dict[key] = { month, lang };
        }
      }
    }

    // Minimal fallback if bank is missing/empty
    if (Object.keys(dict).length === 0) {
      const fallback: Array<[string, number, "en" | "pt" | "es"]> = [
        ["january", 1, "en"], ["jan", 1, "en"], ["janeiro", 1, "pt"], ["enero", 1, "es"],
        ["february", 2, "en"], ["feb", 2, "en"], ["fevereiro", 2, "pt"], ["febrero", 2, "es"],
        ["march", 3, "en"], ["mar", 3, "en"], ["março", 3, "pt"], ["marzo", 3, "es"],
        ["april", 4, "en"], ["apr", 4, "en"], ["abril", 4, "pt"], ["abril", 4, "es"],
        ["may", 5, "en"], ["maio", 5, "pt"], ["mayo", 5, "es"],
        ["june", 6, "en"], ["jun", 6, "en"], ["junho", 6, "pt"], ["junio", 6, "es"],
        ["july", 7, "en"], ["jul", 7, "en"], ["julho", 7, "pt"], ["julio", 7, "es"],
        ["august", 8, "en"], ["aug", 8, "en"], ["agosto", 8, "pt"], ["agosto", 8, "es"],
        ["september", 9, "en"], ["sep", 9, "en"], ["sept", 9, "en"], ["setembro", 9, "pt"], ["septiembre", 9, "es"],
        ["october", 10, "en"], ["oct", 10, "en"], ["outubro", 10, "pt"], ["octubre", 10, "es"],
        ["november", 11, "en"], ["nov", 11, "en"], ["novembro", 11, "pt"], ["noviembre", 11, "es"],
        ["december", 12, "en"], ["dec", 12, "en"], ["dezembro", 12, "pt"], ["diciembre", 12, "es"],
      ];
      for (const [k, m, lang] of fallback) dict[k] = { month: m, lang };
    }

    return dict;
  }

  private normalizeNumericMonthPatterns(text: string, fmt: MonthNormalizationInput["outputFormat"]) {
    // Patterns:
    //  - 01/2024, 1/2024, 01-2024, 1-2024
    //  - 2024-01, 2024/1
    // We only normalize the month portion to chosen format, keeping year.
    const matches: MonthMatch[] = [];
    let out = text;
    let changed = false;

    const replace = (re: RegExp, fn: (m: RegExpExecArray) => string) => {
      out = out.replace(re, (...args: any[]) => {
        const match = args[0];
        const offset = args[args.length - 2] as number;
        const groups = args.slice(1, args.length - 2);
        // reconstruct a RegExpExecArray-like object
        const fake = { 0: match, index: offset, groups: undefined, length: 1 } as any;
        // provide captured groups as numeric indices
        for (let i = 0; i < groups.length; i++) fake[i + 1] = groups[i];
        const replacement = fn(fake);
        if (replacement !== match) changed = true;
        return replacement;
      });
    };

    // month/year
    const reMY = /\b(0?[1-9]|1[0-2])([\/\-\.])(20\d{2})\b/g;
    replace(reMY, (m) => {
      const month = Number(m[1]);
      const sep = String(m[2]);
      const year = String(m[3]);
      const normalized = this.formatMonth(month, fmt);
      const raw = `${m[1]}${sep}${year}`;
      matches.push({
        raw,
        month,
        start: m.index ?? 0,
        end: (m.index ?? 0) + raw.length,
        normalized: `${normalized}${sep}${year}`,
        language: "any",
        confidence: 0.85,
      });
      return `${normalized}${sep}${year}`;
    });

    // year/month
    const reYM = /\b(20\d{2})([\/\-\.])(0?[1-9]|1[0-2])\b/g;
    replace(reYM, (m) => {
      const year = String(m[1]);
      const sep = String(m[2]);
      const month = Number(m[3]);
      const normalized = this.formatMonth(month, fmt);
      const raw = `${year}${sep}${m[3]}`;
      matches.push({
        raw,
        month,
        start: m.index ?? 0,
        end: (m.index ?? 0) + raw.length,
        normalized: `${year}${sep}${normalized}`,
        language: "any",
        confidence: 0.85,
      });
      return `${year}${sep}${normalized}`;
    });

    return { text: out, matches, changed };
  }

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}

export default MonthNormalizationService;
