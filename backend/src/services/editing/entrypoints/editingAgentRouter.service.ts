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
import { safeEditingBank } from "../banks/bankService";

export interface EditingAgentExecution {
  agentId: EditingAgentId;
  response: EditHandlerResponse;
}

type DomainAgent = {
  domain: "docx" | "sheets";
  agentId: EditingAgentId;
  handler: EditingDomainAgent;
};

type EditingAgentPolicyBank = {
  config?: {
    enabled?: boolean;
    defaultAgentId?: string;
    domainAgentMap?: Record<string, string>;
  };
};

function resolveRoutableDomain(value: unknown): "docx" | "sheets" | null {
  if (value === "docx") return "docx";
  if (value === "sheets") return "sheets";
  return null;
}

function normalizeAgentId(value: unknown): EditingAgentId | null {
  const agentId = String(value || "").trim();
  if (agentId === "edit_agent_docx") return "edit_agent_docx";
  if (agentId === "edit_agent_sheets") return "edit_agent_sheets";
  if (agentId === "edit_agent_default") return "edit_agent_default";
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
    const configuredAgentId = this.resolveAgentIdFromPolicy(domain);
    if (!domain || configuredAgentId === "edit_agent_default") {
      return {
        agentId: "edit_agent_default",
        response: await this.fallbackAgent.execute(input),
      };
    }

    const selected = this.domainAgents.find(
      (agent) => agent.agentId === configuredAgentId,
    );
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

  private resolveAgentIdFromPolicy(
    domain: "docx" | "sheets" | null,
  ): EditingAgentId {
    const policy = safeEditingBank<EditingAgentPolicyBank>("editing_agent_policy");
    const config = policy?.config;
    if (!config || config.enabled === false) {
      return domain === "sheets" ? "edit_agent_sheets" : "edit_agent_docx";
    }

    const fallback =
      normalizeAgentId(config.defaultAgentId) || "edit_agent_default";
    if (!domain) return fallback;

    const mapped = normalizeAgentId(config.domainAgentMap?.[domain]);
    return mapped || fallback;
  }
}
