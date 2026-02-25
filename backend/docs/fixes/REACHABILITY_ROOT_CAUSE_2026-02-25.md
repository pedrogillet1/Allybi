# Reachability Root Cause Analysis — 2026-02-25

## Executive summary
Runtime reachability is **not increasing** because there has been no net reduction in the unreachable runtime set.

Current strict metrics (fresh run):
- Reachable runtime files: **367**
- Runtime source files: **458**
- Runtime unreachable: **91**
- Runtime coverage: **80.13%**

Commands used:
- `npm run audit:runtime-graph -- --strict-runtime`
- `npm run audit:reachability:triage`
- `npm run audit:reachability:budget:strict`

All three commands are passing, but they are currently enforcing a **non-regression baseline** (80.13%, 91 unreachable), not a growth target.

## Why coverage is flat

### 1) The unreachable runtime inventory is unchanged
The current unreachable runtime set is still **91 files**. Coverage cannot rise unless that set shrinks (WIRE) or exits runtime scope (MOVE/DELETE).

Breakdown by top directory (runtime unreachable only):
- `src/services/*`: **50**
- `src/modules/*`: **11**
- `src/admin/types/*`: **9**
- `src/platform/*`: **3**
- Other buckets: **18**

### 2) Most unreachable files are legacy surface, not active path
Top reasons from triage:
- `Legacy runtime subtree file is unreachable from active seeds.`: **49**
- `Unknown bucket: move to non-runtime location or wire explicitly.`: **24**
- `Runtime-layer file should be reachable from server seeds.`: **15**

This means the graph is correctly finding dead/unwired runtime code.

### 3) Core unreachable files are fully allowlisted
`coreUnreachable = 16`, and all 16 are allowlisted in `scripts/audit/reachability-allowlist.json`.

Allowlisted core-unreachable files include:
- `src/app/http/index.ts`
- `src/app/workers/index.ts`
- `src/modules/chat/index.ts`
- `src/modules/chat/http/index.ts`
- `src/modules/chat/infra/index.ts`
- `src/modules/documents/application/index.ts`
- `src/modules/documents/http/index.ts`
- `src/modules/domain/infra/index.ts`
- `src/modules/editing/application/index.ts`
- `src/modules/editing/http/index.ts`
- `src/modules/editing/infra/index.ts`
- `src/modules/retrieval/application/index.ts`
- `src/modules/retrieval/infra/index.ts`
- `src/platform/db/prismaClient.ts`
- `src/platform/storage/gcsStorage.service.ts`
- `src/platform/storage/driveStorage.service.ts`

Because these are allowlisted, strict budget currently treats them as acceptable debt.

### 4) Runtime seeds still route through legacy graph
Runtime graph seeds:
- `src/server.ts`
- `src/main/server.ts`
- `src/app.ts`
- `src/workers/document-worker.ts`
- `src/entrypoints/workers/document.worker.ts`
- `src/entrypoints/workers/jobs.worker.ts`

Evidence probes show all major `src/modules/*` and `src/platform/*` wrapper/index files remain unreachable from those seeds.

### 5) Passing strict gates do not imply upward movement
Current budget is configured to pass at current baseline:
- `minRuntimeCoverage: 0.8`
- `maxRuntimeUnreachable: 91`
- `minReachableFiles: 360`
- `minReachableRuntimeFiles: 367`

So strict checks enforce “do not regress”, not “increase each run”.

## Evidence: runtime-unreachable groups (91)

### Highest-impact groups
- `src/services/core/*` (12)
- `src/services/creative/*` (11)
- `src/services/editing/*` (10)
- `src/admin/types/*` (9)
- `src/services/editorSession/*` (5)
- `src/services/ingestion/*` (5)

### Core WIRE backlog (15)
These are the files explicitly classified as WIRE and still unreachable:
- `src/app/http/index.ts`
- `src/app/workers/index.ts`
- `src/modules/chat/http/index.ts`
- `src/modules/chat/index.ts`
- `src/modules/documents/application/index.ts`
- `src/modules/documents/http/index.ts`
- `src/modules/domain/infra/index.ts`
- `src/modules/editing/application/index.ts`
- `src/modules/editing/http/index.ts`
- `src/modules/editing/infra/index.ts`
- `src/modules/retrieval/application/index.ts`
- `src/modules/retrieval/infra/index.ts`
- `src/platform/db/prismaClient.ts`
- `src/platform/storage/gcsStorage.service.ts`
- `src/platform/storage/driveStorage.service.ts`

## Quantitative target math
With current `reachable=367`, `total=458`:

- To reach **90%**:
  - Need `413` reachable (**+46**) if denominator unchanged, or
  - Reduce runtime denominator by **51** files if reachable stays 367.

- To reach **95%**:
  - Need `436` reachable (**+69**), or
  - Reduce denominator by **72** files.

This confirms that small script tweaks cannot move score materially; you need structural WIRE/MOVE/DELETE execution.

## Concrete blockers preventing growth
1. No runtime imports added from seeds into the WIRE file set.
2. No deletion/move of legacy unreachable runtime files in `src/services/*`.
3. Core unreachable files remain allowlisted, so CI does not force closure.
4. No release ratchet on `minRuntimeCoverage` beyond current floor.

## What must happen next for coverage to rise
1. Execute WIRE backlog first (15 files) by making them actual runtime dependencies from `server.ts`/`app.ts` call paths.
2. Move non-runtime utilities out of `src/` (especially type-only/admin helper surfaces not needed at runtime).
3. Delete dead legacy unreachable services after confirming no seed-reachable imports.
4. Tighten reachability ratchet per release:
   - next: `>= 0.85`
   - next: `>= 0.90`
   - next: `>= 0.95`
5. Remove allowlist entries as each item is wired or deleted.

## Bottom line
Reachability is not increasing because the project is still carrying a large, stable unreachable runtime backlog and current strict gates are set to protect against regression, not enforce upward movement. The graph is functioning correctly; the architecture migration closure work has not yet been executed on the unreachable set.
