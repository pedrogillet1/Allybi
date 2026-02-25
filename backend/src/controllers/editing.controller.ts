import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { EditingFacadeService } from "../modules/editing/application";
import type {
  EditHandlerRequest,
  DocxParagraphNode,
  EditDomain,
  ResolvedTarget,
  SheetsTargetNode,
  SlidesTargetNode,
} from "../modules/editing/application";
import { normalizeEditOperator } from "../services/editing/editOperatorAliases.service";
import DocumentRevisionStoreService from "../services/editing/documentRevisionStore.service";
import {
  classifyAllybiIntent,
  resolveAllybiScope,
  planAllybiOperator,
  buildMultiIntentPlan,
} from "../services/editing/allybi";

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface ApiOk<T> {
  ok: true;
  data: T;
}

interface ApiFail {
  ok: false;
  error: ApiError;
}

function sendOk<T>(res: Response, data: T, status = 200): Response<ApiOk<T>> {
  return res.status(status).json({ ok: true, data });
}

function sendErr(
  res: Response,
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
): Response<ApiFail> {
  return res.status(status).json({
    ok: false,
    error: { code, message, ...(details ? { details } : {}) },
  });
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    )
    .map((item) => item.trim());
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function intentSourceFromRawOperator(
  value: unknown,
): "classified" | "explicit_operator" {
  return asString(value) ? "explicit_operator" : "classified";
}

function normalizeDocxBundleProposedText(
  runtimeOperator: string | null | undefined,
  proposedText: string | null,
  rawBundlePatches: unknown,
): string | null {
  if (runtimeOperator !== "EDIT_DOCX_BUNDLE") return proposedText;

  const text = String(proposedText || "").trim();
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed?.patches)) return text;
    } catch {
      // Fall through to bundlePatches fallback.
    }
  }

  if (Array.isArray(rawBundlePatches) && rawBundlePatches.length > 0) {
    return JSON.stringify({ patches: rawBundlePatches });
  }

  return proposedText;
}

function hasDocxBundlePayload(
  proposedText: string | null,
  rawBundlePatches: unknown,
): boolean {
  if (Array.isArray(rawBundlePatches) && rawBundlePatches.length > 0)
    return true;
  const text = String(proposedText || "").trim();
  if (!text) return false;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed?.patches) && parsed.patches.length > 0;
  } catch {
    return false;
  }
}

function userIdFromReq(req: Request): string | null {
  const typedReq = req as Request & { user?: { id?: string } };
  return asString(typedReq.user?.id);
}

function buildContext(req: Request): EditHandlerRequest["context"] | null {
  const userId = userIdFromReq(req);
  if (!userId) return null;

  const body = (req.body as Record<string, unknown> | undefined) ?? {};
  const correlationId =
    asString(req.headers["x-correlation-id"]) ||
    asString(body.correlationId) ||
    randomUUID();

  const clientMessageId =
    asString(req.headers["x-client-message-id"]) ||
    asString(body.clientMessageId) ||
    randomUUID();

  const conversationId =
    asString(req.headers["x-conversation-id"]) ||
    asString(body.conversationId) ||
    `editing:${userId}`;

  const language = asString(body.language);

  return {
    userId,
    conversationId,
    correlationId,
    clientMessageId,
    ...(language &&
    (language === "en" || language === "pt" || language === "es")
      ? { language }
      : {}),
  };
}

function isEditDomain(value: unknown): value is EditDomain {
  return value === "docx" || value === "sheets" || value === "slides";
}

