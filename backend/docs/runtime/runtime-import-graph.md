# Runtime Import Graph Audit

Generated: 2026-02-27T19:21:16.802Z
Seeds: src/server.ts, src/main/server.ts, src/app.ts, src/workers/document-worker.ts, src/entrypoints/workers/document.worker.ts, src/entrypoints/workers/jobs.worker.ts

## Totals

- Source files: 485
- Reachable from runtime seeds: 403
- Unreachable from runtime seeds: 82
- Import edges: 1063
- Missing local refs: 0

## Runtime Totals (Strict Denominator)

- Runtime source files: 377
- Runtime reachable from seeds: 374
- Runtime unreachable from seeds: 3
- Runtime coverage: 99.20%

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
| entrypoints | 27 | 26 | 1 |
| jobs | 1 | 1 | 0 |
| main | 1 | 1 | 0 |
| middleware | 13 | 13 | 0 |
| modules | 22 | 18 | 4 |
| platform | 6 | 6 | 0 |
| queues | 3 | 3 | 0 |
| routes | 2 | 2 | 0 |
| schemas | 1 | 1 | 0 |
| server.ts | 1 | 1 | 0 |
| services | 267 | 245 | 22 |
| tests | 21 | 0 | 21 |
| types | 8 | 7 | 1 |
| utils | 36 | 36 | 0 |
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