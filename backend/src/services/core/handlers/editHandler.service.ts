import {
  EditingSafetyGateService,
  EditingTextGenerationService,
  type EditApplyResult,
  EditOrchestratorService,
  type EditOutcomeType,
  type EditPlan,
  type EditReceipt,
  TargetResolverService,
  type DocxParagraphNode,
  type EditExecutionContext,
  type EditPlanRequest,
  type EditPlanResult,
  type EditPreviewResult,
  type EditRevisionStore,
  type EditTelemetry,
  type EditTrustLevel,
  type ResolvedTarget,
  type SheetsTargetNode,
  type SlidesTargetNode,
  type UndoResult,
} from "../../editing";
import {
  SupportContractService,
  type SupportContractResult,
} from "../../editing/allybi/supportContract.service";
import { logger } from "../../../utils/logger";

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
  confirmationToken?: string;
  trustLevel?: EditTrustLevel;
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

function canSkipBeforeTextForPlan(plan: EditPlan): boolean {
  if (plan.domain !== "docx") return false;
  const canonical = String(plan.canonicalOperator || "")
    .trim()
    .toUpperCase();
  return canonical === "DOCX_FIND_REPLACE";
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

function parseSheetAndRange(text: string | undefined): {
  sheetName: string | null;
  rangeA1: string | null;
} {
  const raw = String(text || "").trim();
  if (!raw) return { sheetName: null, rangeA1: null };

  const sheetRange = raw.match(
    /(?:'([^']+)'|([A-Za-z0-9_][A-Za-z0-9_ ]*))!([A-Za-z]{1,3}\d{1,7}(?::[A-Za-z]{1,3}\d{1,7})?)/,
  );
  if (sheetRange) {
    return {
      sheetName: (sheetRange[1] || sheetRange[2] || "").trim() || null,
      rangeA1: String(sheetRange[3] || "").trim() || null,
    };
  }

  const bareRange = raw.match(
    /\b([A-Za-z]{1,3}\d{1,7}(?::[A-Za-z]{1,3}\d{1,7})?)\b/,
  );
  if (bareRange?.[1]) {
    return { sheetName: null, rangeA1: String(bareRange[1]).trim() };
  }

  return { sheetName: null, rangeA1: null };
}

function buildSupportViewerContext(
  plan: EditPlan,
  target: ResolvedTarget,
): {
  selection?: unknown;
  sheetName?: string;
  frozenSelection?: unknown;
} {
  if (plan.domain === "sheets") {
    const fromTarget = parseSheetAndRange(`${target.label} ${target.id}`);
    const fromHint = parseSheetAndRange(plan.targetHint);
    const sheetName = fromTarget.sheetName || fromHint.sheetName || undefined;
    const rangeA1 = fromTarget.rangeA1 || fromHint.rangeA1;
    if (!rangeA1 && !sheetName) return {};
    return {
      selection: {
        rangeA1: rangeA1 || undefined,
        a1: rangeA1 || undefined,
      },
      ...(sheetName ? { sheetName } : {}),
    };
  }

  if (plan.domain === "docx") {
    return {
      selection: {
        paragraphId: target.id,
      },
    };
  }

  return {};
}

export class EditHandlerService {
  private readonly orchestrator: EditOrchestratorService;
  private readonly targetResolver: TargetResolverService;
  private readonly supportContract: SupportContractService;
  private readonly safetyGate: EditingSafetyGateService;
  private readonly textGeneration: EditingTextGenerationService;

  constructor(opts?: {
    revisionStore?: EditRevisionStore;
    telemetry?: EditTelemetry;
  }) {
    this.orchestrator = new EditOrchestratorService({
      revisionStore: opts?.revisionStore,
      telemetry: opts?.telemetry,
    });
    this.targetResolver = new TargetResolverService();
    this.supportContract = new SupportContractService();
    this.safetyGate = new EditingSafetyGateService();
    this.textGeneration = new EditingTextGenerationService();
  }

