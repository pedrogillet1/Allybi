import { createHash } from "crypto";

export function normalizeSnippetForProvenanceHash(input: string): string {
  const normalized = String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  let compactNumbers = normalized;
  let prev = "";
  while (compactNumbers !== prev) {
    prev = compactNumbers;
    compactNumbers = compactNumbers.replace(/(\d)[,.](\d{3}\b)/g, "$1$2");
  }

  return compactNumbers
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashSnippetForProvenance(input: string): string {
  return createHash("sha256")
    .update(normalizeSnippetForProvenanceHash(input))
    .digest("hex")
    .slice(0, 16);
}
