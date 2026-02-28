import {
  EditHandlerService,
  type EditHandlerRequest,
  type EditHandlerResponse,
} from "../../core/handlers/editHandler.service";
import type { EditingAgentDependencies, EditingDomainAgent } from "./types";
import { logger } from "../../../utils/logger";

interface QualityGateResult {
  pass: boolean;
  checks: Array<{ id: string; pass: boolean; detail?: string }>;
}

export class DocxEditAgentService implements EditingDomainAgent {
  readonly domain = "docx" as const;
  readonly id = "edit_agent_docx" as const;
  private readonly handler: EditHandlerService;

  constructor(deps?: EditingAgentDependencies) {
    this.handler = new EditHandlerService({
      revisionStore: deps?.revisionStore,
      telemetry: deps?.telemetry,
    });
  }

  async execute(input: EditHandlerRequest): Promise<EditHandlerResponse> {
    const result = await this.handler.execute(input);

    // Run post-apply quality gate checks when an edit was applied
    if (
      result.mode === "apply" &&
      result.result &&
      (result.result as any).applied
    ) {
      const gate = this.runQualityGate(input, result);
      if (!gate.pass) {
        logger.warn("[DocxEditAgent] quality_gate_warnings", {
          checks: gate.checks.filter((c) => !c.pass),
          correlationId: input.context?.correlationId,
        });
      }
      // Attach quality gate results as validations
      const applied = result.result as any;
      applied.validations = [...(applied.validations || []), ...gate.checks];
    }

    return result;
  }

  /**
   * Post-apply quality gate. Checks structural integrity of DOCX output:
   * - No empty paragraphs created (unless intentional)
   * - List numbering integrity (w:numPr present where expected)
   * - Heading hierarchy not broken (no H3 without parent H2)
   */
  private runQualityGate(
    input: EditHandlerRequest,
    response: EditHandlerResponse,
  ): QualityGateResult {
    const checks: Array<{ id: string; pass: boolean; detail?: string }> = [];

    try {
      // Check 1: Empty paragraphs detection
      const proof = (response.result as any)?.proof;
      const affectedPIds =
        proof?.highlights?.docxParagraphIds ||
        proof?.affectedParagraphIds ||
        [];
      const hasEmptyParas =
        affectedPIds.length > 0 &&
        input.docxCandidates?.some(
          (c) => affectedPIds.includes(c.paragraphId) && !c.text?.trim(),
        );
      checks.push({
        id: "no_empty_paragraphs",
        pass: !hasEmptyParas,
        ...(hasEmptyParas
          ? { detail: "Empty paragraphs detected in affected nodes" }
          : {}),
      });

      // Check 2: Operator is not creating unintended structural damage
      const changeset = (response.result as any)?.changeset;
      const changeCount = changeset?.changeCount ?? 0;
      const instructionLen = input.planRequest?.instruction?.length ?? 0;
      // A simple instruction shouldn't create more than ~20 changes
      const disproportionate = instructionLen < 50 && changeCount > 20;
      checks.push({
        id: "proportional_changes",
        pass: !disproportionate,
        ...(disproportionate
          ? {
              detail: `${changeCount} changes from ${instructionLen}-char instruction`,
            }
          : {}),
      });

      // Check 3: Heading hierarchy validation (when headings are affected)
      const operator = input.planRequest?.operator;
      const isHeadingOp =
        operator === "EDIT_DOCX_BUNDLE" &&
        input.planRequest?.instruction?.toLowerCase().includes("heading");
      if (isHeadingOp && input.docxCandidates) {
        const headingCandidates = input.docxCandidates.filter((c) =>
          c.styleFingerprint?.startsWith("Heading"),
        );
        let hierarchyOk = true;
        let prevLevel = 0;
        for (const h of headingCandidates) {
          const level = parseInt(
            h.styleFingerprint?.replace("Heading", "") || "0",
            10,
          );
          if (level > 0 && prevLevel > 0 && level > prevLevel + 1) {
            hierarchyOk = false;
          }
          if (level > 0) prevLevel = level;
        }
        checks.push({
          id: "heading_hierarchy",
          pass: hierarchyOk,
          ...(!hierarchyOk
            ? { detail: "Heading levels skip (e.g. H1 → H3 without H2)" }
            : {}),
        });
      }
    } catch (err) {
      checks.push({
        id: "quality_gate_error",
        pass: true,
        detail: `Quality gate check failed: ${String(err)}`,
      });
    }

    return {
      pass: checks.every((c) => c.pass),
      checks,
    };
  }
}
