import { z } from "zod";
import {
  OverviewResponseSchema,
  UsersResponseSchema,
  UserDetailSchema,
  FilesResponseSchema,
  FileDetailSchema,
  QueriesResponseSchema,
  QueryTelemetryDetailSchema,
  AnswerQualityResponseSchema,
  LLMCostResponseSchema,
  ReliabilityResponseSchema,
  SecurityResponseSchema,
  SystemHealthSchema,
  SearchResponseSchema,
} from "@/types/admin";
import type {
  TimeRange,
  Environment,
  OverviewResponse,
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
  FileStatus,
} from "@/types/admin";

// ============================================================================
// API Configuration
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const adminKey = localStorage.getItem("admin_key");
  console.log('[Admin API] Token in localStorage:', token ? `${token.slice(0, 20)}...` : 'none');
  return {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(adminKey && { "X-Admin-Key": adminKey }),
  };
}

/**
 * Transform backend response format to frontend expected format
 * Backend returns: { ok, data: { v, total, users, ... }, meta, range, nextCursor }
 * Frontend expects: { users, pagination: { cursor, hasMore, total } }
 */
function transformResponse(rawResponse: Record<string, unknown>): Record<string, unknown> {
  // If response doesn't have the wrapper structure, return as-is
  if (!rawResponse.ok || !rawResponse.data) {
    return rawResponse;
  }

  const data = rawResponse.data as Record<string, unknown>;
  const nextCursor = rawResponse.nextCursor as string | undefined;
  const total = (data.total as number) ?? 0;

  // Build pagination object for list responses
  const pagination = {
    cursor: nextCursor ?? null,
    hasMore: !!nextCursor,
    total,
  };

  // Remove internal fields and add pagination
  const { v, total: _total, ...restData } = data;

  return {
    ...restData,
    pagination,
  };
}

async function request<T>(
  endpoint: string,
  schema: z.ZodSchema<T>,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, headers = {} } = options;

  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      errorData.message || errorData.error || `Request failed with status ${response.status}`,
      response.status,
      errorData.code
    );
  }

  const rawData = await response.json();

  // Transform backend response format to frontend expected format
  const data = transformResponse(rawData);

  // Validate response with Zod schema
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error("API response validation failed:", result.error);
    console.error("Transformed data:", data);
    throw new ApiError("Invalid API response format", 500, "VALIDATION_ERROR");
  }

  return result.data;
}

// ============================================================================
// Query Parameters Builder
// ============================================================================

interface BaseParams {
  range?: TimeRange;
  env?: Environment;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

function buildQueryString(params: object): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, String(v)));
      } else {
        searchParams.append(key, String(value));
      }
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

// ============================================================================
// Admin API Endpoints
// ============================================================================

export const adminApi = {
  // Overview
  async getOverview(params: BaseParams = {}): Promise<OverviewResponse> {
    const query = buildQueryString(params);
    return request(`/admin/overview${query}`, OverviewResponseSchema);
  },

  // Users
  async getUsers(
    params: BaseParams & {
      search?: string;
      tier?: string;
      role?: string;
    } = {}
  ): Promise<UsersResponse> {
    const query = buildQueryString(params);
    return request(`/admin/users${query}`, UsersResponseSchema);
  },

  async getUserDetail(userId: string): Promise<UserDetail> {
    return request(`/admin/users/${userId}`, UserDetailSchema);
  },

  // Files
  async getFiles(
    params: BaseParams & {
      status?: FileStatus;
      mimeType?: string;
      folderId?: string;
      userId?: string;
    } = {}
  ): Promise<FilesResponse> {
    const query = buildQueryString(params);
    return request(`/admin/files${query}`, FilesResponseSchema);
  },

  async getFileDetail(fileId: string): Promise<FileDetail> {
    return request(`/admin/files/${fileId}`, FileDetailSchema);
  },

  // Queries (QueryTelemetry)
  async getQueries(
    params: BaseParams & {
      intent?: string;
      domain?: string;
      hadFallback?: boolean;
      hasErrors?: boolean;
      languageMismatch?: boolean;
      retrievalMethod?: string;
      userId?: string;
      conversationId?: string;
    } = {}
  ): Promise<QueriesResponse> {
    const query = buildQueryString(params);
    return request(`/admin/queries${query}`, QueriesResponseSchema);
  },

  async getQueryDetail(queryId: string): Promise<QueryTelemetryDetail> {
    return request(`/admin/queries/${queryId}`, QueryTelemetryDetailSchema);
  },

  // Answer Quality
  async getAnswerQuality(params: BaseParams = {}): Promise<AnswerQualityResponse> {
    const query = buildQueryString(params);
    return request(`/admin/answer-quality${query}`, AnswerQualityResponseSchema);
  },

  // LLM Cost
  async getLLMCost(
    params: BaseParams & {
      provider?: string;
      model?: string;
    } = {}
  ): Promise<LLMCostResponse> {
    const query = buildQueryString(params);
    return request(`/admin/llm-cost${query}`, LLMCostResponseSchema);
  },

  // Reliability
  async getReliability(params: BaseParams = {}): Promise<ReliabilityResponse> {
    const query = buildQueryString(params);
    return request(`/admin/reliability${query}`, ReliabilityResponseSchema);
  },

  // Security
  async getSecurity(
    params: BaseParams & {
      eventType?: string;
    } = {}
  ): Promise<SecurityResponse> {
    const query = buildQueryString(params);
    return request(`/admin/security${query}`, SecurityResponseSchema);
  },

  // System Health
  async getSystemHealth(): Promise<SystemHealth> {
    return request("/admin/health", SystemHealthSchema);
  },

  // Global Search
  async search(query: string): Promise<SearchResponse> {
    const params = buildQueryString({ q: query });
    return request(`/admin/search${params}`, SearchResponseSchema);
  },

  // Export
  async exportData(
    endpoint: string,
    format: "csv" | "json",
    params: BaseParams = {}
  ): Promise<Blob> {
    const query = buildQueryString({ ...params, format });
    const url = `${API_BASE_URL}/admin/${endpoint}/export${query}`;
    
    const response = await fetch(url, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new ApiError("Export failed", response.status);
    }

    return response.blob();
  },

  // Live Stream (SSE)
  createLiveStream(
    categories: string[] = [],
    onEvent: (event: unknown) => void,
    onError?: (error: Error) => void
  ): () => void {
    const params = buildQueryString({ categories });
    const url = `${API_BASE_URL}/admin/live/stream${params}`;
    
    const eventSource = new EventSource(url, { withCredentials: true });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEvent(data);
      } catch (e) {
        console.error("Failed to parse SSE event:", e);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE error:", error);
      onError?.(new Error("SSE connection error"));
    };

    // Return cleanup function
    return () => {
      eventSource.close();
    };
  },
};

export { ApiError };
