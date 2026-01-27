// src/components/chat/ChatInterface.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";

import unifiedUploadService from "../../services/unifiedUploadService";
import { UPLOAD_CONFIG } from "../../config/upload.config";
import * as chatService from "../../services/chatService";

import FileIcons from "../shared/FileIcons";
import DocumentPreviewModal from "../documents/DocumentPreviewModal";
import UniversalUploadModal from "../upload/UniversalUploadModal";

import StreamingMarkdown from "./streaming/StreamingMarkdown";
import MessageActions from "./messages/MessageActions";
import FailedMessage from "./messages/FailedMessage";
import MessageLoadingSkeleton from "./messages/MessageLoadingSkeleton";
import TypingIndicator from "./messages/TypingIndicator";
import useStageLabel from "./messages/useStageLabel";
import FollowUpChips from "./followups/FollowUpChips";

import SourcesList from "../sources/SourcesList";
import InlineNavPill from "../attachments/pills/InlineNavPill";

import "./streaming/MarkdownStyles.css";
import "./streaming/StreamingAnimation.css";
import "./streaming/SpacingUtilities.css";

/**
 * ChatInterface.jsx (ChatGPT-parity, cleaned)
 * ------------------------------------------
 * What this version guarantees:
 *  - Smooth streaming (fast first token, steady cadence, abortable)
 *  - Ephemeral “New Chat” stays local until first send; conversation is created on first message
 *  - Attachments behave like ChatGPT:
 *      - upload immediately on attach (drag/drop/paste/filepicker)
 *      - show attachment pills above input
 *      - attachments also appear on the user message
 *  - Sources match your screenshot:
 *      - Normal answers: "Sources:" + pill buttons
 *      - open/where/find/discover: short intro line + pill buttons only (no actions)
 *  - Smart scroll: only autoscroll if user is near bottom; show a “jump to bottom” button if not
 *  - No raw HTML in markdown (StreamingMarkdown already enforces this)
 *
 * Expected server streaming format (SSE):
 *  data: {"type":"meta","answerMode":"doc_grounded_single","navType":null}
 *  data: {"type":"delta","text":"..."}  (or type:"content")
 *  data: {"type":"sources","sources":[...]}
 *  data: {"type":"followups","followups":[{label,query}]}
 *  data: {"type":"final","message":{answerMode,navType,text,sources,followups}}
 *  data: {"type":"error","message":"..."}
 *
 * If your backend currently uses /api/rag/query/stream, set ENDPOINT below.
 */

const API_BASE = process.env.REACT_APP_API_URL || "";
const ENDPOINT = process.env.REACT_APP_CHAT_STREAM_ENDPOINT || `${API_BASE}/api/chat/stream`;

// Streaming cadence (frontend smoothing)
const STREAM = {
  FLUSH_INTERVAL_MS: 33, // ~30fps
  TARGET_CHARS_PER_SEC: 75,
  MAX_CHARS_PER_FLUSH: 12,
  RAMP_MS: 350,
};

// Session cache keys
const cacheKeyFor = (conversationId) => `koda_chat_messages_${conversationId}`;
const cacheTsKeyFor = (conversationId) => `${cacheKeyFor(conversationId)}_timestamp`;
const DRAFT_KEY = (conversationId) => `koda_draft_${conversationId || "new"}`;

function uid(prefix = "m") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function normalizeWhitespace(s) {
  return (s ?? "").replace(/\r\n|\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function stripSourcesLabels(text) {
  if (!text) return "";
  return text.replace(/\b(Sources|Fontes|Fuentes)\s*:\s*\n?/gi, "").trim();
}

function isNearBottom(el, thresholdPx = 120) {
  if (!el) return true;
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - scrollTop - clientHeight < thresholdPx;
}

async function* streamSSE(response) {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const lines = frame.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
        else yield trimmed;
      }
    }
  }

  const tail = buffer.trim();
  if (tail) yield tail;
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extFromFilename(filename = "", mimeType = "") {
  const f = String(filename || "");
  const dot = f.lastIndexOf(".");
  if (dot !== -1 && dot < f.length - 1) return f.slice(dot + 1).toLowerCase();

  const m = String(mimeType || "").toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("spreadsheet") || m.includes("excel") || m.includes("sheet")) return "xlsx";
  if (m.includes("presentation") || m.includes("powerpoint")) return "pptx";
  if (m.includes("wordprocessingml")) return "docx";
  if (m.startsWith("image/")) return m.split("/")[1] || "img";
  if (m.includes("text/markdown")) return "md";
  if (m.includes("text/plain")) return "txt";
  return "";
}

