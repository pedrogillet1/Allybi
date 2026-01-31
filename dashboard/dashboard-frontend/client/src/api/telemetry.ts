import api from "./client";
import {
  OverviewResponseSchema,
  UsersResponseSchema,
  FilesResponseSchema,
  QueriesResponseSchema,
  QualityResponseSchema,
  LLMResponseSchema,
  ReliabilityResponseSchema,
  SecurityResponseSchema,
  type TimeRange,
  type OverviewResponse,
  type UsersResponse,
  type FilesResponse,
  type QueriesResponse,
  type QualityResponse,
  type LLMResponse,
  type ReliabilityResponse,
  type SecurityResponse,
  type FileStatus,
} from "@/types/telemetry";

const BASE_PATH = "/admin/telemetry";

export interface OverviewParams {
  range: TimeRange;
}

export interface UsersParams {
  range: TimeRange;
  search?: string;
}

export interface FilesParams {
  range: TimeRange;
  status?: FileStatus;
  type?: string;
  search?: string;
}

export interface QueriesParams {
  range: TimeRange;
  domain?: string;
  search?: string;
}

export interface QualityParams {
  range: TimeRange;
}

export interface LLMParams {
  range: TimeRange;
}

export interface ReliabilityParams {
  range: TimeRange;
}

export interface SecurityParams {
  range: TimeRange;
}

export const telemetryApi = {
  getOverview: (params: OverviewParams): Promise<OverviewResponse> =>
    api.get(`${BASE_PATH}/overview`, OverviewResponseSchema, {
      range: params.range,
    }),

  getUsers: (params: UsersParams): Promise<UsersResponse> =>
    api.get(`${BASE_PATH}/users`, UsersResponseSchema, {
      range: params.range,
      search: params.search,
    }),

  getFiles: (params: FilesParams): Promise<FilesResponse> =>
    api.get(`${BASE_PATH}/files`, FilesResponseSchema, {
      range: params.range,
      status: params.status,
      type: params.type,
      search: params.search,
    }),

  getQueries: (params: QueriesParams): Promise<QueriesResponse> =>
    api.get(`${BASE_PATH}/queries`, QueriesResponseSchema, {
      range: params.range,
      domain: params.domain,
      search: params.search,
    }),

  getQuality: (params: QualityParams): Promise<QualityResponse> =>
    api.get(`${BASE_PATH}/quality`, QualityResponseSchema, {
      range: params.range,
    }),

  getLLM: (params: LLMParams): Promise<LLMResponse> =>
    api.get(`${BASE_PATH}/llm`, LLMResponseSchema, {
      range: params.range,
    }),

  getReliability: (params: ReliabilityParams): Promise<ReliabilityResponse> =>
    api.get(`${BASE_PATH}/reliability`, ReliabilityResponseSchema, {
      range: params.range,
    }),

  getSecurity: (params: SecurityParams): Promise<SecurityResponse> =>
    api.get(`${BASE_PATH}/security`, SecurityResponseSchema, {
      range: params.range,
    }),
};

export default telemetryApi;
