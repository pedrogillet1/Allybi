// ── Domain ──
export type {
  ChatRole,
  ChatMessageDTO,
  ConversationDTO,
  ConversationWithMessagesDTO,
  ConversationListOptions,
  ConversationMessagesOptions,
  CreateMessageParams,
  ChatRequest,
  AnswerMode,
  AnswerClass,
  NavType,
  ChatResultStatus,
  ChatCompletionState,
  ChatTruncationState,
  ChatEvidenceState,
  ChatSourceDTO,
  ChatResult,
  ChatEngine,
  PrismaChatServicePort,
} from "./domain/chat.contracts";
export { ConversationNotFoundError } from "./domain/chat.contracts";

export type {
  EditorSelectionRange,
  TurnContext,
  TurnRouteDecision,
  TurnRequest,
  TurnResult,
} from "./domain/chat.types";

// ── Runtime ──
export type { RuntimeDelegate } from "./runtime/ChatRuntimeOrchestrator";
export { ChatRuntimeOrchestrator } from "./runtime/ChatRuntimeOrchestrator";

export { CentralizedChatRuntimeDelegate } from "./runtime/CentralizedChatRuntimeDelegate";

export { ScopeService } from "./runtime/ScopeService";
export { EvidenceValidator } from "./runtime/EvidenceValidator";
export { ContractNormalizer } from "./runtime/ContractNormalizer";

export type { RuntimePolicyErrorCode } from "./runtime/runtimePolicyError";
export {
  RuntimePolicyError,
  isRuntimePolicyError,
  toRuntimePolicyErrorCode,
} from "./runtime/runtimePolicyError";

// ── API envelope ──
export {
  normalizeChatResult,
  toChatFinalEvent,
  toChatHttpEnvelope,
} from "./api/chatResultEnvelope";

// ── Application ──
export { ChatRuntimeService } from "./application/chat-runtime.service";
