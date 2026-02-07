import { randomUUID } from 'crypto';

export type EditorSessionStatus = 'active' | 'committing' | 'committed' | 'cancelled' | 'expired' | 'errored';

export type EditorStage =
  | 'init'
  | 'plan'
  | 'resolve_target'
  | 'draft'
  | 'quality_gates'
  | 'preview'
  | 'apply'
  | 'reindex'
  | 'done';

export type EditorEventType =
  | 'stage'
  | 'delta'
  | 'message'
  | 'patch_proposed'
  | 'patch_enqueued'
  | 'patch_applied'
  | 'warning'
  | 'error';

export interface EditorEvent {
  id: string;
  ts: number;
  seq: number;
  type: EditorEventType;
  payload: Record<string, any>;
}

export interface EditorPatch {
  patchId: string;
  kind: 'docx_paragraph' | 'sheets_cell' | 'slides_text' | 'generic_text';
  target: Record<string, any>;
  before?: string | null;
  after: string;
  meta?: Record<string, any>;
}

export interface EditorSession {
  sessionId: string;
  userId: string;
  documentId?: string | null;
  conversationId?: string | null;
  clientMessageId?: string | null;
  correlationId?: string | null;

  createdAt: number;
  updatedAt: number;
  expiresAt: number;

  status: EditorSessionStatus;
  stage: EditorStage;

  // Session output buffers (kept small)
  draftText?: string | null;
  lastError?: { code: string; message: string } | null;

  // Patches proposed/applied
  patches: EditorPatch[];
  appliedPatchIds: string[];

  // Monotonic sequence for streamed events
  nextSeq: number;
  events: EditorEvent[];
}

export interface EditorSessionCreateInput {
  userId: string;
  documentId?: string | null;
  conversationId?: string | null;
  clientMessageId?: string | null;
  correlationId?: string | null;
  ttlMs?: number;
}

export interface EditorSessionUpdate {
  status?: EditorSessionStatus;
  stage?: EditorStage;
  draftText?: string | null;
  lastError?: { code: string; message: string } | null;
  expiresAt?: number;
}

export class EditorStateService {
  private readonly sessions = new Map<string, EditorSession>();
  private readonly DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_EVENTS = 400;

  createSession(input: EditorSessionCreateInput): EditorSession {
    const now = Date.now();
    const ttlMs = Math.max(30_000, Math.min(input.ttlMs ?? this.DEFAULT_TTL_MS, 12 * 60 * 60 * 1000));

    const session: EditorSession = {
      sessionId: randomUUID(),
      userId: input.userId,
      documentId: input.documentId ?? null,
      conversationId: input.conversationId ?? null,
      clientMessageId: input.clientMessageId ?? null,
      correlationId: input.correlationId ?? null,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ttlMs,
      status: 'active',
      stage: 'init',
      draftText: null,
      lastError: null,
      patches: [],
      appliedPatchIds: [],
      nextSeq: 1,
      events: [],
    };

    this.sessions.set(session.sessionId, session);
    return session;
  }

  getSession(sessionId: string): EditorSession | null {
    const s = this.sessions.get(sessionId) || null;
    if (!s) return null;
    if (this.isExpired(s)) {
      this.expireSession(sessionId);
      return null;
    }
    return s;
  }

  assertSession(sessionId: string): EditorSession {
    const s = this.getSession(sessionId);
    if (!s) throw new Error(`Editor session not found: ${sessionId}`);
    return s;
  }

  touch(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.updatedAt = Date.now();
  }

  updateSession(sessionId: string, patch: EditorSessionUpdate): EditorSession {
    const s = this.assertSession(sessionId);
    const now = Date.now();
    s.updatedAt = now;
    if (patch.status) s.status = patch.status;
    if (patch.stage) s.stage = patch.stage;
    if (patch.draftText !== undefined) s.draftText = patch.draftText;
    if (patch.lastError !== undefined) s.lastError = patch.lastError;
    if (patch.expiresAt !== undefined) s.expiresAt = patch.expiresAt;
    return s;
  }

  addEvent(sessionId: string, type: EditorEventType, payload: Record<string, any>): EditorEvent {
    const s = this.assertSession(sessionId);
    const ev: EditorEvent = {
      id: randomUUID(),
      ts: Date.now(),
      seq: s.nextSeq++,
      type,
      payload,
    };
    s.events.push(ev);
    if (s.events.length > this.MAX_EVENTS) {
      s.events.splice(0, s.events.length - this.MAX_EVENTS);
    }
    s.updatedAt = ev.ts;
    return ev;
  }

  listEvents(sessionId: string, sinceSeq?: number): EditorEvent[] {
    const s = this.assertSession(sessionId);
    if (!sinceSeq) return [...s.events];
    return s.events.filter(e => e.seq > sinceSeq);
  }

  addPatch(sessionId: string, patch: Omit<EditorPatch, 'patchId'> & { patchId?: string }): EditorPatch {
    const s = this.assertSession(sessionId);
    const p: EditorPatch = {
      patchId: patch.patchId || randomUUID(),
      kind: patch.kind,
      target: patch.target,
      before: patch.before ?? null,
      after: patch.after,
      meta: patch.meta,
    };
    s.patches.push(p);
    s.updatedAt = Date.now();
    return p;
  }

  markPatchApplied(sessionId: string, patchId: string): void {
    const s = this.assertSession(sessionId);
    if (!s.appliedPatchIds.includes(patchId)) s.appliedPatchIds.push(patchId);
    s.updatedAt = Date.now();
  }

  cancelSession(sessionId: string, reason?: string): void {
    const s = this.getSession(sessionId);
    if (!s) return;
    s.status = 'cancelled';
    s.stage = 'done';
    s.lastError = reason ? { code: 'CANCELLED', message: reason } : s.lastError;
    s.updatedAt = Date.now();
  }

  sweepExpired(now = Date.now()): { expired: number } {
    let expired = 0;
    for (const [id, s] of this.sessions.entries()) {
      if (s.expiresAt <= now) {
        this.expireSession(id);
        expired++;
      }
    }
    return { expired };
  }

  private isExpired(s: EditorSession): boolean {
    return s.expiresAt <= Date.now() || s.status === 'expired';
  }

  private expireSession(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.status = 'expired';
    s.stage = 'done';
    s.updatedAt = Date.now();
    // Keep record briefly for diagnostics; callers treat expired as missing.
    this.sessions.delete(sessionId);
  }
}