function resolveOperatorWithAllybiFallback(input: {
  rawOperator: unknown;
  domain: EditDomain;
  instruction: string;
  targetHint?: string | null;
}): {
  runtimeOperator: ReturnType<typeof normalizeEditOperator>["operator"];
  canonicalOperator: string | null;
  canonicalOperators?: string[];
  blockedReasonCode?: string;
  blockedReasonMessage?: string;
  clarificationRequired?: boolean;
} {
  const explicitOperator = asString(input.rawOperator);
  const normalized = normalizeEditOperator(input.rawOperator, {
    domain: input.domain,
    instruction: input.instruction,
  });
  if (normalized.operator) {
    return {
      runtimeOperator: normalized.operator,
      canonicalOperator: normalized.canonicalOperator ?? null,
    };
  }
  if (explicitOperator) {
    return {
      runtimeOperator: null,
      canonicalOperator: normalized.canonicalOperator ?? explicitOperator,
      canonicalOperators: [],
      blockedReasonCode: "OPERATOR_MAPPING_MISSING",
      blockedReasonMessage: `No runtime operator mapping found for '${explicitOperator}'.`,
    };
  }

  // Fallback path: classify + scope + plan from Allybi banks when caller
  // did not provide an explicit operator.
  const domainForIntent =
    input.domain === "sheets"
      ? "xlsx"
      : input.domain === "docx"
        ? "docx"
        : "global";
  if (domainForIntent === "global") {
    return {
      runtimeOperator: null,
      canonicalOperator: null,
      canonicalOperators: [],
      blockedReasonCode: "INTENT_DOMAIN_UNSUPPORTED",
      blockedReasonMessage:
        "Unsupported domain for intent-based operator resolution.",
    };
  }

  const multiPlan = buildMultiIntentPlan({
    domain: input.domain,
    message: input.instruction,
    explicitTarget: input.targetHint || null,
  });
  if (Array.isArray(multiPlan.steps) && multiPlan.steps.length > 0) {
    const first = multiPlan.steps.find((step) =>
      Boolean(String(step.runtimeOperator || "").trim()),
    );
    if (!first) {
      const blocked = multiPlan.steps[0];
      return {
        runtimeOperator: null,
        canonicalOperator: blocked?.canonicalOperator || null,
        canonicalOperators: multiPlan.steps
          .map((s) => String(s.canonicalOperator || "").trim())
          .filter(Boolean),
        blockedReasonCode: blocked?.blockedReasonCode || "INTENT_PLAN_BLOCKED",
        blockedReasonMessage:
          blocked?.blockedReasonMessage ||
          "Unable to resolve a valid runtime operator for this request.",
        clarificationRequired: blocked?.clarificationRequired === true,
      };
    }
    const canonicalOperators = multiPlan.steps
      .map((s) => String(s.canonicalOperator || "").trim())
      .filter(Boolean);
    return {
      runtimeOperator: first?.runtimeOperator as ReturnType<
        typeof normalizeEditOperator
      >["operator"],
      canonicalOperator: first?.canonicalOperator || null,
      canonicalOperators,
      clarificationRequired: first?.clarificationRequired === true,
    };
  }

  const classifiedIntent = classifyAllybiIntent(
    input.instruction,
    domainForIntent,
  );
  const scope = resolveAllybiScope({
    domain: domainForIntent,
    message: input.instruction,
    classifiedIntent,
    explicitTarget: input.targetHint || null,
  });
  const plan = planAllybiOperator({
    domain: input.domain,
    message: input.instruction,
    classifiedIntent,
    scope,
  });
  if (!plan?.runtimeOperator)
    return {
      runtimeOperator: null,
      canonicalOperator: plan?.canonicalOperator || null,
      canonicalOperators: [],
      blockedReasonCode: plan?.blockedReasonCode || "INTENT_PLAN_NOT_RESOLVED",
      blockedReasonMessage:
        plan?.blockedReasonMessage ||
        "Unable to resolve a valid runtime operator for this request.",
      clarificationRequired: plan?.clarificationRequired === true,
    };
  return {
    runtimeOperator: plan.runtimeOperator as ReturnType<
      typeof normalizeEditOperator
    >["operator"],
    canonicalOperator: plan.canonicalOperator,
    canonicalOperators: plan.canonicalOperator ? [plan.canonicalOperator] : [],
    clarificationRequired: plan.clarificationRequired === true,
  };
}

function mapEditError(error: string): { code: string; status: number } {
  const e = error.toLowerCase();
  if (e.includes("invalid edit context"))
    return { code: "INVALID_CONTEXT", status: 400 };
  if (e.includes("missing plan request"))
    return { code: "PLAN_REQUIRED", status: 400 };
  if (e.includes("could not resolve edit target"))
    return { code: "TARGET_NOT_RESOLVED", status: 422 };
  if (e.includes("confirmation required"))
    return { code: "CONFIRMATION_REQUIRED", status: 409 };
  if (
    e.includes("replan_required") ||
    e.includes("document changed since plan")
  )
    return { code: "REPLAN_REQUIRED", status: 409 };
  if (e.includes("revision store is not configured"))
    return { code: "EDIT_STORE_NOT_CONFIGURED", status: 503 };
  if (e.includes("chart_engine_unavailable"))
    return { code: "CHART_ENGINE_UNAVAILABLE", status: 422 };
  return { code: "EDIT_ERROR", status: 400 };
}

