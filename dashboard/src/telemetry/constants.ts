/**
 * Telemetry constants (Koda)
 * -------------------------
 * Canonical constants for:
 *  - severity levels
 *  - categories
 *  - event name strings
 *
 * Keep this file stable: these values are used in DB, dashboards, and alerts.
 */

export const TELEMETRY_SEVERITY = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
  FATAL: "fatal",
} as const;

export type TelemetrySeverity = (typeof TELEMETRY_SEVERITY)[keyof typeof TELEMETRY_SEVERITY];

export const TELEMETRY_CATEGORY = {
  AUTH: "auth",
  FILES: "files",
  FOLDERS: "folders",
  DOCUMENTS: "documents",
  CHAT: "chat",
  RAG: "rag",
  ROUTING: "routing",
  RETRIEVAL: "retrieval",
  LLM: "llm",
  SECURITY: "security",
  ADMIN: "admin",
  BILLING: "billing",
  SYSTEM: "system",
} as const;

export type TelemetryCategory = (typeof TELEMETRY_CATEGORY)[keyof typeof TELEMETRY_CATEGORY];

/**
 * Event name registry
 * -------------------
 * Use dot-delimited namespaces:
 *  - auth.*
 *  - files.*
 *  - folders.*
 *  - documents.*
 *  - chat.*
 *  - routing.*
 *  - retrieval.*
 *  - llm.*
 *  - security.*
 *
 * Add new events here before emitting them in code.
 */
export const TELEMETRY_EVENT = {
  // Auth
  AUTH_LOGIN_SUCCESS: "auth.login.success",
  AUTH_LOGIN_FAILED: "auth.login.failed",
  AUTH_LOGOUT: "auth.logout",
  AUTH_REGISTER: "auth.register",
  AUTH_SESSION_CREATED: "auth.session.created",
  AUTH_SESSION_REVOKED: "auth.session.revoked",

  AUTH_2FA_SETUP_STARTED: "auth.2fa.setup.started",
  AUTH_2FA_SETUP_ENABLED: "auth.2fa.setup.enabled",
  AUTH_2FA_CHALLENGE_FAILED: "auth.2fa.challenge.failed",
  AUTH_2FA_CHALLENGE_PASSED: "auth.2fa.challenge.passed",

  // Files
  FILES_UPLOAD_STARTED: "files.upload.started",
  FILES_UPLOAD_COMPLETED: "files.upload.completed",
  FILES_UPLOAD_FAILED: "files.upload.failed",
  FILES_MOVE: "files.move",
  FILES_RENAME: "files.rename",
  FILES_DELETE: "files.delete",
  FILES_RESTORE: "files.restore",

  // Folders
  FOLDERS_CREATE: "folders.create",
  FOLDERS_RENAME: "folders.rename",
  FOLDERS_MOVE: "folders.move",
  FOLDERS_DELETE: "folders.delete",
  FOLDERS_RESTORE: "folders.restore",

  // Documents (pipeline)
  DOC_PROCESS_STARTED: "documents.process.started",
  DOC_PROCESS_COMPLETED: "documents.process.completed",
  DOC_PROCESS_FAILED: "documents.process.failed",
  DOC_PREVIEW_PDF_STARTED: "documents.preview.pdf.started",
  DOC_PREVIEW_PDF_COMPLETED: "documents.preview.pdf.completed",
  DOC_PREVIEW_PDF_FAILED: "documents.preview.pdf.failed",
  DOC_SLIDES_STARTED: "documents.slides.started",
  DOC_SLIDES_COMPLETED: "documents.slides.completed",
  DOC_SLIDES_FAILED: "documents.slides.failed",

  // Routing
  ROUTING_CLASSIFIED: "routing.classified",
  ROUTING_DISAMBIGUATION: "routing.disambiguation",
  ROUTING_BLOCKED: "routing.blocked",
  ROUTING_FALLBACK: "routing.fallback",

  // Retrieval
  RETRIEVAL_STARTED: "retrieval.started",
  RETRIEVAL_RETRY: "retrieval.retry",
  RETRIEVAL_COMPLETED: "retrieval.completed",
  RETRIEVAL_FAILED: "retrieval.failed",

  // LLM
  LLM_REQUEST: "llm.request",
  LLM_FIRST_TOKEN: "llm.first_token",
  LLM_STREAM_DONE: "llm.stream.done",
  LLM_RESPONSE: "llm.response",
  LLM_ERROR: "llm.error",

  // Chat streaming
  CHAT_MESSAGE_RECEIVED: "chat.message.received",
  CHAT_MESSAGE_SAVED: "chat.message.saved",
  CHAT_STREAM_STARTED: "chat.stream.started",
  CHAT_STREAM_DONE: "chat.stream.done",
  CHAT_STREAM_ABORTED: "chat.stream.aborted",
  CHAT_STREAM_ERROR: "chat.stream.error",

  // Security
  SECURITY_RATE_LIMIT: "security.rate_limit",
  SECURITY_SUSPICIOUS_SESSION: "security.suspicious_session",
  SECURITY_ACCESS_DENIED: "security.access_denied",

  // Admin
  ADMIN_VIEWED: "admin.viewed",
  ADMIN_SEARCHED: "admin.searched",
  ADMIN_EXPORTED: "admin.exported",
  ADMIN_IMPERSONATION_ATTEMPT: "admin.impersonation.attempt",
  ADMIN_IMPERSONATION_SUCCESS: "admin.impersonation.success",
  ADMIN_IMPERSONATION_DENIED: "admin.impersonation.denied",

  // Billing
  BILLING_USAGE_RECORDED: "billing.usage.recorded",
  BILLING_QUOTA_WARNING: "billing.quota.warning",
  BILLING_QUOTA_EXCEEDED: "billing.quota.exceeded",
  BILLING_PLAN_CHANGED: "billing.plan.changed",
  BILLING_PAYMENT_SUCCEEDED: "billing.payment.succeeded",
  BILLING_PAYMENT_FAILED: "billing.payment.failed",

  // System/ops
  SYSTEM_HEALTH_SNAPSHOT: "system.health.snapshot",
  SYSTEM_QUEUE_HEALTH: "system.queue.health",
  SYSTEM_ERROR: "system.error",
} as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENT)[keyof typeof TELEMETRY_EVENT];

/**
 * Default thresholds (optional)
 * These are used by admin dashboard / alerts.
 */
export const TELEMETRY_THRESHOLDS = {
  MAX_TTFT_MS_WARN: 2500,
  MAX_TOTAL_MS_WARN: 20000,
  MAX_ERROR_RATE_WARN: 0.02,
  MAX_FALLBACK_RATE_WARN: 0.08,
  MIN_RETRIEVAL_DOCS_WARN: 1,
} as const;
