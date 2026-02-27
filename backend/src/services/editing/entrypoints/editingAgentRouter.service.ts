import type {
  EditHandlerRequest,
  EditHandlerResponse,
} from "../../core/handlers/editHandler.service";
import type { EditRevisionStore, EditTelemetry } from "../editing.types";
import {
  DefaultEditAgentService,
  DocxEditAgentService,
  SheetsEditAgentService,
  type EditingAgentId,
  type EditingDomainAgent,
} from "../agents";

export interface EditingAgentExecution {
  agentId: EditingAgentId;
  response: EditHandlerResponse;
}

type DomainAgent = {
  domain: "docx" | "sheets";
  agentId: EditingAgentId;
  handler: EditingDomainAgent;
};

function resolveRoutableDomain(value: unknown): "docx" | "sheets" | null {
  if (value === "docx") return "docx";
  if (value === "sheets") return "sheets";
  return null;
}

export class EditingAgentRouterService {
  private readonly domainAgents: DomainAgent[];
  private readonly fallbackAgent: DefaultEditAgentService;

  constructor(opts?: {
    revisionStore?: EditRevisionStore;
    telemetry?: EditTelemetry;
  }) {
    const deps = {
      revisionStore: opts?.revisionStore,
      telemetry: opts?.telemetry,
    };
    const docxAgent = new DocxEditAgentService(deps);
    const sheetsAgent = new SheetsEditAgentService(deps);

    this.domainAgents = [
      {
        domain: "docx",
        agentId: "edit_agent_docx",
        handler: docxAgent,
      },
      {
        domain: "sheets",
        agentId: "edit_agent_sheets",
        handler: sheetsAgent,
      },
    ];

    this.fallbackAgent = new DefaultEditAgentService(deps);
  }

  async execute(input: EditHandlerRequest): Promise<EditingAgentExecution> {
    const domain = this.resolveDomain(input);
    if (!domain) {
      return {
        agentId: "edit_agent_default",
        response: await this.fallbackAgent.execute(input),
      };
    }

    const selected = this.domainAgents.find((agent) => agent.domain === domain);
    if (!selected) {
      return {
        agentId: "edit_agent_default",
        response: await this.fallbackAgent.execute(input),
      };
    }

    return {
      agentId: selected.agentId,
      response: await selected.handler.execute(input),
    };
  }

  private resolveDomain(input: EditHandlerRequest): "docx" | "sheets" | null {
    if (input.mode === "undo") return null;
    return resolveRoutableDomain(input.planRequest?.domain);
  }
}
