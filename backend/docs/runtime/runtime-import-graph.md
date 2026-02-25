# Runtime Import Graph Audit

Generated: 2026-02-25T01:15:18.768Z
Seeds: src/server.ts, src/main/server.ts, src/app.ts, src/workers/document-worker.ts, src/entrypoints/workers/document.worker.ts, src/entrypoints/workers/jobs.worker.ts

## Totals

- Source files: 586
- Reachable from runtime seeds: 367
- Unreachable from runtime seeds: 219
- Import edges: 969
- Missing local refs: 0

## Runtime Totals (Strict Denominator)

- Runtime source files: 458
- Runtime reachable from seeds: 367
- Runtime unreachable from seeds: 91
- Runtime coverage: 80.13%

## Top-Level Bucket Reachability

| Bucket | Total | Reachable | Unreachable |
|---|---:|---:|---:|
| admin | 21 | 12 | 9 |
| analytics | 16 | 0 | 16 |
| app | 2 | 0 | 2 |
| app.ts | 1 | 1 | 0 |
| bootstrap | 4 | 3 | 1 |
| config | 11 | 9 | 2 |
| controllers | 14 | 13 | 1 |
| data_banks | 7 | 0 | 7 |
| entrypoints | 25 | 25 | 0 |
| infra | 3 | 1 | 2 |
| jobs | 1 | 0 | 1 |
| main | 3 | 1 | 2 |
| middleware | 15 | 13 | 2 |
| modules | 30 | 12 | 18 |
| platform | 7 | 3 | 4 |
| queues | 4 | 3 | 1 |
| routes | 2 | 2 | 0 |
| schemas | 4 | 1 | 3 |
| semantics | 2 | 0 | 2 |
| server.ts | 1 | 1 | 0 |
| services | 324 | 222 | 102 |
| storage | 2 | 0 | 2 |
| tests | 41 | 0 | 41 |
| types | 8 | 7 | 1 |
| utils | 35 | 35 | 0 |
| workers | 3 | 3 | 0 |

## Entrypoint Route Wrapper Status

- Wrapper files: 1
- Legacy route wrappers (re-exporting src/routes/*): 0

## Move Map (Draft)

- [in_progress] `src/routes/*` -> `src/entrypoints/http/routes/*`: Replace wrapper re-exports with real route files in entrypoints.
- [planned] `src/controllers/*` -> `src/entrypoints/http/controllers/*`: Controllers should own request parsing and call module services.
- [planned] `src/queues/*` -> `src/platform/queue/*`: Single queue infra home.
- [planned] `src/workers/*` -> `src/entrypoints/workers/*`: Only worker process entrypoints here; no business logic.
- [in_progress] `src/services/chat/*` -> `src/modules/chat/{application,runtime,infrastructure}/*`: Keep thin compatibility wrappers during migration only.
- [planned] `src/services/editing/*` -> `src/modules/editing/{application,runtime,engines,infrastructure}/*`: Split revision orchestration from per-domain appliers.
- [planned] `src/services/core/banks/*` -> `src/banks/loader/*`: Single bank loader package and one injected instance.
- [planned] `src/data_banks/*` -> `src/banks/data/*`: Unify bank data location after loader migration is complete.
- [planned] `src/utils/*` -> `src/shared/* or module-owned utils`: Remove junk-drawer utilities; keep ownership explicit.