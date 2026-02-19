# Orchestration Canonical Runtime

## Production Runtime Path

1. `backend/src/server.ts` initializes banks and LLM gateway.
2. `server.ts` wires `PrismaChatService` into `app.locals.services.chat`.
3. `backend/src/routes/chat.routes.ts` and `backend/src/controllers/rag.controller.ts` both call this same chat service.
4. `PrismaChatService` delegates to `backend/src/modules/chat/application/chat-runtime.service.ts`.
5. Runtime orchestration is handled by:
   - `backend/src/modules/chat/runtime/ChatRuntimeOrchestrator.ts`
   - `backend/src/services/chat/chatKernel.service.ts`
   - `backend/src/services/chat/turnRouter.service.ts`

This is the only supported orchestration path for production chat/rag requests.

## Removed Dead Paths

- Deleted `backend/src/services/app/ragApp.service.ts`.
- Deleted legacy V3 orchestrator tree under `backend/src/services/core/orchestration/`.
- Removed container/server wiring that exposed `core.orchestrator` and `core.kodaOrchestrator` in app locals.

## Routing Policy

`TurnRouterService` now uses bank-backed routing patterns via `backend/src/services/chat/turnRoutePolicy.service.ts`:

- Reads `connectors_routing` and `email_routing` banks when available.
- Applies fallback connector regex only if banks are unavailable.
- Keeps editor-mode guardrails as highest priority.

## Rules For New Work

- Add chat orchestration logic only under `modules/chat` + `services/chat` canonical runtime.
- Do not add new production wiring to `core/orchestration`.
- Keep `/chat` and `/rag` behavior on the same `PrismaChatService` contract.
