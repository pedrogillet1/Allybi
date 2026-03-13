# Runtime Import Graph Audit

Generated: 2026-03-13T03:26:45.997Z
Seeds: src/server.ts, src/main/server.ts, src/app.ts, src/workers/document-worker.ts, src/entrypoints/workers/document.worker.ts, src/entrypoints/workers/jobs.worker.ts

## Totals

- Source files: 883
- Reachable from runtime seeds: 596
- Unreachable from runtime seeds: 287
- Import edges: 1846
- Missing local refs: 0

## Runtime Totals (Strict Denominator)

- Runtime source files: 590
- Runtime reachable from seeds: 559
- Runtime unreachable from seeds: 31
- Runtime coverage: 94.75%

## Top-Level Bucket Reachability

| Bucket | Total | Reachable | Unreachable |
|---|---:|---:|---:|
| admin | 22 | 12 | 10 |
| app.ts | 1 | 1 | 0 |
| bootstrap | 4 | 4 | 0 |
| config | 9 | 9 | 0 |
| controllers | 14 | 13 | 1 |
| data_banks | 4 | 0 | 4 |
| entrypoints | 29 | 28 | 1 |
| jobs | 1 | 1 | 0 |
| main | 1 | 1 | 0 |
| middleware | 13 | 13 | 0 |
| modules | 135 | 117 | 18 |
| platform | 3 | 3 | 0 |
| queues | 13 | 11 | 2 |
| schemas | 1 | 1 | 0 |
| server.ts | 1 | 1 | 0 |
| services | 485 | 337 | 148 |
| tests | 99 | 0 | 99 |
| types | 8 | 5 | 3 |
| utils | 36 | 36 | 0 |
| workers | 4 | 3 | 1 |

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