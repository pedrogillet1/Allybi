import { logger } from "../../utils/logger";
import { getOptionalBank } from "../core/banks/bankLoader.service";
import {
  SpreadsheetEngineClient,
  SpreadsheetEngineClientError,
} from "./spreadsheetEngine.client";
import type {
  SpreadsheetEngineExecuteRequest,
  SpreadsheetEngineExecuteResponse,
  SpreadsheetEngineInsightRequest,
  SpreadsheetEngineInsightResponse,
  SpreadsheetEngineMode,
} from "./spreadsheetEngine.types";
import { coerceSpreadsheetEngineMode } from "./spreadsheetEngine.types";

type PythonSandboxPolicyBank = {
  _meta?: { id?: string; version?: string };
  config?: {
    enabled?: boolean;
    enforcementMode?: string;
  };
  rules?: Array<{
    category?: string;
    enforcement?: string;
    module?: string;
  }>;
};

type SandboxPolicyHint = {
  policyId: string;
  policyVersion: string;
  enforcementMode: string;
  imports: {
    allowed: string[];
    blocked: string[];
  };
};

function asTrimmed(value: unknown): string {
  return String(value || "").trim();
}

export class SpreadsheetEngineService {
  private readonly client: SpreadsheetEngineClient;
  private readonly modeValue: SpreadsheetEngineMode;
  private sandboxPolicyHint: SandboxPolicyHint | null | undefined = undefined;

  constructor(opts?: {
    client?: SpreadsheetEngineClient;
    mode?: SpreadsheetEngineMode;
  }) {
    this.modeValue =
      opts?.mode ??
      coerceSpreadsheetEngineMode(process.env.SPREADSHEET_ENGINE_MODE || "off");
    this.client = opts?.client ?? new SpreadsheetEngineClient();
  }

  mode(): SpreadsheetEngineMode {
    return this.modeValue;
  }

  enabled(): boolean {
    return this.modeValue !== "off";
  }

  async execute(
    req: SpreadsheetEngineExecuteRequest,
  ): Promise<SpreadsheetEngineExecuteResponse> {
    if (!this.enabled()) {
      throw new SpreadsheetEngineClientError("Spreadsheet engine mode is off", {
        code: "ENGINE_MODE_OFF",
        retryable: false,
      });
    }
    const sandboxPolicyHint = this.resolveSandboxPolicyHint();
    const response = await this.client.execute({
      ...req,
      options: {
        ...(req.options || {}),
        ...(sandboxPolicyHint ? { sandboxPolicy: sandboxPolicyHint } : {}),
      },
    });
    logger.info("[SpreadsheetEngine] execute", {
      requestId: req.requestId,
      documentId: req.documentId,
      spreadsheetId: req.spreadsheetId,
      mode: this.modeValue,
      status: response.status,
      warnings: Array.isArray(response.warnings) ? response.warnings.length : 0,
      traceId: response.proof?.trace_id,
    });
    return response;
  }

  async insight(
    req: SpreadsheetEngineInsightRequest,
  ): Promise<SpreadsheetEngineInsightResponse> {
    if (!this.enabled()) {
      throw new SpreadsheetEngineClientError("Spreadsheet engine mode is off", {
        code: "ENGINE_MODE_OFF",
        retryable: false,
      });
    }
    const response = await this.client.insight(req);
    logger.info("[SpreadsheetEngine] insight", {
      requestId: req.requestId,
      documentId: req.documentId,
      spreadsheetId: req.spreadsheetId,
      mode: this.modeValue,
      status: response.status,
    });
    return response;
  }

  private resolveSandboxPolicyHint(): SandboxPolicyHint | null {
    if (this.sandboxPolicyHint !== undefined) {
      return this.sandboxPolicyHint;
    }
    const bank = getOptionalBank<PythonSandboxPolicyBank>("python_sandbox_policy");
    if (!bank?.config?.enabled) {
      this.sandboxPolicyHint = null;
      return this.sandboxPolicyHint;
    }

    const rules = Array.isArray(bank.rules) ? bank.rules : [];
    const allowed = new Set<string>();
    const blocked = new Set<string>();
    for (const rule of rules) {
      if (asTrimmed(rule?.category).toLowerCase() !== "imports") continue;
      const module = asTrimmed(rule?.module);
      if (!module) continue;
      const enforcement = asTrimmed(rule?.enforcement).toLowerCase();
      if (enforcement === "allow") allowed.add(module);
      if (enforcement === "block") blocked.add(module);
    }

    this.sandboxPolicyHint = {
      policyId: asTrimmed(bank?._meta?.id) || "python_sandbox_policy",
      policyVersion: asTrimmed(bank?._meta?.version) || "unknown",
      enforcementMode:
        asTrimmed(bank?.config?.enforcementMode).toLowerCase() || "strict",
      imports: {
        allowed: Array.from(allowed).slice(0, 512),
        blocked: Array.from(blocked).slice(0, 512),
      },
    };
    return this.sandboxPolicyHint;
  }
}

export default SpreadsheetEngineService;
