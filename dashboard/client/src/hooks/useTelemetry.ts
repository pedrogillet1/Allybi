import { useQuery } from "@tanstack/react-query";
import telemetryApi, {
  type OverviewParams,
  type UsersParams,
  type FilesParams,
  type QueriesParams,
  type QualityParams,
  type LLMParams,
  type ReliabilityParams,
  type SecurityParams,
} from "@/api/telemetry";

// Query keys factory
export const telemetryKeys = {
  all: ["telemetry"] as const,
  overview: (params: OverviewParams) => [...telemetryKeys.all, "overview", params] as const,
  users: (params: UsersParams) => [...telemetryKeys.all, "users", params] as const,
  files: (params: FilesParams) => [...telemetryKeys.all, "files", params] as const,
  queries: (params: QueriesParams) => [...telemetryKeys.all, "queries", params] as const,
  quality: (params: QualityParams) => [...telemetryKeys.all, "quality", params] as const,
  llm: (params: LLMParams) => [...telemetryKeys.all, "llm", params] as const,
  reliability: (params: ReliabilityParams) => [...telemetryKeys.all, "reliability", params] as const,
  security: (params: SecurityParams) => [...telemetryKeys.all, "security", params] as const,
};

export function useOverview(params: OverviewParams) {
  return useQuery({
    queryKey: telemetryKeys.overview(params),
    queryFn: () => telemetryApi.getOverview(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useUsers(params: UsersParams) {
  return useQuery({
    queryKey: telemetryKeys.users(params),
    queryFn: () => telemetryApi.getUsers(params),
    staleTime: 30 * 1000,
  });
}

export function useFiles(params: FilesParams) {
  return useQuery({
    queryKey: telemetryKeys.files(params),
    queryFn: () => telemetryApi.getFiles(params),
    staleTime: 30 * 1000,
  });
}

export function useQueries(params: QueriesParams) {
  return useQuery({
    queryKey: telemetryKeys.queries(params),
    queryFn: () => telemetryApi.getQueries(params),
    staleTime: 30 * 1000,
  });
}

export function useQuality(params: QualityParams) {
  return useQuery({
    queryKey: telemetryKeys.quality(params),
    queryFn: () => telemetryApi.getQuality(params),
    staleTime: 30 * 1000,
  });
}

export function useLLM(params: LLMParams) {
  return useQuery({
    queryKey: telemetryKeys.llm(params),
    queryFn: () => telemetryApi.getLLM(params),
    staleTime: 30 * 1000,
  });
}

export function useReliability(params: ReliabilityParams) {
  return useQuery({
    queryKey: telemetryKeys.reliability(params),
    queryFn: () => telemetryApi.getReliability(params),
    staleTime: 30 * 1000,
  });
}

export function useSecurity(params: SecurityParams) {
  return useQuery({
    queryKey: telemetryKeys.security(params),
    queryFn: () => telemetryApi.getSecurity(params),
    staleTime: 30 * 1000,
  });
}
