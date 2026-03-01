export const CHAT_ANSWER_MODES = [
  "doc_grounded_single",
  "doc_grounded_multi",
  "doc_grounded_quote",
  "doc_grounded_table",
  "nav_pills",
  "rank_autopick",
  "rank_disambiguate",
  "general_answer",
  "help_steps",
  "action_confirmation",
  "action_receipt",
  "no_docs",
  "scoped_not_found",
  "refusal",
  "fallback",
] as const;

export const RETRIEVAL_ANSWER_MODES = [
  "doc_grounded_single",
  "doc_grounded_multi",
  "doc_grounded_quote",
  "doc_grounded_table",
  "nav_pills",
  "rank_autopick",
  "rank_disambiguate",
  "general_answer",
  "help_steps",
  "no_docs",
  "scoped_not_found",
  "refusal",
] as const;

export const COMPOSE_ANSWER_TEMPLATE_MODES = [
  "action_confirmation",
  "action_receipt",
  "doc_grounded_multi",
  "doc_grounded_quote",
  "doc_grounded_single",
  "doc_grounded_table",
  "general_answer",
  "help_steps",
  "nav_pills",
  "rank_autopick",
  "rank_disambiguate",
] as const;

export type ChatAnswerMode = (typeof CHAT_ANSWER_MODES)[number];
export type RetrievalAnswerMode = (typeof RETRIEVAL_ANSWER_MODES)[number];
export type ComposeAnswerTemplateMode =
  (typeof COMPOSE_ANSWER_TEMPLATE_MODES)[number];

const RETRIEVAL_MODE_SET = new Set<string>(RETRIEVAL_ANSWER_MODES);

export function isRetrievalAnswerMode(
  value: unknown,
): value is RetrievalAnswerMode {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized) return false;
  return RETRIEVAL_MODE_SET.has(normalized);
}

export function coerceRetrievalAnswerMode(
  value: unknown,
): RetrievalAnswerMode | null {
  if (!isRetrievalAnswerMode(value)) return null;
  return value.trim() as RetrievalAnswerMode;
}
