# Dashboard Connectivity Matrix

## Mounted routes and API dependencies

| Route | Page component | Hook | API call | Backend endpoint |
|---|---|---|---|---|
| `/admin` | `OverviewPage` | `useOverview` | `adminApi.getOverview` | `GET /api/admin/overview` |
| `/admin/users` | `UsersPage` | `useUsers` | `adminApi.getUsers` | `GET /api/admin/users` |
| `/admin/files` | `FilesPage` | `useFiles` | `adminApi.getFiles` | `GET /api/admin/files` |
| `/admin/queries` | `QueriesPage` | `useQueries` | `telemetryApi.getQueries` | `GET /api/admin/queries` |
| `/admin/quality` | `QualityPage` | `useQuality` | `telemetryApi.getQuality` | `GET /api/admin/answer-quality` |
| `/admin/llm` | `LLMPage` | `useLLM` | `telemetryApi.getLLM` | `GET /api/admin/llm-cost` |
| `/admin/reliability` | `ReliabilityPage` | `useReliability` | `telemetryApi.getReliability` | `GET /api/admin/reliability` |
| `/admin/security` | `SecurityPage` | `useSecurity` | `telemetryApi.getSecurity` | `GET /api/admin/security` |

## Failure classification

- `PASS`: 2xx + JSON payload.
- `BACKEND_FAIL`: 5xx JSON payload from backend route logic.
- `PROXY_FAIL`: 5xx non-JSON/empty payload, usually Vite proxy target unavailable.
- `NETWORK_FAIL`: dashboard cannot reach URL at all.
- `AUTH_FAIL`: 401/403 due to missing `X-Admin-Key` or bearer token.

## Expected local contract

- Dashboard: `http://localhost:3001`
- Backend: `http://localhost:5001`
- Dashboard env:
  - `VITE_API_BASE_URL=/api`
  - `VITE_API_PROXY_TARGET=http://localhost:5001`
