import { TargetDocument, resolveScopedDocsForQueryIndex } from "./target-documents";

export interface ScopedResolverState {
  fallbackTurn: number;
}

export interface ResolveScopeParams {
  postData: any;
  queryIndexByText: Map<string, number>;
  queryStartIndex: number;
  state: ScopedResolverState;
}

export interface ResolveScopeResult {
  resolvedIndex: number;
  reason: "query_map" | "fallback_turn";
  queryText: string;
  scopedDocs: TargetDocument[];
}

function flattenMessageContent(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          return String(item.text || item.content || "").trim();
        }
        return "";
      })
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  if (value && typeof value === "object") {
    return String(value.text || value.content || "").trim();
  }
  return "";
}

export function extractRequestQueryText(postData: any): string {
  if (!postData || typeof postData !== "object") return "";
  const direct = [
    postData.query,
    postData.message,
    postData.prompt,
    postData.userMessage,
    postData.input,
    postData.text,
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean);
  if (direct) return direct;

  if (Array.isArray(postData.messages)) {
    for (let i = postData.messages.length - 1; i >= 0; i -= 1) {
      const entry = postData.messages[i];
      const role = String(entry?.role || "").trim().toLowerCase();
      if (role && role !== "user") continue;
      const text = flattenMessageContent(entry?.content || entry?.message);
      if (text) return text;
    }
  }
  return "";
}

export function createQueryIndexByText(
  queries: string[],
  queryStartIndex = 0,
): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < queries.length; i += 1) {
    map.set(String(queries[i] || "").trim(), queryStartIndex + i + 1);
  }
  return map;
}

export function resolveScopedDocsForRequest(params: ResolveScopeParams): ResolveScopeResult {
  const { postData, queryIndexByText, queryStartIndex, state } = params;
  const queryText = extractRequestQueryText(postData);
  const mappedIndex = queryIndexByText.get(queryText.trim()) || null;
  if (!mappedIndex) state.fallbackTurn += 1;
  const resolvedIndex = mappedIndex || (queryStartIndex + state.fallbackTurn);
  const reason = mappedIndex ? "query_map" : "fallback_turn";
  const scopedDocs = resolveScopedDocsForQueryIndex(resolvedIndex);
  return {
    resolvedIndex,
    reason,
    queryText,
    scopedDocs,
  };
}
