import type { EditRevisionStore, EditTelemetry } from "../editing.types";
import {
  type EditHandlerRequest,
  type EditHandlerResponse,
} from "../../core/handlers/editHandler.service";
import {
  EditingAgentRouterService,
  type EditingAgentExecution,
} from "./editingAgentRouter.service";

export type EditingFacadeRequest = EditHandlerRequest;
export type EditingFacadeResponse = EditHandlerResponse;
export type EditingFacadeExecution = EditingAgentExecution;

/**
 * Single internal entrypoint for editing plan/preview/apply/undo.
 * Controllers should depend on this facade rather than wiring orchestrator
 * internals directly.
 */
export class EditingFacadeService {
  private readonly agentRouter: EditingAgentRouterService;

  constructor(opts?: {
    revisionStore?: EditRevisionStore;
    telemetry?: EditTelemetry;
  }) {
    this.agentRouter = new EditingAgentRouterService({
      revisionStore: opts?.revisionStore,
      telemetry: opts?.telemetry,
    });
  }

  async execute(input: EditingFacadeRequest): Promise<EditingFacadeResponse> {
    const executed = await this.agentRouter.execute(input);
    return executed.response;
  }

  async executeWithAgent(
    input: EditingFacadeRequest,
  ): Promise<EditingFacadeExecution> {
    return this.agentRouter.execute(input);
  }
}
