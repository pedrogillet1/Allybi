import * as crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";

export interface ProvenanceContext {
  correlationId?: string;
  userId?: string;
  conversationId?: string;
  clientMessageId?: string;
}

export interface InsertLocation {
  documentId: string;
  slideObjectId?: string;
  slideNumber?: number;
  blockId?: string;
  targetLabel?: string;
}

export interface AssetProvenanceEventInput {
  userId: string;
  assetId: string;
  tool: string;
  prompt: string;
  params: Record<string, unknown>;
  inserted: InsertLocation[];
  model?: string;
  runId?: string;
}

export interface AssetProvenanceEvent {
  id: string;
  createdAt: string;
  userId: string;
  assetId: string;
  tool: string;
  model?: string;
  runId?: string;
  promptHash: string;
  paramsHash: string;
  params: Record<string, unknown>;
  inserted: InsertLocation[];
  correlationId?: string;
  conversationId?: string;
  clientMessageId?: string;
}

export interface ProvenanceProofBlock {
  why: string[];
  proof: Array<{ label: string; value: string }>;
}

export interface ListProvenanceFilter {
  assetId?: string;
  documentId?: string;
  limit?: number;
}

const DEFAULT_ROOT = path.resolve(
  process.cwd(),
  "storage",
  "creative",
  "provenance",
);

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableStringify(input: Record<string, unknown>): string {
  const keys = Object.keys(input).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    normalized[key] = input[key];
  }
  return JSON.stringify(normalized);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Provenance logger for creative assets (why/proof).
 */
export class AssetProvenanceService {
  constructor(private readonly rootDir: string = DEFAULT_ROOT) {}

  async logEvent(
    input: AssetProvenanceEventInput,
    ctx?: ProvenanceContext,
  ): Promise<AssetProvenanceEvent> {
    const userId = input.userId.trim();
    const assetId = input.assetId.trim();
    const tool = input.tool.trim();

    if (!userId || !assetId || !tool) {
      throw new Error(
        "userId, assetId, and tool are required for provenance logging.",
      );
    }

    const params = isObject(input.params) ? input.params : {};

    const event: AssetProvenanceEvent = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      userId,
      assetId,
      tool,
      model: input.model?.trim() || undefined,
      runId: input.runId?.trim() || undefined,
      promptHash: hash(input.prompt),
      paramsHash: hash(stableStringify(params)),
      params,
      inserted: input.inserted,
      correlationId: ctx?.correlationId,
      conversationId: ctx?.conversationId,
      clientMessageId: ctx?.clientMessageId,
    };

    await this.appendEvent(userId, event);
    return event;
  }

  async listEvents(
    userId: string,
    filter: ListProvenanceFilter = {},
  ): Promise<AssetProvenanceEvent[]> {
    const events = await this.readEvents(userId);

    const filtered = events.filter((event) => {
      if (filter.assetId && event.assetId !== filter.assetId) {
        return false;
      }

      if (filter.documentId) {
        const matchesDoc = event.inserted.some(
          (target) => target.documentId === filter.documentId,
        );
        if (!matchesDoc) {
          return false;
        }
      }

      return true;
    });

    filtered.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return filtered.slice(0, Math.max(1, Math.min(filter.limit ?? 50, 500)));
  }

  buildProof(event: AssetProvenanceEvent): ProvenanceProofBlock {
    const targets = event.inserted
      .map((entry) => {
        const parts = [entry.documentId];
        if (entry.slideNumber) parts.push(`slide ${entry.slideNumber}`);
        if (entry.slideObjectId)
          parts.push(`slideObjectId=${entry.slideObjectId}`);
        if (entry.blockId) parts.push(`block=${entry.blockId}`);
        return parts.join(" | ");
      })
      .join("; ");

    return {
      why: [
        `Generated with tool ${event.tool}${event.model ? ` using model ${event.model}` : ""}.`,
        `Parameter set hash ${event.paramsHash} ensures deterministic provenance reference.`,
        event.inserted.length > 0
          ? `Asset inserted into ${event.inserted.length} target location(s).`
          : "Asset has no insertion location recorded yet.",
      ],
      proof: [
        { label: "eventId", value: event.id },
        { label: "promptHash", value: event.promptHash },
        { label: "paramsHash", value: event.paramsHash },
        { label: "tool", value: event.tool },
        { label: "inserted", value: targets || "none" },
      ],
    };
  }

  private userFilePath(userId: string): string {
    return path.join(this.rootDir, `${userId}.jsonl`);
  }

  private async appendEvent(
    userId: string,
    event: AssetProvenanceEvent,
  ): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const filePath = this.userFilePath(userId);
    await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  private async readEvents(userId: string): Promise<AssetProvenanceEvent[]> {
    await fs.mkdir(this.rootDir, { recursive: true });
    const filePath = this.userFilePath(userId);

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const lines = raw
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const out: AssetProvenanceEvent[] = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as AssetProvenanceEvent;
          if (parsed?.id && parsed?.userId && parsed?.assetId) {
            out.push(parsed);
          }
        } catch {
          // Skip malformed line to keep log consumption resilient.
        }
      }

      return out;
    } catch {
      return [];
    }
  }
}

export default AssetProvenanceService;
