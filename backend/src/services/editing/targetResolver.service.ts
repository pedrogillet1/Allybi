import { clamp01 } from "../../types/common.types";
import type {
  DocxParagraphNode,
  ResolvedTarget,
  ResolvedTargetCandidate,
  SheetsTargetNode,
  SlidesTargetNode,
} from "./editing.types";

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(input: string): string[] {
  return normalize(input).split(/[^a-z0-9]+/).filter(Boolean);
}

function jaccard(a: string, b: string): number {
  const setA = new Set(tokens(a));
  const setB = new Set(tokens(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of Array.from(setA)) if (setB.has(token)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function prefixMatchScore(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);
  return c.startsWith(q) || q.startsWith(c) ? 1 : 0;
}

function indexProximityScore(query: string, idx: number, max: number): number {
  if (max <= 1) return 0;
  const extracted = /\b(\d{1,5})\b/.exec(query);
  if (!extracted) return 0;
  const desired = Number(extracted[1]);
  if (!Number.isFinite(desired)) return 0;
  const normalizedIdx = idx + 1;
  const delta = Math.abs(normalizedIdx - desired);
  return clamp01(1 - delta / Math.max(5, max / 4));
}

function buildResolvedTarget(
  scored: Array<{ id: string; label: string; score: number; reasons: string[] }>,
  fallbackLabel: string,
): ResolvedTarget {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const top = sorted[0] || { id: "unknown", label: fallbackLabel, score: 0, reasons: ["no-candidate"] };
  const secondScore = sorted[1]?.score ?? 0;
  const decisionMargin = clamp01(top.score - secondScore);

  const candidates: ResolvedTargetCandidate[] = sorted.slice(0, 3).map((item) => ({
    id: item.id,
    label: item.label,
    confidence: clamp01(item.score),
    reasons: item.reasons,
  }));

  const isAmbiguous = top.score < 0.55 || decisionMargin < 0.12;
  const resolutionReason = isAmbiguous
    ? "Multiple candidates are similarly relevant."
    : "Top candidate has clear score lead.";

  return {
    id: top.id,
    label: top.label,
    confidence: clamp01(top.score),
    candidates,
    decisionMargin,
    isAmbiguous,
    resolutionReason,
  };
}

export class TargetResolverService {
  resolveDocxParagraphTarget(query: string, paragraphs: DocxParagraphNode[]): ResolvedTarget {
    const q = normalize(query);
    const max = paragraphs.length;
    const scored = paragraphs.map((paragraph, idx) => {
      const textScore = jaccard(q, paragraph.text);
      const sectionScore = jaccard(q, (paragraph.sectionPath || []).join(" "));
      const idScore = q.includes(normalize(paragraph.paragraphId)) ? 1 : 0;
      const prefixScore = prefixMatchScore(q, paragraph.text.slice(0, 70));
      const rankScore = indexProximityScore(q, idx, max);
      const score = clamp01(textScore * 0.48 + sectionScore * 0.16 + idScore * 0.2 + prefixScore * 0.08 + rankScore * 0.08);

      const reasons: string[] = [];
      if (textScore > 0.2) reasons.push("text-overlap");
      if (sectionScore > 0.2) reasons.push("section-overlap");
      if (idScore > 0) reasons.push("id-match");
      if (rankScore > 0.2) reasons.push("index-match");

      return {
        id: paragraph.paragraphId,
        label: paragraph.sectionPath?.length
          ? `${paragraph.sectionPath.join(" / ")} > ${paragraph.paragraphId}`
          : paragraph.paragraphId,
        score,
        reasons: reasons.length ? reasons : ["weak-match"],
      };
    });

    return buildResolvedTarget(scored, "paragraph");
  }

  resolveSheetsCellOrRangeTarget(query: string, cells: SheetsTargetNode[]): ResolvedTarget {
    const q = normalize(query);
    const scored = cells.map((cell) => {
      const a1Score = q.includes(normalize(cell.a1)) ? 1 : 0;
      const sheetScore = jaccard(q, cell.sheetName);
      const headerScore = jaccard(q, cell.header || "");
      const contentScore = jaccard(q, cell.text);
      const prefixScore = prefixMatchScore(q, `${cell.sheetName} ${cell.a1}`);
      const score = clamp01(a1Score * 0.35 + sheetScore * 0.2 + headerScore * 0.22 + contentScore * 0.18 + prefixScore * 0.05);

      const reasons: string[] = [];
      if (a1Score > 0) reasons.push("a1-match");
      if (sheetScore > 0.2) reasons.push("sheet-name-overlap");
      if (headerScore > 0.2) reasons.push("header-overlap");
      if (contentScore > 0.2) reasons.push("content-overlap");

      return {
        id: cell.targetId,
        label: `${cell.sheetName}!${cell.a1}`,
        score,
        reasons: reasons.length ? reasons : ["weak-match"],
      };
    });
    return buildResolvedTarget(scored, "sheet-target");
  }

  resolveSlidesTarget(query: string, targets: SlidesTargetNode[]): ResolvedTarget {
    const q = normalize(query);
    const scored = targets.map((target) => {
      const slideToken = `slide ${target.slideNumber}`;
      const slideScore = q.includes(normalize(slideToken)) ? 1 : 0;
      const labelScore = jaccard(q, target.label);
      const textScore = jaccard(q, target.text);
      const prefixScore = prefixMatchScore(q, target.label);
      const score = clamp01(slideScore * 0.3 + labelScore * 0.22 + textScore * 0.42 + prefixScore * 0.06);

      const reasons: string[] = [];
      if (slideScore > 0) reasons.push("slide-number-match");
      if (labelScore > 0.2) reasons.push("label-overlap");
      if (textScore > 0.2) reasons.push("text-overlap");

      return {
        id: target.objectId,
        label: `Slide ${target.slideNumber} • ${target.label}`,
        score,
        reasons: reasons.length ? reasons : ["weak-match"],
      };
    });
    return buildResolvedTarget(scored, "slide-target");
  }
}
