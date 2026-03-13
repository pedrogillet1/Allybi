// Edit handler — top-level entry point for edit requests
export type {
  EditHandlerRequest,
  EditHandlerResponse,
} from "../../../services/core/handlers/editHandler.service";
export { EditHandlerService } from "../../../services/core/handlers/editHandler.service";

export {
  EditingFacadeService,
} from "../../../services/editing";

export type {
  DocxParagraphNode,
  EditDomain,
  EditOperator,
  ResolvedTarget,
  ResolvedTargetCandidate,
  SheetsTargetNode,
  SlidesTargetNode,
} from "../../../services/editing";
