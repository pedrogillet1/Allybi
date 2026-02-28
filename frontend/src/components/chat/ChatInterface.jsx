import React from "react";
import ChatInterfaceV2 from "./v2/ChatInterfaceV2";
import { CHAT_INTERFACE_CONTRACT } from "./v2/types/chatInterfaceContract";

/**
 * Compatibility wrapper for the chat surface.
 * Keeps the public component contract stable while V2 internals live in /v2.
 */
export default function ChatInterface(props) {
  return <ChatInterfaceV2 {...props} />;
}

ChatInterface.displayName = "ChatInterface";
ChatInterface.contract = CHAT_INTERFACE_CONTRACT;
