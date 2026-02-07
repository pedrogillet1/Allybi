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

/**
 * Production-safe sheet editor.
 */
export class SheetsEditorService {
  private readonly validators: SheetsValidatorsService;

  constructor(private readonly sheetsClient: SheetsClientService = new SheetsClientService()) {
    this.validators = new SheetsValidatorsService(this.sheetsClient);
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
}

export default SheetsEditorService;
