// DOCX editing infrastructure
export { DocxEditorService } from "../../../services/editing/docx/docxEditor.service";
export { DocxAnchorsService } from "../../../services/editing/docx/docxAnchors.service";
export type {
  ParagraphNode,
  RichRun,
  RichParagraphNode,
} from "../../../services/editing/docx/docxAnchors.service";
export { DocxValidatorsService } from "../../../services/editing/docx/docxValidators.service";

// XLSX editing infrastructure
export { XlsxFileEditorService } from "../../../services/editing/xlsx/xlsxFileEditor.service";
export type { XlsxCellValue } from "../../../services/editing/xlsx/xlsxFileEditor.service";
export { XlsxInspectorService } from "../../../services/editing/xlsx/xlsxInspector.service";
export type { InferredXlsxRange } from "../../../services/editing/xlsx/xlsxInspector.service";

// Spreadsheet model — in-memory Excel representation
export * from "../../../services/editing/spreadsheetModel";

// Google Sheets editing
export { SheetsEditorService } from "../../../services/editing/sheets/sheetsEditor.service";
export { SheetsClientService } from "../../../services/editing/sheets/sheetsClient.service";
export type {
  SheetsRequestContext,
  SheetsValue,
  SheetsValueGrid,
} from "../../../services/editing/sheets/sheetsClient.service";
export { SheetsValidatorsService } from "../../../services/editing/sheets/sheetsValidators.service";

// Google Slides editing
export { SlidesEditorService } from "../../../services/editing/slides/slidesEditor.service";
export { SlidesClientService } from "../../../services/editing/slides/slidesClient.service";
export type { SlidesRequestContext } from "../../../services/editing/slides/slidesClient.service";
export { SlidesValidatorsService } from "../../../services/editing/slides/slidesValidators.service";
