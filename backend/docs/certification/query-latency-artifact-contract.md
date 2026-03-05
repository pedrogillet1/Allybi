# Query Latency Artifact Contract

## Producer
- Primary producer: `frontend/e2e/grading/run-harsh-rubric.v2.mjs`
- Produced artifacts per successful grading run:
  - `frontend/e2e/reports/latest/per_query.json`
  - `frontend/e2e/reports/latest/lineage.json`
  - `frontend/e2e/reports/archive/<runId>/per_query.json`
  - `frontend/e2e/reports/archive/<runId>/lineage.json`

## Consumer
- Certification gate: `backend/src/tests/certification/query-latency.cert.test.ts`
- Resolution order:
  1. `CERT_QUERY_LATENCY_REPORT` (if set)
  2. `frontend/e2e/reports/latest/per_query.json`
  3. `archivePerQueryPath` referenced by `frontend/e2e/reports/latest/lineage.json`
  4. newest `frontend/e2e/reports/archive/*/per_query.json`

## Guarantees
- `latest` remains the active run target.
- Archive path is immutable per `runId`.
- Certification can still resolve latency evidence after `latest` churn.
