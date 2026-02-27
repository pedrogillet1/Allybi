import {
  EditHandlerService,
  type EditHandlerRequest,
  type EditHandlerResponse,
} from "../../core/handlers/editHandler.service";
import type { EditingAgentDependencies, EditingDomainAgent } from "./types";

export class DefaultEditAgentService implements EditingDomainAgent {
  readonly domain = "default" as const;
  readonly id = "edit_agent_default" as const;
  private readonly handler: EditHandlerService;

  constructor(deps?: EditingAgentDependencies) {
    this.handler = new EditHandlerService({
      revisionStore: deps?.revisionStore,
      telemetry: deps?.telemetry,
    });
  }

  async execute(input: EditHandlerRequest): Promise<EditHandlerResponse> {
    return this.handler.execute(input);
  }
}
