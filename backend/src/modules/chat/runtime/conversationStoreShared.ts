import type { EncryptedChatRepo } from "../infrastructure/encryptedChatRepo.service";
import type {
  ChatMessageDTO,
  ChatRequest,
  ChatResult,
  ChatRole,
  ConversationDTO,
} from "../domain/chat.contracts";

export function clampLimit(input: unknown, fallback: number): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.max(value, 1), 500);
}

export function parseStoredMetadata(
  raw: string | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function toConversationDTO(row: {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ConversationDTO {
  return {
    id: String(row.id),
    title: String(row.title ?? "New Chat"),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function toMessageDTO(row: {
  id: string;
  role: string;
  content: string | null;
  createdAt: Date;
  updatedAt?: Date;
  metadata: string | null;
}): ChatMessageDTO {
  const metadata = parseStoredMetadata(row.metadata);
  const attachments =
    metadata && "attachments" in metadata ? metadata.attachments : null;
  const telemetry =
    metadata && "telemetry" in metadata ? metadata.telemetry : null;
  return {
    id: String(row.id),
    role: row.role as ChatRole,
    content: String(row.content ?? ""),
    attachments: attachments ?? null,
    telemetry: (telemetry as Record<string, unknown> | null) ?? null,
    metadata,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt ?? row.createdAt).toISOString(),
  };
}

const PLACEHOLDER_CONVERSATION_TITLES = new Set(["", "new chat", "untitled"]);

function normalizeTitleKey(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function isPlaceholderConversationTitle(value: unknown): boolean {
  return PLACEHOLDER_CONVERSATION_TITLES.has(normalizeTitleKey(value));
}

export function deriveAutoConversationTitleFromMessage(
  message: string,
  opts?: { maxWords?: number; maxChars?: number },
): string | null {
  const maxWords = Math.max(3, Math.min(16, Number(opts?.maxWords) || 10));
  const maxChars = Math.max(24, Math.min(120, Number(opts?.maxChars) || 80));
  const cleaned = String(message || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'`“”‘’\-–—:;,.!?()[\]{}]+/, "")
    .trim();
  if (!cleaned) return null;

  const words = cleaned.split(" ").filter(Boolean);
  if (!words.length) return null;

  let title = words.slice(0, maxWords).join(" ").trim();
  title = title.replace(/[\s"'`“”‘’\-–—:;,.!?()[\]{}]+$/, "").trim();
  if (!title) return null;
  if (title.length > maxChars) {
    title = title.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
  }
  return title || null;
}

export type PersistedTurnIdentity = {
  conversationId: string;
  titleWasPlaceholder: boolean;
  lastDocumentId: string | null;
};

export type PreparedUserTurn = {
  userMessage: ChatMessageDTO;
  priorAssistantMessageId: string | null;
};

export function withGeneratedConversationTitle(
  result: ChatResult,
  generatedTitle: string | null,
): ChatResult {
  if (!generatedTitle) return result;
  return {
    ...result,
    generatedTitle,
  };
}

export class EncryptedConversationRepoBinding {
  constructor(private encryptedRepo?: EncryptedChatRepo) {}

  wireEncryption(encryptedRepo: EncryptedChatRepo): void {
    this.encryptedRepo = encryptedRepo;
  }

  getEncryptedRepo(): EncryptedChatRepo | undefined {
    return this.encryptedRepo;
  }
}

export function buildMetadataJson(input: {
  metadata?: Record<string, unknown> | null;
  attachments?: unknown;
  telemetry?: Record<string, unknown> | null;
}): { mergedMetadata: Record<string, unknown>; metadataJson: string | null } {
  const mergedMetadata: Record<string, unknown> = {
    ...(input.metadata || {}),
  };
  if (input.attachments !== undefined) mergedMetadata.attachments = input.attachments;
  if (input.telemetry !== undefined) mergedMetadata.telemetry = input.telemetry;
  return {
    mergedMetadata,
    metadataJson:
      Object.keys(mergedMetadata).length > 0
        ? JSON.stringify(mergedMetadata)
        : null,
  };
}

export function isRegenerateRequest(req: ChatRequest): boolean {
  return req.isRegenerate === true;
}
