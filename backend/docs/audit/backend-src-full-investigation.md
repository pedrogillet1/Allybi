# Backend `src` Full Investigation Report

Generated: 2026-02-20T00:16:22.625Z

## Scope and Method
- Scanned every file under `backend/src` with full-text read.
- Total files read: **865**.
- Included structure metrics, file-size hotspots, wrapper detection, placeholder detection, type/test health, and centralization checks.

## Runtime Health Snapshot
- `npm --prefix backend run typecheck`: **PASS**
- `npm --prefix backend run test:runtime-wiring`: **PASS**
- `node backend/scripts/lint/intent-centralization-audit.mjs`: **10/10**
- `node backend/scripts/lint/retrieval-centralization-audit.mjs`: **10/10**

## Top-Level Folder Grades

| Folder | Grade | Files | Lines | Code Files | Tests | Wrappers | .gitkeep | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `.DS_Store` | **100/100** | 1 | 20 | 0 | 0 | 0 | 0 | 1 .DS_Store |
| `admin` | **93/100** | 21 | 2822 | 21 | 0 | 0 | 0 | No major structural anomaly detected. |
| `analytics` | **96/100** | 16 | 3303 | 16 | 0 | 0 | 0 | No major structural anomaly detected. |
| `app.ts` | **96/100** | 1 | 244 | 1 | 0 | 0 | 0 | No major structural anomaly detected. |
| `ARCHITECTURE.md` | **100/100** | 1 | 29 | 0 | 0 | 0 | 0 | No major structural anomaly detected. |
| `bootstrap` | **96/100** | 4 | 969 | 4 | 0 | 0 | 0 | No major structural anomaly detected. |
| `config` | **100/100** | 11 | 1222 | 11 | 0 | 0 | 0 | No major structural anomaly detected. |
| `controllers` | **72/100** | 15 | 6336 | 15 | 1 | 0 | 0 | Several oversized controllers; logic split from routes improved but still heavy. |
| `data` | **40/100** | 3 | 3 | 0 | 0 | 0 | 3 | Placeholder tree for future banks/manifests; not used by active runtime. |
| `data_banks` | **65/100** | 154 | 55029 | 5 | 0 | 0 | 0 | Large policy/pattern corpus; centralized loader works, but bank payloads remain large and hard to govern. |
| `docs` | **99/100** | 8 | 1372 | 0 | 0 | 0 | 0 | No major structural anomaly detected. |
| `entrypoints` | **58/100** | 25 | 9684 | 25 | 0 | 0 | 0 | Now primary HTTP path, but route files are still very large and contain controller/business coupling. |
| `infra` | **96/100** | 3 | 583 | 3 | 0 | 0 | 0 | No major structural anomaly detected. |
| `jobs` | **96/100** | 2 | 539 | 2 | 0 | 0 | 0 | No major structural anomaly detected. |
| `main` | **60/100** | 4 | 8 | 4 | 0 | 2 | 0 | Thin wrappers around legacy entry files; duplicate entrypoint surface still present. |
| `middleware` | **99/100** | 11 | 1462 | 11 | 0 | 0 | 0 | No major structural anomaly detected. |
| `modules` | **95/100** | 13 | 4281 | 13 | 3 | 0 | 0 | Only chat module is substantially implemented; module migration incomplete for other domains. |
| `platform` | **40/100** | 16 | 16 | 0 | 0 | 0 | 16 | Architecture target exists but implementation is mostly placeholder scaffolding (.gitkeep). |
| `queues` | **87/100** | 4 | 2351 | 4 | 0 | 0 | 0 | No major structural anomaly detected. |
| `routes` | **75/100** | 23 | 2168 | 23 | 0 | 21 | 0 | Mostly compatibility shims redirecting to entrypoints (expected transitional state). |
| `schemas` | **99/100** | 4 | 504 | 4 | 0 | 0 | 0 | No major structural anomaly detected. |
| `semantics` | **90/100** | 2 | 622 | 2 | 0 | 0 | 0 | No major structural anomaly detected. |
| `server.ts` | **92/100** | 1 | 387 | 1 | 0 | 0 | 0 | No major structural anomaly detected. |
| `services` | **53/100** | 401 | 116390 | 396 | 43 | 0 | 0 | Primary runtime lives here; very large and still multi-layered (`services/core`, `services/app`, feature services). Major centralization risk. |
| `shared` | **40/100** | 5 | 5 | 0 | 0 | 0 | 5 | Shared layer exists only as scaffold; almost no active shared contracts/utilities. |
| `storage` | **100/100** | 2 | 39 | 2 | 0 | 0 | 0 | No major structural anomaly detected. |
| `tests` | **99/100** | 35 | 6245 | 26 | 20 | 0 | 0 | Good focused tests for runtime wiring and policies, but full-system coverage still limited. |
| `types` | **89/100** | 30 | 6462 | 30 | 0 | 0 | 0 | No major structural anomaly detected. |
| `utils` | **96/100** | 43 | 2912 | 43 | 0 | 0 | 0 | No major structural anomaly detected. |
| `workers` | **100/100** | 6 | 564 | 6 | 0 | 0 | 0 | No major structural anomaly detected. |

