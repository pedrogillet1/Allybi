import type { ScopeRuntimeMentionConfig } from "./ScopeMentionResolver";

const GENERIC_FILE_TOKENS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "txt",
]);

export function filenameFromStorageKey(
  storageKey: string | null | undefined,
): string | null {
  const key = String(storageKey || "").trim();
  if (!key) return null;
  const tail = key.split("/").pop();
  if (!tail) return null;
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}

export function normSpace(s: string): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

export function lower(s: string): string {
  return normSpace(s).toLowerCase();
}

function resetRegex(pattern: RegExp): void {
  pattern.lastIndex = 0;
}

export function matchRegexPatterns(patterns: RegExp[], input: string): string[] {
  const matches: string[] = [];
  for (const pattern of patterns) {
    resetRegex(pattern);
    if (pattern.global) {
      let result: RegExpExecArray | null = null;
      while ((result = pattern.exec(input)) !== null) {
        for (const chunk of result) {
          const value = normSpace(String(chunk || ""));
          if (value) matches.push(value);
        }
        if (result[0] === "") {
          pattern.lastIndex += 1;
        }
      }
      continue;
    }

    const result = pattern.exec(input);
    if (!result) continue;
    for (const chunk of result) {
      const value = normSpace(String(chunk || ""));
      if (value) matches.push(value);
    }
  }
  return matches;
}

export function tokenizeForScope(
  input: string,
  config: Pick<ScopeRuntimeMentionConfig, "tokenMinLength" | "stopWords">,
): string[] {
  const normalized = lower(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  return normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= config.tokenMinLength &&
        !config.stopWords.has(token) &&
        !GENERIC_FILE_TOKENS.has(token),
    );
}

export function normalizeForExactMention(value: string): string {
  return lower(String(value || ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
