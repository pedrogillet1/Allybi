import crypto from "crypto";

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export function stripBom(value: string): string {
  if (!value) return value;
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

export function nowIso(): string {
  return new Date().toISOString();
}
