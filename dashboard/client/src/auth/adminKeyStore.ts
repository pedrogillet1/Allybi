let adminApiKey: string | null = null;

function normalizeKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function setAdminApiKey(key: string): void {
  adminApiKey = normalizeKey(key);
}

export function getAdminApiKey(): string | null {
  return adminApiKey;
}

export function clearAdminApiKey(): void {
  adminApiKey = null;
}

