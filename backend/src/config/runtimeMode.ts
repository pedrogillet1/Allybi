export const RUNTIME_ROLES = [
  "api",
  "worker-document",
  "worker-connectors",
  "worker-edit",
  "scheduler",
  "pubsub-worker",
  "pubsub-fanout-worker",
] as const;

export type RuntimeRole = (typeof RUNTIME_ROLES)[number];

function normalize(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isOneOf<T extends readonly string[]>(value: string, allowed: T): value is T[number] {
  return (allowed as readonly string[]).includes(value);
}

export function getRuntimeRole(): RuntimeRole {
  const raw = normalize(process.env.KODA_RUNTIME_ROLE || "api");
  if (isOneOf(raw, RUNTIME_ROLES)) {
    return raw;
  }
  throw new Error(
    `[Runtime] Invalid KODA_RUNTIME_ROLE=${raw}. Expected one of: ${RUNTIME_ROLES.join(", ")}`,
  );
}

export function isApiRuntime(role: RuntimeRole = getRuntimeRole()): boolean {
  return role === "api";
}

export function isPubSubRuntime(
  role: RuntimeRole = getRuntimeRole(),
): boolean {
  return role === "pubsub-worker" || role === "pubsub-fanout-worker";
}

export function shouldUseExternalTls(): boolean {
  const termination = normalize(process.env.KODA_TLS_TERMINATION || "external-lb");
  return termination !== "in-app";
}

export function getAdminIdentityProvider(): "iap" | "legacy-header" | "disabled" {
  const provider = normalize(process.env.KODA_ADMIN_IDENTITY_PROVIDER || "");
  if (provider === "legacy-header" || provider === "disabled") {
    return provider;
  }
  return "iap";
}

export function isLegacyAdminKeyEnabled(): boolean {
  return normalize(process.env.KODA_ENABLE_LEGACY_ADMIN_KEY) === "true";
}

export function shouldAttachSocketRedisAdapter(): boolean {
  const explicit = normalize(process.env.KODA_ENABLE_SOCKET_REDIS_ADAPTER);
  if (explicit) return explicit === "true";
  return Boolean(process.env.REDIS_URL);
}
