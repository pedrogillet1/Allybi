/**
 * Excel Date Utilities
 * ============================================================================
 * FIX: Excel Date Format Lost - Serial Numbers Not Converted
 *
 * Problem: Dates in Excel are stored as serial numbers (days since Dec 30, 1899)
 * but were being displayed as raw numbers (e.g., 45678 instead of "01/15/2025")
 *
 * This utility provides centralized date handling for all Excel processing services.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Excel epoch: December 30, 1899
 * Note: Excel incorrectly considers 1900 a leap year (Feb 29, 1900 = serial 60)
 * This is a known bug that Microsoft preserved for backwards compatibility
 */
const EXCEL_EPOCH = new Date(1899, 11, 30); // Dec 30, 1899
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Serial number range for valid dates (1970-2100)
 * - 25569 = January 1, 1970
 * - 73051 = December 31, 2099
 */
const MIN_DATE_SERIAL = 1; // January 1, 1900
const MAX_DATE_SERIAL = 73051; // December 31, 2099

/**
 * Common date format patterns in Excel numFmt strings
 */
const DATE_FORMAT_PATTERNS = [
  /[dD]{1,4}/,       // d, dd, ddd, dddd (day)
  /[mM]{1,5}/,       // m, mm, mmm, mmmm, mmmmm (month) - but not after h/H (minutes)
  /[yY]{2,4}/,       // yy, yyyy (year)
  /[sS]{1,2}/,       // s, ss (seconds) - indicates datetime
  /[hH]{1,2}/,       // h, hh (hours) - indicates datetime
  /AM\/PM/i,         // AM/PM indicator
];

/**
 * Number format patterns that indicate it's NOT a date
 * (even if it contains m for minutes)
 */
const NUMBER_FORMAT_PATTERNS = [
  /#/,               // # = digit placeholder
  /0\.0/,            // Decimal number format
  /\[.*\]/,          // Conditional formatting
  /%/,               // Percentage
  /\$/,              // Currency
  /€/,               // Euro
  /£/,               // Pound
  /¥/,               // Yen
];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Convert Excel serial date number to JavaScript Date
 *
 * @param serial - Excel date serial number
 * @returns JavaScript Date object
 *
 * @example
 * excelDateToJSDate(44927) // Returns Date for 2023-01-01
 * excelDateToJSDate(45658) // Returns Date for 2025-01-01
 */
export function excelDateToJSDate(serial: number): Date {
  if (typeof serial !== 'number' || isNaN(serial)) {
    return new Date(NaN); // Invalid date
  }

  // Handle Excel's 1900 leap year bug
  // Excel incorrectly treats 1900 as a leap year, so serial 60 = Feb 29, 1900 (doesn't exist)
  // For serials > 60, we need to subtract 1 day to get the correct date
  let adjustedSerial = serial;
  if (serial > 60) {
    adjustedSerial = serial - 1;
  }

  // Handle negative serials (dates before epoch - rare but possible)
  if (serial < 0) {
    adjustedSerial = serial;
  }

  // Calculate the date
  const date = new Date(EXCEL_EPOCH.getTime() + adjustedSerial * MS_PER_DAY);

  return date;
}

/**
 * Convert JavaScript Date to Excel serial number
 *
 * @param date - JavaScript Date object
 * @returns Excel date serial number
 */
export function jsDateToExcelSerial(date: Date): number {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return NaN;
  }

  const diffMs = date.getTime() - EXCEL_EPOCH.getTime();
  let serial = diffMs / MS_PER_DAY;

  // Adjust for Excel's 1900 leap year bug
  if (serial > 60) {
    serial = serial + 1;
  }

  return serial;
}

/**
 * Check if a numFmt string indicates a date/time format
 *
 * @param numFmt - Excel number format string (e.g., "mm/dd/yyyy", "h:mm:ss")
 * @returns true if the format is a date/time format
 *
 * @example
 * isDateFormat("mm/dd/yyyy")  // true
 * isDateFormat("$#,##0.00")   // false
 * isDateFormat("h:mm:ss")     // true (time)
 * isDateFormat("0.00%")       // false
 */
export function isDateFormat(numFmt: string | undefined | null): boolean {
  if (!numFmt || typeof numFmt !== 'string') {
    return false;
  }

  const fmt = numFmt.toLowerCase();

  // First, check if it matches number/currency patterns (not a date)
  for (const pattern of NUMBER_FORMAT_PATTERNS) {
    if (pattern.test(numFmt)) {
      return false;
    }
  }

  // Check for date/time patterns
  // Look for day (d), month (m not after h), or year (y)
  const hasDay = /d/i.test(fmt);
  const hasYear = /y/i.test(fmt);
  const hasMonthNotMinutes = /m/i.test(fmt) && !/[h].*m/i.test(fmt); // m not after h
  const hasTime = /[hs]/i.test(fmt); // hours or seconds

  // It's a date if it has day, year, or month (not minutes)
  // Time-only formats (h:mm:ss) are also considered date formats
  return hasDay || hasYear || hasMonthNotMinutes || hasTime;
}

