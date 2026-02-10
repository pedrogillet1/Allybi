import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import {
  EditHandlerService,
  type EditHandlerRequest,
} from '../services/core/handlers/editHandler.service';
import type {
  DocxParagraphNode,
  EditDomain,
  EditOperator,
  ResolvedTarget,
  SheetsTargetNode,
  SlidesTargetNode,
} from '../services/editing';
import DocumentRevisionStoreService from '../services/editing/documentRevisionStore.service';

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

function sendErr(res: Response, code: string, message: string, status = 400, details?: Record<string, unknown>): Response<ApiFail> {
  return res.status(status).json({ ok: false, error: { code, message, ...(details ? { details } : {}) } });
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function userIdFromReq(req: Request): string | null {
  const typedReq = req as Request & { user?: { id?: string } };
  return asString(typedReq.user?.id);
}

function buildContext(req: Request): EditHandlerRequest['context'] | null {
  const userId = userIdFromReq(req);
  if (!userId) return null;

  const body = (req.body as Record<string, unknown> | undefined) ?? {};
  const correlationId =
    asString(req.headers['x-correlation-id']) ||
    asString(body.correlationId) ||
    randomUUID();

  const clientMessageId =
    asString(req.headers['x-client-message-id']) ||
    asString(body.clientMessageId) ||
    randomUUID();

  const conversationId =
    asString(req.headers['x-conversation-id']) ||
    asString(body.conversationId) ||
    `editing:${userId}`;

  const language = asString(body.language);

  return {
    userId,
    conversationId,
    correlationId,
    clientMessageId,
    ...(language && (language === 'en' || language === 'pt' || language === 'es') ? { language } : {}),
  };
}

function isEditDomain(value: unknown): value is EditDomain {
  return value === 'docx' || value === 'sheets' || value === 'slides';
}

function isEditOperator(value: unknown): value is EditOperator {
  return (
    value === 'EDIT_PARAGRAPH' ||
    value === 'ADD_PARAGRAPH' ||
    value === 'EDIT_CELL' ||
    value === 'EDIT_RANGE' ||
    value === 'ADD_SHEET' ||
    value === 'RENAME_SHEET' ||
    value === 'CREATE_CHART' ||
    value === 'ADD_SLIDE' ||
    value === 'REWRITE_SLIDE_TEXT' ||
    value === 'REPLACE_SLIDE_IMAGE'
  );
}

function mapEditError(error: string): { code: string; status: number } {
  const e = error.toLowerCase();
  if (e.includes('invalid edit context')) return { code: 'INVALID_CONTEXT', status: 400 };
  if (e.includes('missing plan request')) return { code: 'PLAN_REQUIRED', status: 400 };
  if (e.includes('could not resolve edit target')) return { code: 'TARGET_NOT_RESOLVED', status: 422 };
  if (e.includes('confirmation required')) return { code: 'CONFIRMATION_REQUIRED', status: 409 };
  if (e.includes('revision store is not configured')) return { code: 'EDIT_STORE_NOT_CONFIGURED', status: 503 };
  return { code: 'EDIT_ERROR', status: 400 };
}

function parseResolvedTarget(raw: unknown): ResolvedTarget | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const item = raw as Record<string, unknown>;

  const id = asString(item.id);
  const label = asString(item.label);
  const confidence = typeof item.confidence === 'number' ? item.confidence : null;

  if (!id || !label || confidence === null) return undefined;

  const candidates = Array.isArray(item.candidates)
    ? item.candidates
        .map((candidate) => {
          if (!candidate || typeof candidate !== 'object') return null;
          const c = candidate as Record<string, unknown>;
          const candidateId = asString(c.id);
          const candidateLabel = asString(c.label);
          const candidateConfidence = typeof c.confidence === 'number' ? c.confidence : null;
          if (!candidateId || !candidateLabel || candidateConfidence === null) return null;
          return {
            id: candidateId,
            label: candidateLabel,
            confidence: candidateConfidence,
            reasons: asStringArray(c.reasons),
          };
        })
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    : [];

  return {
    id,
    label,
    confidence,
    candidates,
    decisionMargin: typeof item.decisionMargin === 'number' ? item.decisionMargin : 0,
    isAmbiguous: asBoolean(item.isAmbiguous),
    resolutionReason: asString(item.resolutionReason) || 'provided_target',
  };
}

