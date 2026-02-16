# Dashboard Local Runbook

## 1) Start backend

```bash
cd backend
PORT=5001 npm run dev
```

Expect:
- `Running on port 5001`

## 2) Start dashboard

```bash
cd dashboard
npm run dev -- --port 3001
```

## 3) Verify route wiring (static)

```bash
npm run verify:screens
```

## 4) Verify endpoint connectivity (runtime)

```bash
ADMIN_KEY='your_admin_key' npm run verify:connectivity
```

Optional bearer token:

```bash
AUTH_TOKEN='your_admin_jwt' ADMIN_KEY='your_admin_key' npm run verify:connectivity
```

## 5) Interpret failures

- `PROXY_FAIL`: Dashboard proxy or backend process is unavailable/flapping.
  - Check backend terminal and `VITE_API_PROXY_TARGET`.
- `BACKEND_FAIL`: Backend endpoint is running but threw route/service error.
  - Check backend logs for `/api/admin/*` stack traces.
- `AUTH_FAIL`: Missing/invalid auth values.
  - Provide `ADMIN_KEY` and/or `AUTH_TOKEN`.

## 6) UI validation pass

After connectivity passes, open:
- `/admin`
- `/admin/users`
- `/admin/files`
- `/admin/queries`
- `/admin/quality`
- `/admin/llm`
- `/admin/reliability`
- `/admin/security`

Each page should render cards/table/chart containers and no blocking fetch error banners.
