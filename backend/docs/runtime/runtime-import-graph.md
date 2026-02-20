# Runtime Import Graph Audit

Generated: 2026-02-20T00:07:54.925Z
Seeds: src/server.ts, src/main/server.ts, src/app.ts

## Totals

- Source files: 668
- Reachable from runtime seeds: 345
- Unreachable from runtime seeds: 323
- Import edges: 909
- Missing local refs: 1

## Top-Level Bucket Reachability

| Bucket | Total | Reachable | Unreachable |
|---|---:|---:|---:|
| admin | 21 | 12 | 9 |
| analytics | 16 | 0 | 16 |
| app.ts | 1 | 1 | 0 |
| bootstrap | 4 | 3 | 1 |
| config | 11 | 9 | 2 |
| controllers | 15 | 13 | 2 |
| data_banks | 5 | 0 | 5 |
| entrypoints | 25 | 23 | 2 |
| infra | 3 | 1 | 2 |
| jobs | 2 | 0 | 2 |
| main | 4 | 1 | 3 |
| middleware | 11 | 11 | 0 |
| modules | 13 | 10 | 3 |
| queues | 4 | 3 | 1 |
| routes | 23 | 2 | 21 |
| schemas | 4 | 1 | 3 |
| semantics | 2 | 0 | 2 |
| server.ts | 1 | 1 | 0 |
| services | 396 | 213 | 183 |
| storage | 2 | 0 | 2 |
| tests | 26 | 0 | 26 |
| types | 30 | 4 | 26 |
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