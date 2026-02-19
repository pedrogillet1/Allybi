import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api/admin";
import type {
  TimeRange,
  Environment,
  FileStatus,
  OverviewResponse,
  OverviewTimeseriesResponse,
  OverviewTimeseriesMetric,
  UsersResponse,
  UserDetail,
  FilesResponse,
  FileDetail,
  QueriesResponse,
  QueryTelemetryDetail,
  AnswerQualityResponse,
  LLMCostResponse,
  ReliabilityResponse,
  SecurityResponse,
  SystemHealth,
  SearchResponse,
} from "@/types/admin";
import { useState, useEffect, useCallback } from "react";

// ============================================================================
// Common Types
// ============================================================================

interface BaseQueryParams {
  range?: TimeRange;
  env?: Environment;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

// ============================================================================
// Overview Hook
// ============================================================================

export function useOverview(params: BaseQueryParams = {}) {
  return useQuery<OverviewResponse, Error>({
    queryKey: ["admin", "overview", params],
    queryFn: () => adminApi.getOverview(params),
    staleTime: 30_000,
  });
}

interface OverviewTimeseriesParams extends BaseQueryParams {
  metric?: OverviewTimeseriesMetric;
}

export function useOverviewTimeseries(params: OverviewTimeseriesParams = {}) {
  return useQuery<OverviewTimeseriesResponse, Error>({
    queryKey: ["admin", "overview", "timeseries", params],
    queryFn: () => adminApi.getOverviewTimeseries(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// Users Hooks
// ============================================================================

interface UsersQueryParams extends BaseQueryParams {
  search?: string;
  tier?: string;
  role?: string;
}

export function useUsers(params: UsersQueryParams = {}) {
  return useQuery<UsersResponse, Error>({
    queryKey: ["admin", "users", params],
    queryFn: () => adminApi.getUsers(params),
    staleTime: 30_000,
  });
}

export function useUserDetail(userId: string | null) {
  return useQuery<UserDetail, Error>({
    queryKey: ["admin", "users", userId],
    queryFn: () => adminApi.getUserDetail(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  });
}

// ============================================================================
// Files Hooks
// ============================================================================

interface FilesQueryParams extends BaseQueryParams {
  status?: FileStatus;
  mimeType?: string;
  folderId?: string;
  userId?: string;
}

export function useFiles(params: FilesQueryParams = {}) {
  return useQuery<FilesResponse, Error>({
    queryKey: ["admin", "files", params],
    queryFn: () => adminApi.getFiles(params),
    staleTime: 30_000,
  });
}

export function useFileDetail(fileId: string | null) {
  return useQuery<FileDetail, Error>({
    queryKey: ["admin", "files", fileId],
    queryFn: () => adminApi.getFileDetail(fileId!),
    enabled: !!fileId,
    staleTime: 60_000,
  });
}

// ============================================================================
// Queries Hooks
// ============================================================================

interface QueriesQueryParams extends BaseQueryParams {
  intent?: string;
  domain?: string;
  hadFallback?: boolean;
  hasErrors?: boolean;
  languageMismatch?: boolean;
  retrievalMethod?: string;
  userId?: string;
  conversationId?: string;
}

export function useQueries(params: QueriesQueryParams = {}) {
  return useQuery<QueriesResponse, Error>({
    queryKey: ["admin", "queries", params],
    queryFn: () => adminApi.getQueries(params),
    staleTime: 30_000,
  });
}

export function useQueryDetail(queryId: string | null) {
  return useQuery<QueryTelemetryDetail, Error>({
    queryKey: ["admin", "queries", queryId],
    queryFn: () => adminApi.getQueryDetail(queryId!),
    enabled: !!queryId,
    staleTime: 60_000,
  });
}

// ============================================================================
// Answer Quality Hook
// ============================================================================

export function useAnswerQuality(params: BaseQueryParams = {}) {
  return useQuery<AnswerQualityResponse, Error>({
    queryKey: ["admin", "answer-quality", params],
    queryFn: () => adminApi.getAnswerQuality(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// LLM Cost Hook
// ============================================================================

interface LLMCostQueryParams extends BaseQueryParams {
  provider?: string;
  model?: string;
}

export function useLLMCost(params: LLMCostQueryParams = {}) {
  return useQuery<LLMCostResponse, Error>({
    queryKey: ["admin", "llm-cost", params],
    queryFn: () => adminApi.getLLMCost(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// Reliability Hook
// ============================================================================

export function useReliability(params: BaseQueryParams = {}) {
  return useQuery<ReliabilityResponse, Error>({
    queryKey: ["admin", "reliability", params],
    queryFn: () => adminApi.getReliability(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// Security Hook
// ============================================================================

interface SecurityQueryParams extends BaseQueryParams {
  eventType?: string;
}

export function useSecurity(params: SecurityQueryParams = {}) {
  return useQuery<SecurityResponse, Error>({
    queryKey: ["admin", "security", params],
    queryFn: () => adminApi.getSecurity(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// System Health Hook
// ============================================================================

export function useSystemHealth() {
  return useQuery<SystemHealth, Error>({
    queryKey: ["admin", "health"],
    queryFn: () => adminApi.getSystemHealth(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

// ============================================================================
// Search Hook
// ============================================================================

export function useSearch(query: string) {
  return useQuery<SearchResponse, Error>({
    queryKey: ["admin", "search", query],
    queryFn: () => adminApi.search(query),
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
}

// ============================================================================
// Export Hook
// ============================================================================

export function useExport() {
  const [isExporting, setIsExporting] = useState(false);

  const exportData = useCallback(
    async (
      endpoint: string,
      format: "csv" | "json",
      params: BaseQueryParams = {},
      filename?: string
    ) => {
      setIsExporting(true);
      try {
        const blob = await adminApi.exportData(endpoint, format, params);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || `${endpoint}-export.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  return { exportData, isExporting };
}

// ============================================================================
// Live Stream Hook
// ============================================================================

import type { LiveEvent } from "@/types/admin";

export function useLiveStream(categories: string[] = []) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const cleanup = adminApi.createLiveStream(
      categories,
      (event) => {
        setEvents((prev) => [event as LiveEvent, ...prev].slice(0, 100));
        setIsConnected(true);
        setError(null);
      },
      (err) => {
        setError(err);
        setIsConnected(false);
      }
    );

    return cleanup;
  }, [categories.join(",")]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, isConnected, error, clearEvents };
}

// ============================================================================
// Invalidation Helpers
// ============================================================================

export function useInvalidateAdmin() {
  const queryClient = useQueryClient();

  return {
    invalidateOverview: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] }),
    invalidateUsers: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
    invalidateFiles: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "files"] }),
    invalidateQueries: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "queries"] }),
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: ["admin"] }),
  };
}
