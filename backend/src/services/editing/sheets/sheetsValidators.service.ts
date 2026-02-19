import type { sheets_v4 } from "googleapis";
import {
  SheetsClientError,
  SheetsClientService,
  type SheetsRequestContext,
} from "./sheetsClient.service";

export interface SheetExistsResult {
  exists: boolean;
  sheetId?: number;
}

export interface RangeBoundsResult {
  valid: boolean;
  reason?: string;
}

export interface HeaderValidationResult {
  valid: boolean;
  headers: string[];
}

export interface ColumnCandidate {
  header: string;
  index: number;
  score: number;
}

export interface ColumnCandidateResult {
  candidates: ColumnCandidate[];
  ambiguous: boolean;
}

interface ParsedCell {
  row: number;
  column: number;
}

/**
 * Range/sheet/header validations + ambiguous column resolution.
 */
export class SheetsValidatorsService {
  constructor(
    private readonly sheetsClient: SheetsClientService = new SheetsClientService(),
  ) {}

  async validateSheetExists(
    spreadsheetId: string,
    sheetName: string,
    ctx?: SheetsRequestContext,
  ): Promise<SheetExistsResult> {
    const normalizedSheet = this.normalizeSheetName(sheetName);
    const spreadsheet = await this.sheetsClient.getSpreadsheet(
      spreadsheetId,
      ctx,
    );

    const sheet = spreadsheet.sheets?.find(
      (entry) => entry.properties?.title === normalizedSheet,
    );
    if (!sheet || typeof sheet.properties?.sheetId !== "number") {
      return { exists: false };
    }

    return { exists: true, sheetId: sheet.properties.sheetId };
  }

  async validateRangeWithinBounds(
    spreadsheetId: string,
    rangeA1: string,
    ctx?: SheetsRequestContext,
  ): Promise<RangeBoundsResult> {
    try {
      const parsed = this.parseRange(rangeA1);
      const spreadsheet = await this.sheetsClient.getSpreadsheet(
        spreadsheetId,
        ctx,
      );
      const sheet = spreadsheet.sheets?.find(
        (entry) => entry.properties?.title === parsed.sheetName,
      );

      if (!sheet?.properties?.gridProperties) {
        return { valid: false, reason: `Sheet not found: ${parsed.sheetName}` };
      }

      const rowCount = sheet.properties.gridProperties.rowCount ?? 0;
      const columnCount = sheet.properties.gridProperties.columnCount ?? 0;

      if (parsed.startCell.row < 1 || parsed.endCell.row < 1) {
        return { valid: false, reason: "Row index must start at 1." };
      }

      if (parsed.startCell.column < 1 || parsed.endCell.column < 1) {
        return { valid: false, reason: "Column index must start at 1." };
      }

      if (parsed.startCell.row > rowCount || parsed.endCell.row > rowCount) {
        return { valid: false, reason: "Row index out of bounds." };
      }

      if (
        parsed.startCell.column > columnCount ||
        parsed.endCell.column > columnCount
      ) {
        return { valid: false, reason: "Column index out of bounds." };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        reason:
          error instanceof Error ? error.message : "Invalid range syntax.",
      };
    }
  }

  async validateHeaderRowExists(
    spreadsheetId: string,
    sheetName: string,
    headerRow: number = 1,
    ctx?: SheetsRequestContext,
  ): Promise<HeaderValidationResult> {
    if (!Number.isInteger(headerRow) || headerRow < 1) {
      throw new SheetsClientError("headerRow must be an integer >= 1.", {
        code: "INVALID_HEADER_ROW",
        retryable: false,
      });
    }

    const normalizedSheet = this.normalizeSheetName(sheetName);
    const row = await this.sheetsClient.getValues(
      spreadsheetId,
      `${normalizedSheet}!${headerRow}:${headerRow}`,
      ctx,
    );
    const headers = (row.values?.[0] ?? [])
      .map((v) => String(v ?? "").trim())
      .filter(Boolean);

    return {
      valid: headers.length > 0,
      headers,
    };
  }

  resolveColumnCandidates(
    headerValues: string[],
    columnLabelQuery: string,
  ): ColumnCandidateResult {
    const normalizedQuery = this.normalize(columnLabelQuery);
    if (!normalizedQuery) {
      return { candidates: [], ambiguous: false };
    }

    const ranked = headerValues
      .map((header, index) => {
        const normalizedHeader = this.normalize(header);
        const score = this.score(normalizedHeader, normalizedQuery);
        return { header, index, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const ambiguous =
      ranked.length > 1 && ranked[0].score - ranked[1].score < 0.15;

    return {
      candidates: ranked,
      ambiguous,
    };
  }

  private parseRange(input: string): {
    sheetName: string;
    startCell: ParsedCell;
    endCell: ParsedCell;
  } {
    const [sheetPartRaw, rawRange] = input.includes("!")
      ? input.split("!")
      : ["Sheet1", input];

    const sheetName = this.normalizeSheetName(sheetPartRaw);
    if (!rawRange || !rawRange.trim()) {
      throw new Error("Range cells are required (e.g., A1:B10).");
    }

    const [startRaw, endRaw] = rawRange.includes(":")
      ? rawRange.split(":")
      : [rawRange, rawRange];

    const startCell = this.parseCell(startRaw);
    const endCell = this.parseCell(endRaw);

    return {
      sheetName,
      startCell: {
        row: Math.min(startCell.row, endCell.row),
        column: Math.min(startCell.column, endCell.column),
      },
      endCell: {
        row: Math.max(startCell.row, endCell.row),
        column: Math.max(startCell.column, endCell.column),
      },
    };
  }

  private parseCell(cell: string): ParsedCell {
    const normalized = cell.replace(/\$/g, "").toUpperCase().trim();
    const match = normalized.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      throw new Error(`Invalid A1 cell reference: ${cell}`);
    }

    return {
      row: Number(match[2]),
      column: this.columnToNumber(match[1]),
    };
  }

  private columnToNumber(columnLetters: string): number {
    let value = 0;
    for (const char of columnLetters) {
      value = value * 26 + (char.charCodeAt(0) - 64);
    }
    return value;
  }

  private normalize(input: string): string {
    return input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeSheetName(name: string): string {
    const normalized = name.replace(/^'/, "").replace(/'$/, "").trim();
    if (!normalized) {
      throw new Error("Sheet name is required.");
    }
    return normalized;
  }

  private score(header: string, query: string): number {
    if (!header || !query) return 0;
    if (header === query) return 1;

    if (header.includes(query) || query.includes(header)) {
      return 0.85;
    }

    const headerTokens = new Set(header.split(" ").filter(Boolean));
    const queryTokens = query.split(" ").filter(Boolean);

    if (queryTokens.length === 0) return 0;

    let overlap = 0;
    for (const token of queryTokens) {
      if (headerTokens.has(token)) overlap += 1;
    }

    if (overlap === 0) return 0;

    return overlap / queryTokens.length;
  }
}

export default SheetsValidatorsService;
