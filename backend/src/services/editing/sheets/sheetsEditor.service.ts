import type { sheets_v4 } from 'googleapis';
import {
  SheetsClientError,
  SheetsClientService,
  type SheetsRequestContext,
  type SheetsValue,
  type SheetsValueGrid,
} from './sheetsClient.service';
import { SheetsValidatorsService } from './sheetsValidators.service';

export interface CreateSheetResult {
  sheetId: number;
  title: string;
}

export interface EditOperationResult {
  updatedRange?: string;
  updatedRows?: number;
  updatedColumns?: number;
  updatedCells?: number;
}

export interface SheetsSortSpecInput {
  dimensionIndex: number;
  sortOrder?: "ASCENDING" | "DESCENDING";
}

export interface SheetsDataValidationInput {
  type: "ONE_OF_LIST" | "NUMBER_BETWEEN" | "NUMBER_GREATER" | "TEXT_CONTAINS";
  values?: string[];
  min?: number;
  max?: number;
  strict?: boolean;
  inputMessage?: string;
  showCustomUi?: boolean;
}

export interface SheetsConditionalFormatInput {
  type: "NUMBER_GREATER" | "NUMBER_LESS" | "TEXT_CONTAINS";
  value: string | number;
  backgroundHex?: string;
  textHex?: string;
}

/**
 * Production-safe sheet editor.
 */
export class SheetsEditorService {
  private readonly validators: SheetsValidatorsService;

  constructor(private readonly sheetsClient: SheetsClientService = new SheetsClientService()) {
    this.validators = new SheetsValidatorsService(this.sheetsClient);
  }

  async getSpreadsheet(
    spreadsheetId: string,
    ctx?: SheetsRequestContext,
  ): Promise<sheets_v4.Schema$Spreadsheet> {
    return this.sheetsClient.getSpreadsheet(spreadsheetId, ctx);
  }

  async getSheetIdByName(
    spreadsheetId: string,
    sheetName: string,
    ctx?: SheetsRequestContext,
  ): Promise<number> {
    const normalized = this.assertSheetName(sheetName);
    const spreadsheet = await this.sheetsClient.getSpreadsheet(spreadsheetId, ctx);
    const match = spreadsheet.sheets?.find((s) => s.properties?.title === normalized);
    const id = match?.properties?.sheetId;
    if (typeof id !== 'number') {
      throw new SheetsClientError(`Sheet "${normalized}" not found.`, {
        code: 'SHEET_NOT_FOUND',
        retryable: false,
      });
    }
    return id;
  }

