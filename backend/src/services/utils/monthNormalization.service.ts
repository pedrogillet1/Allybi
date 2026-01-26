/**
 * Month Normalization Service
 *
 * Expands month terms in queries to include all common variants.
 * Fixes the "July" vs "Jul-2024" mismatch issue in spreadsheet queries.
 *
 * Covers ALL common Excel column header patterns:
 * - Full names: "January", "January 2024"
 * - Abbreviations: "Jan", "Jan-2024", "Jan 2024", "Jan24"
 * - Quarter notation: "Q1", "Q1 2024", "Q1-2024"
 * - Numeric: "01-2024", "1/2024", "01/24", "2024-01"
 * - Period notation: "Period 1", "M1", "Month 1"
 * - Fiscal year patterns: "FY24-Jan", "FY2024 Q1"
 * - Year-month combinations: "2024-Jan", "2024/01"
 * - Informal: "Jan '24", "Jan-24"
 *
 * Example: "revenue in July" → "revenue July Jul Jul-2024 Jul-2025 Julho 07-2024..."
 */

interface MonthEntry {
  monthNum: number;      // 1-12
  en: string[];          // ["January", "Jan"]
  pt: string[];          // ["Janeiro", "Jan"]
  es: string[];          // ["Enero", "Ene"]
  abbrev: string;        // "Jan" - canonical abbreviation
  quarter: number;       // 1-4
}

const MONTH_DATA: MonthEntry[] = [
  { monthNum: 1,  en: ['January', 'Jan'],    pt: ['Janeiro', 'Jan'],    es: ['Enero', 'Ene'],     abbrev: 'Jan', quarter: 1 },
  { monthNum: 2,  en: ['February', 'Feb'],   pt: ['Fevereiro', 'Fev'],  es: ['Febrero', 'Feb'],   abbrev: 'Feb', quarter: 1 },
  { monthNum: 3,  en: ['March', 'Mar'],      pt: ['Março', 'Mar'],      es: ['Marzo', 'Mar'],     abbrev: 'Mar', quarter: 1 },
  { monthNum: 4,  en: ['April', 'Apr'],      pt: ['Abril', 'Abr'],      es: ['Abril', 'Abr'],     abbrev: 'Apr', quarter: 2 },
  { monthNum: 5,  en: ['May'],               pt: ['Maio', 'Mai'],       es: ['Mayo', 'May'],      abbrev: 'May', quarter: 2 },
  { monthNum: 6,  en: ['June', 'Jun'],       pt: ['Junho', 'Jun'],      es: ['Junio', 'Jun'],     abbrev: 'Jun', quarter: 2 },
  { monthNum: 7,  en: ['July', 'Jul'],       pt: ['Julho', 'Jul'],      es: ['Julio', 'Jul'],     abbrev: 'Jul', quarter: 3 },
  { monthNum: 8,  en: ['August', 'Aug'],     pt: ['Agosto', 'Ago'],     es: ['Agosto', 'Ago'],    abbrev: 'Aug', quarter: 3 },
  { monthNum: 9,  en: ['September', 'Sep', 'Sept'], pt: ['Setembro', 'Set'],  es: ['Septiembre', 'Sep'], abbrev: 'Sep', quarter: 3 },
  { monthNum: 10, en: ['October', 'Oct'],    pt: ['Outubro', 'Out'],    es: ['Octubre', 'Oct'],   abbrev: 'Oct', quarter: 4 },
  { monthNum: 11, en: ['November', 'Nov'],   pt: ['Novembro', 'Nov'],   es: ['Noviembre', 'Nov'], abbrev: 'Nov', quarter: 4 },
  { monthNum: 12, en: ['December', 'Dec'],   pt: ['Dezembro', 'Dez'],   es: ['Diciembre', 'Dic'], abbrev: 'Dec', quarter: 4 },
];

