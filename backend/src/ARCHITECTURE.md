# Backend Architecture (Clarity-First, SSOT)

This backend is migrating to a 4-layer structure:

1. `entrypoints/` - transport only (HTTP routes, middleware, workers)
2. `modules/` - business capabilities by domain
3. `platform/` - infra shared across modules (db, llm, security, queue, storage)
4. `shared/` - pure contracts/types/utils

## Current migration state

- New modular tree has been scaffolded.
- Chat runtime moved to `modules/chat` with compatibility wrappers under `services/`.
- Legacy runtime remains behind feature flag and compatibility adapter.
- Route imports in `app.ts` now flow through `entrypoints/http/routes/*` wrappers.
- TODO-only stub services were removed.
- `lint:architecture` enforces route boundary rules.

## Compatibility

- Public API routes are unchanged.
- Existing import paths under `services/` still work via wrappers during migration.

## Next migration work

- Decompose oversized route files (`document.routes.ts`, `chat.routes.ts`).
- Collapse `services/core` into module and platform ownership.
- Move bank runtime from `data_banks` to `data/banks` with single loader and manifest.
