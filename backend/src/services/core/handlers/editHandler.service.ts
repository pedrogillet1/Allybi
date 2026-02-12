import {
  EditOrchestratorService,
  TargetResolverService,
  type DocxParagraphNode,
  type EditApplyResult,
  type EditExecutionContext,
  type EditPlanRequest,
  type EditPlanResult,
  type EditPreviewResult,
  type EditReceipt,
  type EditRevisionStore,
  type EditTelemetry,
  type ResolvedTarget,
  type SheetsTargetNode,
  type SlidesTargetNode,
  type UndoResult,
} from "../../editing";

type EditActionMode = "plan" | "preview" | "apply" | "undo";

export interface EditHandlerRequest {
  mode: EditActionMode;
  context: EditExecutionContext;
  planRequest?: EditPlanRequest;
  target?: ResolvedTarget;
  beforeText?: string;
  proposedText?: string;
  proposedHtml?: string;
  userConfirmed?: boolean;
  idempotencyKey?: string;
  expectedDocumentUpdatedAtIso?: string;
  expectedDocumentFileHash?: string;
  preserveTokens?: string[];
  // Resolution candidates if target is not pre-resolved.
  docxCandidates?: DocxParagraphNode[];
  sheetsCandidates?: SheetsTargetNode[];
  slidesCandidates?: SlidesTargetNode[];
  undo?: {
    documentId: string;
    revisionId?: string;
  };
}

export interface EditHandlerResponse {
  ok: boolean;
  mode: EditActionMode;
  result?: EditPlanResult | EditPreviewResult | EditApplyResult | UndoResult;
  receipt?: EditReceipt;
  requiresUserChoice?: boolean;
  error?: string;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function syntheticTarget(label: string): ResolvedTarget {
  return {
    id: `synthetic:${label.toLowerCase().replace(/\s+/g, "_")}`,
    label,
    confidence: 1,
    candidates: [],
    decisionMargin: 1,
    isAmbiguous: false,
    resolutionReason: "operator_does_not_require_target",
  };
}

export class EditHandlerService {
  private readonly orchestrator: EditOrchestratorService;
  private readonly targetResolver: TargetResolverService;

  constructor(opts?: { revisionStore?: EditRevisionStore; telemetry?: EditTelemetry }) {
    this.orchestrator = new EditOrchestratorService({
      revisionStore: opts?.revisionStore,
      telemetry: opts?.telemetry,
    });
    this.targetResolver = new TargetResolverService();
  }

  async execute(input: EditHandlerRequest): Promise<EditHandlerResponse> {
    if (!input?.context?.userId || !input.context.conversationId || !input.context.correlationId || !input.context.clientMessageId) {
      return { ok: false, mode: input.mode, error: "Invalid edit context." };
    }

    if (input.mode === "plan") {
      if (!input.planRequest) return { ok: false, mode: "plan", error: "Missing plan request." };
      const planned = await this.orchestrator.planEdit(input.context, input.planRequest);
      return { ok: planned.ok, mode: "plan", result: planned, error: planned.ok ? undefined : planned.error };
    }

    if (input.mode === "undo") {
      if (!input.undo?.documentId) return { ok: false, mode: "undo", error: "Undo requires documentId." };
      const undone = await this.orchestrator.undoEdit(input.context, input.undo);
      return { ok: undone.ok, mode: "undo", result: undone, receipt: undone.receipt, error: undone.ok ? undefined : undone.error };
    }

    if (!input.planRequest || !isNonEmpty(input.beforeText) || !isNonEmpty(input.proposedText)) {
      return { ok: false, mode: input.mode, error: "Preview/apply requires planRequest, beforeText, and proposedText." };
    }

    const planned = await this.orchestrator.planEdit(input.context, input.planRequest);
    if (!planned.ok || !planned.plan) {
      return { ok: false, mode: input.mode, result: planned, error: planned.error || "Failed to build edit plan." };
    }

    const resolvedTarget =
      input.target ??
      this.resolveTargetFromCandidates(planned.plan.domain, planned.plan.targetHint || planned.plan.normalizedInstruction, input) ??
      // Operators that are not anchored to an existing paragraph/cell can use a synthetic target.
      (planned.plan.operator === "ADD_SHEET"
        ? syntheticTarget("New sheet")
        : planned.plan.operator === "RENAME_SHEET"
          ? syntheticTarget("Rename sheet")
          : planned.plan.operator === "CREATE_CHART"
            ? syntheticTarget("Create chart")
            : planned.plan.operator === "EDIT_DOCX_BUNDLE"
              ? syntheticTarget("Bulk DOCX edit")
              : planned.plan.operator === "COMPUTE_BUNDLE"
                ? syntheticTarget("Bulk sheet edit")
            : null);

    if (!resolvedTarget) {
      return { ok: false, mode: input.mode, error: "Could not resolve edit target." };
    }

    if (resolvedTarget.isAmbiguous && input.mode === "apply" && input.userConfirmed !== true) {
      const preview = await this.orchestrator.previewEdit(input.context, {
        plan: planned.plan,
        target: resolvedTarget,
        beforeText: input.beforeText,
        proposedText: input.proposedText,
        preserveTokens: input.preserveTokens,
      });
      return {
        ok: true,
        mode: "apply",
        result: preview,
        receipt: preview.receipt,
        requiresUserChoice: true,
      };
    }

    if (input.mode === "preview") {
      const preview = await this.orchestrator.previewEdit(input.context, {
        plan: planned.plan,
        target: resolvedTarget,
        beforeText: input.beforeText,
        proposedText: input.proposedText,
        preserveTokens: input.preserveTokens,
      });
      return {
        ok: preview.ok,
        mode: "preview",
        result: preview,
        receipt: preview.receipt,
        requiresUserChoice: resolvedTarget.isAmbiguous,
        error: preview.ok ? undefined : preview.error,
      };
    }

    const applied = await this.orchestrator.applyEdit(input.context, {
      plan: planned.plan,
      target: resolvedTarget,
      beforeText: input.beforeText,
      proposedText: input.proposedText,
      proposedHtml: input.proposedHtml,
      idempotencyKey: input.idempotencyKey,
      expectedDocumentUpdatedAtIso: input.expectedDocumentUpdatedAtIso,
      expectedDocumentFileHash: input.expectedDocumentFileHash,
      userConfirmed: input.userConfirmed === true,
    });
    return {
      ok: applied.ok,
      mode: "apply",
      result: applied,
      receipt: applied.receipt,
      requiresUserChoice: resolvedTarget.isAmbiguous && !input.userConfirmed,
      error: applied.ok ? undefined : applied.error,
    };
  }

  private resolveTargetFromCandidates(
    domain: "docx" | "sheets" | "slides",
    hint: string,
    input: EditHandlerRequest,
  ): ResolvedTarget | null {
    if (domain === "docx" && input.docxCandidates?.length) {
      return this.targetResolver.resolveDocxParagraphTarget(hint, input.docxCandidates);
    }
    if (domain === "sheets" && input.sheetsCandidates?.length) {
      return this.targetResolver.resolveSheetsCellOrRangeTarget(hint, input.sheetsCandidates);
    }
    if (domain === "slides" && input.slidesCandidates?.length) {
      return this.targetResolver.resolveSlidesTarget(hint, input.slidesCandidates);
    }
    return null;
  }
}