  async execute(input: EditHandlerRequest): Promise<EditHandlerResponse> {
    if (
      !input?.context?.userId ||
      !input.context.conversationId ||
      !input.context.correlationId ||
      !input.context.clientMessageId
    ) {
      return { ok: false, mode: input.mode, error: "Invalid edit context." };
    }

    if (input.mode === "plan") {
      if (!input.planRequest)
        return { ok: false, mode: "plan", error: "Missing plan request." };
      const planned = await this.orchestrator.planEdit(
        input.context,
        input.planRequest,
      );
      return {
        ok: planned.ok,
        mode: "plan",
        result: planned,
        error: planned.ok ? undefined : planned.error,
      };
    }

    if (input.mode === "undo") {
      if (!input.undo?.documentId)
        return { ok: false, mode: "undo", error: "Undo requires documentId." };
      const undone = await this.orchestrator.undoEdit(
        input.context,
        input.undo,
      );
      return {
        ok: undone.ok,
        mode: "undo",
        result: undone,
        receipt: undone.receipt,
        error: undone.ok ? undefined : undone.error,
      };
    }

    if (!input.planRequest) {
      return {
        ok: false,
        mode: input.mode,
        error: "Preview/apply requires planRequest.",
      };
    }

    const planned = await this.orchestrator.planEdit(
      input.context,
      input.planRequest,
    );
    if (!planned.ok || !planned.plan) {
      return {
        ok: false,
        mode: input.mode,
        result: planned,
        error: planned.error || "Failed to build edit plan.",
      };
    }

    const normalizedBeforeText = String(input.beforeText || "").trim();
    if (!normalizedBeforeText && !canSkipBeforeTextForPlan(planned.plan)) {
      return {
        ok: false,
        mode: input.mode,
        error: "Preview/apply requires beforeText for this operator.",
      };
    }

    const generation = await this.textGeneration.generateProposedText({
      context: input.context,
      plan: planned.plan,
      beforeText: normalizedBeforeText,
      proposedText: input.proposedText,
    });
    if (!generation.ok) {
      return {
        ok: false,
        mode: input.mode,
        error: generation.error,
      };
    }
    const effectiveProposedText = generation.proposedText;

    const resolvedTarget =
      input.target ??
      this.resolveTargetFromCandidates(
        planned.plan.domain,
        planned.plan.targetHint || planned.plan.normalizedInstruction,
        input,
      ) ??
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
      return {
        ok: false,
        mode: input.mode,
        error: "Could not resolve edit target.",
      };
    }

    const contract = this.supportContract.evaluatePreApply({
      instruction: planned.plan.normalizedInstruction,
      domain: planned.plan.domain,
      language: (input.context.language ||
        planned.plan.constraints.outputLanguage) as "en" | "pt",
      runtimeOperator: planned.plan.operator,
      canonicalOperator: planned.plan.canonicalOperator || null,
      intentSource: planned.plan.intentSource,
      resolvedTargetId: resolvedTarget.id,
      isAmbiguousTarget: resolvedTarget.isAmbiguous,
      resolvedTargetCandidateCount: resolvedTarget.candidates.length,
      viewerContext: buildSupportViewerContext(planned.plan, resolvedTarget),
    });

    if (!contract.ok) {
      const blockedReceipt = this.buildContractBlockedReceipt({
        plan: planned.plan,
        target: resolvedTarget,
        contract,
      });
      if (input.mode === "preview") {
        return {
          ok: true,
          mode: "preview",
          result: {
            ok: true,
            target: resolvedTarget,
            receipt: blockedReceipt,
            requiresConfirmation: true,
          },
          receipt: blockedReceipt,
          requiresUserChoice: false,
        };
      }

      const blockedApply = this.buildContractBlockedApplyResult({
        plan: planned.plan,
        receipt: blockedReceipt,
        contract,
      });
      return {
        ok: true,
        mode: "apply",
        result: blockedApply,
        receipt: blockedReceipt,
        requiresUserChoice: false,
      };
    }

    // Merge slot context from intent runtime onto plan for template hydration
    const slotContext = (contract.details?.slotContext || {}) as Record<
      string,
      unknown
    >;
    if (Object.keys(slotContext).length > 0) {
      Object.assign(planned.plan, { metadata: slotContext });
    }

    if (
      resolvedTarget.isAmbiguous &&
      input.mode === "apply" &&
      input.userConfirmed !== true
    ) {
      const preview = await this.orchestrator.previewEdit(input.context, {
        plan: planned.plan,
        target: resolvedTarget,
        beforeText: normalizedBeforeText,
        proposedText: effectiveProposedText,
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
        beforeText: normalizedBeforeText,
        proposedText: effectiveProposedText,
        preserveTokens: input.preserveTokens,
      });
      return {
        ok: preview.ok,
        mode: "preview",
        result: {
          ...preview,
          requestId: input.context?.clientMessageId,
        },
        receipt: preview.receipt,
        requiresUserChoice: resolvedTarget.isAmbiguous,
        error: preview.ok ? undefined : preview.error,
      };
    }

