/**
 * Slot filler.
 *
 * Runs SlotExtractors from a matched pattern in order, filling slots
 * from the message text, viewer context, and parser dictionaries.
 *
 * Precedence: (1) explicit in text → (2) viewer context → (3) defaults
 */

import type {
  IntentPattern,
  SlotExtractor,
  FilledSlots,
  SlotFillResult,
} from "./types";
import { lookupParserEntry } from "./loaders";

// ---------------------------------------------------------------------------
// A1 Range extraction
// ---------------------------------------------------------------------------

const SHEET_RANGE_RE =
  /(?:'([^']+)'|([A-Za-z0-9_][A-Za-z0-9_ ]*))!([A-Za-z]{1,3}\d{1,7}(?::[A-Za-z]{1,3}\d{1,7})?)/g;
const BARE_RANGE_RE = /\b([A-Za-z]{1,3}\d{1,7}(?::[A-Za-z]{1,3}\d{1,7})?)\b/g;

function extractA1Ranges(text: string): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  // Prefer explicit target indicators ("in D9", "at B2", "into cell C5")
  // so formula references like =SUM(D5:D8) do not hijack the edit target.
  const targetCellMatch = text.match(
    /\b(?:in|at|into)\s+(?:cell\s+)?([A-Za-z]{1,3}\d{1,7}(?::[A-Za-z]{1,3}\d{1,7})?)\s*(?:[,.\s;]|for\b|$)/i,
  );
  if (targetCellMatch?.[1]) {
    const idx = targetCellMatch.index || 0;
    const before = text.slice(0, idx);
    if (!/=\s*[A-Za-z_]+\s*\([^)]*$/i.test(before)) {
      return [String(targetCellMatch[1]).toUpperCase()];
    }
  }

  // Sheet!Range patterns first
  let sheetMatch: RegExpExecArray | null;
  const sheetRe = new RegExp(SHEET_RANGE_RE.source, SHEET_RANGE_RE.flags);
  while ((sheetMatch = sheetRe.exec(text)) !== null) {
    const sheet = sheetMatch[1] || sheetMatch[2] || "";
    const range = sheetMatch[3];
    const full = sheet ? `${sheet}!${range}` : range;
    const key = full.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push(full);
    }
  }
  if (results.length > 0) return results;

  // Bare range fallback
  let bareMatch: RegExpExecArray | null;
  const bareRe = new RegExp(BARE_RANGE_RE.source, BARE_RANGE_RE.flags);
  while ((bareMatch = bareRe.exec(text)) !== null) {
    const range = bareMatch[1];
    // Skip common false positives (e.g. "A1" being a list label, "PT" being language)
    if (/^[A-Za-z]{2,3}$/.test(range)) continue;
    const key = range.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push(range);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Sheet name extraction
// ---------------------------------------------------------------------------

function extractSheetName(text: string): string | null {
  // From Sheet!Range notation
  const sheetRangeMatch = text.match(
    /(?:'([^']+)'|([A-Za-z0-9_][A-Za-z0-9_ ]*))!/,
  );
  if (sheetRangeMatch) {
    return sheetRangeMatch[1] || sheetRangeMatch[2] || null;
  }

  // From "in sheet X" / "na planilha X"
  const namedSheet = text.match(
    /\b(?:in\s+sheet|on\s+sheet|na\s+planilha|na\s+aba)\s+['"]?([^'",:]+?)['"]?\s*(?:[,!]|$)/i,
  );
  if (namedSheet) return namedSheet[1].trim();

  return null;
}

// ---------------------------------------------------------------------------
// Number / text extraction
// ---------------------------------------------------------------------------

function extractNumberOrText(
  text: string,
  lang: "en" | "pt",
): string | number | null {
  // Look for "to X" or "= X" patterns
  const toMatch = text.match(
    /\b(?:to|=|with|value|valor)\s+["']?([^"',]+?)["']?\s*$/i,
  );
  if (toMatch) {
    const val = toMatch[1].trim();
    const num = parseNumber(val, lang);
    if (num !== null) return num;
    return val;
  }

  // Look for standalone numbers
  const numMatch = text.match(/\b(\d[\d,.]*)\b/);
  if (numMatch) {
    const num = parseNumber(numMatch[1], lang);
    if (num !== null) return num;
  }

  return null;
}

