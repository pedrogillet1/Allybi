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
  ResolvedTargetCandidate,
  SheetsTargetNode,
  SlidesTargetNode,
} from '../services/editing';

import type {
  EditorSessionApplyRequest,
  EditorSessionApplyResponse,
  EditorSessionCancelResponse,
  EditorSessionGetResponse,
  EditorSessionStartRequest,
  EditorSessionStartResponse,
  EditorSessionStatus,
} from '../types/editorSession.types';

type ApiOk<T> = { ok: true; data: T };
type ApiFail = { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } };

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
  return res.status(status).json({ ok: false, error: { code, message, ...(details ? { details } : {}) } });
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
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
    `editor:${userId}`;

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
          const reasons = asStringArray(c.reasons);
          return {
            id: candidateId,
            label: candidateLabel,
            confidence: candidateConfidence,
            reasons,
          } satisfies ResolvedTargetCandidate;
        })
        .filter((candidate): candidate is ResolvedTargetCandidate => Boolean(candidate))
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
      const sectionPath = Array.isArray(item.sectionPath)
        ? item.sectionPath.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        : null;
      const styleFingerprint = asString(item.styleFingerprint);
      return {
        paragraphId,
        text,
        ...(sectionPath && sectionPath.length ? { sectionPath } : {}),
        ...(styleFingerprint ? { styleFingerprint } : {}),
      } as DocxParagraphNode;
    })
    .filter((candidate): candidate is DocxParagraphNode => candidate !== null);
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
      const header = asString(item.header);
      return {
        targetId,
        a1,
        sheetName,
        text,
        ...(header ? { header } : {}),
      } as SheetsTargetNode;
    })
    .filter((candidate): candidate is SheetsTargetNode => candidate !== null);
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
      } satisfies SlidesTargetNode;
    })
    .filter((candidate): candidate is SlidesTargetNode => Boolean(candidate));
}

function mapEditError(error: string): { code: string; status: number } {
  const e = error.toLowerCase();
  if (e.includes('invalid edit context')) return { code: 'INVALID_CONTEXT', status: 400 };
  if (e.includes('missing plan request')) return { code: 'PLAN_REQUIRED', status: 400 };
  if (e.includes('preview/apply requires')) return { code: 'PREVIEW_FIELDS_REQUIRED', status: 400 };
  if (e.includes('could not resolve edit target')) return { code: 'TARGET_NOT_RESOLVED', status: 422 };
  if (e.includes('confirmation required')) return { code: 'CONFIRMATION_REQUIRED', status: 409 };
  if (e.includes('revision store is not configured')) return { code: 'EDIT_STORE_NOT_CONFIGURED', status: 503 };
  return { code: 'EDIT_ERROR', status: 400 };
}

type StoredSession = {
  id: string;
  userId: string;
  documentId: string;
  status: EditorSessionStatus;

  planRequest: {
    instruction: string;
    operator: EditOperator;
    domain: EditDomain;
    documentId: string;
    targetHint?: string;
    requiredEntities?: string[];
    preserveTokens?: string[];
  };

  beforeText: string;
  proposedText: string;
  preserveTokens: string[];

  resolvedTarget?: ResolvedTarget;
  lastPreview?: any;
  receipt?: any;

  createdAt: number;
  expiresAt: number;
};

class EditorSessionStore {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  create(session: Omit<StoredSession, 'createdAt' | 'expiresAt'>): StoredSession {
    const now = Date.now();
    const stored: StoredSession = {
      ...session,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.sessions.set(stored.id, stored);
    return stored;
  }

  getForUser(sessionId: string, userId: string): StoredSession | null {
    this.sweepExpired();
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    if (s.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId);
      return null;
    }
    if (s.userId !== userId) return null;
    return s;
  }

  update(session: StoredSession): void {
    this.sessions.set(session.id, session);
  }

  cancel(sessionId: string, userId: string): StoredSession | null {
    const s = this.getForUser(sessionId, userId);
    if (!s) return null;
    s.status = 'cancelled';
    this.update(s);
    return s;
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [id, s] of this.sessions.entries()) {
      if (s.expiresAt <= now) this.sessions.delete(id);
    }
  }
}

function selectTargetFromCandidate(resolved: ResolvedTarget, selectedId: string): ResolvedTarget | null {
  const candidate = resolved.candidates.find((c) => c.id === selectedId);
  if (!candidate) return null;

  return {
    id: candidate.id,
    label: candidate.label,
    confidence: candidate.confidence,
    candidates: [],
    decisionMargin: 1,
    isAmbiguous: false,
    resolutionReason: 'user_selected',
  };
}

