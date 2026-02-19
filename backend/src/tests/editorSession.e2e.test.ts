import { EditorLockService } from "../services/editorSession/editorLock.service";
import { EditorSessionService } from "../services/editorSession/editorSession.service";
import { EditorStateService } from "../services/editorSession/editorState.service";
import { EditorStreamService } from "../services/editorSession/editorStream.service";

describe("editor session e2e (no redis)", () => {
  it("creates session, proposes patch, enqueues patch (stub), commits", async () => {
    const state = new EditorStateService({ ttlMs: 5_000 });
    const stream = new EditorStreamService(state);
    const locks = new EditorLockService({ redis: null, env: "test" });
    const patchQueue = {
      enqueue: async () => ({ jobId: "job_test_001" }),
    } as any;

    const svc = new EditorSessionService(state, stream, locks, patchQueue);

    const ctx = {
      userId: "u1",
      conversationId: "c1",
      correlationId: "t1",
      clientMessageId: "m1",
    };

    const { session, lock } = await svc.start(ctx, { documentId: "d1" });
    expect(session.sessionId).toBeTruthy();
    expect(lock.token).toBeTruthy();
    expect(await locks.isLocked({ userId: "u1", documentId: "d1" })).toBe(true);

    const patch = svc.proposePatch(ctx, {
      sessionId: session.sessionId,
      patch: {
        kind: "replace_text",
        target: { type: "docx_paragraph", id: "p1" },
        payload: { newText: "Hello" },
      },
    });
    expect(patch.patchId).toBeTruthy();

    const enq = await svc.enqueuePatch(ctx, {
      sessionId: session.sessionId,
      patchId: patch.patchId,
    });
    expect(enq.jobId).toBe("job_test_001");

    const committed = await svc.commit(ctx, {
      sessionId: session.sessionId,
      reason: "apply",
    });
    expect(committed.status).toBe("committed");

    // release lock
    await locks.release(lock);
    expect(await locks.isLocked({ userId: "u1", documentId: "d1" })).toBe(
      false,
    );
  });
});
