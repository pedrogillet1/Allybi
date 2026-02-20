import crypto from "crypto";

export interface PersistedRecallEntry {
  messageId: string;
  role: "user" | "assistant";
  intentFamily: string;
  sourceDocumentIds: string[];
  sourceCount: number;
  summary: string;
  contentHash: string;
  createdAt: string;
}

export class MemoryRedactionService {
  private readonly salt: string;

  constructor(opts?: { salt?: string }) {
    this.salt =
      opts?.salt ||
      process.env.MEMORY_REDACTION_SALT ||
      process.env.TELEMETRY_REDACTION_SALT ||
      "allybi-memory-redaction-salt";
  }

  hashText(input: string): string {
    const normalized = String(input || "")
      .trim()
      .toLowerCase();
    return crypto
      .createHash("sha256")
      .update(`${this.salt}:${normalized}`, "utf8")
      .digest("hex")
      .slice(0, 24);
  }

  sanitizeSourceDocumentIds(input: string[], maxItems: number): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of input || []) {
      const value = String(raw || "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
      if (out.length >= maxItems) break;
    }
    return out;
  }

  normalizeIntentFamily(input: unknown): string {
    const raw = String(input || "")
      .trim()
      .toLowerCase();
    if (!raw) return "general";
    return raw.replace(/[^a-z0-9_]/g, "_").slice(0, 48) || "general";
  }

  buildPersistedRecallEntry(params: {
    messageId: string;
    role: "user" | "assistant";
    intentFamily?: unknown;
    sourceDocumentIds: string[];
    content: string;
    createdAt: Date;
  }): PersistedRecallEntry {
    const intentFamily = this.normalizeIntentFamily(params.intentFamily);
    const summary = `role:${params.role};intent:${intentFamily};sources:${params.sourceDocumentIds.length}`;
    return {
      messageId: params.messageId,
      role: params.role,
      intentFamily,
      sourceDocumentIds: [...params.sourceDocumentIds],
      sourceCount: params.sourceDocumentIds.length,
      summary,
      contentHash: this.hashText(params.content),
      createdAt: params.createdAt.toISOString(),
    };
  }

  approximateBytes(value: unknown): number {
    try {
      return Buffer.byteLength(JSON.stringify(value), "utf8");
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }
}