export class EditorSessionController {
  private readonly store: EditorSessionStore;

  constructor(
    private readonly editHandler: EditHandlerService = new EditHandlerService(),
    opts?: { ttlMs?: number },
  ) {
    this.store = new EditorSessionStore(opts?.ttlMs ?? 15 * 60 * 1000);
  }

  start = async (req: Request, res: Response): Promise<Response> => {
    const ctx = buildContext(req);
    if (!ctx) return sendErr(res, 'AUTH_UNAUTHORIZED', 'Not authenticated.', 401);

    const body = (req.body as Record<string, unknown> | undefined) ?? {};
    const documentId = asString(body.documentId);
    const instruction = asString(body.instruction);
    const operator = body.operator;
    const domain = body.domain;

    const beforeText = asString(body.beforeText);
    const proposedText = asString(body.proposedText);

    if (!documentId || !instruction || !beforeText || !proposedText || !isEditOperator(operator) || !isEditDomain(domain)) {
      return sendErr(
        res,
        'INVALID_START_INPUT',
        'documentId, instruction, operator, domain, beforeText, and proposedText are required.',
        400,
      );
    }

    const targetHint = asString(body.targetHint) || undefined;
    const preserveTokens = asStringArray(body.preserveTokens);

    const target = parseResolvedTarget(body.target);

    const docxCandidates = parseDocxCandidates(body.docxCandidates);
    const sheetsCandidates = parseSheetsCandidates(body.sheetsCandidates);
    const slidesCandidates = parseSlidesCandidates(body.slidesCandidates);

    const planRequest: EditorSessionStartRequest = {
      documentId,
      instruction,
      operator,
      domain,
      beforeText,
      proposedText,
      targetHint,
      preserveTokens,
      ...(target ? { target } : {}),
      ...(docxCandidates.length ? { docxCandidates } : {}),
      ...(sheetsCandidates.length ? { sheetsCandidates } : {}),
      ...(slidesCandidates.length ? { slidesCandidates } : {}),
    };

    const previewResult = await this.editHandler.execute({
      mode: 'preview',
      context: ctx,
      planRequest: {
        instruction: planRequest.instruction,
        operator: planRequest.operator,
        domain: planRequest.domain,
        documentId: planRequest.documentId,
        targetHint: planRequest.targetHint,
        preserveTokens: planRequest.preserveTokens,
      },
      beforeText: planRequest.beforeText,
      proposedText: planRequest.proposedText,
      preserveTokens: planRequest.preserveTokens,
      ...(planRequest.target ? { target: planRequest.target } : {}),
      ...(planRequest.docxCandidates ? { docxCandidates: planRequest.docxCandidates as DocxParagraphNode[] } : {}),
      ...(planRequest.sheetsCandidates ? { sheetsCandidates: planRequest.sheetsCandidates as SheetsTargetNode[] } : {}),
      ...(planRequest.slidesCandidates ? { slidesCandidates: planRequest.slidesCandidates as SlidesTargetNode[] } : {}),
    });

    if (!previewResult.ok) {
      const mapped = mapEditError(previewResult.error || 'preview failed');
      return sendErr(res, mapped.code, previewResult.error || 'Preview failed.', mapped.status);
    }

    const sessionId = randomUUID();

    const stored = this.store.create({
      id: sessionId,
      userId: ctx.userId,
      documentId,
      status: 'preview_ready',
      planRequest: {
        instruction,
        operator,
        domain,
        documentId,
        targetHint,
        preserveTokens,
      },
      beforeText,
      proposedText,
      preserveTokens,
      resolvedTarget: (planRequest.target as ResolvedTarget | undefined) ?? undefined,
      lastPreview: previewResult.result,
      receipt: previewResult.receipt,
    });

    const data: EditorSessionStartResponse = {
      sessionId: stored.id,
      status: stored.status,
      preview: previewResult.result as any,
      receipt: (previewResult.receipt as any) ?? null,
      requiresUserChoice: previewResult.requiresUserChoice === true,
      expiresAt: new Date(stored.expiresAt).toISOString(),
    };

    return sendOk(res, data, 201);
  };

