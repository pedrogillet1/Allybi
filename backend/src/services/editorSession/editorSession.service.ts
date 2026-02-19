import { EditorLockService, type EditorLockHandle } from "./editorLock.service";
import {
  EditorPatchQueueService,
  type EditorPatchJobData,
} from "./editorPatchQueue.service";
import {
  EditorStateService,
  type EditorPatch,
  type EditorSession,
} from "./editorState.service";
import { EditorStreamService } from "./editorStream.service";

export interface EditorCtx {
  userId: string;
  correlationId?: string | null;
  conversationId?: string | null;
  clientMessageId?: string | null;
}

export interface StartEditorSessionInput {
  documentId: string;
  ttlMs?: number;
}

export interface ProposePatchInput {
  sessionId: string;
  patch: Omit<EditorPatch, "patchId"> & { patchId?: string };
}

export interface EnqueuePatchInput {
  sessionId: string;
  patchId: string;
}

export interface CommitSessionInput {
  sessionId: string;
  reason?: string;
}

/**
 * EditorSessionService
 * - owns session lifecycle
 * - acquires a per-(user,document) lock to prevent concurrent commits
 * - stores stream events + patch proposals in EditorStateService
 * - optionally enqueues patch application via BullMQ
 */
export class EditorSessionService {
  constructor(
    private readonly state: EditorStateService,
    private readonly stream: EditorStreamService,
    private readonly locks: EditorLockService,
    private readonly patchQueue: EditorPatchQueueService,
  ) {}

  async start(
    ctx: EditorCtx,
    input: StartEditorSessionInput,
  ): Promise<{ session: EditorSession; lock: EditorLockHandle }> {
    const session = this.state.createSession({
      userId: ctx.userId,
      documentId: input.documentId,
      conversationId: ctx.conversationId ?? null,
      clientMessageId: ctx.clientMessageId ?? null,
      correlationId: ctx.correlationId ?? null,
      ttlMs: input.ttlMs,
    });

    const lock = await this.locks.acquire(
      { userId: ctx.userId, documentId: input.documentId },
      45_000,
    );
    this.stream.setStage({
      sessionId: session.sessionId,
      stage: "init",
      message: "Editor session started",
    });
    return { session, lock };
  }

  get(ctx: EditorCtx, sessionId: string): EditorSession {
    const s = this.state.assertSession(sessionId);
    if (s.userId !== ctx.userId) throw new Error("FORBIDDEN");
    return s;
  }

  proposePatch(ctx: EditorCtx, input: ProposePatchInput): EditorPatch {
    const s = this.get(ctx, input.sessionId);
    if (s.status !== "active") throw new Error("SESSION_NOT_ACTIVE");
    const p = this.state.addPatch(input.sessionId, input.patch);
    this.state.addEvent(input.sessionId, "patch_proposed", {
      patchId: p.patchId,
      kind: p.kind,
      target: p.target,
    });
    return p;
  }

  async enqueuePatch(
    ctx: EditorCtx,
    input: EnqueuePatchInput,
  ): Promise<{ jobId: string }> {
    const s = this.get(ctx, input.sessionId);
    if (!s.documentId) throw new Error("SESSION_HAS_NO_DOCUMENT");

    const patch = s.patches.find((p) => p.patchId === input.patchId);
    if (!patch) throw new Error("PATCH_NOT_FOUND");

    const data: EditorPatchJobData = {
      sessionId: s.sessionId,
      userId: s.userId,
      documentId: s.documentId,
      patch,
      correlationId: s.correlationId ?? undefined,
      conversationId: s.conversationId ?? undefined,
      clientMessageId: s.clientMessageId ?? undefined,
    };

    this.state.addEvent(s.sessionId, "patch_enqueued", {
      patchId: patch.patchId,
    });
    return this.patchQueue.enqueue(data);
  }

  async commit(
    ctx: EditorCtx,
    input: CommitSessionInput,
  ): Promise<EditorSession> {
    const s = this.get(ctx, input.sessionId);
    if (s.status !== "active") return s;

    this.state.updateSession(s.sessionId, {
      status: "committing",
      stage: "apply",
    });
    this.stream.setStage({
      sessionId: s.sessionId,
      stage: "apply",
      message: input.reason ?? "Committing changes",
    });

    // Note: actual file mutation is done by editing services / patch worker.
    // Here we only flip state; callers should use enqueuePatch + downstream workers.
    return this.state.updateSession(s.sessionId, {
      status: "committed",
      stage: "done",
    });
  }

  async cancel(
    ctx: EditorCtx,
    sessionId: string,
    reason?: string,
  ): Promise<void> {
    const s = this.get(ctx, sessionId);
    this.state.cancelSession(s.sessionId, reason);
  }
}
