import type { ChatRequest } from "../domain/chat.contracts";
import { getOptionalBank } from "../../domain/infra";
import { asObject } from "./chatComposeShared";

export class RuntimeOperatorPlaybookBuilder {
  buildOperatorPlaybookContext(
    req: ChatRequest,
  ): Record<string, unknown> | null {
    const meta = asObject(req.meta);
    const domain = this.resolvePlaybookDomain(meta.domain || meta.domainId);
    const operator = this.resolvePlaybookOperator(meta.operator);
    if (!domain || !operator) return null;

    const bankId = `operator_playbook_${operator}_${domain}`;
    const bank = getOptionalBank<Record<string, unknown>>(bankId);
    const bankConfig = asObject(bank?.config);
    if (!bank || bankConfig.enabled === false) return null;

    const bankRecord = bank as Record<string, unknown>;
    const lookFor = Array.isArray(bankRecord.lookFor)
      ? (bankRecord.lookFor as unknown[]).slice(0, 16)
      : [];
    const outputStructure = asObject(bankRecord.outputStructure);
    const requiredBlocks = Array.isArray(outputStructure.requiredBlocks)
      ? outputStructure.requiredBlocks.slice(0, 8)
      : [];
    const askQuestionWhen = Array.isArray(bankRecord.askQuestionWhen)
      ? (bankRecord.askQuestionWhen as unknown[])
          .slice(0, 3)
          .map((item) => String(asObject(item).questionTemplate || "").trim())
          .filter(Boolean)
      : [];
    const validationChecks = Array.isArray(bankRecord.validationChecks)
      ? (bankRecord.validationChecks as unknown[])
          .slice(0, 8)
          .map((item) => String(asObject(item).check || "").trim())
          .filter(Boolean)
      : [];

    return {
      bankId,
      operator,
      domain,
      deterministic: bankConfig.deterministic !== false,
      outputPolicy: bankConfig.outputPolicy || null,
      lookFor,
      requiredBlocks,
      askQuestionWhen,
      validationChecks,
    };
  }

  private resolvePlaybookDomain(
    value: unknown,
  ): "finance" | "legal" | "medical" | "ops" | null {
    const domain = String(value || "").trim().toLowerCase();
    if (!domain) return null;
    if (domain === "finance" || domain === "legal" || domain === "medical" || domain === "ops") {
      return domain;
    }
    if (
      domain === "accounting" ||
      domain === "banking" ||
      domain === "billing" ||
      domain === "tax"
    ) {
      return "finance";
    }
    if (domain === "hr_payroll" || domain === "travel" || domain === "education") {
      return "ops";
    }
    return null;
  }

  private resolvePlaybookOperator(value: unknown): string | null {
    const operator = String(value || "").trim().toLowerCase();
    if (!operator) return null;
    const map: Record<string, string> = {
      navigate: "navigate",
      open: "open",
      where: "locate",
      locate_docs: "navigate",
      locate_file: "locate",
      locate_content: "locate",
      summarize: "summarize",
      extract: "extract",
      compare: "compare",
      compute: "calculate",
      validate: "validate",
      advise: "advise",
      monitor: "monitor",
      evaluate: "evaluate",
      calculate: "calculate",
    };
    return map[operator] || null;
  }
}