function parseDocxCandidates(raw: unknown): DocxParagraphNode[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((candidate) => {
      if (!candidate || typeof candidate !== 'object') return null;
      const item = candidate as Record<string, unknown>;
      const paragraphId = asString(item.paragraphId);
      const text = asString(item.text);
      if (!paragraphId || !text) return null;
      return {
        paragraphId,
        text,
        sectionPath: asStringArray(item.sectionPath),
        styleFingerprint: asString(item.styleFingerprint) || undefined,
        docIndex: typeof item.docIndex === 'number' ? item.docIndex : undefined,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
}

function parseSheetsCandidates(raw: unknown): SheetsTargetNode[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((candidate) => {
      if (!candidate || typeof candidate !== 'object') return null;
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
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
}

function parseSlidesCandidates(raw: unknown): SlidesTargetNode[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((candidate) => {
      if (!candidate || typeof candidate !== 'object') return null;
      const item = candidate as Record<string, unknown>;
      const objectId = asString(item.objectId);
      const label = asString(item.label);
      const text = asString(item.text);
      const slideNumber = typeof item.slideNumber === 'number' ? item.slideNumber : null;
      if (!objectId || !label || !text || slideNumber === null) return null;
      return {
        objectId,
        label,
        text,
        slideNumber,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
}

export class EditingController {
  constructor(private readonly editHandler: EditHandlerService = new EditHandlerService()) {}

  plan = async (req: Request, res: Response): Promise<Response> => {
    const context = buildContext(req);
    if (!context) return sendErr(res, 'AUTH_UNAUTHORIZED', 'Not authenticated.', 401);

    const body = (req.body as Record<string, unknown> | undefined) ?? {};
    const instruction = asString(body.instruction);
    const operator = body.operator;
    const domain = body.domain;
    const documentId = asString(body.documentId);

    if (!instruction || !isEditOperator(operator) || !isEditDomain(domain) || !documentId) {
      return sendErr(res, 'INVALID_PLAN_INPUT', 'instruction, operator, domain, and documentId are required.', 400);
    }

    const result = await this.editHandler.execute({
      mode: 'plan',
      context,
      planRequest: {
        instruction,
        operator,
        domain,
        documentId,
        targetHint: asString(body.targetHint) || undefined,
        requiredEntities: asStringArray(body.requiredEntities),
        preserveTokens: asStringArray(body.preserveTokens),
      },
    });

    if (!result.ok) {
      const mapped = mapEditError(result.error || 'planning failed');
      return sendErr(res, mapped.code, result.error || 'Planning failed.', mapped.status);
    }

    return sendOk(res, {
      mode: 'plan',
      result: result.result,
      receipt: result.receipt || null,
    });
  };

  preview = async (req: Request, res: Response): Promise<Response> => {
    const context = buildContext(req);
    if (!context) return sendErr(res, 'AUTH_UNAUTHORIZED', 'Not authenticated.', 401);

    const body = (req.body as Record<string, unknown> | undefined) ?? {};
    const instruction = asString(body.instruction);
    const operator = body.operator;
    const domain = body.domain;
    const documentId = asString(body.documentId);
    const beforeText = asString(body.beforeText);
    const proposedText = asString(body.proposedText);
    const proposedHtml = asString(body.proposedHtml);

    if (!instruction || !isEditOperator(operator) || !isEditDomain(domain) || !documentId || !beforeText || !proposedText) {
      return sendErr(res, 'INVALID_PREVIEW_INPUT', 'instruction, operator, domain, documentId, beforeText, and proposedText are required.', 400);
    }

    const result = await this.editHandler.execute({
      mode: 'preview',
      context,
      planRequest: {
        instruction,
        operator,
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
      const mapped = mapEditError(result.error || 'preview failed');
      return sendErr(res, mapped.code, result.error || 'Preview failed.', mapped.status);
    }

    return sendOk(res, {
      mode: 'preview',
      result: result.result,
      receipt: result.receipt || null,
      requiresUserChoice: result.requiresUserChoice === true,
    });
  };

  apply = async (req: Request, res: Response): Promise<Response> => {
    const context = buildContext(req);
    if (!context) return sendErr(res, 'AUTH_UNAUTHORIZED', 'Not authenticated.', 401);

    const body = (req.body as Record<string, unknown> | undefined) ?? {};
    const instruction = asString(body.instruction);
    const operator = body.operator;
    const domain = body.domain;
    const documentId = asString(body.documentId);
    const beforeText = asString(body.beforeText);
    const proposedText = asString(body.proposedText);
    const proposedHtml = asString(body.proposedHtml);

    if (!instruction || !isEditOperator(operator) || !isEditDomain(domain) || !documentId || !beforeText || !proposedText) {
      return sendErr(res, 'INVALID_APPLY_INPUT', 'instruction, operator, domain, documentId, beforeText, and proposedText are required.', 400);
    }

    const result = await this.editHandler.execute({
      mode: 'apply',
      context,
      planRequest: {
        instruction,
        operator,
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
      preserveTokens: asStringArray(body.preserveTokens),
      docxCandidates: parseDocxCandidates(body.docxCandidates),
      sheetsCandidates: parseSheetsCandidates(body.sheetsCandidates),
      slidesCandidates: parseSlidesCandidates(body.slidesCandidates),
    });

    if (!result.ok) {
      const mapped = mapEditError(result.error || 'apply failed');
      return sendErr(res, mapped.code, result.error || 'Apply failed.', mapped.status);
    }

    if (result.requiresUserChoice) {
      return sendOk(
        res,
        {
          mode: 'apply',
          result: result.result,
          receipt: result.receipt || null,
          requiresUserChoice: true,
        },
        409,
      );
    }

    return sendOk(res, {
      mode: 'apply',
      result: result.result,
      receipt: result.receipt || null,
      requiresUserChoice: false,
    });
  };

  undo = async (req: Request, res: Response): Promise<Response> => {
    const context = buildContext(req);
    if (!context) return sendErr(res, 'AUTH_UNAUTHORIZED', 'Not authenticated.', 401);

    const body = (req.body as Record<string, unknown> | undefined) ?? {};
    const documentId = asString(body.documentId);
    if (!documentId) return sendErr(res, 'DOCUMENT_ID_REQUIRED', 'documentId is required.', 400);

    const result = await this.editHandler.execute({
      mode: 'undo',
      context,
      undo: {
        documentId,
        revisionId: asString(body.revisionId) || undefined,
      },
    });

    if (!result.ok) {
      const mapped = mapEditError(result.error || 'undo failed');
      return sendErr(res, mapped.code, result.error || 'Undo failed.', mapped.status);
    }

    return sendOk(res, {
      mode: 'undo',
      result: result.result,
      receipt: result.receipt || null,
    });
  };
}

export function createEditingController(handler?: EditHandlerService): EditingController {
  return new EditingController(
    handler ??
      new EditHandlerService({
        revisionStore: new DocumentRevisionStoreService(),
      }),
  );
}
