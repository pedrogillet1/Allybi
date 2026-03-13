import {
  type ProductHelpResolution,
  type ProductHelpResolutionInput,
  type ProductHelpTopicRule,
  chooseSnippet,
  loadProductHelpRules,
  normalizeCode,
  normalizeLanguage,
  resolveProductHelpConfig,
  scoreRule,
} from "./productHelp.shared";

export class ProductHelpService {
  resolve(params: ProductHelpResolutionInput): ProductHelpResolution | null {
    const queryText = normalizeCode(params.queryText);
    const answerMode = normalizeCode(params.answerMode);
    const fallbackReasonCode = normalizeCode(params.fallbackReasonCode);
    const operator = normalizeCode(params.operator);
    const intentFamily = normalizeCode(params.intentFamily);
    const explicitTopic = String(params.explicitTopic || "").trim();

    const config = resolveProductHelpConfig();
    const maxChars = config.maxChars;
    const language = normalizeLanguage(
      params.language || config.defaultLanguage || "en",
    );
    const allRules = loadProductHelpRules();

    if (explicitTopic) {
      const explicit = allRules.find((rule) => rule.id === explicitTopic);
      if (explicit) {
        const snippet = chooseSnippet(explicit.snippets, language);
        if (snippet) {
          return {
            topic: explicit.id,
            snippet: snippet.slice(0, maxChars).trim(),
          };
        }
      }
    }

    let best: { score: number; rule: ProductHelpTopicRule } | null = null;
    for (const rule of allRules) {
      const score = scoreRule(rule, {
        answerMode,
        fallbackReasonCode,
        operator,
        intentFamily,
        queryText,
      });
      if (score < 0) continue;
      if (!best || score > best.score) {
        best = { score, rule };
      }
    }

    if (!best) return null;

    const snippet = chooseSnippet(best.rule.snippets, language)
      .slice(0, maxChars)
      .trim();
    if (!snippet) return null;

    return {
      topic: best.rule.id,
      snippet,
    };
  }
}

let singleton: ProductHelpService | null = null;

export function getProductHelpService(): ProductHelpService {
  if (!singleton) singleton = new ProductHelpService();
  return singleton;
}
