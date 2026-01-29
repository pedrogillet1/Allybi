// src/components/chat/ChatScreen.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import LeftNav from "../app-shell/LeftNav";
import ChatHistory from "./ChatHistory";
import ChatInterface from "./ChatInterface";
import NotificationPanel from "../notifications/NotificationPanel";

import { useIsMobile } from "../../hooks/useIsMobile";
import { useAuth } from "../../context/AuthContext";
import { useOnboarding } from "../../context/OnboardingContext";
import chatService from "../../services/chatService";

/**
 * ChatScreen.jsx (ChatGPT-parity)
 * ------------------------------
 * Goals:
 *  - Clean, predictable conversation lifecycle:
 *      - "New Chat" is ephemeral until first message (no premature API creation)
 *      - Persist active conversation id for the session (sessionStorage)
 *      - Recover gracefully if the saved id 404s
 *  - ChatGPT-like layout behavior:
 *      - Desktop: left nav + chat history + chat thread
 *      - Mobile: left nav + chat thread (history hidden by default; controlled inside ChatHistory if needed)
 *  - No noisy console logging in production
 */

const STORAGE_KEY = "currentConversationId";

function makeEphemeralConversation() {
  const now = new Date().toISOString();
  return {
    id: "new",
    title: "New Chat",
    createdAt: now,
    updatedAt: now,
    isEphemeral: true,
  };
}

function isEphemeral(convo) {
  return !convo || convo.id === "new" || convo.isEphemeral;
}

