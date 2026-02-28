import type { Server as SocketIOServer } from "socket.io";
import { logger } from "../../utils/logger";

let ioRef: SocketIOServer | null = null;

function normalizeUserId(userId: string): string {
  return String(userId || "").trim();
}

export function setRealtimeSocketServer(io: SocketIOServer): void {
  ioRef = io;
}

export function clearRealtimeSocketServer(): void {
  ioRef = null;
}

export function hasRealtimeSocketServer(): boolean {
  return Boolean(ioRef);
}

export function emitRealtimeToUser(
  userId: string,
  event: string,
  payload: Record<string, unknown> = {},
): boolean {
  const io = ioRef;
  const normalizedUserId = normalizeUserId(userId);
  const eventName = String(event || "").trim();
  if (!io || !normalizedUserId || !eventName) return false;

  try {
    // Support both direct room and namespaced room for compatibility.
    io.to(normalizedUserId).emit(eventName, payload);
    io.to(`user:${normalizedUserId}`).emit(eventName, payload);
    return true;
  } catch (error: any) {
    logger.warn("[Realtime] Failed to emit user event", {
      userId: normalizedUserId,
      event: eventName,
      error: error?.message || String(error || "unknown"),
    });
    return false;
  }
}

export function emitRealtimeBroadcast(
  event: string,
  payload: Record<string, unknown> = {},
): boolean {
  const io = ioRef;
  const eventName = String(event || "").trim();
  if (!io || !eventName) return false;
  try {
    io.emit(eventName, payload);
    return true;
  } catch (error: any) {
    logger.warn("[Realtime] Failed to emit broadcast event", {
      event: eventName,
      error: error?.message || String(error || "unknown"),
    });
    return false;
  }
}
