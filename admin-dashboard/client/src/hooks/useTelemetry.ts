/**
 * Shared telemetry fetch hooks for the admin dashboard.
 *
 * Features:
 * - Generic useTelemetry<T>(endpoint, params) with loading/error/data states
 * - Auto-polling every POLL_INTERVAL_MS (30 s)
 * - AbortController cleanup on unmount
 * - Convenience wrappers for every telemetry endpoint
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { ADMIN_TELEMETRY_URL, POLL_INTERVAL_MS } from "../const";

// ---------------------------------------------------------------------------
// Core hook
// ---------------------------------------------------------------------------

export interface TelemetryState<T> {
  data: T | null;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTelemetry<T = any>(
  endpoint: string,
  params?: Record<string, string | number | undefined>,
): TelemetryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Build full URL with query params
  const buildUrl = useCallback(() => {
    const url = new URL(`${ADMIN_TELEMETRY_URL}/${endpoint}`.replace(/\/+/g, "/").replace(":/", "://"));
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") {
          url.searchParams.set(k, String(v));
        }
      }
    }
    return url.toString();
  }, [endpoint, JSON.stringify(params)]);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setIsLoading(true);
      setIsError(false);
      setError(null);

      const res = await fetch(buildUrl(), {
        signal: controller.signal,
        credentials: "include",
        headers: { "Accept": "application/json" },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      if (!mountedRef.current) return;

      // Controller returns { ok, range?, data?, items?, ... }
      // Unwrap: if there is a `data` field, use it; otherwise use the whole payload
      const payload = json.data ?? json;
      setData(payload as T);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      if (!mountedRef.current) return;
      setIsError(true);
      setError(err.message ?? "Unknown error");
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [buildUrl]);

  // Initial fetch + polling
  useEffect(() => {
    mountedRef.current = true;
    fetchData();

    const interval = setInterval(fetchData, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearInterval(interval);
    };
  }, [fetchData]);

  return { data, isLoading, isError, error, refetch: fetchData };
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

export function useOverview(range: string) {
  return useTelemetry("overview", { range });
}

export function useUsers(range: string, limit = 50) {
  return useTelemetry("users", { range, limit });
}

export function useUserDetail(userId: string, range: string) {
  return useTelemetry(`users/${userId}`, { range });
}

export function useFiles(range: string, limit = 50) {
  return useTelemetry("files", { range, limit });
}

export function useFileDetail(fileId: string) {
  return useTelemetry(`files/${fileId}`, { range: "30d" });
}

export function useQueries(range: string, limit = 50, domain?: string) {
  return useTelemetry("queries", { range, limit, domain });
}

export function useQuality(range: string, limit = 50) {
  return useTelemetry("quality", { range, limit });
}

export function useLLM(range: string, limit = 50, provider?: string, model?: string) {
  return useTelemetry("llm", { range, limit, provider, model });
}

export function useLLMProviders(range: string) {
  return useTelemetry("llm/providers", { range });
}

export function useErrors(range: string, limit = 50) {
  return useTelemetry("errors", { range, limit });
}

export function useTimeseries(metric: string, range: string) {
  return useTelemetry("timeseries", { metric, range });
}
