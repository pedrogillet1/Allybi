// Document outline — heading/section extraction
export type { OutlineItem } from "../../../services/documents/documentOutline.service";
export {
  DocumentOutlineService,
  documentOutline,
} from "../../../services/documents/documentOutline.service";

// Document compare — diff between document versions
export type { CompareResult } from "../../../services/documents/documentCompare.service";
export {
  DocumentCompareService,
  documentCompare,
} from "../../../services/documents/documentCompare.service";

// Document export
export type {
  ExportFormat,
  ExportContext,
  ExportRequest,
  ExportResult,
} from "../../../services/documents/export.service";
export {
  ExportService,
  ExportServiceError,
} from "../../../services/documents/export.service";

// Document revision tracking
export type {
  RevisionContext,
  CreateRevisionInput,
  RevisionRecord,
  ListRevisionsResult,
} from "../../../services/documents/revision.service";
export {
  RevisionService,
  RevisionServiceError,
} from "../../../services/documents/revision.service";
