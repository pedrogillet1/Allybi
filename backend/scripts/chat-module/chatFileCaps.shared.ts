export const CHAT_FILE_CAPS = [
  ["src/modules/chat/runtime/ChatRuntimeOrchestrator.ts", 325],
  ["src/modules/chat/runtime/ChatTurnExecutor.ts", 450],
  ["src/modules/chat/runtime/TurnFinalizationService.ts", 220],
  ["src/modules/chat/runtime/TurnRetrievalService.ts", 275],
  ["src/modules/chat/runtime/ChatComposeService.ts", 220],
  ["src/modules/chat/runtime/ChatMemoryContextService.ts", 150],
  ["src/modules/chat/runtime/ChatTraceArtifactsService.ts", 120],
  ["src/modules/chat/runtime/ConversationMutationStore.ts", 325],
  ["src/modules/chat/runtime/ScopeMentionResolver.ts", 225],
  ["src/modules/chat/runtime/chatRuntimeLanguage.ts", 300],
  ["src/modules/chat/runtime/RuntimePromptBuilder.ts", 160],
  ["src/modules/chat/runtime/provenance/ProvenanceBuilder.ts", 180],
  ["src/modules/chat/application/handlers/connectorTurn.handler.ts", 220],
  ["src/modules/chat/application/turnRoutePolicy.service.ts", 140],
  ["src/modules/chat/presentation/chatMicrocopy.service.ts", 160],
  ["src/modules/chat/application/TurnRouterCandidateService.ts", 220],
  ["src/modules/chat/application/productHelp.service.ts", 100],
] as const;

export const CHAT_ENV_ALLOWLIST = new Set([
  "src/modules/chat/config/chatRuntimeConfig.ts",
  "src/modules/chat/application/chat-runtime.factory.ts",
]);
