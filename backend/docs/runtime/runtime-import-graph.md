# Runtime Import Graph Audit

Generated: 2026-02-24T23:56:38.833Z
Seeds: src/server.ts, src/main/server.ts, src/app.ts

## Totals

- Source files: 742
- Reachable from runtime seeds: 364
- Unreachable from runtime seeds: 378
- Import edges: 966
- Missing local refs: 0

## Runtime Totals (Strict Denominator)

- Runtime source files: 613
- Runtime reachable from seeds: 364
- Runtime unreachable from seeds: 249
- Runtime coverage: 59.38%

## Top-Level Bucket Reachability

| Bucket | Total | Reachable | Unreachable |
|---|---:|---:|---:|
| admin | 21 | 12 | 9 |
| analytics | 16 | 0 | 16 |
| app | 3 | 0 | 3 |
| app.ts | 1 | 1 | 0 |
| bootstrap | 4 | 3 | 1 |
| config | 11 | 9 | 2 |
| controllers | 15 | 13 | 2 |
| data_banks | 7 | 0 | 7 |
| entrypoints | 25 | 23 | 2 |
| infra | 3 | 1 | 2 |
| jobs | 2 | 0 | 2 |
| main | 4 | 1 | 3 |
| middleware | 15 | 13 | 2 |
| modules | 37 | 12 | 25 |
| platform | 8 | 3 | 5 |
| queues | 4 | 3 | 1 |
| routes | 23 | 2 | 21 |
| schemas | 4 | 1 | 3 |
| semantics | 2 | 0 | 2 |
| server.ts | 1 | 1 | 0 |
| services | 412 | 222 | 190 |
| shared | 3 | 0 | 3 |
| storage | 2 | 0 | 2 |
| tests | 40 | 0 | 40 |
| types | 30 | 7 | 23 |
| utils | 43 | 35 | 8 |
| workers | 6 | 2 | 4 |

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