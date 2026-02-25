import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";

const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function normalizeHeaderValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = typeof value[0] === "string" ? value[0].trim() : "";
    return first || null;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || null;
  }
  return null;
}

function resolveRequestId(req: Request): string {
  const incoming = normalizeHeaderValue(req.headers[REQUEST_ID_HEADER]);
  if (incoming && REQUEST_ID_PATTERN.test(incoming)) return incoming;
  return crypto.randomUUID();
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = resolveRequestId(req);
  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export default requestIdMiddleware;
