import type { QueryNormalizer } from "../retrieval.types";

export class DefaultQueryNormalizer implements QueryNormalizer {
  async normalize(
    query: string,
  ): Promise<{
    normalized: string;
    hasQuotedText: boolean;
    hasFilename: boolean;
  }> {
    const text = String(query || "").trim().replace(/\s+/g, " ");
    return {
      normalized: text.toLowerCase(),
      hasQuotedText: /"[^"]{2,}"/.test(text),
      hasFilename:
        /\b\w[\w\-_. ]{0,160}\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpe?g|webp)\b/i.test(
          text,
        ),
    };
  }
}

export function createDefaultQueryNormalizer(): QueryNormalizer {
  return new DefaultQueryNormalizer();
}

export function getQueryNormalizerIdentity(
  queryNormalizer: QueryNormalizer,
): string {
  return queryNormalizer?.constructor?.name || "anonymous_query_normalizer";
}
