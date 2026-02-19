import type { EditRevisionStore, EditTelemetry } from "../editing.types";
import {
  EditHandlerService,
  type EditHandlerRequest,
  type EditHandlerResponse,
} from "../../core/handlers/editHandler.service";

export type EditingFacadeRequest = EditHandlerRequest;
export type EditingFacadeResponse = EditHandlerResponse;

/**
 * Single internal entrypoint for editing plan/preview/apply/undo.
 * Controllers should depend on this facade rather than wiring orchestrator
 * internals directly.
 */
export class EditingFacadeService {
  private readonly handler: EditHandlerService;

  constructor(opts?: {
    revisionStore?: EditRevisionStore;
    telemetry?: EditTelemetry;
  }) {
    this.handler = new EditHandlerService({
      revisionStore: opts?.revisionStore,
      telemetry: opts?.telemetry,
    });
  }

  async execute(input: EditingFacadeRequest): Promise<EditingFacadeResponse> {
    return this.handler.execute(input);
  }
}
