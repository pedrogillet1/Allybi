export interface CachedQueryResponse {
  answer: string;
  sources: any[];
  mode: string;
  timestamp: number;
}

export interface CacheStatsResult {
  keys: number;
  user_preferences_memory: string;
  hitRate: number;
}
