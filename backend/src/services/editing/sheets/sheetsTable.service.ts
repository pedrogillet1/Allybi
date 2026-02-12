import type { sheets_v4 } from "googleapis";
import {
  SheetsClientError,
  SheetsClientService,
  type SheetsRequestContext,
} from "./sheetsClient.service";
import { SheetsValidatorsService } from "./sheetsValidators.service";

export interface SheetsTableSpec {
  rangeA1: string; // e.g. Sheet1!A1:D20
  hasHeader?: boolean;
  style?: "light_gray" | "blue" | "green" | "orange" | "teal" | "gray";
}

interface ParsedRange {
  sheetName: string;
  startColumnIndex: number;
  endColumnIndexExclusive: number;
  startRowIndex: number;
  endRowIndexExclusive: number;
}

/**
 * "Excel table" analog for Google Sheets export:
 * - banded rows
 * - bold/filled header
 * - basic filter
 * - freeze header row
 */
export class SheetsTableService {
  private readonly validators: SheetsValidatorsService;

  constructor(private readonly sheetsClient: SheetsClientService = new SheetsClientService()) {
    this.validators = new SheetsValidatorsService(this.sheetsClient);
  }

  async createTable(
    spreadsheetId: string,
    sheetIdFallback: number,
    spec: SheetsTableSpec,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    if (!spec?.rangeA1) {
      throw new SheetsClientError("create_table requires rangeA1.", { code: "INVALID_TABLE_SPEC", retryable: false });
    }

    const range = String(spec.rangeA1 || "").trim();
    const parsed = this.parseRange(range);
    const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, range, ctx);
    if (!bounds.valid) {
      throw new SheetsClientError(bounds.reason ?? "Table range out of bounds.", { code: "TABLE_RANGE_OUT_OF_BOUNDS", retryable: false });
    }

    const spreadsheet = await this.sheetsClient.getSpreadsheet(spreadsheetId, ctx);
    const sheetId = this.resolveSheetId(spreadsheet, parsed.sheetName, sheetIdFallback);
    const hasHeader = spec.hasHeader !== false;
    const headerRowCount = hasHeader ? 1 : 0;

    const gridRange: sheets_v4.Schema$GridRange = {
      sheetId,
      startRowIndex: parsed.startRowIndex,
      endRowIndex: parsed.endRowIndexExclusive,
      startColumnIndex: parsed.startColumnIndex,
      endColumnIndex: parsed.endColumnIndexExclusive,
    };

    const headerRange: sheets_v4.Schema$GridRange | null = hasHeader
      ? {
          sheetId,
          startRowIndex: parsed.startRowIndex,
          endRowIndex: parsed.startRowIndex + 1,
          startColumnIndex: parsed.startColumnIndex,
          endColumnIndex: parsed.endColumnIndexExclusive,
        }
      : null;

    const style = spec.style || "light_gray";
    const paletteByStyle: Record<string, { header: sheets_v4.Schema$Color; even: sheets_v4.Schema$Color; odd: sheets_v4.Schema$Color }> = {
      light_gray: {
        header: { red: 0.96, green: 0.96, blue: 0.97 },
        even: { red: 0.99, green: 0.99, blue: 0.995 },
        odd: { red: 1, green: 1, blue: 1 },
      },
      gray: {
        header: { red: 0.9, green: 0.92, blue: 0.95 },
        even: { red: 0.97, green: 0.98, blue: 0.99 },
        odd: { red: 1, green: 1, blue: 1 },
      },
      blue: {
        header: { red: 0.12, green: 0.35, blue: 0.82 },
        even: { red: 0.96, green: 0.98, blue: 1 },
        odd: { red: 1, green: 1, blue: 1 },
      },
      green: {
        header: { red: 0.09, green: 0.55, blue: 0.33 },
        even: { red: 0.95, green: 0.99, blue: 0.96 },
        odd: { red: 1, green: 1, blue: 1 },
      },
      orange: {
        header: { red: 0.9, green: 0.45, blue: 0.1 },
        even: { red: 1, green: 0.97, blue: 0.94 },
        odd: { red: 1, green: 1, blue: 1 },
      },
      teal: {
        header: { red: 0.06, green: 0.49, blue: 0.53 },
        even: { red: 0.94, green: 0.99, blue: 0.99 },
        odd: { red: 1, green: 1, blue: 1 },
      },
    };
    const palette = paletteByStyle[style] || paletteByStyle.light_gray;
    const headerBg: sheets_v4.Schema$Color = palette.header;
    const evenBg: sheets_v4.Schema$Color = palette.even;

