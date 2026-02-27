import type {
  EditHandlerRequest,
  EditHandlerResponse,
} from "../../core/handlers/editHandler.service";
import type {
  EditDomain,
  EditRevisionStore,
  EditTelemetry,
} from "../editing.types";

export type EditingAgentId =
  | "edit_agent_docx"
  | "edit_agent_sheets"
  | "edit_agent_default";

export interface EditingDomainAgent {
  readonly domain: EditDomain | "default";
  readonly id: EditingAgentId;
  execute(input: EditHandlerRequest): Promise<EditHandlerResponse>;
}

export interface EditingAgentDependencies {
  revisionStore?: EditRevisionStore;
  telemetry?: EditTelemetry;
}
