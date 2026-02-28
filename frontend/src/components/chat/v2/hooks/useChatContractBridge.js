import { useEffect } from "react";

export function useTourConnectorBridge({
  tourOpenConnectorMenuRef,
  tourCloseConnectorMenuRef,
  setConnectorMenuOpen,
}) {
  useEffect(() => {
    if (tourOpenConnectorMenuRef) {
      tourOpenConnectorMenuRef.current = () => setConnectorMenuOpen(true);
    }
    if (tourCloseConnectorMenuRef) {
      tourCloseConnectorMenuRef.current = () => setConnectorMenuOpen(false);
    }
  }, [tourOpenConnectorMenuRef, tourCloseConnectorMenuRef, setConnectorMenuOpen]);
}

export function useImperativeChatApi({
  apiRef,
  inputRef,
  setInput,
  sendMessage,
  setMessages,
}) {
  useEffect(() => {
    if (!apiRef || typeof apiRef !== "object") return undefined;

    apiRef.current = {
      focus: () => inputRef.current?.focus(),
      setDraft: (text) => setInput(String(text || "")),
      send: (text) => sendMessage(String(text || "")),
      injectAssistant: ({ content = "", attachments = [], answerMode = "action_receipt" } = {}) => {
        const id = `injected:${Date.now().toString(16)}:${Math.random().toString(16).slice(2)}`;
        setMessages((prev) => [
          ...(Array.isArray(prev) ? prev : []),
          {
            id,
            role: "assistant",
            content: String(content || ""),
            createdAt: new Date().toISOString(),
            status: "done",
            answerMode,
            navType: null,
            sources: [],
            followups: [],
            attachments: Array.isArray(attachments) ? attachments : [],
          },
        ]);
      },
    };

    return () => {
      try {
        apiRef.current = null;
      } catch {
        // no-op: external refs can be frozen in uncommon host contexts
      }
    };
  }, [apiRef, inputRef, sendMessage, setInput, setMessages]);
}
