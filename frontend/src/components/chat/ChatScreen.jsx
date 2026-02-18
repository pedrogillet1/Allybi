// src/components/chat/ChatScreen.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { ROUTES, buildRoute } from "../../constants/routes";

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
 *  - URL contains conversation ID for refresh persistence (uses replaceState to avoid re-renders)
 */

const STORAGE_KEY_PREFIX = "currentConversationId";

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

/**
 * Silently update the browser URL bar without triggering React Router
 * re-renders or route matching. This is critical — using navigate() would
 * cause ChatHistory to re-fetch conversations and lose locally-added items.
 */
function silentReplaceUrl(path) {
  if (window.location.pathname !== path) {
    window.history.replaceState(null, "", path);
  }
}

export default function ChatScreen() {
  const location = useLocation();
  const { conversationId: urlConversationId } = useParams();
  const isMobile = useIsMobile();

  const { isAuthenticated, user } = useAuth();
  const { open: openOnboarding } = useOnboarding();
  const conversationStorageKey = useMemo(
    () => `${STORAGE_KEY_PREFIX}:${String(user?.id || "anon")}`,
    [user?.id]
  );

  const [showNotificationsPopup, setShowNotificationsPopup] = useState(false);

  // Used to update list items from child (ref to avoid re-render cascade)
  const updateConversationInListRef = useRef(null);

  // Track onboarding open once per session
  const onboardingTriggeredRef = useRef(false);

  // Track whether we mounted with an existing conversation (so we don't re-add it to history)
  const hadInitialConversationRef = useRef(false);

  // Avoid spamming /conversations during dev remounts or when backend is rate limiting.
  const hydrateMetaRef = useRef({ lastAttemptTs: 0 });

  // Initial conversation resolution:
  //  1) URL param (e.g. /c/k4r8f5/{id})
  //  2) navigation state (if provided)
  //  3) localStorage active id (load minimal placeholder, fetch full in effect)
  //  4) ephemeral "new chat"
  const [currentConversation, setCurrentConversation] = useState(() => {
    if (urlConversationId && urlConversationId !== "new") {
      hadInitialConversationRef.current = true;
      return { id: urlConversationId, title: "Loading…" };
    }

    const navConvo = location.state?.newConversation;
    if (navConvo) {
      hadInitialConversationRef.current = true;
      return navConvo;
    }

    const savedId = localStorage.getItem(conversationStorageKey);
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

  useEffect(() => {
    if (!currentConversation || !isEphemeral(currentConversation)) return;
    const savedId = localStorage.getItem(conversationStorageKey);
    if (!savedId || savedId === "new") return;
    setCurrentConversation({ id: savedId, title: "Loading…" });
  }, [conversationStorageKey, currentConversation]);

  // ---------------------------------------------------------------------------
  // Persist current conversation id + sync URL bar
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!currentConversation) return;

    if (!isEphemeral(currentConversation) && currentConversation.id) {
      localStorage.setItem(conversationStorageKey, currentConversation.id);
      silentReplaceUrl(buildRoute.chat(currentConversation.id));
    } else {
      localStorage.removeItem(conversationStorageKey);
      silentReplaceUrl(ROUTES.CHAT);
    }
  }, [conversationStorageKey, currentConversation]);

  // ---------------------------------------------------------------------------
  // If we only have a minimal placeholder (title === "Loading…"), resolve the
  // title from the conversations list. Do NOT call getConversation() here —
  // that fetches all messages + decrypts them, which is slow and redundant
  // (ChatInterface already loads messages independently).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function hydrateConversation() {
      // Skip API calls for unauthenticated users (guest mode on mobile)
      if (!isAuthenticated) return;
      if (!currentConversation) return;
      if (isEphemeral(currentConversation)) return;
      if (currentConversation.title !== "Loading…") return;

      // 1) Try session cache first (written by ChatHistory).
      try {
        const cached = sessionStorage.getItem("koda_chat_conversations");
        if (cached) {
          const list = JSON.parse(cached);
          const match = Array.isArray(list) ? list.find((c) => c?.id === currentConversation.id) : null;
          if (match) {
            setCurrentConversation((prev) => ({ ...prev, ...match }));
            return;
          }
        }
      } catch {
        // ignore cache parse issues
      }

      // 2) Throttle API hydration attempts (prevents 429 loops).
      const now = Date.now();
      if (now - hydrateMetaRef.current.lastAttemptTs < 3000) return;
      hydrateMetaRef.current.lastAttemptTs = now;

      try {
        // Use the lightweight conversations list (no messages, no decryption)
        const list = await chatService.getConversations();
        if (cancelled) return;
        const convos = list?.conversations || [];
        const match = convos.find((c) => c.id === currentConversation.id);
        if (match) {
          setCurrentConversation((prev) => ({ ...prev, ...match }));
        } else {
          try {
            const convo = await chatService.getConversation(currentConversation.id);
            if (cancelled) return;
            if (convo?.id) {
              setCurrentConversation((prev) => ({
                ...prev,
                id: convo.id,
                title: convo.title || prev?.title || "New Chat",
                updatedAt: convo.updatedAt || prev?.updatedAt,
                createdAt: convo.createdAt || prev?.createdAt,
                isEphemeral: false,
              }));
              return;
            }
          } catch (detailErr) {
            if (detailErr?.response?.status === 404) {
              setCurrentConversation(makeEphemeralConversation());
            }
          }
        }
      } catch {
        // Keep current state on transient errors (500, network, rate-limit)
        // so we don't permanently lose the conversation reference.
      }
    }

    hydrateConversation();
    return () => {
      cancelled = true;
    };
  }, [currentConversation?.id, currentConversation?.title, isAuthenticated]);

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

    // Update local state (clear isEphemeral when merging a real conversation)
    setCurrentConversation((prev) => {
      const merged = prev ? { ...prev, ...updatedConversation } : updatedConversation;
      if (merged.id && merged.id !== "new") {
        merged.isEphemeral = false;
      }
      return merged;
    });

    // Update list if available
    if (typeof updateConversationInListRef.current === "function") {
      updateConversationInListRef.current(updatedConversation);
    }
  }, []);

  /**
   * Called by ChatInterface when the first user message creates a real conversation.
   */
  const handleConversationCreated = useCallback((newConversation) => {
    setCurrentConversation({ ...newConversation, isEphemeral: false });

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
      background: "#F1F0EF",
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

      {/* Conversation list (desktop: inline sidebar, mobile: collapsible overlay) */}
      <ChatHistory
        onSelectConversation={handleSelectConversation}
        currentConversation={currentConversation}
        onNewChat={handleNewChat}
        onConversationUpdate={registerUpdateFunction}
      />

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
