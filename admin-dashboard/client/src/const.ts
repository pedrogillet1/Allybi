/**
 * Application-wide constants for the Koda Admin Dashboard.
 */

/** Base URL for the backend API. */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api";

/** Admin telemetry API prefix. */
export const ADMIN_TELEMETRY_URL = `${API_BASE_URL}/admin/telemetry`;

/** Default pagination page size. */
export const DEFAULT_PAGE_SIZE = 25;

/** Maximum items per page. */
export const MAX_PAGE_SIZE = 100;

/** Date format used across the dashboard. */
export const DATE_FORMAT = "yyyy-MM-dd";
export const DATETIME_FORMAT = "yyyy-MM-dd HH:mm:ss";

/** Polling interval for live data (ms). */
export const POLL_INTERVAL_MS = 30_000;

/** App version shown in sidebar footer. */
export const APP_VERSION = "1.0.0";