function parseResolvedTarget(raw: unknown): ResolvedTarget | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const item = raw as Record<string, unknown>;

  const id = asString(item.id);
  const label = asString(item.label);
  const confidence =
    typeof item.confidence === "number" ? item.confidence : null;

  if (!id || !label || confidence === null) return undefined;

  const candidates = Array.isArray(item.candidates)
    ? item.candidates
        .map((candidate) => {
          if (!candidate || typeof candidate !== "object") return null;
          const c = candidate as Record<string, unknown>;
          const candidateId = asString(c.id);
          const candidateLabel = asString(c.label);
          const candidateConfidence =
            typeof c.confidence === "number" ? c.confidence : null;
          if (!candidateId || !candidateLabel || candidateConfidence === null)
            return null;
          return {
            id: candidateId,
            label: candidateLabel,
            confidence: candidateConfidence,
            reasons: asStringArray(c.reasons),
          };
        })
        .filter((candidate): candidate is NonNullable<typeof candidate> =>
          Boolean(candidate),
        )
    : [];

  return {
    id,
    label,
    confidence,
    candidates,
    decisionMargin:
      typeof item.decisionMargin === "number" ? item.decisionMargin : 0,
    isAmbiguous: asBoolean(item.isAmbiguous),
    resolutionReason: asString(item.resolutionReason) || "provided_target",
  };
}

function parseDocxCandidates(raw: unknown): DocxParagraphNode[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") return null;
      const item = candidate as Record<string, unknown>;
      const paragraphId = asString(item.paragraphId);
      const text = asString(item.text);
      if (!paragraphId || !text) return null;
      return {
        paragraphId,
        text,
        sectionPath: asStringArray(item.sectionPath),
        styleFingerprint: asString(item.styleFingerprint) || undefined,
        docIndex: typeof item.docIndex === "number" ? item.docIndex : undefined,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    );
}

function parseSheetsCandidates(raw: unknown): SheetsTargetNode[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") return null;
      const item = candidate as Record<string, unknown>;
      const targetId = asString(item.targetId);
      const a1 = asString(item.a1);
      const sheetName = asString(item.sheetName);
      const text = asString(item.text);
      if (!targetId || !a1 || !sheetName || !text) return null;
      return {
        targetId,
        a1,
        sheetName,
        text,
        header: asString(item.header) || undefined,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    );
}

function parseSlidesCandidates(raw: unknown): SlidesTargetNode[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") return null;
      const item = candidate as Record<string, unknown>;
      const objectId = asString(item.objectId);
      const label = asString(item.label);
      const text = asString(item.text);
      const slideNumber =
        typeof item.slideNumber === "number" ? item.slideNumber : null;
      if (!objectId || !label || !text || slideNumber === null) return null;
      return {
        objectId,
        label,
        text,
        slideNumber,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    );
}

export class EditingController {
  constructor(
    private readonly editingFacade: EditingFacadeService = new EditingFacadeService(),
  ) {}

