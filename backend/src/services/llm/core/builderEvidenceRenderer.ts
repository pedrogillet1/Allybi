import { createHash } from "crypto";

import type { EvidencePackLike } from "./llmRequestBuilder.service";

export type BuilderEvidenceCaps = {
  maxItems: number;
  maxSnippetChars: number;
  maxSectionChars: number;
};

export type BuilderRuntimePolicy = {
  payloadCaps: {
    memoryCharsDefault: number;
    memoryCharsDocGrounded: number;
    userSectionCharsMax: number;
    toolContextCharsMax: number;
    totalUserPayloadCharsMax: number;
  };
  evidenceCapsByMode: Record<string, BuilderEvidenceCaps>;
};

export type EvidenceRenderResult = {
  text: string;
  charsIncluded: number;
  itemsIncluded: number;
  tableItemsRendered: number;
  tableQualityAnnotations: number;
};

export function renderEvidenceForPrompt(
  pack: EvidencePackLike,
  opts?: { isExtractionQuery?: boolean; answerMode?: string },
  policy?: BuilderRuntimePolicy,
): EvidenceRenderResult {
  const activePolicy = policy!;
  const answerMode = String(opts?.answerMode || "").trim().toLowerCase();
  const modeLimits = activePolicy.evidenceCapsByMode[answerMode] || {
    maxItems: 8,
    maxSnippetChars: 260,
    maxSectionChars: 3400,
  };
  const extractionBoost = opts?.isExtractionQuery
    ? { maxItems: 16, maxSnippetChars: 800, maxSectionChars: 16000 }
    : null;
  const maxItems = extractionBoost
    ? Math.max(modeLimits.maxItems, extractionBoost.maxItems)
    : modeLimits.maxItems;
  const maxSnippetChars = extractionBoost
    ? Math.max(modeLimits.maxSnippetChars, extractionBoost.maxSnippetChars)
    : modeLimits.maxSnippetChars;
  const maxSectionChars = extractionBoost
    ? Math.max(modeLimits.maxSectionChars, extractionBoost.maxSectionChars)
    : modeLimits.maxSectionChars;

  const top = pack.evidence.slice(0, maxItems);
  const lines: string[] = [];
  const header =
    answerMode === "doc_grounded_multi"
      ? "### Evidence (synthesize a confident answer from all relevant documents below)"
      : "### Evidence (answer the specific question directly using this evidence)";
  lines.push(header);
  let sectionChars = header.length;
  let itemsIncluded = 0;
  let tableItemsRendered = 0;
  let tableQualityAnnotations = 0;
  for (const e of top) {
    const title = e.title || e.filename || e.docId;
    const locParts: string[] = [];
    if (e.location?.page != null && Number(e.location.page) >= 0) locParts.push(`p.${e.location.page}`);
    if (e.location?.slide != null) locParts.push(`s.${e.location.slide}`);
    if (e.location?.sheet) locParts.push(`sheet:${e.location.sheet}`);
    if (e.location?.sectionKey && !e.location.sectionKey.startsWith("chunk_")) {
      locParts.push(`sec:${e.location.sectionKey}`);
    }
    const loc = locParts.join(",");
    const displayLocationKey = loc || title || "text";
    const displayEvidenceId = `${e.docId}:${displayLocationKey}`;
    const locationKey = String(
      e.locationKey || loc || `${e.docId}:${e.evidenceType || "text"}`,
    ).trim();

    let clipped: string;
    if (
      e.evidenceType === "table" &&
      e.table &&
      Array.isArray(e.table.header) &&
      e.table.header.length > 0
    ) {
      const hdr = e.table.header.map((h) => String(h ?? "")).join(" | ");
      const rows = (e.table.rows || [])
        .slice(0, 20)
        .map((r) => (r || []).map((c) => String(c ?? "")).join(" | "));
      const sep = e.table.header.map(() => "---").join(" | ");
      const tableText = [hdr, sep, ...rows].join("\n");
      clipped =
        tableText.length > maxSnippetChars
          ? tableText.slice(0, maxSnippetChars - 1) + "…"
          : tableText;
      tableItemsRendered++;
      if (e.table.warnings?.length) {
        clipped += ` [warnings: ${e.table.warnings.join(", ")}]`;
      }
      if (e.table.structureScore != null && e.table.structureScore < 0.8) {
        clipped += ` [structureQuality: ${(e.table.structureScore * 100).toFixed(0)}%]`;
        tableQualityAnnotations++;
      }
      if (e.table.numericIntegrityScore != null && e.table.numericIntegrityScore < 0.9) {
        clipped += ` [numericIntegrity: ${(e.table.numericIntegrityScore * 100).toFixed(0)}%]`;
        tableQualityAnnotations++;
      }
    } else {
      const snippet = (e.snippet || "").trim().replace(/\s+/g, " ");
      if (snippet.length <= maxSnippetChars) {
        clipped = snippet;
      } else {
        let truncAt = maxSnippetChars - 1;
        const unitPatterns =
          /(?:R\$|\$|EUR)\s*[\d.,]+|\d[\d.,]*\s*(?:%|kg|months?|years?|days?|hours?|mil|milhões?|bilhões?)/gi;
        let um: RegExpExecArray | null;
        while ((um = unitPatterns.exec(snippet)) !== null) {
          if (um.index < truncAt && um.index + um[0].length > truncAt) {
            truncAt = um.index + um[0].length;
            break;
          }
        }
        clipped = snippet.slice(0, truncAt) + "…";
      }
    }

    const line = `- evidenceId=${displayEvidenceId} | documentId=${e.docId} | locationKey=${displayLocationKey} | title=${title}${loc ? ` | location=${loc}` : ""} | snippet=${clipped}`;
    if (sectionChars + line.length + 1 > maxSectionChars) break;
    lines.push(line);
    sectionChars += line.length + 1;
    itemsIncluded += 1;
    void locationKey;
  }

  const text = lines.join("\n");
  return {
    text,
    charsIncluded: text.length,
    itemsIncluded,
    tableItemsRendered,
    tableQualityAnnotations,
  };
}

export function buildEvidenceMapMetadata(
  evidencePack: EvidencePackLike | null | undefined,
): Array<{
  evidenceId: string;
  documentId: string;
  locationKey: string;
  snippetHash: string;
}> {
  if (!evidencePack || !Array.isArray(evidencePack.evidence)) return [];
  const out: Array<{
    evidenceId: string;
    documentId: string;
    locationKey: string;
    snippetHash: string;
  }> = [];
  for (const item of evidencePack.evidence) {
    const documentId = String(item.docId || "").trim();
    const locationKey = String(item.locationKey || "").trim();
    const snippet = String(item.snippet || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!documentId || !locationKey || !snippet) continue;
    out.push({
      evidenceId: `${documentId}:${locationKey}`,
      documentId,
      locationKey,
      snippetHash: createHash("sha256").update(snippet).digest("hex").slice(0, 16),
    });
  }
  return out;
}
