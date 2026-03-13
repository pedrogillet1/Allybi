import type { ChatRequest } from "../../domain/chat.types";

export type Provider = "gmail" | "outlook" | "slack";
export type EmailProvider = "gmail" | "outlook";
export type ConnectorOperator =
  | "CONNECT_START"
  | "CONNECTOR_SYNC"
  | "CONNECTOR_SEARCH"
  | "CONNECTOR_STATUS"
  | "CONNECTOR_DISCONNECT"
  | "EMAIL_LATEST"
  | "EMAIL_EXPLAIN_LATEST"
  | "EMAIL_SUMMARIZE_PREVIOUS"
  | "EMAIL_DRAFT"
  | "EMAIL_SEND"
  | "EMAIL_DOC_FUSION";

export type ConnectorActionContext = {
  userId: string;
  conversationId: string;
  correlationId: string;
  clientMessageId: string;
};

export type EmailCardAttachment = {
  type: "connector_email_ref";
  provider: EmailProvider;
  messageId?: string;
  cardTitle: string;
  actionLabel: string;
  subject: string;
  from?: string;
  to?: string;
  cc?: string;
  receivedAt?: string;
  preview?: string;
  bodyText?: string;
};

export type SlackCardAttachment = {
  type: "connector_slack_message";
  channelName?: string;
  channelId?: string;
  preview?: string;
};

export const ALL_PROVIDERS: Provider[] = ["gmail", "outlook", "slack"];
export const EMAIL_PROVIDERS: EmailProvider[] = ["gmail", "outlook"];
const CONNECTOR_OPERATORS = new Set<ConnectorOperator>([
  "CONNECT_START",
  "CONNECTOR_SYNC",
  "CONNECTOR_SEARCH",
  "CONNECTOR_STATUS",
  "CONNECTOR_DISCONNECT",
  "EMAIL_LATEST",
  "EMAIL_EXPLAIN_LATEST",
  "EMAIL_SUMMARIZE_PREVIOUS",
  "EMAIL_DRAFT",
  "EMAIL_SEND",
  "EMAIL_DOC_FUSION",
]);
const SEARCH_PREFIX_RE =
  /^(?:please\s+)?(?:search|find|look\s+for|lookup|query|pesquisar|procurar|buscar|encontrar)\s+(?:in|on|no|na|em)?\s*(?:my\s+)?(?:gmail|outlook|slack|emails?|messages?|inbox|channels?|caixa|mensagens?)\s*/i;
const EMAIL_RE_GLOBAL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function providerLabel(provider: Provider): string {
  if (provider === "gmail") return "Gmail";
  if (provider === "outlook") return "Outlook";
  return "Slack";
}