export default function ChatScreen() {
  const location = useLocation();
  const isMobile = useIsMobile();

  const { isAuthenticated } = useAuth();
  const { open: openOnboarding } = useOnboarding();

  const [showNotificationsPopup, setShowNotificationsPopup] = useState(false);

  // Used to update list items from child (ref to avoid re-render cascade)
  const updateConversationInListRef = useRef(null);

  // Track onboarding open once per session
  const onboardingTriggeredRef = useRef(false);

  // Track whether we mounted with an existing conversation (so we don’t re-add it to history)
  const hadInitialConversationRef = useRef(false);

  // Initial conversation resolution:
  //  1) navigation state (if provided)
  //  2) sessionStorage active id (load minimal placeholder, fetch full in effect)
  //  3) ephemeral "new chat"
  const [currentConversation, setCurrentConversation] = useState(() => {
    const navConvo = location.state?.newConversation;
    if (navConvo) {
      hadInitialConversationRef.current = true;
      return navConvo;
    }

    const savedId = localStorage.getItem(STORAGE_KEY);
    if (savedId && savedId !== "new") {
      hadInitialConversationRef.current = true;
      return { id: savedId, title: "Loading…" };
    }

    return makeEphemeralConversation();
  });

  // ---------------------------------------------------------------------------
  // Keep current conversation synced with navigation state (if route pushes a convo)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (location.state?.newConversation) {
      setCurrentConversation(location.state.newConversation);
    }
  }, [location.state]);

  // ---------------------------------------------------------------------------
  // Persist current conversation id during the session (but never persist ephemeral)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!currentConversation) return;

    if (!isEphemeral(currentConversation) && currentConversation.id) {
      localStorage.setItem(STORAGE_KEY, currentConversation.id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [currentConversation]);

  // ---------------------------------------------------------------------------
  // If we only have a minimal placeholder (title === "Loading…"), resolve the
  // title from the conversations list. Do NOT call getConversation() here —
  // that fetches all messages + decrypts them, which is slow and redundant
  // (ChatInterface already loads messages independently).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function hydrateConversation() {
      if (!currentConversation) return;
      if (isEphemeral(currentConversation)) return;
      if (currentConversation.title !== "Loading…") return;

      try {
        // Use the lightweight conversations list (no messages, no decryption)
        const list = await chatService.getConversations();
        if (cancelled) return;
        const convos = list?.conversations || [];
        const match = convos.find((c) => c.id === currentConversation.id);
        if (match) {
          setCurrentConversation((prev) => ({ ...prev, ...match }));
        } else {
          // Conversation was deleted — reset to new chat
          setCurrentConversation(makeEphemeralConversation());
        }
      } catch (err) {
        if (cancelled) return;
        setCurrentConversation(makeEphemeralConversation());
      }
    }

    hydrateConversation();
    return () => {
      cancelled = true;
    };
  }, [currentConversation?.id, currentConversation?.title]);

  // ---------------------------------------------------------------------------
  // Desktop-first onboarding auto-open (once per session)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isAuthenticated) return;

    // Desktop only
    if (isMobile || window.innerWidth < 1024) return;

    if (onboardingTriggeredRef.current) return;

    const done = localStorage.getItem("koda_onboarding_completed");
    if (done === "true") return;

    onboardingTriggeredRef.current = true;
    const t = setTimeout(() => openOnboarding(0, "auto"), 500);
    return () => clearTimeout(t);
  }, [isMobile, isAuthenticated, openOnboarding]);

  // ---------------------------------------------------------------------------
  // Callbacks (ChatHistory <-> ChatInterface coordination)
  // ---------------------------------------------------------------------------

  const handleSelectConversation = useCallback((conversation) => {
    setCurrentConversation(conversation);
  }, []);

  /**
   * "New Chat" is always ephemeral until first message is actually sent.
   */
  const handleNewChat = useCallback((ephemeralConversation) => {
    setCurrentConversation(ephemeralConversation || makeEphemeralConversation());
    // This is now a "fresh session scope"
    hadInitialConversationRef.current = false;
  }, []);

  /**
   * Called by ChatInterface when:
   *  - title/updatedAt changes
   *  - server returns updated conversation metadata
   */
  const handleConversationUpdate = useCallback((updatedConversation) => {
    // If null => conversation not found. Reset to ephemeral new chat.
    if (updatedConversation === null) {
      setCurrentConversation(makeEphemeralConversation());
      return;
    }

    // Update local state
    setCurrentConversation((prev) => (prev ? { ...prev, ...updatedConversation } : updatedConversation));

    // Update list if available
    if (typeof updateConversationInListRef.current === "function") {
      updateConversationInListRef.current(updatedConversation);
    }
  }, []);

  /**
   * Called by ChatInterface when the first user message creates a real conversation.
   */
  const handleConversationCreated = useCallback((newConversation) => {
    setCurrentConversation(newConversation);

    if (typeof updateConversationInListRef.current === "function") {
      updateConversationInListRef.current(newConversation);
    }

    // This conversation is now "real," so future hydration uses it
    hadInitialConversationRef.current = true;
  }, []);

  /**
   * ChatHistory provides a list update function so ChatScreen can keep the sidebar in sync.
   */
  const registerUpdateFunction = useCallback((fn) => {
    updateConversationInListRef.current = fn;
  }, []);

  // ---------------------------------------------------------------------------
  // Layout behavior (ChatGPT-like)
  // ---------------------------------------------------------------------------

  const containerStyle = useMemo(
    () => ({
      width: "100%",
      height: isMobile ? "100dvh" : "100%",
      background: "rgb(248, 250, 248)",
      display: "flex",
      overflow: "hidden",
      flexDirection: isMobile ? "column" : "row",
      position: "relative",
    }),
    [isMobile]
  );

  return (
    <div data-chat-container="true" className="chat-container" style={containerStyle}>
      {/* Global left nav */}
      <LeftNav onNotificationClick={() => setShowNotificationsPopup(true)} />

      {/* Desktop: show conversation list */}
      {!isMobile ? (
        <ChatHistory
          onSelectConversation={handleSelectConversation}
          currentConversation={currentConversation}
          onNewChat={handleNewChat}
          onConversationUpdate={registerUpdateFunction}
        />
      ) : null}

      {/* Main chat thread */}
      <ChatInterface
        currentConversation={currentConversation}
        onConversationUpdate={handleConversationUpdate}
        onConversationCreated={handleConversationCreated}
      />

      {/* Notifications */}
      <NotificationPanel
        showNotificationsPopup={showNotificationsPopup}
        setShowNotificationsPopup={setShowNotificationsPopup}
      />
    </div>
  );
}