export default function ChatInterface({ currentConversation, onConversationUpdate, onConversationCreated }) {
  const isMobile = useIsMobile();

  const conversationId = currentConversation?.id || "new";
  const isEphemeral = conversationId === "new" || currentConversation?.isEphemeral;

  // Messages are kept in a canonical shape:
  // { id, role, content, createdAt, status, answerMode, navType, sources, followups, attachments, error }
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState(() => localStorage.getItem(DRAFT_KEY(conversationId)) || "");

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState(null);

  // Stage indicator (optional UI)
  const [stage, setStage] = useState({ stage: "thinking", message: "" });
  const stageLabel = useStageLabel(stage.stage, isStreaming);

  // Attachments (uploaded immediately, then attached to next send)
  const [attachedDocs, setAttachedDocs] = useState([]); // {id, filename/name, mimeType/type, size}
  const [uploading, setUploading] = useState([]); // local File objects being uploaded

  // Preview modal state
  const [previewDocument, setPreviewDocument] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Smart scroll state
  const [atBottom, setAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const containerRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Abort streaming
  const abortRef = useRef(null);

  // Streaming buffer and flush loop
  const activeAssistantIdRef = useRef(null);
  const streamBufRef = useRef("");
  const streamStartRef = useRef(0);
  const streamLastFlushRef = useRef(0);
  const rafRef = useRef(null);

  // Prevent unnecessary reload clearing (hot reload / same id)
  const prevConversationIdRef = useRef(null);

  // -------------------------
  // Load conversation messages (cache first)
  // -------------------------
  useEffect(() => {
    const curId = conversationId;
    const prevId = prevConversationIdRef.current;
    const changed = curId !== prevId;

    if (!changed) return;

    // Reset state if ephemeral
    if (isEphemeral) {
      setMessages([]);
      setIsStreaming(false);
      setStreamError(null);
      setStage({ stage: "thinking", message: "" });
      setAttachedDocs([]);
      setUploading([]);
      activeAssistantIdRef.current = null;
      streamBufRef.current = "";
      prevConversationIdRef.current = curId;
      return;
    }

    prevConversationIdRef.current = curId;

    // 1) cache
    try {
      const cached = sessionStorage.getItem(cacheKeyFor(curId));
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {}

    // 2) background refresh
    let cancelled = false;
    (async () => {
      try {
        const convo = await chatService.getConversation(curId);
        if (cancelled) return;
        const loaded = Array.isArray(convo?.messages) ? convo.messages : [];

        const normalized = loaded.map((m) => ({
          id: m.id || uid("msg"),
          role: m.role,
          content: m.content || "",
          createdAt: m.createdAt || new Date().toISOString(),
          status: "done",
          answerMode: m.answerMode || m.metadata?.answerMode || "doc_grounded_single",
          navType: m.navType || m.metadata?.navType || null,
          sources: m.sources || m.ragSources || m.metadata?.ragSources || [],
          followups: m.followups || m.followUpSuggestions || [],
          attachments: m.attachments || [],
        }));

        setMessages(normalized);
        sessionStorage.setItem(cacheKeyFor(curId), JSON.stringify(normalized));
        sessionStorage.setItem(cacheTsKeyFor(curId), Date.now().toString());
      } catch (e) {
        // If 404, let parent reset conversation
        if (e?.response?.status === 404) onConversationUpdate?.(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, isEphemeral, onConversationUpdate]);

  // -------------------------
  // Draft persistence per conversation
  // -------------------------
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY(conversationId), input);
  }, [input, conversationId]);

  useEffect(() => {
    setInput(localStorage.getItem(DRAFT_KEY(conversationId)) || "");
  }, [conversationId]);

  // -------------------------
  // Smart scroll
  // -------------------------
  const scrollToBottom = useCallback(() => {
    if (!containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
    setAtBottom(true);
    setUnreadCount(0);
  }, []);

  const onScroll = useCallback(() => {
    const near = isNearBottom(containerRef.current);
    setAtBottom(near);
    if (near) setUnreadCount(0);
  }, []);

  useEffect(() => {
    // When new messages arrive: only autoscroll if already near bottom
    if (!containerRef.current) return;
    if (atBottom) {
      scrollToBottom();
    } else {
      setUnreadCount((n) => n + 1);
    }

    // Cache messages when updated (exclude streaming placeholder if desired)
    if (!isEphemeral) {
      try {
        sessionStorage.setItem(cacheKeyFor(conversationId), JSON.stringify(messages));
        sessionStorage.setItem(cacheTsKeyFor(conversationId), Date.now().toString());
      } catch {}
    }
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------
  // Streaming flush loop (ChatGPT-like cadence)
  // -------------------------
  const flushLoop = useCallback(() => {
    const now = performance.now();
    const id = activeAssistantIdRef.current;
    if (!id) return;

    const buf = streamBufRef.current;
    if (!buf) {
      rafRef.current = requestAnimationFrame(flushLoop);
      return;
    }

    const elapsed = now - (streamStartRef.current || now);
    const ramp = clamp(elapsed / STREAM.RAMP_MS, 0, 1);
    const targetCps = STREAM.TARGET_CHARS_PER_SEC * (0.35 + 0.65 * ramp);

    const dt = Math.max(1, now - (streamLastFlushRef.current || now));
    const budgetChars = clamp(Math.floor((dt / 1000) * targetCps), 1, STREAM.MAX_CHARS_PER_FLUSH);

    const chunk = buf.slice(0, budgetChars);
    streamBufRef.current = buf.slice(budgetChars);
    streamLastFlushRef.current = now;

    if (chunk) {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, content: (m.content || "") + chunk, status: "streaming" } : m))
      );
    }

    rafRef.current = requestAnimationFrame(flushLoop);
  }, []);

  const ensureFlush = useCallback(() => {
    if (rafRef.current) return;
    streamLastFlushRef.current = performance.now();
    rafRef.current = requestAnimationFrame(flushLoop);
  }, [flushLoop]);

  const stopStreaming = useCallback((soft = false) => {
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {}
    }
    abortRef.current = null;

    setIsStreaming(false);
    setStage({ stage: "thinking", message: "" });

    streamBufRef.current = "";
    activeAssistantIdRef.current = null;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Soft stop: keep partial assistant message as done
    if (soft) {
      setMessages((prev) =>
        prev.map((m) => (m.status === "streaming" && m.role === "assistant" ? { ...m, status: "done" } : m))
      );
    }
  }, []);

  useEffect(() => {
    return () => stopStreaming(true);
  }, [stopStreaming]);

  // -------------------------
  // Upload (immediate on attach)
  // -------------------------
  const uploadFiles = useCallback(
    async (files) => {
      const list = Array.from(files || []).filter(Boolean);
      if (!list.length) return;

      // Validate upfront (size)
      for (const f of list) {
        if (f.size > UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES) {
          setStreamError(`File is too large: ${f.name}`);
          return;
        }
      }

      setUploading(list);

      const uploaded = [];
      try {
        for (const f of list) {
          const result = await unifiedUploadService.uploadSingleFile(
            f,
            null,
            () => {} // progress can be wired into a per-file progress UI if you want
          );
          if (result?.success && result.documentId) {
            uploaded.push({
              id: result.documentId,
              filename: f.name,
              name: f.name,
              mimeType: f.type || "application/octet-stream",
              type: f.type || "application/octet-stream",
              size: f.size,
            });
          }
        }
      } catch (e) {
        setStreamError("Upload failed. Try again.");
      } finally {
        setUploading([]);
      }

      if (uploaded.length) {
        setAttachedDocs((prev) => {
          const seen = new Set(prev.map((d) => d.id));
          const merged = [...prev];
          for (const d of uploaded) if (!seen.has(d.id)) merged.push(d);
          return merged;
        });
      }
    },
    [setStreamError]
  );

  const onFilePick = useCallback((e) => {
    const files = e.target.files;
    if (files && files.length) uploadFiles(files);
    e.target.value = "";
  }, [uploadFiles]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (files && files.length) uploadFiles(files);
  }, [uploadFiles]);

  const onPaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files = [];
    for (const it of items) {
      if (it.type?.startsWith("image/")) {
        const blob = it.getAsFile();
        if (blob) {
          const ext = it.type.split("/")[1] || "png";
          files.push(new File([blob], `pasted-${Date.now()}.${ext}`, { type: it.type }));
        }
      }
    }

    if (files.length) uploadFiles(files);
  }, [uploadFiles]);

  const removeAttachment = useCallback((docId) => {
    setAttachedDocs((prev) => prev.filter((d) => d.id !== docId));
  }, []);

  // -------------------------
  // Send message (SSE streaming)
  // -------------------------
  const beginAssistantPlaceholder = useCallback(() => {
    const id = uid("asst");
    activeAssistantIdRef.current = id;
    streamBufRef.current = "";
    streamStartRef.current = performance.now();

    setMessages((prev) => [
      ...prev,
      {
        id,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        status: "streaming",
        answerMode: "doc_grounded_single",
        navType: null,
        sources: [],
        followups: [],
        attachments: [],
      },
    ]);

    ensureFlush();
    return id;
  }, [ensureFlush]);

  const createConversationIfNeeded = useCallback(async () => {
    if (!isEphemeral) return conversationId;

    const created = await chatService.createConversation();
    onConversationCreated?.(created);
    return created.id;
  }, [conversationId, isEphemeral, onConversationCreated]);

  const sendMessage = useCallback(async () => {
    if (isStreaming) return;

    const trimmed = (input || "").trim();
    const hasAttachments = attachedDocs.length > 0;

    if (!trimmed && !hasAttachments) return;

    setStreamError(null);

    // optimistic user message
    const userId = uid("user");
    const userMsg = {
      id: userId,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
      status: "done",
      answerMode: "general_answer",
      navType: null,
      sources: [],
      followups: [],
      attachments: attachedDocs.map((d) => ({
        type: "attached_file",
        id: d.id,
        filename: d.filename || d.name,
        mimeType: d.mimeType || d.type,
      })),
      attachedFiles: attachedDocs.map((d) => ({
        id: d.id,
        name: d.filename || d.name,
        mimeType: d.mimeType || d.type,
      })),
    };

    setMessages((prev) => [...prev, userMsg]);

    // clear input + draft
    setInput("");
    localStorage.removeItem(DRAFT_KEY(conversationId));

    // Keep focus like ChatGPT
    setTimeout(() => inputRef.current?.focus(), 10);

    setIsStreaming(true);
    setStage({ stage: "thinking", message: "" });

    const assistantId = beginAssistantPlaceholder();

    // Create conversation if needed
    let realConversationId = conversationId;
    try {
      realConversationId = await createConversationIfNeeded();
    } catch {
      setStreamError("Couldn’t start a new chat.");
      setIsStreaming(false);
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, status: "error" } : m)));
      return;
    }

    // Build request
    const token = localStorage.getItem("accessToken");
    const controller = new AbortController();
    abortRef.current = controller;

    const body = {
      conversationId: realConversationId,
      message: trimmed,
      attachedDocuments: attachedDocs.map((d) => ({
        id: d.id,
        name: d.filename || d.name,
        type: d.mimeType || d.type,
      })),
      client: { wantsStreaming: true },
    };

    // Once message is sent, clear pending attachments (ChatGPT-like)
    // Attachments remain visible on the user message.
    setAttachedDocs([]);

    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      setStreamError("Network error.");
      setIsStreaming(false);
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, status: "error" } : m)));
      abortRef.current = null;
      return;
    }

    if (!response.ok) {
      setStreamError(`Request failed (${response.status})`);
      setIsStreaming(false);
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, status: "error" } : m)));
      abortRef.current = null;
      return;
    }

    try {
      for await (const raw of streamSSE(response)) {
        if (!activeAssistantIdRef.current) break;

        const evt = safeJsonParse(raw);
        if (!evt) {
          // treat raw as delta text
          streamBufRef.current += raw;
          continue;
        }

        const type = evt.type || evt.event || "delta";

        if (type === "stage") {
          setStage({ stage: evt.stage || "thinking", message: evt.message || "" });
        }

        if (type === "meta") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, answerMode: evt.answerMode || m.answerMode, navType: evt.navType ?? m.navType }
                : m
            )
          );
        }

        if (type === "delta" || type === "content") {
          const t = String(evt.text ?? evt.delta ?? evt.content ?? "");
          if (t) streamBufRef.current += t;
        }

        if (type === "sources") {
          const sources = Array.isArray(evt.sources) ? evt.sources : [];
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, sources } : m)));
        }

        if (type === "followups") {
          const followups = Array.isArray(evt.followups) ? evt.followups : [];
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, followups } : m)));
        }

        if (type === "final" || type === "done") {
          const msg = evt.message || evt.payload || evt;

          const finalMode = msg.answerMode || evt.answerMode || "doc_grounded_single";
          const finalNavType = msg.navType || evt.navType || null;

          const finalSources = Array.isArray(msg.sources) ? msg.sources : (Array.isArray(evt.sources) ? evt.sources : []);
          const finalFollowups = Array.isArray(msg.followups) ? msg.followups : (Array.isArray(evt.followups) ? evt.followups : []);

          // flush buffer immediately
          const buffered = streamBufRef.current;
          streamBufRef.current = "";

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const merged = normalizeWhitespace((m.content || "") + buffered);
              const cleaned = stripSourcesLabels(merged); // never show "Sources:" in text
              return {
                ...m,
                content: cleaned,
                status: "done",
                answerMode: finalMode,
                navType: finalNavType,
                sources: finalSources,
                followups: finalFollowups,
              };
            })
          );

          setIsStreaming(false);
          abortRef.current = null;

          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }

          break;
        }

        if (type === "error") {
          setStreamError(String(evt.message || "Request failed"));
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, status: "error" } : m)));
          setIsStreaming(false);
          abortRef.current = null;

          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }

          break;
        }
      }
    } catch (e) {
      if (controller.signal.aborted) {
        // stopped by user
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, status: (m.content || "").trim() ? "done" : "error" } : m))
        );
      } else {
        setStreamError("Stream interrupted.");
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, status: "error" } : m)));
      }
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [
    attachedDocs,
    beginAssistantPlaceholder,
    conversationId,
    createConversationIfNeeded,
    input,
    isEphemeral,
    isStreaming,
  ]);

  // -------------------------
  // Render helpers
  // -------------------------
  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  const openPreviewFromSource = useCallback((src) => {
    const filename = src?.title || src?.filename || "Document";
    setPreviewDocument({
      id: src?.docId || src?.documentId || src?.id,
      filename,
      mimeType: src?.mimeType || "application/octet-stream",
      fileSize: src?.fileSize,
      initialPage: src?.page || 1,
    });
  }, []);

  const renderSources = (m) => {
    const sources = Array.isArray(m.sources) ? m.sources : [];
    if (!sources.length) return null;

    const isNav = m.answerMode === "nav_pills" || !!m.navType;
    const navType = m.navType || (m.answerMode === "nav_pills" ? "discover" : null);

    // For open/where/find/discover queries: one short line + pills only.
    // The server can send its own intro in content, but we keep it minimal here too.
    return (
      <div style={{ marginTop: 10 }}>
        <SourcesList
          sources={sources.map((s) => ({
            docId: s.docId || s.documentId || s.id,
            title: s.title || s.filename || s.name,
            filename: s.filename || s.title || s.name,
            mimeType: s.mimeType,
            url: s.url, // if your backend gives open links
            page: s.page,
            slide: s.slide,
            sheet: s.sheet,
            locationKey: s.locationKey,
          }))}
          variant={isNav ? "pills" : "inline"}
          navType={isNav ? navType : null}
          introText={isNav ? (navType === "open" ? "Here it is:" : navType === "where" ? "Here’s the location:" : "These look relevant:") : ""}
          onSelect={(src) => {
            // Prefer URL if present (open in new tab) else open preview modal
            if (src?.url) window.open(src.url, "_blank", "noopener,noreferrer");
            else openPreviewFromSource(src);
          }}
        />
      </div>
    );
  };

  const renderUserAttachments = (m) => {
    const a = Array.isArray(m.attachments) ? m.attachments : [];
    if (!a.length) return null;

    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8, justifyContent: "flex-end" }}>
        {a.map((att) => {
          const name = att.filename || "Attachment";
          return (
            <InlineNavPill
              key={`${att.id}-${name}`}
              label={name}
              mimeType={att.mimeType}
              ext={extFromFilename(name, att.mimeType)}
              onClick={() =>
                setPreviewDocument({
                  id: att.id,
                  filename: name,
                  mimeType: att.mimeType || "application/octet-stream",
                })
              }
            />
          );
        })}
      </div>
    );
  };

  // -------------------------
  // UI
  // -------------------------
  return (
    <div
      data-chat-container="true"
      style={{
        flex: isMobile ? "1 1 auto" : "1 1 0",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "#FFFFFF",
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Messages */}
      <div
        ref={containerRef}
        className="messages-container scrollable-content"
        onScroll={onScroll}
        style={{
          flex: "1 1 0",
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: isMobile ? 16 : 20,
          paddingBottom: isMobile ? "calc(env(safe-area-inset-bottom))" : 20,
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto", width: "100%" }}>
          {messages.length === 0 ? (
            <div style={{ paddingTop: 64 }}>
              {/* Keep this minimal here; your StreamingWelcomeMessage can replace this */}
              <div style={{ fontSize: 18, color: "#171717", fontWeight: 600, marginBottom: 10 }}>
                New chat
              </div>
              <div style={{ color: "#6B7280", fontSize: 14 }}>
                Drop files here or ask a question.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {messages.map((m) => {
                const isAssistant = m.role === "assistant";
                const isError = m.status === "error";
                const isStreamingMsg = m.status === "streaming";

                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: isAssistant ? "flex-start" : "flex-end",
                      width: "100%",
                    }}
                  >
                    {isAssistant ? (
                      <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 900 }}>
                        {/* Avatar placeholder: your app uses sphere; keep minimal */}
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 999,
                            background: "#111111",
                            flex: "0 0 auto",
                            marginTop: 2,
                          }}
                          aria-hidden="true"
                        />
                        <div style={{ flex: 1, maxWidth: 720 }}>
                          {/* Body */}
                          {isStreamingMsg && !m.content ? (
                            <MessageLoadingSkeleton />
                          ) : (
                            <div className="markdown-preview-container" style={{ color: "#1a1a1a", fontSize: 16, lineHeight: 1.6 }}>
                              <StreamingMarkdown
                                content={m.content || ""}
                                isStreaming={isStreamingMsg}
                                documents={attachedDocs}
                                onOpenPreview={(docId, docName, pageNumber) => {
                                  setPreviewDocument({
                                    id: docId,
                                    filename: docName,
                                    mimeType: "application/octet-stream",
                                    initialPage: pageNumber || 1,
                                  });
                                }}
                                onUpload={() => setShowUploadModal(true)}
                              />
                            </div>
                          )}

                          {/* Sources */}
                          {renderSources(m)}

                          {/* Actions (never in nav_pills, never while streaming) */}
                          {m.answerMode !== "nav_pills" && !m.navType && !isStreamingMsg && !isError ? (
                            <div style={{ marginTop: 10 }}>
                              <MessageActions
                                message={m}
                                onRegenerate={() => {
                                  // Minimal regenerate: re-send last user message (you can wire to your backend regen route)
                                  const lastUser = [...messages].reverse().find((x) => x.role === "user");
                                  if (lastUser?.content) setInput(lastUser.content);
                                  setTimeout(() => inputRef.current?.focus(), 10);
                                }}
                              />
                            </div>
                          ) : null}

                          {/* Error */}
                          {isError ? <FailedMessage compact /> : null}
                        </div>
                      </div>
                    ) : (
                      <div style={{ maxWidth: "70%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                        {renderUserAttachments(m)}
                        {m.content?.trim() ? (
                          <div
                            style={{
                              padding: "12px 16px",
                              borderRadius: 18,
                              background: "#111111",
                              color: "white",
                              fontSize: 16,
                              lineHeight: "24px",
                              userSelect: "text",
                            }}
                          >
                            {m.content}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Streaming indicator */}
              {isStreaming && !streamError ? (
                <TypingIndicator label={stageLabel} />
              ) : null}

              {/* Follow-ups */}
              {!isStreaming && lastAssistant?.status === "done" && Array.isArray(lastAssistant.followups) && lastAssistant.followups.length > 0 ? (
                <div style={{ marginTop: 6 }}>
                  <FollowUpChips
                    chips={lastAssistant.followups}
                    onSelect={(chip) => {
                      const q = typeof chip === "string" ? chip : chip?.query || chip?.label || "";
                      if (!q) return;
                      setInput(q);
                      setTimeout(() => inputRef.current?.focus(), 10);
                    }}
                  />
                </div>
              ) : null}

              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Jump to bottom */}
        {!atBottom ? (
          <button
            type="button"
            onClick={scrollToBottom}
            style={{
              position: "absolute",
              right: 20,
              bottom: 120,
              width: 42,
              height: 42,
              borderRadius: 999,
              background: "#fff",
              border: "1px solid #E5E7EB",
              boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
              cursor: "pointer",
            }}
            title="Jump to latest"
          >
            <span style={{ position: "relative" }}>
              ⬇️
              {unreadCount > 0 ? (
                <span
                  style={{
                    position: "absolute",
                    top: -10,
                    right: -12,
                    background: "#EF4444",
                    color: "white",
                    borderRadius: 999,
                    padding: "2px 6px",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </span>
          </button>
        ) : null}
      </div>

      {/* Input + attachments */}
      <div
        className="chat-input-area"
        style={{
          padding: isMobile ? "10px 14px" : "14px 20px 20px",
          background: "white",
          borderTop: isMobile ? "1px solid #E6E6EC" : "none",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          {/* Uploading previews (simple) */}
          {uploading.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {uploading.map((f) => (
                <div
                  key={f.name}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 999,
                    border: "1px solid #E6E6EC",
                    background: "#fff",
                  }}
                >
                  <FileIcons mimeType={f.type} ext={extFromFilename(f.name, f.type)} size={16} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{f.name}</span>
                  <span style={{ fontSize: 12, color: "#6B7280" }}>Uploading…</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Attached docs (already uploaded, pending next send) */}
          {attachedDocs.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {attachedDocs.map((d) => (
                <div key={d.id} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <InlineNavPill
                    label={d.filename || d.name}
                    mimeType={d.mimeType || d.type}
                    ext={extFromFilename(d.filename || d.name, d.mimeType || d.type)}
                    onClick={() =>
                      setPreviewDocument({
                        id: d.id,
                        filename: d.filename || d.name,
                        mimeType: d.mimeType || d.type,
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(d.id)}
                    aria-label="Remove attachment"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 10,
                      border: "1px solid #E6E6EC",
                      background: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: isMobile ? "8px 10px" : "10px 14px",
              borderRadius: isMobile ? 16 : 24,
              border: "2px solid #E6E6EC",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)",
              background: "white",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              placeholder={isMobile ? "Message…" : "Ask anything…"}
              onChange={(e) => setInput(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={1}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                resize: "none",
                fontSize: isMobile ? 14 : 16,
                lineHeight: "24px",
                height: "24px",
                maxHeight: isMobile ? "24px" : "200px",
                overflow: "hidden",
              }}
            />

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={onFilePick}
              style={{ display: "none" }}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp"
            />

            {/* Attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                border: "1px solid #E6E6EC",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              📎
            </button>

            {/* Send / Stop */}
            {isStreaming ? (
              <button
                type="button"
                onClick={() => stopStreaming(true)}
                aria-label="Stop generating"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: "none",
                  background: "#111111",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                ■
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() && attachedDocs.length === 0}
                aria-label="Send"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: "none",
                  background: input.trim() || attachedDocs.length ? "#111111" : "#E6E6EC",
                  color: "white",
                  cursor: input.trim() || attachedDocs.length ? "pointer" : "not-allowed",
                }}
              >
                ↑
              </button>
            )}
          </form>

          {/* Lightweight error line (no forbidden phrases) */}
          {streamError ? (
            <div style={{ marginTop: 10, color: "#B91C1C", fontSize: 13 }}>
              {streamError}
            </div>
          ) : null}
        </div>
      </div>

      {/* Preview modal */}
      <DocumentPreviewModal
        isOpen={!!previewDocument}
        document={previewDocument}
        initialPage={previewDocument?.initialPage || 1}
        attachOnClose={false}
        onClose={() => setPreviewDocument(null)}
      />

      {/* Upload modal (triggered by inline upload marker in markdown) */}
      <UniversalUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={() => setShowUploadModal(false)}
      />
    </div>
  );
}
