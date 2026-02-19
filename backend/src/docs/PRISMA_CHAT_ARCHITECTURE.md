# Prisma Chat Architecture

## Goal

Provide one centralized runtime chat surface while preserving existing API and SSE contracts.

## Current Runtime

1. `PrismaChatService` is the single entrypoint used by `server.ts`.
2. `PrismaChatService` composes:
- `ChatRuntimeService` for persistence and full turn execution logic.
- `ChatKernelService` for route selection and guardrails.
3. There is no `prismaChat.core/legacy` runtime file anymore.

## Composition Root

`backend/src/services/prismaChat.service.ts`

- Owns:
  - `runtime: ChatRuntimeService`
  - `kernel: ChatKernelService`
- Delegates:
  - `chat` and `streamChat` through kernel when enabled
  - CRUD/message methods directly to core

## Kernel Routing

`backend/src/services/chat/chatKernel.service.ts`

- Uses `TurnContextBuilder` + `TurnRouterService`.
- Dispatches to editor/connector/knowledge/general handlers.
- Handlers depend on `TurnExecutor` (generic contract), not a legacy-named executor.

## Migration Note

All new code must import:

- `PrismaChatService` from `prismaChat.service.ts`
- `ChatRuntimeService` from `chatRuntime.service.ts`
