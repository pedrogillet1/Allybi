/**
 * Canonical visibility rules for user-facing document listings and folder counts.
 * Keep this as the single source of truth to avoid count/list drift.
 */
export const VISIBLE_DOCUMENT_FILTER = {
  status: { not: "skipped" },
  parentVersionId: null,
  encryptedFilename: { not: { contains: "/connectors/" } },
} as const;