export function normalizePreview(text: string, max = 280): string {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}...` : cleaned;
}

function parseGmailHeader(headers: unknown, name: string): string {
  const needle = name.toLowerCase();
  const list = Array.isArray(headers) ? headers : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (String(record.name || "").toLowerCase() === needle) {
      return asString(record.value);
    }
  }
  return "";
}

function decodeBase64Url(data: string): string {
  const normalized = String(data || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64").toString("utf8");
}

export function extractGmailText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const node = payload as Record<string, unknown>;
  const body = asRecord(node.body);
  const data = asString(body.data);
  const mime = asString(node.mimeType).toLowerCase();
  if (data && (mime === "text/plain" || !mime)) {
    const decoded = normalizePreview(decodeBase64Url(data), 1200);
    if (decoded) return decoded;
  }
  const parts = Array.isArray(node.parts) ? node.parts : [];
  for (const part of parts) {
    const nested = extractGmailText(part);
    if (nested) return nested;
  }
  if (data) {
    const fallback = normalizePreview(
      decodeBase64Url(data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
      1200,
    );
    if (fallback) return fallback;
  }
  return "";
}

export function languageOf(req: ChatRequest): "en" | "pt" | "es" {
  const raw = asString(req.preferredLanguage).toLowerCase();
  if (raw.startsWith("pt")) return "pt";
  if (raw.startsWith("es")) return "es";
  return "en";
}

export function resolveOperator(req: ChatRequest): ConnectorOperator | null {
  const meta = asRecord(req.meta);
  const op = asString(meta.operator).toUpperCase() as ConnectorOperator;
  if (CONNECTOR_OPERATORS.has(op)) return op;
  const text = String(req.message || "").toLowerCase();
  if (text.includes("latest email") || text.includes("ultimo email")) {
    return "EMAIL_LATEST";
  }
  if (text.includes("send") && text.includes("email")) return "EMAIL_SEND";
  if (
    /\b(draft|compose|write|create|craft|generate|redigir|escrever|criar|gerar)\b/i.test(
      text,
    ) &&
    /\b(email|e-mail|message|mensagem)\b/i.test(text)
  ) {
    return "EMAIL_DRAFT";
  }
  if (
    text.includes("search") ||
    text.includes("find") ||
    text.includes("pesquisar") ||
    text.includes("buscar")
  ) {
    return "CONNECTOR_SEARCH";
  }
  return "CONNECTOR_STATUS";
}

export function inferProviderFromText(text: string): Provider | null {
  const msg = String(text || "").toLowerCase();
  if (/\b(gmail|google\s*mail)\b/.test(msg)) return "gmail";
  if (/\b(outlook|office\s*365|microsoft\s*outlook)\b/.test(msg)) return "outlook";
  if (/\b(slack|channel|dm|thread)\b/.test(msg)) return "slack";
  return null;
}

function extractEmailRecipients(text: string): string[] {
  const raw = String(text || "");
  const matches = raw.match(EMAIL_RE_GLOBAL) || [];
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const match of matches) {
    const normalized = String(match || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    recipients.push(normalized);
  }
  return recipients;
}

function inferDraftSubject(body: string): string {
  const trimmed = String(body || "").trim();
  if (!trimmed) return "Quick follow-up";
  const normalized = trimmed
    .replace(/^[,.:;\- ]+/, "")
    .replace(/[.?!\s]+$/, "")
    .trim();
  if (!normalized) return "Quick follow-up";
  const normalizedTypos = normalized.replace(/\bhes\b/gi, "his");
  if (
    /\bhow\b/i.test(normalizedTypos) &&
    /\bday\b/i.test(normalizedTypos) &&
    /\b(you|your|his|her|their)\b/i.test(normalizedTypos)
  ) {
    return "How is your day?";
  }
  let subject = normalizedTypos
    .replace(
      /^(please\s+)?(?:ask(?:ing)?|write(?:ing)?|compose|draft|create|craft|generate|send)\s+(?:them|him|her|the team)?\s*/i,
      "",
    )
    .trim();
  subject = subject.replace(/^for\s+(?:an?\s+|the\s+)?/i, "").trim();
  if (!subject) subject = normalizedTypos;
  subject = subject.charAt(0).toUpperCase() + subject.slice(1);
  if (subject.length > 72) {
    subject = `${subject.slice(0, 69).trim()}...`;
  }
  return subject || "Quick follow-up";
}

function inferDraftBody(bodyHint: string): string {
  let body = String(bodyHint || "").trim();
  if (!body) return "";
  body = body.replace(/\bhes\b/gi, "his").replace(/\s+/g, " ").trim();
  if (!body) return "";
  if (/^how (?:is|was) (?:your|his|her|their) day$/i.test(body)) {
    return "How is your day?";
  }
  body = body.charAt(0).toUpperCase() + body.slice(1);
  if (!/[.?!]$/.test(body)) {
    body = /^(how|what|when|where|why|who|is|are|was|were|do|does|did|can|could|will|would|should)\b/i.test(
      body,
    )
      ? `${body}?`
      : `${body}.`;
  }
  return body;
}

export function parseEmailDraft(text: string): {
  to: string;
  subject: string;
  body: string;
} {
  const raw = String(text || "").trim();
  const recipients = extractEmailRecipients(raw);
  const recipient = recipients.join(", ");
  const subjectMatch = raw.match(/\b(?:subject|assunto|asunto)\s*[:\-]\s*(.+)$/i);
  const explicitSubject = subjectMatch?.[1]?.trim() || "";
  let bodyHint = raw
    .replace(/\s+/g, " ")
    .replace(
      /\b(send|draft|compose|write|create|craft|generate|enviar|redigir|escrever|criar|gerar)\b/gi,
      "",
    )
    .replace(/\b(an?\s+)?email\b/gi, "")
    .replace(EMAIL_RE_GLOBAL, "")
    .replace(/\bto\b|\bpara\b/gi, "")
    .trim();
  const askingMatch = bodyHint.match(
    /\b(?:asking|ask(?:ing)?(?:\s+them)?(?:\s+if)?|preguntando|perguntando)\b[\s:,-]*(.+)$/i,
  );
  if (askingMatch?.[1]) {
    bodyHint = askingMatch[1].trim();
  }
  bodyHint = bodyHint.replace(/\b(?:to|para)\s*$/i, "").replace(/\s+/g, " ").trim();
  const body = inferDraftBody(bodyHint);
  const subject = explicitSubject || inferDraftSubject(body || bodyHint);
  return { to: recipient, subject, body };
}

export function searchQueryFromMessage(message: string): string {
  const raw = String(message || "").trim();
  const stripped = raw.replace(SEARCH_PREFIX_RE, "").trim();
  return stripped || raw;
}

export { parseGmailHeader };