  get = async (req: Request, res: Response): Promise<Response> => {
    const userId = userIdFromReq(req);
    if (!userId) return sendErr(res, 'AUTH_UNAUTHORIZED', 'Not authenticated.', 401);

    const sessionId = asString(req.params.sessionId);
    if (!sessionId) return sendErr(res, 'SESSION_ID_REQUIRED', 'sessionId is required.', 400);

    const session = this.store.getForUser(sessionId, userId);
    if (!session) return sendErr(res, 'SESSION_NOT_FOUND', 'Editor session not found or expired.', 404);

    const data: EditorSessionGetResponse = {
      sessionId: session.id,
      status: session.status,
      documentId: session.documentId,
      planRequest: session.planRequest as any,
      beforeText: session.beforeText,
      proposedText: session.proposedText,
      resolvedTarget: session.resolvedTarget,
      lastPreview: session.lastPreview,
      receipt: session.receipt ?? null,
      requiresUserChoice: Boolean(session.lastPreview && (session.lastPreview as any).requiresConfirmation) || false,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };

    return sendOk(res, data);
  };

  apply = async (req: Request, res: Response): Promise<Response> => {
    const ctx = buildContext(req);
    if (!ctx) return sendErr(res, 'AUTH_UNAUTHORIZED', 'Not authenticated.', 401);

    const body = (req.body as Record<string, unknown> | undefined) ?? {};
    const sessionId = asString(body.sessionId);
    if (!sessionId) return sendErr(res, 'SESSION_ID_REQUIRED', 'sessionId is required.', 400);

    const session = this.store.getForUser(sessionId, ctx.userId);
    if (!session) return sendErr(res, 'SESSION_NOT_FOUND', 'Editor session not found or expired.', 404);
    if (session.status !== 'preview_ready') {
      return sendErr(res, 'SESSION_NOT_ACTIVE', `Editor session is not active (status=${session.status}).`, 409);
    }

    const confirmed = asBoolean(body.confirmed);
    const selectedTargetId = asString(body.selectedTargetId);

    let target: ResolvedTarget | undefined = session.resolvedTarget;
    if (selectedTargetId && target) {
      const selected = selectTargetFromCandidate(target, selectedTargetId);
      if (selected) target = selected;
    }

    const applied = await this.editHandler.execute({
      mode: 'apply',
      context: ctx,
      planRequest: {
        instruction: session.planRequest.instruction,
        operator: session.planRequest.operator,
        domain: session.planRequest.domain,
        documentId: session.planRequest.documentId,
        targetHint: session.planRequest.targetHint,
        preserveTokens: session.preserveTokens,
      },
      beforeText: session.beforeText,
      proposedText: session.proposedText,
      preserveTokens: session.preserveTokens,
      userConfirmed: confirmed,
      ...(target ? { target } : {}),
    });

    if (!applied.ok) {
      const mapped = mapEditError(applied.error || 'apply failed');
      return sendErr(res, mapped.code, applied.error || 'Apply failed.', mapped.status);
    }

    if (applied.requiresUserChoice) {
      // Keep session open. Return preview for choice UI.
      session.lastPreview = applied.result;
      session.receipt = applied.receipt;
      this.store.update(session);

      const data: EditorSessionApplyResponse = {
        sessionId: session.id,
        status: session.status,
        requiresUserChoice: true,
        previewIfChoiceRequired: applied.result as any,
        receipt: (applied.receipt as any) ?? null,
      };
      return sendOk(res, data, 200);
    }

    session.status = 'applied';
    session.receipt = applied.receipt;
    this.store.update(session);

    const data: EditorSessionApplyResponse = {
      sessionId: session.id,
      status: session.status,
      applied: applied.result as any,
      receipt: (applied.receipt as any) ?? null,
      requiresUserChoice: false,
    };

    return sendOk(res, data, 200);
  };

  cancel = async (req: Request, res: Response): Promise<Response> => {
    const userId = userIdFromReq(req);
    if (!userId) return sendErr(res, 'AUTH_UNAUTHORIZED', 'Not authenticated.', 401);

    const body = (req.body as Record<string, unknown> | undefined) ?? {};
    const sessionId = asString(body.sessionId);
    if (!sessionId) return sendErr(res, 'SESSION_ID_REQUIRED', 'sessionId is required.', 400);

    const cancelled = this.store.cancel(sessionId, userId);
    if (!cancelled) return sendErr(res, 'SESSION_NOT_FOUND', 'Editor session not found or expired.', 404);

    const data: EditorSessionCancelResponse = { sessionId: cancelled.id, status: cancelled.status };
    return sendOk(res, data, 200);
  };
}

export function createEditorSessionController(): EditorSessionController {
  return new EditorSessionController();
}
