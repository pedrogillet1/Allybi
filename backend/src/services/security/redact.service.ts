const SENSITIVE_KEYS = new Set([
  // Content fields
  "content",
  "contentEncrypted",
  "rawText",
  "previewText",
  "renderableContent",
  "extractedText",
  "extractedTextEncrypted",
  "filename",
  "textEncrypted",
  // PII
  "email",
  "phone",
  "phoneNumber",
  "creditCard",
  "ssn",
  "ipAddress",
  // Auth & secrets
  "password",
  "token",
  "authorization",
  "accessToken",
  "refreshToken",
  "code",
  "secret",
  "backupCodes",
  "passwordHash",
  "salt",
  "recoveryKeyHash",
  "tenantKeyEncrypted",
  "masterKeyEncrypted",
  "dataKeyEncrypted",
  "verificationCode",
  "apiKey",
]);

/** Pattern-based match: any key ending with token, secret, key, password, or hash */
const SENSITIVE_PATTERN = /(?:token|secret|key|password|hash)$/i;

export function redactObjectDeep(input: any): any {
  if (input === null || input === undefined) return input;
  if (typeof input !== "object") return input;

  if (Array.isArray(input)) return input.map(redactObjectDeep);

  const out: any = {};
  for (const [k, v] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(k) || SENSITIVE_PATTERN.test(k)) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redactObjectDeep(v);
    }
  }
  return out;
}
