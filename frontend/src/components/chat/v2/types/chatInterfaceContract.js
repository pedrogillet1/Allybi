export const CHAT_INTERFACE_PROP_KEYS = [
  "currentConversation",
  "onConversationUpdate",
  "onConversationCreated",
  "conversationCreateTitle",
  "variant",
  "pinnedDocuments",
  "viewerDraftApproval",
  "viewerSelection",
  "viewerContext",
  "viewerIntent",
  "onViewerSourceNavigate",
  "onClearViewerSelection",
  "focusNonce",
  "apiRef",
  "onAssistantFinal",
  "tourOpenConnectorMenuRef",
  "tourCloseConnectorMenuRef",
];

export const CHAT_INTERFACE_IMPERATIVE_METHODS = [
  "focus",
  "setDraft",
  "send",
  "injectAssistant",
];

export const CHAT_INTERFACE_REQUIRED_TOUR_SELECTORS = [
  "chat-hero",
  "chat-input",
  "chat-send",
  "chat-plus",
  "chat-upload-files",
  "chat-connectors",
  "chat-tools-popover",
  "chat-upload-folder",
];

export const CHAT_INTERFACE_CONTRACT = {
  propKeys: CHAT_INTERFACE_PROP_KEYS,
  imperativeMethods: CHAT_INTERFACE_IMPERATIVE_METHODS,
  tourSelectors: CHAT_INTERFACE_REQUIRED_TOUR_SELECTORS,
};