// Quarter data for Q1/Q2/Q3/Q4 queries
const QUARTER_DATA = [
  { quarter: 1, en: ['Q1', 'Q1', '1Q', 'First Quarter'], months: [1, 2, 3] },
  { quarter: 2, en: ['Q2', '2Q', 'Second Quarter'], months: [4, 5, 6] },
  { quarter: 3, en: ['Q3', '3Q', 'Third Quarter'], months: [7, 8, 9] },
  { quarter: 4, en: ['Q4', '4Q', 'Fourth Quarter'], months: [10, 11, 12] },
];

// Current year and last year for expansion
const CURRENT_YEAR = new Date().getFullYear();
const LAST_YEAR = CURRENT_YEAR - 1;
const SHORT_YEAR = String(CURRENT_YEAR).slice(-2);  // "24", "25", etc.
const SHORT_YEAR_LAST = String(LAST_YEAR).slice(-2);

/**
 * Build a regex pattern to match any month name in any supported language
 */
function buildMonthPattern(): RegExp {
  const allMonthNames: string[] = [];

  for (const month of MONTH_DATA) {
    allMonthNames.push(...month.en, ...month.pt, ...month.es);
  }

  // Sort by length descending to match longer names first (e.g., "September" before "Sep")
  allMonthNames.sort((a, b) => b.length - a.length);

  // Build pattern with word boundaries
  const pattern = `\\b(${allMonthNames.join('|')})\\b`;
  return new RegExp(pattern, 'gi');
}

/**
 * Build a regex pattern to match quarter references
 */
function buildQuarterPattern(): RegExp {
  const quarterTerms = ['Q1', 'Q2', 'Q3', 'Q4', '1Q', '2Q', '3Q', '4Q',
    'First Quarter', 'Second Quarter', 'Third Quarter', 'Fourth Quarter',
    'Primeiro Trimestre', 'Segundo Trimestre', 'Terceiro Trimestre', 'Quarto Trimestre'];

  const pattern = `\\b(${quarterTerms.join('|')})\\b`;
  return new RegExp(pattern, 'gi');
}

const MONTH_PATTERN = buildMonthPattern();
const QUARTER_PATTERN = buildQuarterPattern();

/**
 * Find which month entry a given name belongs to
 */
function findMonthEntry(monthName: string): MonthEntry | null {
  const lowerName = monthName.toLowerCase();

  for (const entry of MONTH_DATA) {
    const allNames = [...entry.en, ...entry.pt, ...entry.es].map(n => n.toLowerCase());
    if (allNames.includes(lowerName)) {
      return entry;
    }
  }

  return null;
}

/**
 * Find which quarter a term refers to
 */
function findQuarter(quarterTerm: string): { quarter: number; months: number[] } | null {
  const lowerTerm = quarterTerm.toLowerCase();

  for (const q of QUARTER_DATA) {
    for (const name of q.en) {
      if (name.toLowerCase() === lowerTerm) {
        return { quarter: q.quarter, months: q.months };
      }
    }
  }

  // Handle Portuguese quarters
  if (lowerTerm.includes('primeiro')) return { quarter: 1, months: [1, 2, 3] };
  if (lowerTerm.includes('segundo')) return { quarter: 2, months: [4, 5, 6] };
  if (lowerTerm.includes('terceiro')) return { quarter: 3, months: [7, 8, 9] };
  if (lowerTerm.includes('quarto')) return { quarter: 4, months: [10, 11, 12] };

  return null;
}

/**
 * Generate ALL common Excel header variants for a month
 * Covers all patterns found in real spreadsheets
 *
 * @param monthEntry - The month entry
 * @returns Array of variant strings
 */
