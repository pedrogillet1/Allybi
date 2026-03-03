export function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(
    new Set(values.map((v) => String(v || "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}

export function lower(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function getArrayCount(bank: unknown): number {
  if (!bank || typeof bank !== "object") return 0;

  const record = bank as Record<string, unknown>;
  const candidateArrayKeys = [
    "rules",
    "aliases",
    "priorities",
    "typeDefinitions",
    "templates",
    "questions",
    "frameworks",
    "entries",
    "patterns",
  ];

  for (const key of candidateArrayKeys) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).length;
  }

  if (record.entries && typeof record.entries === "object") {
    return Object.keys(record.entries as Record<string, unknown>).length;
  }

  return 0;
}