  async insertRows(
    spreadsheetId: string,
    sheetIdOrName: number | string,
    startIndex: number,
    count: number,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const { sheetId } = await this.resolveSheetId(spreadsheetId, sheetIdOrName, ctx);
    this.assertRowIndex(startIndex, "startIndex");
    this.assertPositiveCount(count, "count");

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          insertDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex,
              endIndex: startIndex + count,
            },
            inheritFromBefore: true,
          },
        },
      ],
      ctx,
    );
  }

  async deleteRows(
    spreadsheetId: string,
    sheetIdOrName: number | string,
    startIndex: number,
    count: number,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const { sheetId, maxRows } = await this.resolveSheetId(spreadsheetId, sheetIdOrName, ctx);
    this.assertRowIndex(startIndex, "startIndex");
    this.assertPositiveCount(count, "count");
    if (maxRows != null && startIndex + count > maxRows) {
      throw new SheetsClientError("Row delete out of bounds for this sheet.", {
        code: "ROW_INDEX_OUT_OF_BOUNDS",
        retryable: false,
      });
    }

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex,
              endIndex: startIndex + count,
            },
          },
        },
      ],
      ctx,
    );
  }

  async insertColumns(
    spreadsheetId: string,
    sheetIdOrName: number | string,
    startIndex: number,
    count: number,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const { sheetId } = await this.resolveSheetId(spreadsheetId, sheetIdOrName, ctx);
    this.assertColumnIndex(startIndex, "startIndex");
    this.assertPositiveCount(count, "count");

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          insertDimension: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex,
              endIndex: startIndex + count,
            },
            inheritFromBefore: true,
          },
        },
      ],
      ctx,
    );
  }

  async deleteColumns(
    spreadsheetId: string,
    sheetIdOrName: number | string,
    startIndex: number,
    count: number,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const { sheetId, maxCols } = await this.resolveSheetId(spreadsheetId, sheetIdOrName, ctx);
    this.assertColumnIndex(startIndex, "startIndex");
    this.assertPositiveCount(count, "count");
    if (maxCols != null && startIndex + count > maxCols) {
      throw new SheetsClientError("Column delete out of bounds for this sheet.", {
        code: "COLUMN_INDEX_OUT_OF_BOUNDS",
        retryable: false,
      });
    }

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex,
              endIndex: startIndex + count,
            },
          },
        },
      ],
      ctx,
    );
  }

  private async resolveSheetId(
    spreadsheetId: string,
    sheetIdOrName: number | string,
    ctx?: SheetsRequestContext,
  ): Promise<{ sheetId: number; maxRows?: number; maxCols?: number }> {
    if (typeof sheetIdOrName === "number") {
      this.assertSheetId(sheetIdOrName);
      const spreadsheet = await this.sheetsClient.getSpreadsheet(spreadsheetId, ctx);
      const sheet = spreadsheet.sheets?.find((s) => s.properties?.sheetId === sheetIdOrName);
      if (!sheet) {
        throw new SheetsClientError(`Sheet id ${sheetIdOrName} not found.`, {
          code: "SHEET_NOT_FOUND",
          retryable: false,
        });
      }
      return {
        sheetId: sheetIdOrName,
        maxRows: sheet.properties?.gridProperties?.rowCount ?? undefined,
        maxCols: sheet.properties?.gridProperties?.columnCount ?? undefined,
      };
    }

    const name = this.assertSheetName(String(sheetIdOrName));
    const spreadsheet = await this.sheetsClient.getSpreadsheet(spreadsheetId, ctx);
    const sheet = spreadsheet.sheets?.find((s) => s.properties?.title === name);
    const id = sheet?.properties?.sheetId;
    if (typeof id !== "number") {
      throw new SheetsClientError(`Sheet "${name}" not found.`, {
        code: "SHEET_NOT_FOUND",
        retryable: false,
      });
    }
    return {
      sheetId: id,
      maxRows: sheet?.properties?.gridProperties?.rowCount ?? undefined,
      maxCols: sheet?.properties?.gridProperties?.columnCount ?? undefined,
    };
  }

  async createSheet(
    spreadsheetId: string,
    title: string,
    ctx?: SheetsRequestContext,
  ): Promise<CreateSheetResult> {
    const normalizedTitle = this.normalizeSheetTitle(title);

    const spreadsheet = await this.sheetsClient.getSpreadsheet(spreadsheetId, ctx);
    const alreadyExists = spreadsheet.sheets?.some((sheet) => sheet.properties?.title === normalizedTitle);
    if (alreadyExists) {
      throw new SheetsClientError(`Sheet "${normalizedTitle}" already exists.`, {
        code: 'SHEET_ALREADY_EXISTS',
        retryable: false,
      });
    }

    const response = await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          addSheet: {
            properties: {
              title: normalizedTitle,
            },
          },
        },
      ],
      ctx,
    );

    const sheetId = response.replies?.[0]?.addSheet?.properties?.sheetId;
    if (typeof sheetId !== 'number') {
      throw new SheetsClientError('Sheet created but no sheetId returned.', {
        code: 'MISSING_SHEET_ID',
        retryable: false,
      });
    }

    return { sheetId, title: normalizedTitle };
  }

  async renameSheet(
    spreadsheetId: string,
    sheetId: number,
    newTitle: string,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    this.assertSheetId(sheetId);
    const normalizedTitle = this.normalizeSheetTitle(newTitle);

    const spreadsheet = await this.sheetsClient.getSpreadsheet(spreadsheetId, ctx);
    const sheet = spreadsheet.sheets?.find((entry) => entry.properties?.sheetId === sheetId);
    if (!sheet) {
      throw new SheetsClientError(`Sheet id ${sheetId} not found.`, {
        code: 'SHEET_NOT_FOUND',
        retryable: false,
      });
    }

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              title: normalizedTitle,
            },
            fields: 'title',
          },
        },
      ],
      ctx,
    );
  }

  async deleteSheet(
    spreadsheetId: string,
    sheetIdOrName: number | string,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const { sheetId } = await this.resolveSheetId(spreadsheetId, sheetIdOrName, ctx);
    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          deleteSheet: {
            sheetId,
          },
        },
      ],
      ctx,
    );
  }

  async editCell(
    spreadsheetId: string,
    sheetName: string,
    a1: string,
    newValue: SheetsValue,
    ctx?: SheetsRequestContext,
  ): Promise<EditOperationResult> {
    const normalizedSheetName = this.assertSheetName(sheetName);
    const range = `${normalizedSheetName}!${a1}`;

    const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, range, ctx);
    if (!bounds.valid) {
      throw new SheetsClientError(bounds.reason ?? 'Cell out of bounds.', {
        code: 'RANGE_OUT_OF_BOUNDS',
        retryable: false,
      });
    }

    const response = await this.sheetsClient.setValues(spreadsheetId, range, [[newValue]], ctx);

    return {
      updatedRange: response.updatedRange ?? range,
      updatedRows: response.updatedRows ?? 1,
      updatedColumns: response.updatedColumns ?? 1,
      updatedCells: response.updatedCells ?? 1,
    };
  }

  async editRange(
    spreadsheetId: string,
    rangeA1: string,
    values: SheetsValueGrid,
    ctx?: SheetsRequestContext,
  ): Promise<EditOperationResult> {
    this.assertValues(values);

    const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, rangeA1, ctx);
    if (!bounds.valid) {
      throw new SheetsClientError(bounds.reason ?? 'Range out of bounds.', {
        code: 'RANGE_OUT_OF_BOUNDS',
        retryable: false,
      });
    }

    const response = await this.sheetsClient.setValues(spreadsheetId, rangeA1, values, ctx);

    return {
      updatedRange: response.updatedRange ?? rangeA1,
      updatedRows: response.updatedRows ?? values.length,
      updatedColumns: response.updatedColumns ?? values[0].length,
      updatedCells: response.updatedCells ?? values.length * values[0].length,
    };
  }

  async moveColumn(
    spreadsheetId: string,
    sheetId: number,
    columnIndex: number,
    destinationIndex: number,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    this.assertSheetId(sheetId);
    this.assertColumnIndex(columnIndex, 'columnIndex');
    this.assertColumnIndex(destinationIndex, 'destinationIndex');

    if (columnIndex === destinationIndex) return;

    const spreadsheet = await this.sheetsClient.getSpreadsheet(spreadsheetId, ctx);
    const targetSheet = spreadsheet.sheets?.find((sheet) => sheet.properties?.sheetId === sheetId);

    if (!targetSheet?.properties?.gridProperties?.columnCount) {
      throw new SheetsClientError(`Sheet id ${sheetId} not found or missing grid metadata.`, {
        code: 'SHEET_NOT_FOUND',
        retryable: false,
      });
    }

    const maxColumns = targetSheet.properties.gridProperties.columnCount;
    if (columnIndex >= maxColumns || destinationIndex > maxColumns) {
      throw new SheetsClientError('Column index out of bounds for this sheet.', {
        code: 'COLUMN_INDEX_OUT_OF_BOUNDS',
        retryable: false,
      });
    }

    const request: sheets_v4.Schema$Request = {
      moveDimension: {
        source: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: columnIndex,
          endIndex: columnIndex + 1,
        },
        destinationIndex,
      },
    };

    await this.sheetsClient.batchUpdate(spreadsheetId, [request], ctx);
  }

  async sortRange(
    spreadsheetId: string,
    rangeA1: string,
    sortSpecs: SheetsSortSpecInput[],
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const parsed = this.parseRangeA1(rangeA1);
    const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, rangeA1, ctx);
    if (!bounds.valid) {
      throw new SheetsClientError(bounds.reason ?? "Range out of bounds.", {
        code: "RANGE_OUT_OF_BOUNDS",
        retryable: false,
      });
    }
    const { sheetId } = await this.resolveSheetId(spreadsheetId, parsed.sheetName, ctx);
    const specs = (Array.isArray(sortSpecs) ? sortSpecs : [])
      .filter((s) => Number.isInteger(s?.dimensionIndex))
      .map((s) => ({
        dimensionIndex: Number(s.dimensionIndex),
        sortOrder: String(s.sortOrder || "ASCENDING").toUpperCase() === "DESCENDING" ? "DESCENDING" : "ASCENDING",
      }));
    if (!specs.length) {
      throw new SheetsClientError("sort_range requires at least one valid sort spec.", {
        code: "INVALID_SORT_SPEC",
        retryable: false,
      });
    }

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          sortRange: {
            range: {
              sheetId,
              startRowIndex: parsed.startRowIndex,
              endRowIndex: parsed.endRowIndexExclusive,
              startColumnIndex: parsed.startColumnIndex,
              endColumnIndex: parsed.endColumnIndexExclusive,
            },
            sortSpecs: specs,
          },
        },
      ],
      ctx,
    );
  }

  async applyBasicFilter(
    spreadsheetId: string,
    rangeA1: string,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const parsed = this.parseRangeA1(rangeA1);
    const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, rangeA1, ctx);
    if (!bounds.valid) {
      throw new SheetsClientError(bounds.reason ?? "Range out of bounds.", {
        code: "RANGE_OUT_OF_BOUNDS",
        retryable: false,
      });
    }
    const { sheetId } = await this.resolveSheetId(spreadsheetId, parsed.sheetName, ctx);

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          setBasicFilter: {
            filter: {
              range: {
                sheetId,
                startRowIndex: parsed.startRowIndex,
                endRowIndex: parsed.endRowIndexExclusive,
                startColumnIndex: parsed.startColumnIndex,
                endColumnIndex: parsed.endColumnIndexExclusive,
              },
            },
          },
        },
      ],
      ctx,
    );
  }

  async clearBasicFilter(
    spreadsheetId: string,
    sheetIdOrName: number | string,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const { sheetId } = await this.resolveSheetId(spreadsheetId, sheetIdOrName, ctx);
    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          clearBasicFilter: {
            sheetId,
          },
        },
      ],
      ctx,
    );
  }

  async setNumberFormat(
    spreadsheetId: string,
    rangeA1: string,
    pattern: string,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const parsed = this.parseRangeA1(rangeA1);
    const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, rangeA1, ctx);
    if (!bounds.valid) {
      throw new SheetsClientError(bounds.reason ?? "Range out of bounds.", {
        code: "RANGE_OUT_OF_BOUNDS",
        retryable: false,
      });
    }
    const { sheetId } = await this.resolveSheetId(spreadsheetId, parsed.sheetName, ctx);
    const safePattern = String(pattern || "").trim();
    if (!safePattern) {
      throw new SheetsClientError("set_number_format requires a format pattern.", {
        code: "INVALID_NUMBER_FORMAT",
        retryable: false,
      });
    }

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: parsed.startRowIndex,
              endRowIndex: parsed.endRowIndexExclusive,
              startColumnIndex: parsed.startColumnIndex,
              endColumnIndex: parsed.endColumnIndexExclusive,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: this.inferNumberFormatType(safePattern),
                  pattern: safePattern,
                },
              },
            },
            fields: "userEnteredFormat.numberFormat",
          },
        },
      ],
      ctx,
    );
  }

  async formatRange(
    spreadsheetId: string,
    rangeA1: string,
    format: {
      color?: string;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      fontSizePt?: number;
      fontFamily?: string;
    },
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const parsed = this.parseRangeA1(rangeA1);
    const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, rangeA1, ctx);
    if (!bounds.valid) {
      throw new SheetsClientError(bounds.reason ?? "Range out of bounds.", {
        code: "RANGE_OUT_OF_BOUNDS", retryable: false,
      });
    }
    const { sheetId } = await this.resolveSheetId(spreadsheetId, parsed.sheetName, ctx);

    const textFormat: Record<string, unknown> = {};
    const fields: string[] = [];

    if (format.color) {
      const hex = format.color.replace(/^#/, '');
      textFormat.foregroundColor = {
        red:   parseInt(hex.slice(0, 2), 16) / 255,
        green: parseInt(hex.slice(2, 4), 16) / 255,
        blue:  parseInt(hex.slice(4, 6), 16) / 255,
      };
      fields.push('userEnteredFormat.textFormat.foregroundColor');
    }
    if (typeof format.bold === 'boolean') {
      textFormat.bold = format.bold;
      fields.push('userEnteredFormat.textFormat.bold');
    }
    if (typeof format.italic === 'boolean') {
      textFormat.italic = format.italic;
      fields.push('userEnteredFormat.textFormat.italic');
    }
    if (typeof format.underline === 'boolean') {
      textFormat.underline = format.underline;
      fields.push('userEnteredFormat.textFormat.underline');
    }
    if (format.fontSizePt && format.fontSizePt > 0) {
      textFormat.fontSize = format.fontSizePt;
      fields.push('userEnteredFormat.textFormat.fontSize');
    }
    if (format.fontFamily) {
      textFormat.fontFamily = format.fontFamily;
      fields.push('userEnteredFormat.textFormat.fontFamily');
    }

    if (!fields.length) return;

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [{
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: parsed.startRowIndex,
            endRowIndex: parsed.endRowIndexExclusive,
            startColumnIndex: parsed.startColumnIndex,
            endColumnIndex: parsed.endColumnIndexExclusive,
          },
          cell: { userEnteredFormat: { textFormat } },
          fields: fields.join(','),
        },
      }],
      ctx,
    );
  }

  async setFreezePanes(
    spreadsheetId: string,
    sheetIdOrName: number | string,
    frozenRowCount: number,
    frozenColumnCount: number,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const { sheetId } = await this.resolveSheetId(spreadsheetId, sheetIdOrName, ctx);
    const rows = Number.isInteger(frozenRowCount) && frozenRowCount >= 0 ? frozenRowCount : 0;
    const cols = Number.isInteger(frozenColumnCount) && frozenColumnCount >= 0 ? frozenColumnCount : 0;

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: {
                frozenRowCount: rows,
                frozenColumnCount: cols,
              },
            },
            fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
          },
        },
      ],
      ctx,
    );
  }

  async setDataValidation(
    spreadsheetId: string,
    rangeA1: string,
    input: SheetsDataValidationInput,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const parsed = this.parseRangeA1(rangeA1);
    const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, rangeA1, ctx);
    if (!bounds.valid) {
      throw new SheetsClientError(bounds.reason ?? "Range out of bounds.", {
        code: "RANGE_OUT_OF_BOUNDS",
        retryable: false,
      });
    }
    const { sheetId } = await this.resolveSheetId(spreadsheetId, parsed.sheetName, ctx);
    const condition = this.buildValidationCondition(input);

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: parsed.startRowIndex,
              endRowIndex: parsed.endRowIndexExclusive,
              startColumnIndex: parsed.startColumnIndex,
              endColumnIndex: parsed.endColumnIndexExclusive,
            },
            rule: {
              condition,
              strict: input.strict !== false,
              showCustomUi: input.showCustomUi !== false,
              inputMessage: String(input.inputMessage || "").trim() || undefined,
            },
          },
        },
      ],
      ctx,
    );
  }

  async clearDataValidation(
    spreadsheetId: string,
    rangeA1: string,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const parsed = this.parseRangeA1(rangeA1);
    const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, rangeA1, ctx);
    if (!bounds.valid) {
      throw new SheetsClientError(bounds.reason ?? "Range out of bounds.", {
        code: "RANGE_OUT_OF_BOUNDS",
        retryable: false,
      });
    }
    const { sheetId } = await this.resolveSheetId(spreadsheetId, parsed.sheetName, ctx);

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: parsed.startRowIndex,
              endRowIndex: parsed.endRowIndexExclusive,
              startColumnIndex: parsed.startColumnIndex,
              endColumnIndex: parsed.endColumnIndexExclusive,
            },
            rule: null as any,
          } as any,
        },
      ],
      ctx,
    );
  }

  async applyConditionalFormat(
    spreadsheetId: string,
    rangeA1: string,
    input: SheetsConditionalFormatInput,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const parsed = this.parseRangeA1(rangeA1);
    const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, rangeA1, ctx);
    if (!bounds.valid) {
      throw new SheetsClientError(bounds.reason ?? "Range out of bounds.", {
        code: "RANGE_OUT_OF_BOUNDS",
        retryable: false,
      });
    }
    const { sheetId } = await this.resolveSheetId(spreadsheetId, parsed.sheetName, ctx);
    const conditionType = String(input?.type || "").toUpperCase();
    const condValue = String(input?.value ?? "").trim();
    if (!condValue) {
      throw new SheetsClientError("apply_conditional_format requires a condition value.", {
        code: "INVALID_CONDITIONAL_FORMAT",
        retryable: false,
      });
    }
    if (!["NUMBER_GREATER", "NUMBER_LESS", "TEXT_CONTAINS"].includes(conditionType)) {
      throw new SheetsClientError("Unsupported conditional format type.", {
        code: "INVALID_CONDITIONAL_FORMAT",
        retryable: false,
      });
    }

    const bg = this.parseHexColor(input?.backgroundHex || "#FEF3C7");
    const fg = this.parseHexColor(input?.textHex || "#111827");

    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          addConditionalFormatRule: {
            index: 0,
            rule: {
              ranges: [
                {
                  sheetId,
                  startRowIndex: parsed.startRowIndex,
                  endRowIndex: parsed.endRowIndexExclusive,
                  startColumnIndex: parsed.startColumnIndex,
                  endColumnIndex: parsed.endColumnIndexExclusive,
                },
              ],
              booleanRule: {
                condition: {
                  type: conditionType as "NUMBER_GREATER" | "NUMBER_LESS" | "TEXT_CONTAINS",
                  values: [{ userEnteredValue: condValue }],
                },
                format: {
                  ...(bg
                    ? { backgroundColor: bg }
                    : {}),
                  ...(fg
                    ? { textFormat: { foregroundColor: fg } }
                    : {}),
                },
              },
            },
          },
        },
      ],
      ctx,
    );
  }

  async setPrintLayout(
    spreadsheetId: string,
    sheetIdOrName: number | string,
    opts: { hideGridlines?: boolean },
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const { sheetId } = await this.resolveSheetId(spreadsheetId, sheetIdOrName, ctx);
    await this.sheetsClient.batchUpdate(
      spreadsheetId,
      [
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: {
                hideGridlines: Boolean(opts?.hideGridlines),
              },
            },
            fields: "gridProperties.hideGridlines",
          },
        },
      ],
      ctx,
    );
  }

  private normalizeSheetTitle(title: string): string {
    const normalized = title.trim();
    if (!normalized) {
      throw new SheetsClientError('Sheet title must not be empty.', {
        code: 'INVALID_SHEET_TITLE',
        retryable: false,
      });
    }

    if (normalized.length > 100) {
      throw new SheetsClientError('Sheet title cannot exceed 100 characters.', {
        code: 'INVALID_SHEET_TITLE',
        retryable: false,
      });
    }

    return normalized;
  }

  private assertSheetName(sheetName: string): string {
    const normalized = sheetName.trim();
    if (!normalized) {
      throw new SheetsClientError('sheetName is required.', {
        code: 'INVALID_SHEET_NAME',
        retryable: false,
      });
    }
    return normalized;
  }

  private assertSheetId(sheetId: number): void {
    if (!Number.isInteger(sheetId) || sheetId < 0) {
      throw new SheetsClientError('sheetId must be a non-negative integer.', {
        code: 'INVALID_SHEET_ID',
        retryable: false,
      });
    }
  }

  private assertRowIndex(value: number, name: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new SheetsClientError(`${name} must be a non-negative integer.`, {
        code: "INVALID_ROW_INDEX",
        retryable: false,
      });
    }
  }

  private assertPositiveCount(value: number, name: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new SheetsClientError(`${name} must be a positive integer.`, {
        code: "INVALID_COUNT",
        retryable: false,
      });
    }
  }

  private assertColumnIndex(value: number, name: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new SheetsClientError(`${name} must be a non-negative integer.`, {
        code: 'INVALID_COLUMN_INDEX',
        retryable: false,
      });
    }
  }

  private assertValues(values: SheetsValueGrid): void {
    if (!Array.isArray(values) || values.length === 0 || values[0].length === 0) {
      throw new SheetsClientError('values must contain at least one row and one column.', {
        code: 'INVALID_VALUES',
        retryable: false,
      });
    }

    const width = values[0].length;
    if (values.some((row) => row.length !== width)) {
      throw new SheetsClientError('values rows must be rectangular (same number of columns).', {
        code: 'INVALID_VALUES',
        retryable: false,
      });
    }
  }

  private inferNumberFormatType(pattern: string): "NUMBER" | "CURRENCY" | "PERCENT" | "DATE" | "DATE_TIME" | "TEXT" {
    const p = String(pattern || "").trim();
    if (!p) return "NUMBER";
    if (/%/.test(p)) return "PERCENT";
    if (/\$|R\$|€|£|¥/.test(p)) return "CURRENCY";
    if (/[dy]/i.test(p) && /[m]/i.test(p)) {
      return /h|s/i.test(p) ? "DATE_TIME" : "DATE";
    }
    if (/@/.test(p)) return "TEXT";
    return "NUMBER";
  }

  private buildValidationCondition(input: SheetsDataValidationInput): sheets_v4.Schema$BooleanCondition {
    const type = String(input?.type || "").toUpperCase();
    if (type === "ONE_OF_LIST") {
      const values = (Array.isArray(input?.values) ? input.values : [])
        .map((v) => String(v || "").trim())
        .filter(Boolean);
      if (!values.length) {
        throw new SheetsClientError("ONE_OF_LIST validation requires non-empty values.", {
          code: "INVALID_DATA_VALIDATION",
          retryable: false,
        });
      }
      return {
        type: "ONE_OF_LIST",
        values: values.map((v) => ({ userEnteredValue: v })),
      };
    }
    if (type === "NUMBER_BETWEEN") {
      const min = Number(input?.min);
      const max = Number(input?.max);
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new SheetsClientError("NUMBER_BETWEEN validation requires numeric min and max.", {
          code: "INVALID_DATA_VALIDATION",
          retryable: false,
        });
      }
      return {
        type: "NUMBER_BETWEEN",
        values: [{ userEnteredValue: String(min) }, { userEnteredValue: String(max) }],
      };
    }
    if (type === "NUMBER_GREATER") {
      const min = Number(input?.min);
      if (!Number.isFinite(min)) {
        throw new SheetsClientError("NUMBER_GREATER validation requires numeric min.", {
          code: "INVALID_DATA_VALIDATION",
          retryable: false,
        });
      }
      return {
        type: "NUMBER_GREATER",
        values: [{ userEnteredValue: String(min) }],
      };
    }
    if (type === "TEXT_CONTAINS") {
      const token = String(input?.values?.[0] || "").trim();
      if (!token) {
        throw new SheetsClientError("TEXT_CONTAINS validation requires a token value.", {
          code: "INVALID_DATA_VALIDATION",
          retryable: false,
        });
      }
      return {
        type: "TEXT_CONTAINS",
        values: [{ userEnteredValue: token }],
      };
    }
    throw new SheetsClientError("Unsupported data validation type.", {
      code: "INVALID_DATA_VALIDATION",
      retryable: false,
    });
  }

  private parseHexColor(hex: string): sheets_v4.Schema$Color | null {
    const raw = String(hex || "").trim();
    const match = raw.match(/^#?([0-9a-fA-F]{6})$/);
    if (!match) return null;
    const h = match[1];
    const r = Number.parseInt(h.slice(0, 2), 16) / 255;
    const g = Number.parseInt(h.slice(2, 4), 16) / 255;
    const b = Number.parseInt(h.slice(4, 6), 16) / 255;
    return { red: r, green: g, blue: b };
  }

  private parseRangeA1(rangeA1: string): {
    sheetName: string;
    startColumnIndex: number;
    endColumnIndexExclusive: number;
    startRowIndex: number;
    endRowIndexExclusive: number;
  } {
    const raw = String(rangeA1 || "").trim();
    const bang = raw.indexOf("!");
    if (bang <= 0) {
      throw new SheetsClientError("Range must include a sheet name, e.g. Sheet1!A1:B10.", {
        code: "INVALID_RANGE",
        retryable: false,
      });
    }
    const sheetPartRaw = raw.slice(0, bang).trim();
    const cellPartRaw = raw.slice(bang + 1).trim();
    const sheetName = sheetPartRaw.replace(/^'/, "").replace(/'$/, "").replace(/''/g, "'").trim();
    if (!sheetName || !cellPartRaw) {
      throw new SheetsClientError("Invalid A1 range.", {
        code: "INVALID_RANGE",
        retryable: false,
      });
    }
    const [startCellRaw, endCellRaw] = cellPartRaw.includes(":") ? cellPartRaw.split(":") : [cellPartRaw, cellPartRaw];
    const start = this.parseA1Cell(startCellRaw);
    const end = this.parseA1Cell(endCellRaw);
    return {
      sheetName,
      startColumnIndex: Math.min(start.columnIndex, end.columnIndex),
      endColumnIndexExclusive: Math.max(start.columnIndex, end.columnIndex) + 1,
      startRowIndex: Math.min(start.rowIndex, end.rowIndex),
      endRowIndexExclusive: Math.max(start.rowIndex, end.rowIndex) + 1,
    };
  }

  private parseA1Cell(cell: string): { rowIndex: number; columnIndex: number } {
    const normalized = String(cell || "").replace(/\$/g, "").toUpperCase().trim();
    const match = normalized.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      throw new SheetsClientError(`Invalid A1 cell reference: ${cell}`, {
        code: "INVALID_A1_CELL",
        retryable: false,
      });
    }
    const rowIndex = Number(match[2]) - 1;
    const columnIndex = this.columnLettersToIndex(match[1]);
    return { rowIndex, columnIndex };
  }

  private columnLettersToIndex(columnLetters: string): number {
    let result = 0;
    for (const char of columnLetters) result = result * 26 + (char.charCodeAt(0) - 64);
    return result - 1;
  }
}

export default SheetsEditorService;
