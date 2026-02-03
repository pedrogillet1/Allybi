// file: src/admin/controllers/live.controller.ts
import type { Request, Response } from "express";
import { liveService } from "../services/live.service";

/**
 * SSE stream for admin dashboard live feed
 * GET /api/admin/live/events?since=ISO&limit=100
 *
 * SECURITY NOTE:
 * - Guards must be applied at router level (owner/adminKey/ip allowlist).
 * - Stream MUST NOT include PII or plaintext user content.
 * - Events returned by liveService must already be sanitized.
 */

function parseOptionalIso(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseIntClamped(input: unknown, def: number, min: number, max: number): number {
  const n = typeof input === "string" ? Number(input) : typeof input === "number" ? input : def;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function sseWrite(res: Response, lines: string[]) {
  res.write(lines.join("\n") + "\n\n");
}

export async function streamLiveEvents(req: Request, res: Response) {
  // Setup SSE headers
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // nginx: don't buffer SSE

  // If behind proxy, flush headers if available
  (res as any).flushHeaders?.();

  const since = parseOptionalIso(req.query.since);
  const limit = parseIntClamped(req.query.limit, 100, 1, 500);

  // Send initial ready event
  sseWrite(res, [
    "event: ready",
    `data: ${JSON.stringify({ ok: true, since: since ?? null, serverTs: new Date().toISOString() })}`,
  ]);

  // Heartbeat every 15s so proxies don’t close the connection
  const heartbeat = setInterval(() => {
    // SSE comment line
    res.write(`:heartbeat ${Date.now()}\n\n`);
  }, 15_000);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    try {
      res.end();
    } catch {
      // ignore
    }
  };

  // If client disconnects
  req.on("close", close);
  req.on("aborted", close);

  try {
    // Simple polling loop (safe default).
    // If your liveService uses Redis streams, this can be upgraded to block reads.
    let cursor = since ?? new Date(Date.now() - 60_000).toISOString(); // default: last 60s
    while (!closed) {
      const batch = await liveService.getEventsSince({ since: cursor, limit });

      if (Array.isArray(batch.events) && batch.events.length > 0) {
        // Update cursor to newest event timestamp
        cursor = batch.nextSince ?? cursor;

        for (const evt of batch.events) {
          // evt must already be sanitized and must not contain plaintext content
          sseWrite(res, [
            "event: telemetry",
            `data: ${JSON.stringify(evt)}`,
          ]);
        }
      }

      // Wait a bit before polling again
      await new Promise((r) => setTimeout(r, 2_000));
    }
  } catch (err) {
    if (!closed) {
      // Send a safe error event, no internal details
      sseWrite(res, [
        "event: error",
        `data: ${JSON.stringify({ ok: false, error: "stream_error" })}`,
      ]);
      close();
    }
  }
}
