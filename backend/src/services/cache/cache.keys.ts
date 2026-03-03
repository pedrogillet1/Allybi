import crypto from "crypto";

function stableSerialize(value: unknown): string {
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function hashArgs(args: unknown[]): string {
  const payload = args.map(stableSerialize).join("|");
  return crypto.createHash("md5").update(payload).digest("hex");
}

export function buildCacheKey(prefix: string, ...args: unknown[]): string {
  return `${prefix}:${hashArgs(args)}`;
}

export function buildDocumentBufferKey(documentId: string): string {
  return `document_buffer:${documentId}`;
}

export function buildQueryResponseKey(
  userId: string,
  mode: string,
  query: string,
): string {
  const normalizedQuery = String(query || "").toLowerCase().trim();
  return `query_response:${userId}:${mode}:${buildCacheKey("qr", normalizedQuery)}`;
}