/**
 * Check if a numeric value is likely an Excel date serial number
 *
 * @param value - The value to check
 * @param numFmt - Optional numFmt string from the cell
 * @returns true if the value is likely a date serial
 *
 * @example
 * isExcelDateSerial(45658)              // true (reasonable date range)
 * isExcelDateSerial(123.45)             // false (too small)
 * isExcelDateSerial(45658, "mm/dd/yyyy") // true (confirmed by format)
 */
export function isExcelDateSerial(value: any, numFmt?: string | null): boolean {
  // Must be a number
  if (typeof value !== 'number' || isNaN(value)) {
    return false;
  }

  // If we have a numFmt, use it as the authoritative source
  if (numFmt) {
    return isDateFormat(numFmt);
  }

  // Heuristic: check if value falls within reasonable date range
  // This catches dates from 1900 to 2099
  // Be conservative - only flag obvious dates to avoid false positives
  if (value >= MIN_DATE_SERIAL && value <= MAX_DATE_SERIAL) {
    // Additional heuristic: dates usually don't have many decimal places
    // Serial 45678.5 = noon on that day (valid)
    // Serial 45678.123456789 = probably not a date
    const decimalPlaces = (value.toString().split('.')[1] || '').length;
    return decimalPlaces <= 6; // Excel time precision is about 6 decimal places
  }

  return false;
}

/**
 * Format an Excel date serial as a human-readable string
 *
 * @param serial - Excel date serial number
 * @param options - Formatting options
 * @returns Formatted date string
 *
 * @example
 * formatExcelDate(45658)                    // "1/1/2025"
 * formatExcelDate(45658, { locale: 'pt-BR' }) // "01/01/2025"
 * formatExcelDate(45658.5)                  // "1/1/2025" (ignores time portion)
 */
export function formatExcelDate(
  serial: number,
  options: {
    locale?: string;
    includeTime?: boolean;
    dateStyle?: 'short' | 'medium' | 'long' | 'full';
  } = {}
): string {
  const {
    locale = 'en-US',
    includeTime = false,
    dateStyle = 'short'
  } = options;

  const date = excelDateToJSDate(serial);

  if (isNaN(date.getTime())) {
    return String(serial); // Return original value if conversion fails
  }

  try {
    if (includeTime && serial % 1 !== 0) {
      // Has time component
      return date.toLocaleString(locale, {
        dateStyle,
        timeStyle: 'short'
      });
    }

    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
  } catch (error) {
    // Fallback for unsupported locales
    return date.toLocaleDateString('en-US');
  }
}

/**
 * Format an Excel time serial (fractional part) as a time string
 *
 * @param serial - Excel date/time serial number (uses fractional part)
 * @param locale - Locale for formatting
 * @returns Formatted time string
 *
 * @example
 * formatExcelTime(0.5)    // "12:00 PM" (noon)
 * formatExcelTime(0.75)   // "6:00 PM"
 * formatExcelTime(45658.5) // "12:00 PM" (extracts time from datetime)
 */
export function formatExcelTime(serial: number, locale: string = 'en-US'): string {
  const timeFraction = serial % 1;
  const totalMinutes = Math.round(timeFraction * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  try {
    return date.toLocaleTimeString(locale, {
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return date.toLocaleTimeString('en-US');
  }
}

/**
 * Smart format function that handles both dates and regular numbers
 * Uses numFmt to determine the appropriate formatting
 *
 * @param value - The cell value
 * @param numFmt - Excel number format string
 * @param locale - Locale for formatting
 * @returns Formatted string
 */
export function formatCellValueWithDateSupport(
  value: any,
  numFmt?: string | null,
  locale: string = 'en-US'
): string {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return '';
  }

  // Handle Date objects directly
  if (value instanceof Date) {
    return value.toLocaleDateString(locale);
  }

  // Handle numbers that might be dates
  if (typeof value === 'number') {
    // Check if it's a date based on numFmt or heuristics
    if (isExcelDateSerial(value, numFmt)) {
      return formatExcelDate(value, { locale });
    }

    // Regular number formatting
    if (Math.abs(value) >= 1000) {
      return value.toLocaleString(locale, { maximumFractionDigits: 2 });
    }
    return String(value);
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  // Default: convert to string
  return String(value);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  excelDateToJSDate,
  jsDateToExcelSerial,
  isDateFormat,
  isExcelDateSerial,
  formatExcelDate,
  formatExcelTime,
  formatCellValueWithDateSupport,
};