    const oddBg: sheets_v4.Schema$Color = palette.odd;

    const requests: sheets_v4.Schema$Request[] = [];

    // 1) Freeze header row (best-effort, do not reduce existing frozen rows below header)
    if (hasHeader) {
      requests.push({
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: {
              frozenRowCount: Math.max(1, headerRowCount),
            },
          },
          fields: "gridProperties.frozenRowCount",
        },
      });
    }

    // 2) Add a basic filter over the range
    requests.push({
      setBasicFilter: {
        filter: {
          range: gridRange,
        },
      },
    });

    // 3) Header formatting
    if (headerRange) {
      requests.push({
        repeatCell: {
          range: headerRange,
          cell: {
            userEnteredFormat: {
              backgroundColor: headerBg,
              textFormat: { bold: true },
              horizontalAlignment: "CENTER",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
        },
      });
    }

    // 4) Banded rows on the entire range (Sheets API first-class)
    requests.push({
      addBanding: {
        bandedRange: {
          range: gridRange,
          rowProperties: {
            firstBandColor: evenBg,
            secondBandColor: oddBg,
          },
        },
      },
    });

    await this.sheetsClient.batchUpdate(spreadsheetId, requests, ctx);
  }

  private resolveSheetId(
    spreadsheet: sheets_v4.Schema$Spreadsheet,
    sheetName: string,
    fallbackSheetId?: number,
  ): number {
    const match = spreadsheet.sheets?.find((sheet) => sheet.properties?.title === sheetName);
    const foundId = match?.properties?.sheetId;
    if (typeof foundId === "number") return foundId;
    if (typeof fallbackSheetId === "number") return fallbackSheetId;
    throw new SheetsClientError(`Sheet "${sheetName}" not found in spreadsheet.`, { code: "SHEET_NOT_FOUND", retryable: false });
  }

  private parseRange(rangeA1: string): ParsedRange {
    const [sheetPartRaw, cellPartRaw] = rangeA1.includes("!") ? rangeA1.split("!") : ["Sheet1", rangeA1];
    const sheetName = sheetPartRaw.replace(/^'/, "").replace(/'$/, "").trim();
    if (!sheetName) throw new SheetsClientError("Table range must include a sheet name.", { code: "INVALID_TABLE_RANGE", retryable: false });

    const [startCellRaw, endCellRaw] = cellPartRaw.includes(":") ? cellPartRaw.split(":") : [cellPartRaw, cellPartRaw];
    const start = this.parseCell(startCellRaw);
    const end = this.parseCell(endCellRaw);

    const startColumnIndex = Math.min(start.columnIndex, end.columnIndex);
    const endColumnIndexExclusive = Math.max(start.columnIndex, end.columnIndex) + 1;
    const startRowIndex = Math.min(start.rowIndex, end.rowIndex);
    const endRowIndexExclusive = Math.max(start.rowIndex, end.rowIndex) + 1;

    return { sheetName, startColumnIndex, endColumnIndexExclusive, startRowIndex, endRowIndexExclusive };
  }

  private parseCell(cell: string): { rowIndex: number; columnIndex: number } {
    const normalized = String(cell || "").replace(/\$/g, "").toUpperCase().trim();
    const match = normalized.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      throw new SheetsClientError(`Invalid A1 cell reference: ${cell}`, { code: "INVALID_A1_CELL", retryable: false });
    }
    return {
      rowIndex: Number(match[2]) - 1,
      columnIndex: this.columnLettersToIndex(match[1]),
    };
  }

  private columnLettersToIndex(columnLetters: string): number {
    let result = 0;
    for (const char of columnLetters) result = result * 26 + (char.charCodeAt(0) - 64);
    return result - 1;
  }
}

export default SheetsTableService;