  plan = async (req: Request, res: Response): Promise<Response> => {
    const context = buildContext(req);
    if (!context)
      return sendErr(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const body = (req.body as Record<string, unknown> | undefined) ?? {};
    const instruction = asString(body.instruction);
    const operator = body.operator;
    const domain = body.domain;
    const documentId = asString(body.documentId);

    const normalized = isEditDomain(domain)
      ? resolveOperatorWithAllybiFallback({
          rawOperator: operator,
          domain,
          instruction: instruction || "",
          targetHint: asString(body.targetHint) || null,
        })
      : { runtimeOperator: null, canonicalOperator: null };
    const intentSource = intentSourceFromRawOperator(operator);
    if (normalized.blockedReasonCode) {
      return sendErr(
        res,
        normalized.blockedReasonCode,
        normalized.blockedReasonMessage || "Unable to resolve edit operator.",
        normalized.clarificationRequired ? 409 : 422,
      );
    }

    if (
      !instruction ||
      !isEditDomain(domain) ||
      !normalized.runtimeOperator ||
      !documentId
    ) {
      return sendErr(
        res,
        "INVALID_PLAN_INPUT",
        "instruction, domain, and documentId are required.",
        400,
      );
    }

    const result = await this.editingFacade.execute({
      mode: "plan",
      context,
      planRequest: {
        instruction,
        operator: normalized.runtimeOperator,
        canonicalOperator: normalized.canonicalOperator || undefined,
        intentSource,
        domain,
        documentId,
        targetHint: asString(body.targetHint) || undefined,
        requiredEntities: asStringArray(body.requiredEntities),
        preserveTokens: asStringArray(body.preserveTokens),
      },
    });

    if (!result.ok) {
      const mapped = mapEditError(result.error || "planning failed");
      return sendErr(
        res,
        mapped.code,
        result.error || "Planning failed.",
        mapped.status,
      );
    }

    return sendOk(res, {
      mode: "plan",
      canonicalOperator: normalized.canonicalOperator,
      canonicalOperators: normalized.canonicalOperators || [],
      result: result.result,
      receipt: result.receipt || null,
    });
  };

  preview = async (req: Request, res: Response): Promise<Response> => {
    const context = buildContext(req);
    if (!context)
      return sendErr(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const body = (req.body as Record<string, unknown> | undefined) ?? {};
    const instruction = asString(body.instruction);
    const operator = body.operator;
    const domain = body.domain;
    const documentId = asString(body.documentId);
    const beforeText = asString(body.beforeText);
    const proposedTextRaw = asString(body.proposedText);
    const proposedHtml = asString(body.proposedHtml);
    const idempotencyKey = asString(body.idempotencyKey);
    const expectedDocumentUpdatedAtIso = asString(
      body.expectedDocumentUpdatedAtIso,
    );
    const expectedDocumentFileHash = asString(body.expectedDocumentFileHash);

    const normalized = isEditDomain(domain)
      ? resolveOperatorWithAllybiFallback({
          rawOperator: operator,
          domain,
          instruction: instruction || "",
          targetHint: asString(body.targetHint) || null,
        })
      : { runtimeOperator: null, canonicalOperator: null };
    const intentSource = intentSourceFromRawOperator(operator);
    if (normalized.blockedReasonCode) {
      return sendErr(
        res,
        normalized.blockedReasonCode,
        normalized.blockedReasonMessage || "Unable to resolve edit operator.",
        normalized.clarificationRequired ? 409 : 422,
      );
    }

    const forceDocxBundle =
      domain === "docx" &&
      hasDocxBundlePayload(proposedTextRaw, body.bundlePatches);
    const runtimeOperator = forceDocxBundle
      ? "EDIT_DOCX_BUNDLE"
      : normalized.runtimeOperator;
    const canonicalOperator = forceDocxBundle
      ? "DOCX_SET_RUN_STYLE"
      : normalized.canonicalOperator;
    const proposedText = normalizeDocxBundleProposedText(
      runtimeOperator,
      proposedTextRaw,
      body.bundlePatches,
    );

    if (
      !instruction ||
      !isEditDomain(domain) ||
      !runtimeOperator ||
      !documentId ||
      !beforeText ||
      !proposedText
    ) {
      return sendErr(
        res,
        "INVALID_PREVIEW_INPUT",
        "instruction, domain, documentId, beforeText, and proposedText are required.",
        400,
      );
    }

    const result = await this.editingFacade.execute({
      mode: "preview",
      context,
      planRequest: {
        instruction,
        operator: runtimeOperator,
        canonicalOperator: canonicalOperator || undefined,
        intentSource,
        domain,
        documentId,
        targetHint: asString(body.targetHint) || undefined,
        requiredEntities: asStringArray(body.requiredEntities),
        preserveTokens: asStringArray(body.preserveTokens),
      },
      target: parseResolvedTarget(body.target),
      beforeText,
      proposedText,
      proposedHtml: proposedHtml || undefined,
      preserveTokens: asStringArray(body.preserveTokens),
      docxCandidates: parseDocxCandidates(body.docxCandidates),
      sheetsCandidates: parseSheetsCandidates(body.sheetsCandidates),
      slidesCandidates: parseSlidesCandidates(body.slidesCandidates),
    });

    if (!result.ok) {
      const mapped = mapEditError(result.error || "preview failed");
      return sendErr(
        res,
        mapped.code,
        result.error || "Preview failed.",
        mapped.status,
      );
    }

    return sendOk(res, {
      mode: "preview",
      canonicalOperator,
      canonicalOperators: normalized.canonicalOperators || [],
      result: result.result,
      receipt: result.receipt || null,
      requiresUserChoice: result.requiresUserChoice === true,
    });
  };

  apply = async (req: Request, res: Response): Promise<Response> => {
    const context = buildContext(req);
    if (!context)
      return sendErr(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const body = (req.body as Record<string, unknown> | undefined) ?? {};
    const instruction = asString(body.instruction);
    const operator = body.operator;
    const domain = body.domain;
    const documentId = asString(body.documentId);
    const beforeText = asString(body.beforeText);
    const proposedTextRaw = asString(body.proposedText);
    const proposedHtml = asString(body.proposedHtml);
    const idempotencyKey = asString(body.idempotencyKey);
    const expectedDocumentUpdatedAtIso = asString(
      body.expectedDocumentUpdatedAtIso,
    );
    const expectedDocumentFileHash = asString(body.expectedDocumentFileHash);

    const normalized = isEditDomain(domain)
      ? resolveOperatorWithAllybiFallback({
          rawOperator: operator,
          domain,
          instruction: instruction || "",
          targetHint: asString(body.targetHint) || null,
        })
      : { runtimeOperator: null, canonicalOperator: null };
    const intentSource = intentSourceFromRawOperator(operator);
    if (normalized.blockedReasonCode) {
      return sendErr(
        res,
        normalized.blockedReasonCode,
        normalized.blockedReasonMessage || "Unable to resolve edit operator.",
        normalized.clarificationRequired ? 409 : 422,
      );
    }

    const forceDocxBundle =
      domain === "docx" &&
      hasDocxBundlePayload(proposedTextRaw, body.bundlePatches);
    const runtimeOperator = forceDocxBundle
      ? "EDIT_DOCX_BUNDLE"
      : normalized.runtimeOperator;
    const canonicalOperator = forceDocxBundle
      ? "DOCX_SET_RUN_STYLE"
      : normalized.canonicalOperator;
    const proposedText = normalizeDocxBundleProposedText(
      runtimeOperator,
      proposedTextRaw,
      body.bundlePatches,
    );

    if (
      !instruction ||
      !isEditDomain(domain) ||
      !runtimeOperator ||
      !documentId ||
      !beforeText ||
      !proposedText
    ) {
      return sendErr(
        res,
        "INVALID_APPLY_INPUT",
        "instruction, domain, documentId, beforeText, and proposedText are required.",
        400,
      );
    }

    const result = await this.editingFacade.execute({
      mode: "apply",
      context,
      planRequest: {
        instruction,
        operator: runtimeOperator,
        canonicalOperator: canonicalOperator || undefined,
        intentSource,
        domain,
        documentId,
        targetHint: asString(body.targetHint) || undefined,
        requiredEntities: asStringArray(body.requiredEntities),
        preserveTokens: asStringArray(body.preserveTokens),
      },
      target: parseResolvedTarget(body.target),
      beforeText,
      proposedText,
      proposedHtml: proposedHtml || undefined,
      userConfirmed: asBoolean(body.userConfirmed),
      idempotencyKey: idempotencyKey || undefined,
      expectedDocumentUpdatedAtIso: expectedDocumentUpdatedAtIso || undefined,
      expectedDocumentFileHash: expectedDocumentFileHash || undefined,
      preserveTokens: asStringArray(body.preserveTokens),
      docxCandidates: parseDocxCandidates(body.docxCandidates),
      sheetsCandidates: parseSheetsCandidates(body.sheetsCandidates),
      slidesCandidates: parseSlidesCandidates(body.slidesCandidates),
    });

    if (!result.ok) {
      const mapped = mapEditError(result.error || "apply failed");
      return sendErr(
        res,
        mapped.code,
        result.error || "Apply failed.",
        mapped.status,
      );
    }

    if (result.requiresUserChoice) {
      return sendOk(
        res,
        {
          mode: "apply",
          applyPath: "editing_facade",
          canonicalOperator,
          canonicalOperators: normalized.canonicalOperators || [],
          result: result.result,
          receipt: result.receipt || null,
          requiresUserChoice: true,
        },
        409,
      );
    }

    return sendOk(res, {
      mode: "apply",
      applyPath: "editing_facade",
      canonicalOperator,
      canonicalOperators: normalized.canonicalOperators || [],
      result: result.result,
      receipt: result.receipt || null,
      requiresUserChoice: false,
    });
  };

  undo = async (req: Request, res: Response): Promise<Response> => {
    const context = buildContext(req);
    if (!context)
      return sendErr(res, "AUTH_UNAUTHORIZED", "Not authenticated.", 401);

    const body = (req.body as Record<string, unknown> | undefined) ?? {};
    const documentId = asString(body.documentId);
    if (!documentId)
      return sendErr(
        res,
        "DOCUMENT_ID_REQUIRED",
        "documentId is required.",
        400,
      );

    const result = await this.editingFacade.execute({
      mode: "undo",
      context,
      undo: {
        documentId,
        revisionId: asString(body.revisionId) || undefined,
      },
    });

    if (!result.ok) {
      const mapped = mapEditError(result.error || "undo failed");
      return sendErr(
        res,
        mapped.code,
        result.error || "Undo failed.",
        mapped.status,
      );
    }

    return sendOk(res, {
      mode: "undo",
      applyPath: "editing_facade",
      result: result.result,
      receipt: result.receipt || null,
    });
  };
}

export function createEditingController(
  facade?: EditingFacadeService,
): EditingController {
  return new EditingController(
    facade ??
      new EditingFacadeService({
        revisionStore: new DocumentRevisionStoreService(),
      }),
  );
}
