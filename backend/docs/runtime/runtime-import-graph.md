# Runtime Import Graph Audit

Generated: 2026-03-03T03:05:17.170Z
Seeds: src/server.ts, src/main/server.ts, src/app.ts, src/workers/document-worker.ts, src/entrypoints/workers/document.worker.ts, src/entrypoints/workers/jobs.worker.ts

## Totals

- Source files: 649
- Reachable from runtime seeds: 444
- Unreachable from runtime seeds: 205
- Import edges: 1196
- Missing local refs: 0

## Runtime Totals (Strict Denominator)

- Runtime source files: 424
- Runtime reachable from seeds: 414
- Runtime unreachable from seeds: 10
- Runtime coverage: 97.64%

## Top-Level Bucket Reachability

| Bucket | Total | Reachable | Unreachable |
|---|---:|---:|---:|
| _full_test.js | 1 | 0 | 1 |
| admin | 21 | 12 | 9 |
| analytics | 16 | 0 | 16 |
| app | 2 | 2 | 0 |
| app.ts | 1 | 1 | 0 |
| bootstrap | 3 | 3 | 0 |
| config | 9 | 9 | 0 |
| controllers | 14 | 13 | 1 |
| data_banks | 4 | 0 | 4 |
| entrypoints | 27 | 26 | 1 |
| jobs | 1 | 1 | 0 |
| main | 1 | 1 | 0 |
| middleware | 13 | 13 | 0 |
| modules | 34 | 20 | 14 |
| platform | 4 | 4 | 0 |
| queues | 3 | 3 | 0 |
| routes | 2 | 2 | 0 |
| schemas | 1 | 1 | 0 |
| server.ts | 1 | 1 | 0 |
| services | 387 | 286 | 101 |
| tests | 56 | 0 | 56 |
| types | 8 | 7 | 1 |
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