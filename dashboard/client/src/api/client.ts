import { z } from "zod";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export class APIError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

export class ValidationError extends Error {
  constructor(
    public endpoint: string,
    public zodError: z.ZodError
  ) {
    super(`API response validation failed for ${endpoint}`);
    this.name = "ValidationError";
  }
}

interface FetchOptions extends RequestInit {
  params?: Record<string, string | undefined>;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const adminKey = localStorage.getItem("admin_key");
  return {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(adminKey && { "X-Admin-Key": adminKey }),
  };
}

async function fetchWithValidation<T>(
  endpoint: string,
  schema: z.ZodSchema<T>,
  options: FetchOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;

  // Build URL with query params
  const url = new URL(`${API_BASE_URL}${endpoint}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, value);
      }
    });
  }

  const response = await fetch(url.toString(), {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...fetchOptions.headers,
    },
    credentials: "include",
  });

  if (!response.ok) {
    throw new APIError(
      response.status,
      response.statusText,
      `API request failed: ${response.status} ${response.statusText}`
    );
  }

  const rawData = await response.json();

  // Transform backend response: { ok, data: {...}, meta } -> data content
  const data = rawData.ok && rawData.data ? rawData.data : rawData;

  // Validate response with Zod (use passthrough to allow extra fields)
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(`API validation warning for ${endpoint}:`, result.error.issues);
    // Return data anyway - don't fail on validation, just warn
    return data as T;
  }

  return result.data;
}

export const api = {
  get: <T>(endpoint: string, schema: z.ZodSchema<T>, params?: Record<string, string | undefined>) =>
    fetchWithValidation(endpoint, schema, { method: "GET", params }),

  post: <T>(endpoint: string, schema: z.ZodSchema<T>, body: unknown, params?: Record<string, string | undefined>) =>
    fetchWithValidation(endpoint, schema, {
      method: "POST",
      body: JSON.stringify(body),
      params,
    }),
};

export default api;
