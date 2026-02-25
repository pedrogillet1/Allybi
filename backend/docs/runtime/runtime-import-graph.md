# Runtime Import Graph Audit

Generated: 2026-02-25T21:12:41.951Z
Seeds: src/server.ts, src/main/server.ts, src/app.ts, src/workers/document-worker.ts, src/entrypoints/workers/document.worker.ts, src/entrypoints/workers/jobs.worker.ts

## Totals

- Source files: 566
- Reachable from runtime seeds: 388
- Unreachable from runtime seeds: 178
- Import edges: 1007
- Missing local refs: 0

## Runtime Totals (Strict Denominator)

- Runtime source files: 397
- Runtime reachable from seeds: 360
- Runtime unreachable from seeds: 37
- Runtime coverage: 90.68%

## Top-Level Bucket Reachability

| Bucket | Total | Reachable | Unreachable |
|---|---:|---:|---:|
| admin | 21 | 12 | 9 |
| analytics | 16 | 0 | 16 |
| app | 2 | 2 | 0 |
| app.ts | 1 | 1 | 0 |
| bootstrap | 3 | 3 | 0 |
| config | 9 | 9 | 0 |
| controllers | 14 | 13 | 1 |
| data_banks | 7 | 0 | 7 |
| entrypoints | 25 | 25 | 0 |
| infra | 1 | 1 | 0 |
| jobs | 1 | 0 | 1 |
| main | 1 | 1 | 0 |
| middleware | 15 | 13 | 2 |
| modules | 24 | 17 | 7 |
| platform | 7 | 6 | 1 |
| queues | 3 | 3 | 0 |
| routes | 2 | 2 | 0 |
| schemas | 2 | 1 | 1 |
| server.ts | 1 | 1 | 0 |
| services | 324 | 233 | 91 |
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