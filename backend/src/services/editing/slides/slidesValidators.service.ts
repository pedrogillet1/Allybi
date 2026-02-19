import type { slides_v1 } from "googleapis";
import {
  SlidesClientError,
  SlidesClientService,
  type SlidesRequestContext,
} from "./slidesClient.service";

export interface SlideTargetCandidate {
  objectId: string;
  slideObjectId: string;
  slideNumber: number;
  label: string;
  score: number;
  reasons: string[];
}

export interface SlideTargetResolution {
  target?: SlideTargetCandidate;
  confidence: number;
  candidates: SlideTargetCandidate[];
  decisionMargin: number;
  ambiguous: boolean;
  reasonCodes: string[];
}

interface SlideIndexNode {
  slideObjectId: string;
  slideNumber: number;
  slideTitle: string;
  pageElementObjectId: string;
  pageElementLabel: string;
  text: string;
}

const MIN_GOOD_SCORE = 0.55;

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function extractTextFromShape(
  shape: slides_v1.Schema$Shape | undefined,
): string {
  const textElements = asArray(shape?.text?.textElements);
  const chunks: string[] = [];

  for (const element of textElements) {
    const content = element.textRun?.content;
    if (content && content.trim()) {
      chunks.push(content);
    }
  }

  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function extractSlideNumberHint(query: string): number | null {
  const m = query.match(/\bslide\s*(\d+)\b/i) ?? query.match(/\b(\d+)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function tokenOverlapScore(targetText: string, query: string): number {
  const q = normalize(query);
  const t = normalize(targetText);
  if (!q || !t) return 0;

  if (q === t) return 1;
  if (t.includes(q) || q.includes(t)) return 0.85;

  const qTokens = q.split(" ").filter(Boolean);
  const tTokens = new Set(t.split(" ").filter(Boolean));

  if (qTokens.length === 0) return 0;
  let overlap = 0;
  for (const token of qTokens) {
    if (tTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / qTokens.length;
}

/**
 * Slides validation and target resolution for ambiguous user hints.
 */
export class SlidesValidatorsService {
  constructor(
    private readonly slidesClient: SlidesClientService = new SlidesClientService(),
  ) {}

  async validateSlideExists(
    presentationId: string,
    slideObjectId: string,
    ctx?: SlidesRequestContext,
  ): Promise<boolean> {
    const presentation = await this.slidesClient.getPresentation(
      presentationId,
      ctx,
    );
    const slides = presentation.slides ?? [];
    return slides.some((slide) => slide.objectId === slideObjectId);
  }

  async resolveSlideTarget(
    presentationId: string,
    query: string,
    ctx?: SlidesRequestContext,
  ): Promise<SlideTargetResolution> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return {
        confidence: 0,
        candidates: [],
        decisionMargin: 0,
        ambiguous: true,
        reasonCodes: ["EMPTY_QUERY"],
      };
    }

    const presentation = await this.slidesClient.getPresentation(
      presentationId,
      ctx,
    );
    const index = this.buildIndex(presentation);

    if (index.length === 0) {
      return {
        confidence: 0,
        candidates: [],
        decisionMargin: 0,
        ambiguous: true,
        reasonCodes: ["NO_SLIDE_TEXT_INDEX"],
      };
    }

    const slideNumberHint = extractSlideNumberHint(normalizedQuery);

    const ranked = index
      .map((node): SlideTargetCandidate => {
        const reasons: string[] = [];
        let score = 0;

        const labelScore = tokenOverlapScore(
          node.pageElementLabel,
          normalizedQuery,
        );
        if (labelScore > 0) {
          score += labelScore * 0.45;
          reasons.push("LABEL_MATCH");
        }

        const textScore = tokenOverlapScore(node.text, normalizedQuery);
        if (textScore > 0) {
          score += textScore * 0.35;
          reasons.push("TEXT_MATCH");
        }

        const titleScore = tokenOverlapScore(node.slideTitle, normalizedQuery);
        if (titleScore > 0) {
          score += titleScore * 0.2;
          reasons.push("TITLE_MATCH");
        }

        if (slideNumberHint !== null && node.slideNumber === slideNumberHint) {
          score += 0.25;
          reasons.push("SLIDE_NUMBER_MATCH");
        }

        score = Math.min(1, score);

        return {
          objectId: node.pageElementObjectId,
          slideObjectId: node.slideObjectId,
          slideNumber: node.slideNumber,
          label: node.pageElementLabel,
          score,
          reasons,
        };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (ranked.length === 0) {
      return {
        confidence: 0,
        candidates: [],
        decisionMargin: 0,
        ambiguous: true,
        reasonCodes: ["NO_TARGET_MATCH"],
      };
    }

    const top = ranked[0];
    const second = ranked[1];
    const margin = second ? top.score - second.score : top.score;

    const ambiguous =
      top.score < MIN_GOOD_SCORE || (Boolean(second) && margin < 0.15);

    const reasonCodes = [
      ambiguous ? "AMBIGUOUS_TARGET" : "RESOLVED_TARGET",
      top.reasons.length > 0 ? top.reasons[0] : "SCORE_ONLY",
    ];

    return {
      target: top,
      confidence: top.score,
      candidates: ranked,
      decisionMargin: margin,
      ambiguous,
      reasonCodes,
    };
  }

  assertObjectId(objectId: string, fieldName: string): string {
    const normalized = objectId.trim();
    if (!normalized) {
      throw new SlidesClientError(`${fieldName} is required.`, {
        code: "INVALID_OBJECT_ID",
        retryable: false,
      });
    }
    return normalized;
  }

  private buildIndex(
    presentation: slides_v1.Schema$Presentation,
  ): SlideIndexNode[] {
    const slides = presentation.slides ?? [];
    const nodes: SlideIndexNode[] = [];

    for (let i = 0; i < slides.length; i += 1) {
      const slide = slides[i];
      const slideObjectId = slide.objectId;
      if (!slideObjectId) {
        continue;
      }

      const pageElements = slide.pageElements ?? [];
      const titleShape = pageElements
        .map((element) => ({
          objectId: element.objectId,
          shape: element.shape,
          placeholderType: element.shape?.placeholder?.type ?? "",
        }))
        .find(
          (entry) =>
            entry.objectId &&
            (entry.placeholderType === "TITLE" ||
              entry.placeholderType === "CENTERED_TITLE"),
        );

      const slideTitle = extractTextFromShape(titleShape?.shape);

      for (const element of pageElements) {
        if (!element.objectId) {
          continue;
        }

        const text = extractTextFromShape(element.shape);
        const label = this.deriveElementLabel(slideTitle, element, text, i + 1);

        nodes.push({
          slideObjectId,
          slideNumber: i + 1,
          slideTitle,
          pageElementObjectId: element.objectId,
          pageElementLabel: label,
          text,
        });
      }
    }

    return nodes;
  }

  private deriveElementLabel(
    slideTitle: string,
    element: slides_v1.Schema$PageElement,
    text: string,
    slideNumber: number,
  ): string {
    const placeholderType = element.shape?.placeholder?.type;
    const textProbe = text.slice(0, 80).trim();

    if (placeholderType === "TITLE" || placeholderType === "CENTERED_TITLE") {
      return `slide ${slideNumber} title ${slideTitle || textProbe}`.trim();
    }

    if (placeholderType === "BODY") {
      return `slide ${slideNumber} body ${textProbe}`.trim();
    }

    if (textProbe) {
      return `slide ${slideNumber} text ${textProbe}`;
    }

    return `slide ${slideNumber} element ${element.objectId ?? "unknown"}`;
  }
}

export default SlidesValidatorsService;