## Critical Hotspots (Largest Files)

- `data_banks/generators/generateAllBanks.ts` (4490 lines)
- `entrypoints/http/routes/documents.routes.ts` (2807 lines)
- `data_banks/intent_patterns/excel.pt.any.json` (2680 lines)
- `data_banks/intent_patterns/docx.en.any.json` (2676 lines)
- `data_banks/intent_patterns/excel.en.any.json` (2675 lines)
- `data_banks/intent_patterns/docx.pt.any.json` (2645 lines)
- `services/editing/documentRevisionStore.service.ts` (2582 lines)
- `services/editing/docx/docxEditor.service.ts` (2491 lines)
- `data_banks/manifest/bank_registry.any.json` (2371 lines)
- `modules/chat/runtime/CentralizedChatRuntimeDelegate.ts` (2217 lines)
- `queues/document.queue.ts` (2132 lines)
- `services/config/promptConfig.service.ts` (1664 lines)
- `services/telemetry/adminTelemetryAdapter.ts` (1597 lines)
- `services/core/execution/fileActionExecutor.service.ts` (1587 lines)
- `services/app/adminTelemetryApp.service.ts` (1583 lines)
- `data_banks/operators/operator_contracts.any.json` (1509 lines)
- `services/core/enforcement/contentGuard.service.ts` (1454 lines)
- `services/core/retrieval/retrievalEngine.service.ts` (1368 lines)
- `data_banks/dataBankRegistry.ts` (1366 lines)
- `services/creative/deck/slidesDeckBuilder.service.ts` (1355 lines)

## Lowest-Scoring Subfolders

| Subfolder | Grade | Files | Lines | Large(>500) | Notes |
|---|---:|---:|---:|---:|---|
| `entrypoints/http` | **58/100** | 23 | 9680 | 6 | HTTP layer central now, but route/controller split still incomplete in very large routes. |
| `services/core` | **61/100** | 38 | 20033 | 15 | Core orchestration is too dense; multiple responsibilities and high complexity. |
| `services/editing` | **72/100** | 102 | 30070 | 15 | Editing runtime is broad and still concentrated in very large service files. |
| `data_banks/intent_patterns` | **73/100** | 4 | 10676 | 4 | Pattern banks are huge and difficult to maintain safely without stronger tooling. |
| `services/llm` | **75/100** | 66 | 15878 | 8 | Complexity/size pressure. |
| `data_banks/operators` | **79/100** | 6 | 4054 | 4 | Complexity/size pressure. |
| `services/admin` | **80/100** | 24 | 7426 | 3 | Complexity/size pressure. |
| `services/extraction` | **82/100** | 7 | 3648 | 5 | Complexity/size pressure. |
| `services/app` | **83/100** | 7 | 3402 | 3 | Complexity/size pressure. |
| `data_banks/generators` | **85/100** | 3 | 5393 | 2 | Complexity/size pressure. |
| `services/config` | **85/100** | 4 | 2535 | 2 | Complexity/size pressure. |
| `services/telemetry` | **85/100** | 8 | 3831 | 2 | Complexity/size pressure. |
| `data_banks/dataBankRegistry.ts` | **87/100** | 1 | 1366 | 1 | Complexity/size pressure. |
| `data_banks/policies` | **87/100** | 9 | 2820 | 3 | Complexity/size pressure. |
| `queues/document.queue.ts` | **87/100** | 1 | 2132 | 1 | Complexity/size pressure. |

## Centralization Verdict

1. **Improved**: entrypoint routes are now the active runtime path; legacy `src/routes` are mostly compatibility shims.
2. **Not complete**: business logic remains heavily concentrated in `src/services` with overlapping namespaces (`core`, `app`, feature services).
3. **Architecture drift remains**: `src/platform`, `src/shared`, and `src/data` are mostly scaffolds, while real runtime still uses legacy locations.
4. **Bank governance improved but still heavy**: one loader path is active, but bank files are very large and numerous, increasing drift risk.
5. **Deployability**: build/test wiring checks pass, but maintainability risk is still high due to giant files and partial migration state.

## Immediate Reorganization Priorities

1. Split `entrypoints/http/routes/documents.routes.ts` and `entrypoints/http/routes/chat.routes.ts` into route + controller/use-case boundaries.
2. Break `services/core` and `services/editing` giant services into smaller module-owned units with strict interfaces.
3. Either implement `platform/shared` for real runtime usage or remove scaffolds until migration is ready.
4. Continue reducing duplicate type surfaces (notably LLM type files across multiple provider folders).
5. Keep only one data/bank governance path and delete any remaining direct filesystem bank lookups in runtime-critical services.
