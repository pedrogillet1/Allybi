import type { EvidencePack } from "../retrieval.types";
import { BankRuntimeCache } from "../../cache/bankRuntimeCache.service";
import { RETRIEVAL_CONFIG } from "./retrieval.config";

export interface QueryRewriteCacheValue {
  variants: Array<{
    text: string;
    weight: number;
    sourceRuleId: string;
    reason: string;
  }>;
  ruleIds: string[];
}

export interface RetrievalEngineCaches {
  queryRewriteCache: BankRuntimeCache<QueryRewriteCacheValue>;
  retrievalResultCache: BankRuntimeCache<EvidencePack>;
}

export function createRetrievalEngineCaches(): RetrievalEngineCaches {
  return {
    queryRewriteCache: new BankRuntimeCache<QueryRewriteCacheValue>({
      maxEntries: RETRIEVAL_CONFIG.rewriteCacheMax,
      ttlMs: RETRIEVAL_CONFIG.rewriteCacheTtlMs,
    }),
    retrievalResultCache: new BankRuntimeCache<EvidencePack>({
      maxEntries: RETRIEVAL_CONFIG.retrievalCacheMax,
      ttlMs: RETRIEVAL_CONFIG.retrievalCacheTtlMs,
    }),
  };
}