    const safetyDecision = this.safetyGate.evaluate({
      plan: planned.plan,
      beforeText: normalizedBeforeText,
      proposedText: effectiveProposedText,
      targetId: resolvedTarget.id,
      userConfirmed: input.userConfirmed === true,
      confirmationToken: input.confirmationToken,
      trustLevel: input.trustLevel || input.context.trustLevel,
    });
    if (safetyDecision.decision !== "allow") {
      logger.warn("[EditingSafetyGate] blocked_or_confirm_required", {
        conversationId: input.context.conversationId,
        correlationId: input.context.correlationId,
        operator: planned.plan.operator,
        domain: planned.plan.domain,
        decision: safetyDecision.decision,
        trustLevel: safetyDecision.trustLevel,
        riskScore: safetyDecision.riskScore,
        reasons: safetyDecision.reasons,
      });
      const code =
        safetyDecision.decision === "block"
          ? "SAFETY_GATE_BLOCKED"
          : "SAFETY_GATE_CONFIRMATION_REQUIRED";
      const safetyValidations = [
        {
          id: "safety_gate",
          pass: false,
          detail: `${safetyDecision.decision}: ${safetyDecision.reasons.join("; ")}`,
        },
        ...(safetyDecision.injectionDetected
          ? [
              {
                id: "injection_check",
                pass: false,
                detail: "Prompt injection suspected",
              },
            ]
          : [{ id: "injection_check", pass: true }]),
        {
          id: "risk_score",
          pass: safetyDecision.riskScore < 0.7,
          detail: `score=${safetyDecision.riskScore}`,
        },
      ];
      const blocked: EditApplyResult = {
        ok: true,
        applied: false,
        outcomeType: "blocked",
        requestId: input.context?.clientMessageId,
        validations: safetyValidations,
        safetyGate: safetyDecision,
        blockedReason: {
          code,
          gate: "trust_gate",
          message:
            safetyDecision.decision === "block"
              ? "Safety gate blocked this operation due to high-risk context."
              : "Safety gate requires stronger confirmation before apply.",
          details: {
            reasons: safetyDecision.reasons,
            trustLevel: safetyDecision.trustLevel,
            riskScore: safetyDecision.riskScore,
          },
        },
      };
      return {
        ok: true,
        mode: "apply",
        result: blocked,
        requiresUserChoice: safetyDecision.decision === "confirm",
      };
    }

    const applied = await this.orchestrator.applyEdit(input.context, {
      plan: planned.plan,
      target: resolvedTarget,
      beforeText: normalizedBeforeText,
      proposedText: effectiveProposedText,
      proposedHtml: input.proposedHtml,
      confirmationToken: input.confirmationToken,
      trustLevel: input.trustLevel || input.context.trustLevel,
      idempotencyKey: input.idempotencyKey,
      expectedDocumentUpdatedAtIso: input.expectedDocumentUpdatedAtIso,
      expectedDocumentFileHash: input.expectedDocumentFileHash,
      userConfirmed: input.userConfirmed === true,
    });
    const applyValidations = [
      {
        id: "safety_gate",
        pass: true,
        detail: `allowed (risk=${safetyDecision.riskScore})`,
      },
      ...(safetyDecision.injectionDetected
        ? [
            {
              id: "injection_check",
              pass: false,
              detail: "Prompt injection suspected",
            },
          ]
        : [{ id: "injection_check", pass: true }]),
    ];
    return {
      ok: applied.ok,
      mode: "apply",
      result: {
        ...applied,
        requestId: input.context?.clientMessageId,
        validations: [...applyValidations, ...(applied.validations || [])],
        safetyGate: applied.safetyGate || safetyDecision,
      },
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
      return this.targetResolver.resolveDocxParagraphTarget(
        hint,
        input.docxCandidates,
      );
    }
    if (domain === "sheets" && input.sheetsCandidates?.length) {
      return this.targetResolver.resolveSheetsCellOrRangeTarget(
        hint,
        input.sheetsCandidates,
      );
    }
    if (domain === "slides" && input.slidesCandidates?.length) {
      return this.targetResolver.resolveSlidesTarget(
        hint,
        input.slidesCandidates,
      );
    }
    return null;
  }

  private buildContractBlockedReceipt(input: {
    plan: EditPlan;
    target: ResolvedTarget;
    contract: SupportContractResult;
  }): EditReceipt {
    const note =
      input.contract.blockedReason?.message ||
      "This edit is currently blocked by support checks.";
    return {
      stage: "blocked",
      note,
      actions: [
        { kind: "cancel", label: "Cancel" },
        {
          kind: "pick_target",
          label: "Pick different target",
          payload: { targetId: input.target.id },
        },
      ],
    };
  }

  private buildContractBlockedApplyResult(input: {
    plan: EditPlan;
    receipt: EditReceipt;
    contract: SupportContractResult;
  }): EditApplyResult {
    const outcomeType: EditOutcomeType =
      input.contract.outcomeType || "blocked";
    return {
      ok: true,
      applied: false,
      outcomeType,
      blockedReason: input.contract.blockedReason,
      receipt: input.receipt,
    };
  }
}
