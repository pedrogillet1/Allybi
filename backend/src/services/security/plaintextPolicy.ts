/**
 * Runtime guardrails to prevent accidentally saving plaintext.
 * Hard-fails in prod, can be softened in dev.
 */
export function assertNoPlaintext(label: string, value: unknown) {
  if (value === null || value === undefined) return;
  if (typeof value === "string" && value.trim().length > 0) {
    throw new Error(`[SECURITY] plaintext not allowed for ${label}`);
  }
}