function parseNumber(val: string, lang: "en" | "pt"): number | null {
  const raw = String(val || "")
    .trim()
    .replace(/\s+/g, "");
  if (!raw || /[a-z]/i.test(raw)) return null;

  const parse = (normalized: string): number | null => {
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  };

  // pt-BR style: 1.234,56 -> 1234.56
  if (/^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(raw)) {
    return parse(raw.replace(/\./g, "").replace(",", "."));
  }
  // pt-BR decimal comma: 1,5 -> 1.5
  if (/^-?\d+,\d+$/.test(raw)) {
    return parse(raw.replace(",", "."));
  }
  // Integer with thousand separators: 1.234.567
  if (/^-?\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    return parse(raw.replace(/\./g, ""));
  }

  // en-US style: 1,234.56 -> 1234.56
  if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) {
    return parse(raw.replace(/,/g, ""));
  }

  // Locale-aware fallback for ambiguous comma values.
  if (lang === "pt" && /^-?\d+,\d+$/.test(raw)) {
    return parse(raw.replace(",", "."));
  }
  if (lang === "en" && /,-?\d+$/.test(raw)) {
    return null;
  }

  return parse(raw);
}

// ---------------------------------------------------------------------------
// Color extraction
// ---------------------------------------------------------------------------

function extractColor(text: string, lang: "en" | "pt"): string | null {
  // Try hex code first
  const hexMatch = text.match(/#[0-9A-Fa-f]{6}\b/);
  if (hexMatch) return hexMatch[0].toUpperCase();

  // Dictionary lookup
  const dictId = lang === "pt" ? "colors_pt" : "colors_en";
  const low = text.toLowerCase();

  // Try each word and multi-word combinations
  const words = low.split(/\s+/);
  for (let len = 3; len >= 1; len--) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(" ");
      const result = lookupParserEntry(dictId, phrase);
      if (result) return result;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Font family extraction
// ---------------------------------------------------------------------------

function extractFontFamily(text: string): string | null {
  // Look for known font patterns: "font X", "to X font", "font family X"
  const fontMatch = text.match(
    /\b(?:font(?:\s+family)?|fonte)\s+(?:to\s+|para\s+)?['"]?([A-Za-z][A-Za-z ]+?)['"]?\s*(?:\d|$|,|and|e\b)/i,
  );
  if (fontMatch) {
    const result = lookupParserEntry("fonts", fontMatch[1].trim());
    if (result) return result;
  }

  // Try matching whole "to Font Name" pattern
  const toFontMatch = text.match(
    /\bto\s+['"]?([A-Za-z][A-Za-z ]+?)['"]?\s*(?:\d|$|,)/i,
  );
  if (toFontMatch) {
    const result = lookupParserEntry("fonts", toFontMatch[1].trim());
    if (result) return result;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Font size extraction
// ---------------------------------------------------------------------------

function extractFontSize(text: string): number | null {
  const sizeMatch = text.match(
    /\b(\d+(?:\.\d+)?)\s*(?:pt|px|points?|pontos?)?\b/i,
  );
  if (sizeMatch) {
    const size = parseFloat(sizeMatch[1]);
    if (size >= 1 && size <= 400) return size;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Chart type extraction
// ---------------------------------------------------------------------------

function extractChartType(text: string, lang: "en" | "pt"): string | null {
  const dictId =
    lang === "pt" ? "excel_chart_types_pt" : "excel_chart_types_en";
  const low = text.toLowerCase();
  const words = low.split(/\s+/);

  for (let len = 4; len >= 1; len--) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(" ");
      const result = lookupParserEntry(dictId, phrase);
      if (result) return result;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Formula extraction
// ---------------------------------------------------------------------------

function extractFormula(
  text: string,
  lang: "en" | "pt",
): { formula: string; conversions: string[] } | null {
  // Look for =FORMULA(...) pattern
  const formulaMatch = text.match(/=\s*([A-Za-z_][A-Za-z0-9_.]*\([^)]*\))/);
  if (formulaMatch) {
    const raw = `=${formulaMatch[1]}`;
    return normalizeFormulaLocale(raw, lang);
  }

  // Look for "formula =..." pattern
  const prefixMatch = text.match(/\bformula\s+(=[^\s,]+)/i);
  if (prefixMatch) {
    return normalizeFormulaLocale(prefixMatch[1], lang);
  }

  return null;
}

function translateFormulaToEn(formula: string): string {
  // Replace PT function names with EN equivalents
  return formula.replace(/[A-ZÀ-ÚÃÕ][A-ZÀ-ÚÃÕ0-9_.]+(?=\()/g, (match) => {
    const result = lookupParserEntry("excel_functions_pt_to_en", match);
    return result || match;
  });
}

/**
 * Tokenize a formula into string-literal and non-string segments.
 * Only non-string segments should be locale-transformed.
 */
function tokenizeFormula(
  formula: string,
): Array<{ text: string; isString: boolean }> {
  const tokens: Array<{ text: string; isString: boolean }> = [];
  let i = 0;
  while (i < formula.length) {
    if (formula[i] === '"') {
      // Find closing quote
      let j = i + 1;
      while (j < formula.length && formula[j] !== '"') j++;
      tokens.push({ text: formula.slice(i, j + 1), isString: true });
      i = j + 1;
    } else {
      let j = i;
      while (j < formula.length && formula[j] !== '"') j++;
      if (j > i) tokens.push({ text: formula.slice(i, j), isString: false });
      i = j;
    }
  }
  return tokens;
}

/**
 * Full locale normalization for PT formulas:
 *  1. Translate function names (SOMA → SUM)
 *  2. Convert argument separators: `;` → `,` (outside string literals)
 *  3. Convert thousand-dot + decimal-comma numbers: `1.000,56` → `1000.56`
 *  4. Convert standalone decimal commas in numeric contexts: `1,5` → `1.5`
 *
 * EN formulas pass through unchanged.
 */
function normalizeFormulaLocale(
  formula: string,
  lang: "en" | "pt",
): { formula: string; conversions: string[] } {
  if (lang !== "pt") return { formula, conversions: [] };

  const conversions: string[] = [];

  // Step 1: Translate function names
  const afterNames = translateFormulaToEn(formula);
  if (afterNames !== formula) {
    // Find what changed
    const origNames = formula.match(/[A-ZÀ-ÚÃÕ][A-ZÀ-ÚÃÕ0-9_.]+(?=\()/g) || [];
    const newNames = afterNames.match(/[A-ZA-Z0-9_.]+(?=\()/g) || [];
    for (let k = 0; k < origNames.length && k < newNames.length; k++) {
      if (origNames[k] !== newNames[k]) {
        conversions.push(`${origNames[k]} → ${newNames[k]}`);
      }
    }
  }

  // Tokenize to protect string literals
  const tokens = tokenizeFormula(afterNames);

  let hadSemicolon = false;
  let hadNumberConversion = false;

  const transformed = tokens.map((tok) => {
    if (tok.isString) return tok.text;

    let segment = tok.text;

    // Step 3: Convert thousand-dot + decimal-comma numbers: 1.000,56 → 1000.56
    // Pattern: digits, then groups of .NNN, then ,NN (decimal part)
    segment = segment.replace(
      /(\d{1,3}(?:\.\d{3})+),(\d+)/g,
      (_match, intPart: string, decPart: string) => {
        hadNumberConversion = true;
        const cleanInt = intPart.replace(/\./g, "");
        return `${cleanInt}.${decPart}`;
      },
    );

    // Step 4: Convert standalone decimal commas: 1,5 → 1.5
    // Must be a number,digit pattern that isn't a thousand separator (already handled above)
    // and not a semicolon-style separator. Only match N,N where N is not part of .NNN pattern
    segment = segment.replace(
      /(\d+),(\d+)/g,
      (_match, left: string, right: string) => {
        // If left has 1-3 digits and right has exactly 3, it could be a thousand separator
        // that wasn't preceded by another group. In formula context, treat as decimal.
        hadNumberConversion = true;
        return `${left}.${right}`;
      },
    );

    // Step 2: Convert semicolons to commas (argument separators)
    if (segment.includes(";")) {
      hadSemicolon = true;
      segment = segment.replace(/;/g, ",");
    }

    return segment;
  });

  if (hadSemicolon) conversions.push("; → ,");
  if (hadNumberConversion) conversions.push("decimal comma → dot");

  return { formula: transformed.join(""), conversions };
}

// ---------------------------------------------------------------------------
// Format pattern extraction
// ---------------------------------------------------------------------------

function extractFormatPattern(text: string): string | null {
  // Look for explicit format codes like $#,##0.00 or 0.00% etc.
  const explicitMatch = text.match(
    /(?:format\s+)?([#0$€£R][#0,.*?;[\]]+(?:;[^,\s]+)*)/i,
  );
  if (explicitMatch) return explicitMatch[1];

  // Dictionary lookup for named formats.
  // PT keywords map to EN bank keys so the lookup resolves correctly.
  const low = text.toLowerCase();
  const ptToEnMap: Record<string, string> = {
    moeda: "currency",
    porcentagem: "percentage",
    percentual: "percent",
    data: "date",
    numero: "number",
    número: "number",
    contabil: "accounting",
    contábil: "accounting",
    científico: "scientific",
    cientifico: "scientific",
    texto: "text",
    geral: "general",
  };

  const formatNames = [
    "currency",
    "percent",
    "percentage",
    "date",
    "number",
    "accounting",
    "scientific",
    "text",
    "general",
    ...Object.keys(ptToEnMap),
  ];

  for (const name of formatNames) {
    if (low.includes(name)) {
      const bankKey = ptToEnMap[name] || name;
      const result = lookupParserEntry("excel_number_formats", bankKey);
      if (result) return result;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Heading level extraction
// ---------------------------------------------------------------------------

function extractHeadingLevel(text: string, lang: "en" | "pt"): number | null {
  const dictId =
    lang === "pt" ? "docx_heading_levels_pt" : "docx_heading_levels_en";
  const low = text.toLowerCase();
  const words = low.split(/\s+/);

  for (let len = 3; len >= 1; len--) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(" ");
      const result = lookupParserEntry(dictId, phrase);
      if (result !== null) return Number(result);
    }
  }

  // Fallback: look for "heading N" / "título N"
  const headingMatch = text.match(/\b(?:heading|titulo|título)\s+(\d)\b/i);
  if (headingMatch) return parseInt(headingMatch[1], 10);

  return null;
}

// ---------------------------------------------------------------------------
// Language extraction
// ---------------------------------------------------------------------------

function extractLanguage(text: string): string | null {
  const low = text.toLowerCase();
  if (/\b(?:to\s+)?(?:english|inglês|ingles|en)\b/.test(low)) return "en";
  if (/\b(?:to\s+)?(?:portuguese|português|portugues|pt|pt-br)\b/.test(low))
    return "pt";
  if (/\b(?:to\s+)?(?:spanish|espanhol|español|es)\b/.test(low)) return "es";
  if (/\b(?:to\s+)?(?:french|francês|frances|fr)\b/.test(low)) return "fr";
  if (/\b(?:to\s+)?(?:german|alemão|alemao|de)\b/.test(low)) return "de";
  if (/\b(?:to\s+)?(?:italian|italiano|it)\b/.test(low)) return "it";
  return null;
}

// ---------------------------------------------------------------------------
// Boolean flag extraction
// ---------------------------------------------------------------------------

function extractBooleanFlag(text: string, slotName: string): boolean | null {
  const low = text.toLowerCase();
  if (/\b(?:without|no|disable|remove|off|sem|desabilite)\b/.test(low))
    return false;
  if (/\b(?:with|yes|enable|add|on|com|habilite|ative)\b/.test(low))
    return true;
  return null;
}

// ---------------------------------------------------------------------------
// Alignment extraction
// ---------------------------------------------------------------------------

function extractAlignment(text: string): string | null {
  const low = text.toLowerCase();
  if (/\b(?:center|centre|centralize|centraliz)\b/.test(low)) return "center";
  if (/\b(?:left|esquerda)\b/.test(low)) return "left";
  if (/\b(?:right|direita)\b/.test(low)) return "right";
  if (/\b(?:justify|justif)\b/.test(low)) return "justify";
  return null;
}

// ---------------------------------------------------------------------------
// Sort spec extraction
// ---------------------------------------------------------------------------

function extractSortSpec(text: string): string | null {
  // Look for "by column X" or "by FIELD_NAME"
  const byMatch = text.match(
    /\bby\s+(?:column\s+)?['"]?([A-Za-z][A-Za-z0-9_ ]*?)['"]?\s*(?:ascending|descending|asc|desc|$)/i,
  );
  if (byMatch) return byMatch[1].trim();

  const porMatch = text.match(
    /\bpor\s+(?:coluna\s+)?['"]?([A-Za-z][A-Za-z0-9_ ]*?)['"]?\s*(?:crescente|decrescente|$)/i,
  );
  if (porMatch) return porMatch[1].trim();

  return null;
}

// ---------------------------------------------------------------------------
// Percentage extraction
// ---------------------------------------------------------------------------

function extractPercentage(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (match) return parseFloat(match[1]);
  return null;
}

// ---------------------------------------------------------------------------
// Locator text extraction (catch-all)
// ---------------------------------------------------------------------------

function extractLocatorText(text: string): string | null {
  // Try "titled X" / "called X" / "named X"
  const namedMatch = text.match(
    /\b(?:titled|called|named|chamado|intitulado)\s+['"]?([^'"]+?)['"]?\s*$/i,
  );
  if (namedMatch) return namedMatch[1].trim();

  // Try quoted text
  const quotedMatch = text.match(/['"]([^'"]+)['"]/);
  if (quotedMatch) return quotedMatch[1];

  return null;
}

// ---------------------------------------------------------------------------
// Scope extraction
// ---------------------------------------------------------------------------

function extractScope(text: string): string | null {
  const low = text.toLowerCase();
  // "all headings" / "every header" / "all titles"
  if (
    /\b(?:all|every|each|todos?\s+os?)\s+(?:headings?|headers?|titles?|títulos?|cabeçalhos?)\b/i.test(
      low,
    )
  )
    return "all_headings";
  // "this section" / "esta seção"
  if (/\b(?:this|the|current|esta|essa)\s+(?:section|seção|secao)\b/i.test(low))
    return "section";
  // "all bullets" / "all list items" / "every bullet point"
  if (
    /\b(?:all|every|each|todos?\s+os?)\s+(?:bullets?|list\s*items?|bullet\s*points?|itens?\s+de?\s+lista|marcadores?)\b/i.test(
      low,
    )
  )
    return "all_list_items";
  // "entire document" / "whole document"
  if (
    /\b(?:entire|whole|all|todo\s+o?)\s+(?:document|documento|doc)\b/i.test(low)
  )
    return "document";
  // "all paragraphs"
  if (
    /\b(?:all|every|each|todos?\s+os?)\s+(?:paragraphs?|parágrafos?|paragrafos?)\b/i.test(
      low,
    )
  )
    return "all_paragraphs";
  return null;
}

// ---------------------------------------------------------------------------
// Text case extraction
// ---------------------------------------------------------------------------

function extractTextCase(text: string): string | null {
  const low = text.toLowerCase();
  if (/\b(?:title\s*case|capitalize|maiúscula\s+inicial)\b/i.test(low))
    return "title";
  if (/\b(?:upper\s*case|all\s*caps|maiúscul[ao]s?|caixa\s*alta)\b/i.test(low))
    return "upper";
  if (/\b(?:lower\s*case|no\s*caps|minúscul[ao]s?|caixa\s*baixa)\b/i.test(low))
    return "lower";
  if (/\b(?:sentence\s*case|frase)\b/i.test(low)) return "sentence";
  return null;
}

// ---------------------------------------------------------------------------
// List type extraction
// ---------------------------------------------------------------------------

function extractListType(text: string): string | null {
  const low = text.toLowerCase();
  if (
    /\b(?:numbered|numbering|numbers?|ordered|numerada|numerado|numerad[ao]s?|números)\b/.test(
      low,
    )
  )
    return "numbered";
  if (
    /\b(?:bullet|bullets|bulleted|unordered|marcadores?|marcador)\b/.test(low)
  )
    return "bulleted";
  return null;
}

// ---------------------------------------------------------------------------
// Direction extraction (promote/demote)
// ---------------------------------------------------------------------------

function extractDirection(text: string): string | null {
  const low = text.toLowerCase();
  if (/\b(?:promote|indent|increase\s+level|promov|recuar)\b/.test(low))
    return "promote";
  if (/\b(?:demote|outdent|decrease\s+level|rebaixar|avançar)\b/.test(low))
    return "demote";
  return null;
}

// ---------------------------------------------------------------------------
// Master dispatcher
// ---------------------------------------------------------------------------

function runExtractor(
  extractor: SlotExtractor,
  text: string,
  lang: "en" | "pt",
  viewerContext: {
    selection?: unknown;
    sheetName?: string;
    frozenSelection?: unknown;
  },
): { value: unknown; localeConversions?: string[] } {
  switch (extractor.type) {
    case "A1_RANGE": {
      const ranges = extractA1Ranges(text);
      if (ranges.length > 0) {
        return { value: ranges.length === 1 ? ranges[0] : ranges };
      }

      // Fallback to viewer context
      if (viewerContext.selection) {
        const sel = viewerContext.selection as any;
        return { value: sel?.rangeA1 || sel?.a1 || sel?.range || null };
      }
      if (viewerContext.frozenSelection) {
        const frozen = viewerContext.frozenSelection as any;
        return {
          value: frozen?.rangeA1 || frozen?.a1 || frozen?.range || null,
        };
      }
      return { value: null };
    }

    case "SHEET_NAME": {
      const sheet = extractSheetName(text);
      if (sheet) return { value: sheet };
      return { value: viewerContext.sheetName || null };
    }

    case "NUMBER_OR_TEXT":
      return { value: extractNumberOrText(text, lang) };

    case "COLOR":
      return { value: extractColor(text, lang) };

    case "FONT_FAMILY":
      return { value: extractFontFamily(text) };

    case "FONT_SIZE":
      return { value: extractFontSize(text) };

    case "CHART_TYPE":
      return { value: extractChartType(text, lang) };

    case "FORMULA": {
      const formulaResult = extractFormula(text, lang);
      if (!formulaResult) return { value: null };
      return {
        value: formulaResult.formula,
        localeConversions:
          formulaResult.conversions.length > 0
            ? formulaResult.conversions
            : undefined,
      };
    }

    case "FORMAT_PATTERN":
      return { value: extractFormatPattern(text) };

    case "HEADING_LEVEL":
      return { value: extractHeadingLevel(text, lang) };

    case "LANGUAGE":
      return { value: extractLanguage(text) };

    case "BOOLEAN_FLAG":
      return { value: extractBooleanFlag(text, extractor.out) };

    case "STYLE_NAME":
      return { value: extractLocatorText(text) };

    case "LOCATOR_TEXT":
      return { value: extractLocatorText(text) };

    case "SORT_SPEC":
      return { value: extractSortSpec(text) };

    case "PERCENTAGE":
      return { value: extractPercentage(text) };

    case "ALIGNMENT":
      return { value: extractAlignment(text) };

    case "AXIS": {
      const low = text.toLowerCase();
      if (/\brows?\b|\blinhas?\b/.test(low)) return { value: "rows" };
      if (/\bcolumns?\b|\bcolunas?\b/.test(low)) return { value: "columns" };
      return { value: null };
    }

    case "SCOPE":
      return { value: extractScope(text) };

    case "TEXT_CASE":
      return { value: extractTextCase(text) };

    case "LIST_TYPE":
      return { value: extractListType(text) };

    case "DIRECTION":
      return { value: extractDirection(text) };

    default:
      return { value: null };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function fillSlots(
  pattern: IntentPattern,
  text: string,
  viewerContext: {
    selection?: unknown;
    sheetName?: string;
    frozenSelection?: unknown;
  },
): SlotFillResult {
  const lang = pattern.lang;
  const filled: FilledSlots = {};
  const missing: string[] = [];
  let localeConversions: string[] | undefined;

  for (const extractor of pattern.slotExtractors) {
    // If custom regex provided, try it first
    if (extractor.regex) {
      try {
        const match = text.match(new RegExp(extractor.regex, "i"));
        if (match) {
          filled[extractor.out] = match[1] || match[0];
          continue;
        }
      } catch {
        // Fall through to built-in parser
      }
    }

    const extracted = runExtractor(extractor, text, lang, viewerContext);
    const value = extracted.value;
    if (extracted.localeConversions?.length) {
      localeConversions = [
        ...(localeConversions || []),
        ...extracted.localeConversions,
      ];
    }

    if (value !== null && value !== undefined) {
      filled[extractor.out] = value;
    } else if (extractor.defaultValue !== undefined) {
      filled[extractor.out] = extractor.defaultValue;
    } else {
      // Slot not found — check if it's in a required slot for the operator
      missing.push(extractor.out);
    }
  }

  return {
    filled,
    missing,
    ...(localeConversions?.length ? { localeConversions } : {}),
  };
}
