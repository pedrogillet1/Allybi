/**
 * Excel Cell Utilities
 * Shared utilities for handling Excel cell values, especially formulas
 *
 * ✅ FIX: This utility ensures formulas return calculated results, not formula text
 * ✅ FIX: Added date serial number detection and conversion
 */

import {
  isExcelDateSerial,
  formatExcelDate,
  isDateFormat
} from './excelDateUtils';

/**
 * Result of extracting a cell value
 */
export interface CellValueResult {
  value: any;
  formattedValue: string;
  hasFormula: boolean;
  formula?: string;
  isError?: boolean;
  errorType?: string;
}

/**
 * Get cell value from an ExcelJS cell object
 * ✅ FIX: Returns calculated result for formula cells, not the formula text
 *
 * @param cell - ExcelJS Cell object or raw cell value
 * @returns CellValueResult with proper value extraction
 */
export function getCellValue(cell: any): CellValueResult {
  // Handle null/undefined
  if (cell === null || cell === undefined) {
    return {
      value: null,
      formattedValue: '',
      hasFormula: false,
    };
  }

  // If cell is an ExcelJS Cell object, get its value
  const cellValue = cell.value !== undefined ? cell.value : cell;

  // Handle null/undefined value
  if (cellValue === null || cellValue === undefined) {
    return {
      value: null,
      formattedValue: '',
      hasFormula: false,
    };
  }

  // ✅ FIX: Handle formula cells - return calculated result, not formula text
  if (typeof cellValue === 'object' && cellValue.formula) {
    const formula = cellValue.formula;

    // Check if we have a calculated result
    if (cellValue.result !== undefined && cellValue.result !== null) {
      return {
        value: cellValue.result,
        formattedValue: formatValue(cellValue.result),
        hasFormula: true,
        formula: `=${formula}`,
      };
    }

    // Check for shared formula result
    if (cellValue.sharedFormula && cellValue.result !== undefined) {
      return {
        value: cellValue.result,
        formattedValue: formatValue(cellValue.result),
        hasFormula: true,
        formula: `=${formula}`,
      };
    }

    // No result available - formula wasn't calculated by Excel
    console.warn(`[ExcelCellUtils] Formula not calculated: =${formula}`);
    return {
      value: null,
      formattedValue: `[Formula: =${formula}]`,
      hasFormula: true,
      formula: `=${formula}`,
    };
  }

  // Handle rich text
  if (typeof cellValue === 'object' && cellValue.richText) {
    const text = cellValue.richText.map((rt: any) => rt.text || '').join('');
    return {
      value: text,
      formattedValue: text,
      hasFormula: false,
    };
  }

  // Handle hyperlinks
  if (typeof cellValue === 'object' && cellValue.hyperlink) {
    const text = cellValue.text || cellValue.hyperlink;
    return {
      value: text,
      formattedValue: text,
      hasFormula: false,
    };
  }

  // Handle Excel error values
  if (typeof cellValue === 'object' && cellValue.error) {
    return {
      value: cellValue.error,
      formattedValue: cellValue.error,
      hasFormula: false,
      isError: true,
      errorType: cellValue.error,
    };
  }

  // Regular value
  return {
    value: cellValue,
    formattedValue: formatValue(cellValue),
    hasFormula: false,
  };
}

/**
 * Format a number value with proper precision preservation
 * ✅ FIX: Preserves decimal precision for financial data accuracy
 *
 * @param value - The numeric value to format
 * @returns Formatted string with proper precision
 */
export function formatNumber(value: number): string {
  if (isNaN(value)) return String(value);

  // Preserve original precision
  // Check if has decimals
  if (value % 1 !== 0) {
    // Keep up to 2 decimal places for currency (values >= 1)
    // Keep up to 4 decimal places for percentages/rates (values < 1)
    const decimals = Math.abs(value) < 1 ? 4 : 2;

    // Use toLocaleString to add thousand separators while preserving decimals
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  // Integer - add thousand separators
  return value.toLocaleString('en-US');
}

/**
 * Format a value for display
 * ✅ FIX: Added date serial number detection and conversion
 * ✅ FIX: Uses formatNumber for proper precision preservation
 *
 * @param value - The value to format
 * @param numFmt - Optional Excel number format string for date detection
 */
export function formatValue(value: any, numFmt?: string | null): string {
  if (value === null || value === undefined) {
    return '';
  }

  // Date object
  if (value instanceof Date) {
    return value.toLocaleDateString('en-US');
  }

  // Boolean
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  // Number
  if (typeof value === 'number') {
    // Check for special values
    if (isNaN(value)) return '#NUM!';
    if (!isFinite(value)) return value > 0 ? '#DIV/0!' : '#DIV/0!';

    // ✅ FIX: Check if this number is an Excel date serial
    if (isExcelDateSerial(value, numFmt)) {
      return formatExcelDate(value, { locale: 'en-US' });
    }

    // ✅ FIX: Use formatNumber for proper precision preservation
    return formatNumber(value);
  }

  // String or other
  return String(value);
}

/**
 * Check if a cell contains a formula
 */
export function hasFormula(cell: any): boolean {
  if (!cell) return false;
  const cellValue = cell.value !== undefined ? cell.value : cell;
  return typeof cellValue === 'object' && !!cellValue?.formula;
}

/**
 * Get the formula text from a cell (if it has one)
 */
export function getFormula(cell: any): string | null {
  if (!cell) return null;
  const cellValue = cell.value !== undefined ? cell.value : cell;
  if (typeof cellValue === 'object' && cellValue?.formula) {
    return `=${cellValue.formula}`;
  }
  return null;
}

/**
 * Check if a cell value represents an Excel error
 */
export function isErrorValue(value: any): boolean {
  if (typeof value === 'string') {
    const errorTypes = ['#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#NULL!'];
    return errorTypes.includes(value);
  }
  if (typeof value === 'object' && value?.error) {
    return true;
  }
  return false;
}

/**
 * Get error type from a cell value
 */
export function getErrorType(value: any): string | null {
  if (typeof value === 'string') {
    const errorTypes = ['#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#NULL!'];
    if (errorTypes.includes(value)) return value;
  }
  if (typeof value === 'object' && value?.error) {
    return value.error;
  }
  return null;
}

export default {
  getCellValue,
  formatValue,
  formatNumber,
  hasFormula,
  getFormula,
  isErrorValue,
  getErrorType,
};