function generateMonthVariants(monthEntry: MonthEntry): string[] {
  const variants: Set<string> = new Set();
  const num = monthEntry.monthNum;
  const paddedNum = num.toString().padStart(2, '0');
  const abbrev = monthEntry.abbrev;

  // ═══════════════════════════════════════════════════════════════════════════
  // Pattern 1: Full names (all languages)
  // "January", "Janeiro", "Enero"
  // ═══════════════════════════════════════════════════════════════════════════
  for (const name of [...monthEntry.en, ...monthEntry.pt, ...monthEntry.es]) {
    variants.add(name);
    // With year: "January 2024", "January-2024"
    variants.add(`${name} ${CURRENT_YEAR}`);
    variants.add(`${name} ${LAST_YEAR}`);
    variants.add(`${name}-${CURRENT_YEAR}`);
    variants.add(`${name}-${LAST_YEAR}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Pattern 2: Abbreviations with year
  // "Jan", "Jan-2024", "Jan 2024", "Jan24", "Jan-24", "Jan '24"
  // ═══════════════════════════════════════════════════════════════════════════
  variants.add(abbrev);
  variants.add(`${abbrev}-${CURRENT_YEAR}`);
  variants.add(`${abbrev}-${LAST_YEAR}`);
  variants.add(`${abbrev} ${CURRENT_YEAR}`);
  variants.add(`${abbrev} ${LAST_YEAR}`);
  variants.add(`${abbrev}${SHORT_YEAR}`);       // Jan25
  variants.add(`${abbrev}${SHORT_YEAR_LAST}`);  // Jan24
  variants.add(`${abbrev}-${SHORT_YEAR}`);      // Jan-25
  variants.add(`${abbrev}-${SHORT_YEAR_LAST}`); // Jan-24
  variants.add(`${abbrev} '${SHORT_YEAR}`);     // Jan '25
  variants.add(`${abbrev} '${SHORT_YEAR_LAST}`);// Jan '24

  // ═══════════════════════════════════════════════════════════════════════════
  // Pattern 3: Numeric formats
  // "01-2024", "1/2024", "01/24", "2024-01", "2024/01"
  // ═══════════════════════════════════════════════════════════════════════════
  variants.add(`${paddedNum}-${CURRENT_YEAR}`);   // 01-2024
  variants.add(`${paddedNum}-${LAST_YEAR}`);      // 01-2023
  variants.add(`${num}/${CURRENT_YEAR}`);         // 1/2024
  variants.add(`${num}/${LAST_YEAR}`);            // 1/2023
  variants.add(`${paddedNum}/${SHORT_YEAR}`);     // 01/25
  variants.add(`${paddedNum}/${SHORT_YEAR_LAST}`);// 01/24
  variants.add(`${CURRENT_YEAR}-${paddedNum}`);   // 2024-01
  variants.add(`${LAST_YEAR}-${paddedNum}`);      // 2023-01
  variants.add(`${CURRENT_YEAR}/${paddedNum}`);   // 2024/01
  variants.add(`${LAST_YEAR}/${paddedNum}`);      // 2023/01

  // ═══════════════════════════════════════════════════════════════════════════
  // Pattern 4: Period/Month notation
  // "M1", "M01", "Month 1", "Period 1", "Per. 1"
  // ═══════════════════════════════════════════════════════════════════════════
  variants.add(`M${num}`);                        // M1
  variants.add(`M${paddedNum}`);                  // M01
  variants.add(`Month ${num}`);                   // Month 1
  variants.add(`Month${num}`);                    // Month1
  variants.add(`Period ${num}`);                  // Period 1
  variants.add(`Per. ${num}`);                    // Per. 1
  variants.add(`Per ${num}`);                     // Per 1

  // ═══════════════════════════════════════════════════════════════════════════
  // Pattern 5: Year-first formats
  // "2024-Jan", "2024 Jan", "2024/Jan", "FY24-Jan", "FY2024-Jan"
  // ═══════════════════════════════════════════════════════════════════════════
  variants.add(`${CURRENT_YEAR}-${abbrev}`);      // 2024-Jan
  variants.add(`${LAST_YEAR}-${abbrev}`);         // 2023-Jan
  variants.add(`${CURRENT_YEAR} ${abbrev}`);      // 2024 Jan
  variants.add(`${LAST_YEAR} ${abbrev}`);         // 2023 Jan
  variants.add(`${CURRENT_YEAR}/${abbrev}`);      // 2024/Jan
  variants.add(`${LAST_YEAR}/${abbrev}`);         // 2023/Jan
  variants.add(`FY${SHORT_YEAR}-${abbrev}`);      // FY25-Jan
  variants.add(`FY${SHORT_YEAR_LAST}-${abbrev}`); // FY24-Jan
  variants.add(`FY${CURRENT_YEAR}-${abbrev}`);    // FY2024-Jan
  variants.add(`FY${LAST_YEAR}-${abbrev}`);       // FY2023-Jan

  // ═══════════════════════════════════════════════════════════════════════════
  // Pattern 6: Quarter reference for this month's quarter
  // "Q1", "Q1-2024", "1Q24"
  // ═══════════════════════════════════════════════════════════════════════════
  const q = monthEntry.quarter;
  variants.add(`Q${q}`);                          // Q1
  variants.add(`${q}Q`);                          // 1Q
  variants.add(`Q${q}-${CURRENT_YEAR}`);          // Q1-2024
  variants.add(`Q${q}-${LAST_YEAR}`);             // Q1-2023
  variants.add(`Q${q} ${CURRENT_YEAR}`);          // Q1 2024
  variants.add(`Q${q} ${LAST_YEAR}`);             // Q1 2023
  variants.add(`${q}Q${SHORT_YEAR}`);             // 1Q25
  variants.add(`${q}Q${SHORT_YEAR_LAST}`);        // 1Q24

  // ═══════════════════════════════════════════════════════════════════════════
  // Pattern 7: Half year references (H1/H2)
  // ═══════════════════════════════════════════════════════════════════════════
  const half = num <= 6 ? 1 : 2;
  variants.add(`H${half}`);                       // H1 or H2
  variants.add(`H${half} ${CURRENT_YEAR}`);       // H1 2024
  variants.add(`H${half}-${CURRENT_YEAR}`);       // H1-2024

  return Array.from(variants);
}

/**
 * Generate quarter variants
 */
function generateQuarterVariants(quarterNum: number): string[] {
  const variants: Set<string> = new Set();

  // Basic quarter notations
  variants.add(`Q${quarterNum}`);
  variants.add(`${quarterNum}Q`);

  // With years
  variants.add(`Q${quarterNum}-${CURRENT_YEAR}`);
  variants.add(`Q${quarterNum}-${LAST_YEAR}`);
  variants.add(`Q${quarterNum} ${CURRENT_YEAR}`);
  variants.add(`Q${quarterNum} ${LAST_YEAR}`);
  variants.add(`${quarterNum}Q${SHORT_YEAR}`);
  variants.add(`${quarterNum}Q${SHORT_YEAR_LAST}`);

  // Fiscal year notation
  variants.add(`FY${SHORT_YEAR} Q${quarterNum}`);
  variants.add(`FY${SHORT_YEAR_LAST} Q${quarterNum}`);
  variants.add(`FY${CURRENT_YEAR}-Q${quarterNum}`);
  variants.add(`FY${LAST_YEAR}-Q${quarterNum}`);

  // Also add all months in this quarter
  const quarterMonths = MONTH_DATA.filter(m => m.quarter === quarterNum);
  for (const month of quarterMonths) {
    variants.add(month.abbrev);
    variants.add(`${month.abbrev}-${CURRENT_YEAR}`);
    variants.add(`${month.abbrev}-${LAST_YEAR}`);
  }

  return Array.from(variants);
}

/**
 * Expand month terms in a query to include all variants
 *
 * This fixes the issue where "July" doesn't match "Jul-2024" in BM25 search.
 *
 * @param query - The original query text
 * @returns Expanded query with month variants appended
 *
 * Example:
 *   Input:  "How much revenue in July?"
 *   Output: "How much revenue in July? July Jul Jul-2024 Jul-2025 Jul24 Jul-24 Julho 07-2024..."
 */
export function expandMonthQuery(query: string): string {
  const allVariants: Set<string> = new Set();
  let match: RegExpExecArray | null;

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 1: Find month mentions in the query
  // ═══════════════════════════════════════════════════════════════════════════
  MONTH_PATTERN.lastIndex = 0;
  while ((match = MONTH_PATTERN.exec(query)) !== null) {
    const monthName = match[1];
    const monthEntry = findMonthEntry(monthName);

    if (monthEntry) {
      const variants = generateMonthVariants(monthEntry);
      for (const variant of variants) {
        allVariants.add(variant);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 2: Find quarter mentions in the query
  // ═══════════════════════════════════════════════════════════════════════════
  QUARTER_PATTERN.lastIndex = 0;
  while ((match = QUARTER_PATTERN.exec(query)) !== null) {
    const quarterTerm = match[1];
    const quarterInfo = findQuarter(quarterTerm);

    if (quarterInfo) {
      const variants = generateQuarterVariants(quarterInfo.quarter);
      for (const variant of variants) {
        allVariants.add(variant);
      }
    }
  }

  // If no time references found, return original query
  if (allVariants.size === 0) {
    return query;
  }

  // Append variants to the query (limit to most important ones to avoid huge queries)
  const priorityVariants = Array.from(allVariants).slice(0, 50);
  const variantsStr = priorityVariants.join(' ');

  console.log(`[MONTH_EXPAND] Query expanded with ${priorityVariants.length} variants`);

  return `${query} ${variantsStr}`;
}

/**
 * Check if a query contains month references
 */
export function hasMonthReference(query: string): boolean {
  MONTH_PATTERN.lastIndex = 0;
  if (MONTH_PATTERN.test(query)) return true;

  QUARTER_PATTERN.lastIndex = 0;
  return QUARTER_PATTERN.test(query);
}

/**
 * Extract month numbers from a query
 * Used for filtering results to specific months
 */
export function extractMonthNumbers(query: string): number[] {
  const months: number[] = [];
  let match: RegExpExecArray | null;

  MONTH_PATTERN.lastIndex = 0;

  while ((match = MONTH_PATTERN.exec(query)) !== null) {
    const monthEntry = findMonthEntry(match[1]);
    if (monthEntry && !months.includes(monthEntry.monthNum)) {
      months.push(monthEntry.monthNum);
    }
  }

  // Also check for quarter mentions and add their months
  QUARTER_PATTERN.lastIndex = 0;
  while ((match = QUARTER_PATTERN.exec(query)) !== null) {
    const quarterInfo = findQuarter(match[1]);
    if (quarterInfo) {
      for (const m of quarterInfo.months) {
        if (!months.includes(m)) {
          months.push(m);
        }
      }
    }
  }

  return months;
}

/**
 * Normalize a month column header to a canonical form
 * Used for matching user queries to spreadsheet headers
 *
 * @param header - Column header like "Jul-2024" or "Jul 2024"
 * @returns Normalized form with month number and year, or null if not a month header
 */
export function normalizeMonthHeader(header: string): { monthNum: number; year: number | null } | null {
  if (!header) return null;

  const headerTrim = header.trim();

  // ═══════════════════════════════════════════════════════════════════════════
  // Pattern 1: Abbreviated month with year (Jul-2024, Jul 2024, Jul24, Jul-24)
  // ═══════════════════════════════════════════════════════════════════════════
  const abbrevYearMatch = headerTrim.match(/^([A-Za-zçãéèêúíóô]{3,9})[\s\-\/]?['']?(\d{2,4})?$/i);
  if (abbrevYearMatch) {
    const monthEntry = findMonthEntry(abbrevYearMatch[1]);
    if (monthEntry) {
      let year: number | null = null;
      if (abbrevYearMatch[2]) {
        year = parseInt(abbrevYearMatch[2]);
        // Convert 2-digit year to 4-digit
        if (year < 100) {
          year = year >= 50 ? 1900 + year : 2000 + year;
        }
      }
      return { monthNum: monthEntry.monthNum, year };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Pattern 2: Numeric month with year (07-2024, 7/2024, 01/24)
  // ═══════════════════════════════════════════════════════════════════════════
  const numericMatch = headerTrim.match(/^(\d{1,2})[\s\-\/](\d{2,4})$/);
  if (numericMatch) {
    const monthNum = parseInt(numericMatch[1]);
    if (monthNum >= 1 && monthNum <= 12) {
      let year = parseInt(numericMatch[2]);
      if (year < 100) {
        year = year >= 50 ? 1900 + year : 2000 + year;
      }
      return { monthNum, year };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Pattern 3: Year-first format (2024-01, 2024/Jul, 2024-Jan)
  // ═══════════════════════════════════════════════════════════════════════════
  const yearFirstNumeric = headerTrim.match(/^(\d{4})[\-\/](\d{1,2})$/);
  if (yearFirstNumeric) {
    const year = parseInt(yearFirstNumeric[1]);
    const monthNum = parseInt(yearFirstNumeric[2]);
    if (monthNum >= 1 && monthNum <= 12) {
      return { monthNum, year };
    }
  }

  const yearFirstAbbrev = headerTrim.match(/^(\d{4})[\-\/\s]([A-Za-zçãéèêúíóô]{3,9})$/i);
  if (yearFirstAbbrev) {
    const year = parseInt(yearFirstAbbrev[1]);
    const monthEntry = findMonthEntry(yearFirstAbbrev[2]);
    if (monthEntry) {
      return { monthNum: monthEntry.monthNum, year };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Pattern 4: Period notation (M1, M01, Period 1)
  // ═══════════════════════════════════════════════════════════════════════════
  const periodMatch = headerTrim.match(/^(?:M|Month|Period|Per\.?)\s?(\d{1,2})$/i);
  if (periodMatch) {
    const monthNum = parseInt(periodMatch[1]);
    if (monthNum >= 1 && monthNum <= 12) {
      return { monthNum, year: null };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Pattern 5: Quarter notation (Q1, Q1-2024, 1Q24)
  // ═══════════════════════════════════════════════════════════════════════════
  const quarterMatch = headerTrim.match(/^(?:Q|)(\d)[Q]?[\-\s]?(\d{2,4})?$/i);
  if (quarterMatch) {
    const quarterNum = parseInt(quarterMatch[1]);
    if (quarterNum >= 1 && quarterNum <= 4) {
      // Return first month of quarter as proxy
      const monthNum = (quarterNum - 1) * 3 + 1;
      let year: number | null = null;
      if (quarterMatch[2]) {
        year = parseInt(quarterMatch[2]);
        if (year < 100) {
          year = year >= 50 ? 1900 + year : 2000 + year;
        }
      }
      return { monthNum, year };
    }
  }

  return null;
}

// Singleton instance
let instance: {
  expandMonthQuery: typeof expandMonthQuery;
  hasMonthReference: typeof hasMonthReference;
  extractMonthNumbers: typeof extractMonthNumbers;
  normalizeMonthHeader: typeof normalizeMonthHeader;
} | null = null;

export function getMonthNormalizationService() {
  if (!instance) {
    instance = {
      expandMonthQuery,
      hasMonthReference,
      extractMonthNumbers,
      normalizeMonthHeader,
    };
  }
  return instance;
}

export default {
  expandMonthQuery,
  hasMonthReference,
  extractMonthNumbers,
  normalizeMonthHeader,
};
