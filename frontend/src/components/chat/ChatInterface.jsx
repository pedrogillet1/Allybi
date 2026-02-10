// src/components/chat/ChatInterface.jsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useIsKeyboardVisible } from "../../hooks/useVisualViewportVars";
import { useAuth } from "../../context/AuthContext";
import { useAuthGate } from "../auth/ProtectedRoute";
import { buildRoute, AUTH_MODES } from "../../constants/routes";

import unifiedUploadService from "../../services/unifiedUploadService";
import { UPLOAD_CONFIG } from "../../config/upload.config";
import * as chatService from "../../services/chatService";
import * as integrationsService from "../../services/integrationsService";
import api from "../../services/api";
import cleanDocumentName from "../../utils/cleanDocumentName";
import { getApiBaseUrl } from "../../services/runtimeConfig";

import { FileTypeIcon } from "../attachments/pills/SourcePill";
import FolderPill from "../attachments/pills/FolderPill";
import DocumentPreviewModal from "../documents/DocumentPreviewModal";
import FolderPreviewModal from "../folders/FolderPreviewModal";
import EmailPreviewModal from "../connectors/EmailPreviewModal";
import UniversalUploadModal from "../upload/UniversalUploadModal";
import { DocumentScanner } from "../scanner";

import StreamingMarkdown from "./streaming/StreamingMarkdown";
import MessageActions from "./messages/MessageActions";
import useStageLabel from "./messages/useStageLabel";
import FollowUpChips from "./followups/FollowUpChips";
import StreamingWelcomeMessage from "./streaming/StreamingWelcomeMessage";
import ChatEmptyState from "./ChatEmptyState";
import kodaIcon from "../../assets/main-logo-b.svg";
import kodaIconBlack from "../../assets/koda-dark-knot.svg";
import thinkingVideo from "../../assets/koda-animation-final.mp4";
import ChromaKeyVideo from "./ChromaKeyVideo";
import EmailDraftActionCard from "./messages/EmailDraftActionCard";
// PaperclipIcon defined inline below
import { ReactComponent as ArrowUpIcon } from "../../assets/arrow-narrow-up.svg";
import { ReactComponent as AddIcon } from "../../assets/add.svg";
import gmailSvg from "../../assets/Gmail.svg";
import outlookSvg from "../../assets/outlook.svg";
import slackSvg from "../../assets/slack.svg";

import SourcesList from "../sources/SourcesList";
import InlineNavPill from "../attachments/pills/InlineNavPill";
import AttachmentsRenderer from "../attachments/AttachmentsRenderer";
import { useDocuments } from "../../context/DocumentsContext";

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

const API_BASE = getApiBaseUrl();
const ENDPOINT = process.env.REACT_APP_CHAT_STREAM_ENDPOINT || `${API_BASE}/api/chat/stream`;

// Streaming cadence (frontend smoothing)
const STREAM = {
  FLUSH_INTERVAL_MS: 33, // ~30fps
  TARGET_CHARS_PER_SEC: 75,
  MAX_CHARS_PER_FLUSH: 12,
  RAMP_MS: 350,
};

const CONNECTOR_OPTIONS = [
  { provider: "gmail", label: "Gmail", family: "email", icon: gmailSvg },
  { provider: "outlook", label: "Outlook", family: "email", icon: outlookSvg },
  { provider: "slack", label: "Slack", family: "messages", icon: slackSvg },
];

// Session cache keys
const cacheKeyFor = (conversationId) => `koda_chat_messages_${conversationId}`;
const cacheTsKeyFor = (conversationId) => `${cacheKeyFor(conversationId)}_timestamp`;
const DRAFT_KEY = (conversationId) => `koda_draft_${conversationId || "new"}`;

// localStorage persistent cache keys
const lsCacheKeyFor = (conversationId) => `koda_chat_persist_${conversationId}`;
const LS_CACHE_INDEX_KEY = "koda_chat_persist_index"; // JSON array of conv IDs, most-recent last
const LS_CACHE_MAX = 10;

/** Write messages to localStorage and keep only the last N conversations cached. */
function lsCacheWrite(conversationId, messages) {
  try {
    localStorage.setItem(lsCacheKeyFor(conversationId), JSON.stringify(messages));
    // Update LRU index
    let index = [];
    try { index = JSON.parse(localStorage.getItem(LS_CACHE_INDEX_KEY) || "[]"); } catch {}
    index = index.filter((id) => id !== conversationId);
    index.push(conversationId);
    // Evict oldest entries beyond cap
    while (index.length > LS_CACHE_MAX) {
      const evicted = index.shift();
      localStorage.removeItem(lsCacheKeyFor(evicted));
    }
    localStorage.setItem(LS_CACHE_INDEX_KEY, JSON.stringify(index));
  } catch {}
}

/** Read messages from localStorage cache. Returns parsed array or null. */
function lsCacheRead(conversationId) {
  try {
    const raw = localStorage.getItem(lsCacheKeyFor(conversationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch { return null; }
}

function uid(prefix = "m") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function normalizeWhitespace(s) {
  if (!s) return "";
  let text = s.replace(/\r\n|\r/g, "\n");

  // Process line by line to preserve table formatting
  const lines = text.split("\n");
  const normalized = lines.map(line => {
    const trimmed = line.trim();
    // Preserve table rows (start and end with |) exactly as-is
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      return line;
    }
    // Preserve table separator rows (start with | and contain only |, -, :, spaces)
    if (trimmed.startsWith("|") && /^[\s|:\-]+$/.test(trimmed)) {
      return line;
    }
    // For non-table lines, collapse multiple spaces
    return line.replace(/[ \t]+/g, " ");
  });

  // Collapse excessive blank lines
  return normalized.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripSourcesLabels(text) {
  if (!text) return "";
  return text
    // Remove "Sources:" / "Fontes:" / "Fuentes:" labels
    .replace(/\b(Sources|Fontes|Fuentes)\s*:\s*\n?/gi, "")
    // Remove em-dash attribution lines containing file extensions (handles comma-separated filenames)
    .replace(/\n*\s*[—\u2014\u2013]+\s+[^\n]*\.(pdf|docx?|xlsx?|pptx?|csv|txt|md)\b[^\n]*/gi, "")
    // Remove standalone backtick-wrapped filenames (`filename.ext` on their own or in lists)
    .replace(/(?<!\[)`[\w_.,\-() ]+\.(pdf|docx?|xlsx?|pptx?|csv|txt|md)`(?!\])/gi, "")
    .trim();
}

/** Clean source filename for display */
const cleanSourceFilename = cleanDocumentName;

function isConnectorEmailArtifactName(name) {
  const n = String(name || "").trim();
  if (!n) return false;
  const lower = n.toLowerCase();
  if (!(lower.startsWith("outlook ") || lower.startsWith("gmail "))) return false;
  if (!lower.endsWith(".txt")) return false;
  // Connector message IDs are long; avoid hiding legitimate short user filenames.
  if (n.length < 50) return false;
  return true;
}


/** Extract first intro sentence from text for nav_pills mode */
function extractIntroSentence(text) {
  if (!text) return "";
  // Strip markdown list lines and bold markers
  let cleaned = text.replace(/^\s*[-*]\s+.+$/gm, '').replace(/^\s*\d+\.\s+.+$/gm, '').trim();
  cleaned = cleaned.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
  if (!cleaned) return "";
  // Take first sentence (up to first period, ?, !, or colon followed by whitespace)
  const match = cleaned.match(/^[^]*?[.!?:](?:\s|$)/);
  return match ? match[0].trim() : cleaned.slice(0, 200).trim();
}

/** Fix LaTeX-style currency artifacts: $(383,893.23)$ → ($383,893.23) */
function fixCurrencyArtifacts(text) {
  if (!text) return "";
  let t = text;
  // $(383,893.23)$ → ($383,893.23)
  t = t.replace(/\$\s*\(([\d,]+(?:\.\d{1,2})?)\)\s*\$/g, "($$1)");
  // $24,972,043.79$ → $24,972,043.79 (strip trailing $)
  t = t.replace(/\$(\d[\d,]*(?:\.\d{1,2})?)\$/g, "$$1");
  return t;
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

function UploadSpinner({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={{ animation: "koda-spin 0.8s linear infinite", flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="6.5" stroke="#E5E7EB" strokeWidth="2" />
      <path
        d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5"
        stroke="#1F2937"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ChatInterface({
  currentConversation,
  onConversationUpdate,
  onConversationCreated,
  conversationCreateTitle,
  variant = "default",
  pinnedDocuments = [],
  viewerSelection = null,
  onClearViewerSelection,
  focusNonce = 0,
  apiRef,
  onAssistantFinal,
}) {
  const isMobile = useIsMobile();
  const isKeyboardVisible = useIsKeyboardVisible();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { documents, folders, fetchDocuments, fetchFolders } = useDocuments();
  const { user, isAuthenticated } = useAuth();
  const { triggerAuthGate, isUnauthenticated } = useAuthGate();

  const docTotalByFolderId = useMemo(() => {
    // Total documents per folder, including all descendant subfolders.
    const direct = new Map();
    for (const d of documents || []) {
      if (!d?.id) continue;
      if (d?.status === "deleted") continue;
      const fid = d?.folderId ?? null;
      direct.set(fid, (direct.get(fid) || 0) + 1);
    }

    const children = new Map();
    for (const f of folders || []) {
      if (!f?.id) continue;
      const pid = f?.parentFolderId ?? null;
      const arr = children.get(pid) || [];
      arr.push(f.id);
      children.set(pid, arr);
    }

    const memo = new Map();
    const visiting = new Set();
    const totalFor = (folderId) => {
      if (memo.has(folderId)) return memo.get(folderId);
      if (visiting.has(folderId)) return direct.get(folderId) || 0; // cycle guard
      visiting.add(folderId);
      let total = direct.get(folderId) || 0;
      const kids = children.get(folderId) || [];
      for (const k of kids) total += totalFor(k);
      visiting.delete(folderId);
      memo.set(folderId, total);
      return total;
    };

    // Populate totals for known folders (and root).
    for (const f of folders || []) {
      if (!f?.id) continue;
      totalFor(f.id);
    }
    totalFor(null);
    return memo;
  }, [documents, folders]);

  const capitalizeFirst = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
  const userName = capitalizeFirst(user?.firstName) || 'there';

  const conversationId = currentConversation?.id || "new";
  const isEphemeral = conversationId === "new" || currentConversation?.isEphemeral;
  const isViewerVariant = variant === "viewer";
  const hasViewerSelection = isViewerVariant && viewerSelection && viewerSelection.text;

  const ViewerSelectionPill = !hasViewerSelection ? null : (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid #E6E6EC",
        background: "rgba(255,255,255,0.92)",
        boxShadow: "0 1px 4px rgba(17,24,39,0.06)",
        maxWidth: "100%",
      }}
      title={String(viewerSelection?.text || "")}
    >
      <div
        style={{
          minWidth: 0,
          fontFamily: "Plus Jakarta Sans, sans-serif",
          fontSize: 12,
          fontWeight: 850,
          color: "#111827",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        Selection locked: {String(viewerSelection?.text || "").trim()}
      </div>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          try { onClearViewerSelection?.(); } catch {}
        }}
        style={{
          height: 26,
          padding: "0 10px",
          borderRadius: 999,
          border: "1px solid #E6E6EC",
          background: "white",
          cursor: "pointer",
          fontFamily: "Plus Jakarta Sans, sans-serif",
          fontSize: 12,
          fontWeight: 900,
          color: "#111827",
          flexShrink: 0,
        }}
        title="Clear selection (Esc)"
      >
        Clear
      </button>
    </div>
  );

  // Messages are kept in a canonical shape:
  // { id, role, content, createdAt, status, answerMode, navType, sources, followups, attachments, error }
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState(() => localStorage.getItem(DRAFT_KEY(conversationId)) || "");
  // UX: long user prompts should not dominate the viewport.
  // Store per-message expansion state so "Show more" is sticky while scrolling.
  const [expandedUserMessages, setExpandedUserMessages] = useState({});

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState(null);

  // Stage indicator (optional UI)
  const [stage, setStage] = useState({ stage: "thinking", message: "" });

  // Viewer: allow the document header "Ask Allybi" button to force-focus the input.
  useEffect(() => {
    if (!isViewerVariant) return;
    if (!focusNonce) return;
    setTimeout(() => inputRef.current?.focus(), 10);
  }, [focusNonce, isViewerVariant]);
  // Resolve the effective answer language: answerLanguage setting, or fall back to UI language
  const answerLang = useMemo(() => {
    const stored = localStorage.getItem('answerLanguage');
    if (stored && stored !== 'match') return stored.slice(0, 2);
    return (i18n.language || 'en').slice(0, 2);
  }, [i18n.language]);

  // Language of the current streaming message (detected from user text when answerLanguage='match')
  const [streamingLang, setStreamingLang] = useState(null);
  const stageLabel = useStageLabel(stage.stage, isStreaming, streamingLang || answerLang);

  // Detect language from user message text (for 'match' mode)
  const detectMessageLang = useCallback((text) => {
    const q = (text || '').toLowerCase();
    if (/\b(quais?|meus?|minhas?|documentos?|arquivos?|pastas?|tenho|está|como|onde|qual|por que|porque|obrigad|olá|oi|tudo|pode|fazer|quero|preciso|ajuda|sobre)\b/.test(q)) return 'pt';
    if (/\b(cuáles?|mis|archivos?|carpetas?|tengo|está|cómo|dónde|cuál|por qué|gracias|hola|todo|puede|hacer|quiero|necesito|ayuda|sobre)\b/.test(q)) return 'es';
    return 'en';
  }, []);

  // Attachments (uploaded immediately, then attached to next send)
  // Note: `pinnedDocuments` are "sticky" attachments (e.g. DocumentViewer edit mode).
  const pinnedDocs = useMemo(() => {
    const arr = Array.isArray(pinnedDocuments) ? pinnedDocuments : [];
    return arr
      .map((d) => ({
        id: d?.id || d?.documentId,
        filename: d?.filename || d?.name || d?.title,
        mimeType: d?.mimeType || d?.type,
      }))
      .filter((d) => typeof d.id === "string" && d.id.trim().length > 0)
      .map((d) => ({ ...d, id: d.id.trim() }));
  }, [pinnedDocuments]);

  const pinnedIds = useMemo(() => new Set(pinnedDocs.map((d) => d.id)), [pinnedDocs]);

  const [attachedDocs, setAttachedDocs] = useState([]); // {id, filename/name, mimeType/type, size}
  const prevPinnedIdsRef = useRef(new Set());
  const [uploading, setUploading] = useState([]); // local File objects being uploaded

  // V3 floating card focus state
  const [isFocused, setIsFocused] = useState(false);
  const [connectorStatus, setConnectorStatus] = useState({});
  const [connectorStatusLoading, setConnectorStatusLoading] = useState(false);
  const [activatingConnector, setActivatingConnector] = useState(null);
  const [connectorError, setConnectorError] = useState(null);
  const [connectorMenuOpen, setConnectorMenuOpen] = useState(false);
  // Active connector = the one currently "armed" for read/send actions.
  // This is what the pill above the input represents.
  const [activeConnectors, setActiveConnectors] = useState([]); // ['gmail','outlook','slack']

  // Preview modal state
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewEmail, setPreviewEmail] = useState(null);
  const [previewFolder, setPreviewFolder] = useState(null);
  const [previewFolderContents, setPreviewFolderContents] = useState({ files: [], subfolders: [] });
  const [allFilesListing, setAllFilesListing] = useState(null); // { items, breadcrumb } for "Show all" modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Smart scroll state
  const [atBottom, setAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const containerRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const connectorMenuRef = useRef(null);
  const connectorMenuBtnRef = useRef(null);

  const autosizeTextarea = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    if (String(el.tagName || "").toLowerCase() !== "textarea") return;
    try {
      const max = 200;
      // Reset then grow to content (ChatGPT-like).
      el.style.height = "0px";
      const next = Math.min(el.scrollHeight || 0, max);
      el.style.height = `${Math.max(24, next)}px`;
      el.style.overflowY = (el.scrollHeight || 0) > max ? "auto" : "hidden";
    } catch {}
  }, []);

  useLayoutEffect(() => {
    autosizeTextarea();
  }, [input, autosizeTextarea]);

  const connectedBadges = useMemo(() => {
    return {
      gmail: !!connectorStatus?.gmail?.connected && !connectorStatus?.gmail?.expired,
      outlook: !!connectorStatus?.outlook?.connected && !connectorStatus?.outlook?.expired,
      slack: !!connectorStatus?.slack?.connected && !connectorStatus?.slack?.expired,
    };
  }, [connectorStatus]);

  // Abort streaming
  const abortRef = useRef(null);
  const oauthPollRef = useRef(null);
  const oauthTimeoutRef = useRef(null);
  // Best-effort debounce so we don't spam the backend if the user toggles connectors repeatedly.
  const lastConnectorSyncAtRef = useRef({});

  // Streaming buffer and flush loop
  const activeAssistantIdRef = useRef(null);
  const streamBufRef = useRef("");
  const streamStartRef = useRef(0);
  const streamLastFlushRef = useRef(0);
  const rafRef = useRef(null);

  // Prevent unnecessary reload clearing (hot reload / same id)
  const prevConversationIdRef = useRef(null);
  const prevWasEphemeralRef = useRef(false);

  // Track "user intent": whether they are currently near the bottom.
  // We use a ref so async background refreshes don't rely on stale state.
  const atBottomRef = useRef(true);
  // Once the user scrolls up, we lock auto-scroll and prevent async refreshes
  // from snapping them back to bottom until they return near bottom.
  const scrollLockRef = useRef(false);

  // True while we're waiting for the server to return messages for a new conversation
  const [loadingChat, setLoadingChat] = useState(false);

  // -------------------------
  // Load conversation messages (cache first, instant switch)
  // -------------------------
  useEffect(() => {
    // Viewer chat is session-only: do not load persisted history, ever.
    if (isViewerVariant) return;

    const curId = conversationId;
    const prevId = prevConversationIdRef.current;
    const changed = curId !== prevId;

    if (!changed) return;

    // Transitioning from ephemeral -> real conversation ID means we just created
    // the conversation mid-send. The messages are already in local state from
    // active streaming — skip the server fetch to avoid overwriting them.
    if (prevWasEphemeralRef.current && !isEphemeral) {
      prevConversationIdRef.current = curId;
      prevWasEphemeralRef.current = false;
      return;
    }

    // Reset state if ephemeral (new chat clicked)
    if (isEphemeral) {
      // Always clear messages — user clicked "New Chat"
      setMessages([]);
      setIsStreaming(false);
      setStreamError(null);
      setStage({ stage: "thinking", message: "" });
      setAttachedDocs([]);
      setUploading([]);
      setPreviewDocument(null);
      setPreviewEmail(null);
      setPreviewFolder(null);
      setPreviewFolderContents({ files: [], subfolders: [] });
      setConnectorMenuOpen(false);
      setConnectorError(null);
      setShowUploadModal(false);
      setShowScanner(false);
      activeAssistantIdRef.current = null;
      streamBufRef.current = "";
      prevConversationIdRef.current = curId;
      prevWasEphemeralRef.current = true;
      setLoadingChat(false);
      return;
    }

    prevWasEphemeralRef.current = false;

    // 1) Try cache — instant restore, no auth needed.
    //    sessionStorage first (freshest, intra-tab), then localStorage (survives browser close).
    let hadCache = false;
    try {
      const sessionCached = sessionStorage.getItem(cacheKeyFor(curId));
      if (sessionCached) {
        const parsed = JSON.parse(sessionCached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          hadCache = true;
        }
      }
    } catch {}
    if (!hadCache) {
      const lsCached = lsCacheRead(curId);
      if (lsCached) {
        setMessages(lsCached);
        hadCache = true;
      }
    }

    // If no cache, show a loading indicator instead of flashing the welcome screen.
    if (!hadCache) {
      setLoadingChat(true);
    }

    // 2) API refresh requires auth — gate only the network call, not the cache.
    if (!isAuthenticated) return;

    // Mark conversation as loaded only after auth is ready. On page refresh,
    // isAuthenticated starts false; if we set prevConversationIdRef before this
    // gate, the effect won't re-run when auth resolves (changed would be false).
    prevConversationIdRef.current = curId;

    // If we have a fresh cache, skip the refresh to prevent late-arriving overwrites
    // that reset scroll position.
    try {
      const ts = Number(sessionStorage.getItem(cacheTsKeyFor(curId)) || "0");
      const age = ts ? Date.now() - ts : Infinity;
      if (hadCache && age < 30_000) { // 30s freshness window
        setLoadingChat(false);
        return;
      }
    } catch {}

    let cancelled = false;
    (async () => {
      try {
        const el = containerRef.current;
        const wasNearBottom = isNearBottom(el);
        const prevScrollTop = el ? el.scrollTop : 0;
        const prevScrollHeight = el ? el.scrollHeight : 0;

        const convo = await chatService.getConversation(curId);
        if (cancelled) return;
        const loaded = Array.isArray(convo?.messages) ? convo.messages : [];

        // Build a map of in-memory attachments so we don't lose them during refresh
        const prevAttachmentsById = {};
        setMessages((prev) => {
          for (const pm of prev) {
            if (pm.attachments?.length) prevAttachmentsById[pm.id] = pm.attachments;
          }
          return prev; // no change — just reading
        });

        const normalized = loaded.map((m) => {
          const rawContent = m.content || "";
          const meta = (() => { try { return typeof m.metadata === 'string' ? JSON.parse(m.metadata) : (m.metadata || {}); } catch { return {}; } })();
          const existingSources = m.sources || meta.sources || m.ragSources || meta.ragSources || [];
          const isAssist = m.role === "assistant";
          // Attachments: from API metadata, from API field, from in-memory, or empty
          const apiAttachments = meta.attachments || m.attachments || [];
          const inMemoryAttachments = prevAttachmentsById[m.id] || [];
          const attachments = apiAttachments.length > 0 ? apiAttachments : inMemoryAttachments;
          return {
            id: m.id || uid("msg"),
            role: m.role,
            content: isAssist ? fixCurrencyArtifacts(stripSourcesLabels(rawContent)) : rawContent,
            createdAt: m.createdAt || new Date().toISOString(),
            status: "done",
            answerMode: m.answerMode || meta.answerMode || "general_answer",
            answerClass: m.answerClass || meta.answerClass || null,
            navType: m.navType || meta.navType || null,
            sources: existingSources,
            followups: m.followups || m.followUpSuggestions || [],
            attachments,
            listing: Array.isArray(meta.listing) ? meta.listing : undefined,
            breadcrumb: m.breadcrumb || meta.breadcrumb || [],
          };
        });

        // If user scrolled up (locked), do NOT overwrite visible messages.
        // Still update cache so when they come back down they can refresh naturally.
        if (!scrollLockRef.current) {
          setMessages(normalized);
        }
        sessionStorage.setItem(cacheKeyFor(curId), JSON.stringify(normalized));
        sessionStorage.setItem(cacheTsKeyFor(curId), Date.now().toString());
        lsCacheWrite(curId, normalized);

        // Preserve scroll position if the user is reading above.
        // If they were near bottom, we let the existing autoscroll behavior run.
        if (!wasNearBottom && containerRef.current) {
          // Force lock: a late refresh should never unlock auto-scroll.
          scrollLockRef.current = true;
          requestAnimationFrame(() => {
            const el2 = containerRef.current;
            if (!el2) return;
            const newScrollHeight = el2.scrollHeight;
            const delta = newScrollHeight - prevScrollHeight;
            el2.scrollTop = Math.max(0, prevScrollTop + delta);
          });
        }
      } catch (e) {
        if (e?.response?.status === 404) {
          onConversationUpdate?.(null);
        } else {
          // Keep cached messages in state — don't clear on transient failures
          console.warn('[Chat] Failed to refresh messages:', e?.message);
        }
      } finally {
        if (!cancelled) setLoadingChat(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, isAuthenticated, isEphemeral, onConversationUpdate, isViewerVariant]);

  // -------------------------
  // Draft persistence per conversation
  // -------------------------
  useEffect(() => {
    // Viewer chat is session-only: don't persist drafts across sessions.
    if (isViewerVariant) return;
    localStorage.setItem(DRAFT_KEY(conversationId), input);
  }, [input, conversationId]);

  useEffect(() => {
    const next = isViewerVariant ? "" : (localStorage.getItem(DRAFT_KEY(conversationId)) || "");
    setInput(next);

    // Viewer: when DocumentViewer seeds a selection-based draft, auto-focus and select it.
    // The selection range is stored in sessionStorage keyed by conversationId.
    if (variant === "viewer") {
      try {
        const raw = sessionStorage.getItem(`koda_draft_select_${conversationId}`);
        if (!raw) return;
        const obj = JSON.parse(raw);
        const start = typeof obj?.start === "number" ? obj.start : null;
        const end = typeof obj?.end === "number" ? obj.end : null;
        sessionStorage.removeItem(`koda_draft_select_${conversationId}`);
        if (start == null || end == null) return;

        setTimeout(() => {
          const el = inputRef.current;
          if (!el) return;
          el.focus?.();
          if (typeof el.setSelectionRange === "function") {
            const s = Math.max(0, Math.min(start, (el.value || "").length));
            const e = Math.max(s, Math.min(end, (el.value || "").length));
            el.setSelectionRange(s, e);
          }
        }, 30);
      } catch {}
    }
  }, [conversationId, isViewerVariant]);

  // Reset expanded states when switching conversations.
  useEffect(() => {
    setExpandedUserMessages({});
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
    const el = containerRef.current;
    const near = isNearBottom(el);
    const unlockNear = isNearBottom(el, 240);

    atBottomRef.current = near;
    scrollLockRef.current = !unlockNear;

    setAtBottom(near);
    if (unlockNear) setUnreadCount(0);
  }, []);

  useEffect(() => {
    // When new messages arrive: only autoscroll if already near bottom
    if (!containerRef.current) return;
    // Use ref to avoid stale state when async refreshes complete.
    if (!scrollLockRef.current && atBottomRef.current) {
      scrollToBottom();
    } else {
      setUnreadCount((n) => n + 1);
    }

    // Cache messages when updated — dual-layer: sessionStorage (fast) + localStorage (persistent)
    // Viewer chat is session-only: never persist/cache to avoid leaking into chat history.
    if (!isEphemeral && !isViewerVariant) {
      try {
        const serialized = JSON.stringify(messages);
        sessionStorage.setItem(cacheKeyFor(conversationId), serialized);
        sessionStorage.setItem(cacheTsKeyFor(conversationId), Date.now().toString());
      } catch {}
      lsCacheWrite(conversationId, messages);
    }
  }, [messages?.length ?? 0]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (soft) {
      setStage({ stage: "stopped", message: "Stopped generating" });
      setTimeout(() => setStage({ stage: "thinking", message: "" }), 1200);
    } else {
      setStage({ stage: "thinking", message: "" });
    }

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
  // Connectors: status + OAuth start
  // -------------------------
  const refreshConnectorStatus = useCallback(async ({ silent = false } = {}) => {
    if (!isAuthenticated) return;
    if (!silent) setConnectorStatusLoading(true);
    setConnectorError(null);
    try {
      const statusMap = await integrationsService.getStatus();
      setConnectorStatus(statusMap);
      return statusMap;
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.message || 'Failed to load integrations status.';
      setConnectorError(String(msg));
      return null;
    } finally {
      if (!silent) setConnectorStatusLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refreshConnectorStatus();
    return () => {
      if (oauthPollRef.current) {
        clearInterval(oauthPollRef.current);
        oauthPollRef.current = null;
      }
      if (oauthTimeoutRef.current) {
        clearTimeout(oauthTimeoutRef.current);
        oauthTimeoutRef.current = null;
      }
    };
  }, [refreshConnectorStatus]);

  const maybeAutoSyncConnector = useCallback(async (provider) => {
    const normalized = String(provider || "").toLowerCase();
    if (!normalized) return;

    const status = connectorStatus?.[normalized];
    const isConnected = Boolean(status?.connected) && !Boolean(status?.expired);
    if (!isConnected) return;

    const now = Date.now();
    const last = lastConnectorSyncAtRef.current?.[normalized] || 0;
    if (now - last < 30_000) return; // 30s cooldown per provider

    lastConnectorSyncAtRef.current = { ...(lastConnectorSyncAtRef.current || {}), [normalized]: now };
    try {
      await integrationsService.sync(normalized, { forceResync: false });
      await refreshConnectorStatus({ silent: true });
    } catch {
      // Non-fatal: backend also auto-syncs after OAuth callback.
    }
  }, [connectorStatus, refreshConnectorStatus]);

  useEffect(() => {
    const onMessage = (e) => {
      const data = e?.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "koda_oauth_done") return;
      // Optimistically mark provider as connected so the pill appears instantly
      if (data.ok && data.provider) {
        setConnectorStatus((prev) => ({
          ...prev,
          [data.provider]: { ...prev[data.provider], connected: true, expired: false },
        }));
        // Auto-activate the connector that was just connected.
        const p = String(data.provider || '').toLowerCase();
        if (p) {
          setActiveConnectors((prev) => (Array.isArray(prev) && prev.includes(p) ? prev : [...(prev || []), p]));
        }
        // Auto-sync immediately after connect so the user never has to type "sync gmail/outlook".
        // (Debounced by cooldown.)
        maybeAutoSyncConnector(String(data.provider));
      }
      refreshConnectorStatus();
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [maybeAutoSyncConnector, refreshConnectorStatus]);

  // If a connector becomes disconnected/expired, remove it from active list.
  useEffect(() => {
    if (!activeConnectors.length) return;
    const stillAlive = activeConnectors.filter((p) => {
      const s = connectorStatus?.[p];
      return s?.connected && !s?.expired;
    });
    if (stillAlive.length !== activeConnectors.length) {
      setActiveConnectors(stillAlive);
    }
  }, [activeConnectors, connectorStatus]);

  useEffect(() => {
    if (!connectorMenuOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") setConnectorMenuOpen(false);
    };

    const onMouseDown = (e) => {
      const menuEl = connectorMenuRef.current;
      const btnEl = connectorMenuBtnRef.current;
      const t = e.target;
      if (!menuEl || !btnEl) return;
      if (menuEl.contains(t) || btnEl.contains(t)) return;
      setConnectorMenuOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [connectorMenuOpen]);

  const startConnectorOAuth = useCallback(async (provider) => {
    if (!isAuthenticated) {
      triggerAuthGate('connector');
      return;
    }

    const normalized = String(provider || '').toLowerCase();
    setConnectorError(null);
    setActivatingConnector(normalized);

    try {
      const { authorizationUrl } = await integrationsService.startConnect(normalized);
      const popup = window.open(
        authorizationUrl,
        `koda_oauth_${normalized}`,
        'popup=yes,width=520,height=720',
      );

      if (!popup) {
        // Popup blocked. Fallback to full-page redirect.
        window.location.href = authorizationUrl;
        return;
      }

      // Poll status until the popup closes, then refresh.
      if (oauthPollRef.current) clearInterval(oauthPollRef.current);
      oauthPollRef.current = setInterval(async () => {
        let isClosed = false;
        try {
          // Some browsers enforce COOP/COEP and throw on cross-origin window access.
          isClosed = popup.closed;
        } catch {
          // Can't read `popup.closed` safely; rely on postMessage + timeout instead.
          clearInterval(oauthPollRef.current);
          oauthPollRef.current = null;
          return;
        }

        if (!isClosed) return;
        clearInterval(oauthPollRef.current);
        oauthPollRef.current = null;
        setActivatingConnector(null);
        await refreshConnectorStatus();
      }, 750);

      // Hard timeout to avoid stuck state if popup is left open.
      if (oauthTimeoutRef.current) clearTimeout(oauthTimeoutRef.current);
      oauthTimeoutRef.current = setTimeout(async () => {
        if (oauthPollRef.current) {
          clearInterval(oauthPollRef.current);
          oauthPollRef.current = null;
        }
        setActivatingConnector(null);
        await refreshConnectorStatus();
      }, 2 * 60 * 1000);
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.message || 'Connector activation failed.';
      setConnectorError(String(msg));
      setActivatingConnector(null);
    }
  }, [isAuthenticated, navigate, refreshConnectorStatus]);

  const disconnectConnector = useCallback(async (provider) => {
    // Optimistically mark as disconnected so pill vanishes instantly
    setConnectorStatus((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], connected: false, expired: false },
    }));
    try {
      await integrationsService.disconnect(provider);
      await refreshConnectorStatus({ silent: true });
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.message || 'Failed to disconnect.';
      setConnectorError(String(msg));
      // Revert on failure
      await refreshConnectorStatus({ silent: true });
    }
  }, [refreshConnectorStatus]);

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
    if (pinnedIds.has(docId)) return;
    setAttachedDocs((prev) => prev.filter((d) => d.id !== docId));
  }, [pinnedIds]);

  // Keep pinned docs always attached (non-removable).
  useEffect(() => {
    // DocumentViewer (viewer variant) is implicitly scoped to its active document.
    // We still send pinned docs to the backend, but we don't mix them into the
    // visible attachment UI state.
    if (isViewerVariant) return;
    const prevPinned = prevPinnedIdsRef.current || new Set();
    const nextPinnedIds = new Set(pinnedDocs.map((d) => d?.id).filter(Boolean));
    setAttachedDocs((prev) => {
      // If the parent passes a new `pinnedDocuments` array each render (same contents),
      // `pinnedDocs` changes identity and this effect re-runs. Avoid updating state
      // unless the attached docs list meaningfully changed to prevent render loops.
      const prevById = new Map();
      for (const d of prev) if (d?.id) prevById.set(d.id, d);

      const seen = new Set();
      const next = [];
      for (const d of pinnedDocs) {
        if (!d?.id || seen.has(d.id)) continue;
        seen.add(d.id);
        const existing = prevById.get(d.id);
        if (existing) {
          const prevName = existing.filename || existing.name;
          const prevType = existing.mimeType || existing.type;
          if (prevName !== d.filename || prevType !== d.mimeType) next.push({ ...existing, ...d });
          else next.push(existing);
        } else {
          next.push(d);
        }
      }
      for (const d of prev) {
        if (!d?.id || seen.has(d.id)) continue;
        // Drop any doc that was pinned previously but isn't pinned anymore (viewer doc switch).
        if (prevPinned.has(d.id) && !nextPinnedIds.has(d.id)) continue;
        seen.add(d.id);
        next.push(d);
      }

      const same =
        prev.length === next.length &&
        prev.every((a, i) => {
          const b = next[i];
          if (a?.id !== b?.id) return false;
          const aName = a?.filename || a?.name;
          const bName = b?.filename || b?.name;
          if (aName !== bName) return false;
          const aType = a?.mimeType || a?.type;
          const bType = b?.mimeType || b?.type;
          return aType === bType;
        });

      return same ? prev : next;
    });
    prevPinnedIdsRef.current = nextPinnedIds;
  }, [pinnedDocs]);

  // Handle scanned document completion (mobile scanner)
  const handleScanComplete = useCallback(async (pdfFile) => {
    if (!pdfFile) return;
    await uploadFiles([pdfFile]);
  }, [uploadFiles]);

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

    const title =
      conversationCreateTitle ||
      (isViewerVariant ? `__viewer__:${Date.now()}` : "New Chat");
    const created = await chatService.createConversation(title);
    onConversationCreated?.(created);
    return created.id;
  }, [conversationId, isEphemeral, onConversationCreated, conversationCreateTitle, isViewerVariant]);

  // ---- Shared streaming logic (used by sendMessage + regenerate) ----
  const streamNewResponse = useCallback(async (messageText, docAttachments = [], { isRegenerate = false } = {}) => {
    setStreamError(null);
    setIsStreaming(true);
    setStage({ stage: "thinking", message: "" });

    const assistantId = beginAssistantPlaceholder();

    let realConversationId = conversationId;
    try {
      realConversationId = await createConversationIfNeeded();
    } catch {
      setStreamError("Couldn't start a new chat.");
      setIsStreaming(false);
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, status: "error" } : m)));
      return;
    }

    const token = localStorage.getItem("accessToken");
    const controller = new AbortController();
    abortRef.current = controller;

    // Detect language from message text when answerLanguage is 'match' (or unset)
    const storedLangPref = localStorage.getItem('answerLanguage');
    const effectiveLang = (!storedLangPref || storedLangPref === 'match')
      ? detectMessageLang(messageText)
      : answerLang;
    setStreamingLang(effectiveLang);

    const meta =
      isViewerVariant
        ? {
            viewerMode: true,
            ...(viewerSelection && viewerSelection.text
              ? {
                  // Back-compat fields (paragraphId/text) + v2 fields (domain/ranges/hash/etc.).
                  viewerSelection: {
                    paragraphId: String(viewerSelection.paragraphId || ""),
                    text: String(viewerSelection.text || ""),
                    ...(viewerSelection.domain ? { domain: String(viewerSelection.domain) } : {}),
                    ...(Array.isArray(viewerSelection.ranges) ? { ranges: viewerSelection.ranges } : {}),
                    ...(viewerSelection.frozenAtIso ? { frozenAtIso: String(viewerSelection.frozenAtIso) } : {}),
                    ...(viewerSelection.preview ? { preview: String(viewerSelection.preview) } : {}),
                  },
                }
              : {}),
          }
        : undefined;

    const body = {
      conversationId: realConversationId,
      message: messageText,
      attachedDocuments: docAttachments,
      language: ["pt", "es"].includes(effectiveLang) ? effectiveLang : "en",
      client: { wantsStreaming: true },
      ...(isRegenerate ? { isRegenerate: true } : {}),
      ...(meta ? { meta } : {}),
      connectorContext: {
        activeProvider: activeConnectors[0] || null,
        activeProviders: activeConnectors,
        gmail: { connected: !!connectorStatus?.gmail?.connected, canSend: !!connectorStatus?.gmail?.connected && !!connectorStatus?.gmail?.capabilities?.send },
        outlook: { connected: !!connectorStatus?.outlook?.connected, canSend: !!connectorStatus?.outlook?.connected && !!connectorStatus?.outlook?.capabilities?.send },
        slack: { connected: !!connectorStatus?.slack?.connected, canSend: false },
      },
    };

    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
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
                ? { ...m, answerMode: evt.answerMode || m.answerMode, answerClass: evt.answerClass || m.answerClass, navType: evt.navType ?? m.navType, ...(evt.breadcrumb ? { breadcrumb: evt.breadcrumb } : {}) }
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

        if (type === "action") {
          // File action executed — refresh documents/folders in sidebar
          if (typeof fetchDocuments === "function") fetchDocuments();
          if (typeof fetchFolders === "function") fetchFolders();
        }

        if (type === "listing") {
          const items = Array.isArray(evt.items) ? evt.items : [];
          const bc = Array.isArray(evt.breadcrumb) ? evt.breadcrumb : [];
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, listing: items, ...(bc.length ? { breadcrumb: bc } : {}) } : m)));
        }

        if (type === "final" || type === "done") {
          const msg = evt.message || evt.payload || evt;

          const finalMode = msg.answerMode || evt.answerMode || "general_answer";
          const finalAnswerClass = msg.answerClass || evt.answerClass || null;
          const finalNavType = msg.navType || evt.navType || null;

          // Promote the placeholder id to the real DB id so that conversation
          // reloads can match in-memory attachments by id (prevAttachmentsById).
          const realMessageId = msg.messageId || evt.messageId;

          // Important: treat an empty array as an explicit "no sources" signal.
          // Otherwise we can accidentally keep stale sources from a previous turn,
          // which shows the wrong source pill (especially for action/edit turns).
          const finalSources = Array.isArray(msg.sources)
            ? msg.sources
            : (Array.isArray(evt.sources) ? evt.sources : null);
          const finalFollowups = Array.isArray(msg.followups) ? msg.followups : (Array.isArray(evt.followups) ? evt.followups : []);

          const buffered = streamBufRef.current;
          streamBufRef.current = "";

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const merged = normalizeWhitespace((m.content || "") + buffered);
              const cleaned = fixCurrencyArtifacts(stripSourcesLabels(merged));
              const finalListing = Array.isArray(msg.listing) ? msg.listing : (Array.isArray(evt.listing) ? evt.listing : null);
              const finalBreadcrumb = Array.isArray(msg.breadcrumb) ? msg.breadcrumb : (Array.isArray(evt.breadcrumb) ? evt.breadcrumb : null);
              const finalAttachments = Array.isArray(msg.attachments)
                ? msg.attachments
                : (Array.isArray(evt.attachments) ? evt.attachments : null);
              return {
                ...m,
                ...(realMessageId ? { id: realMessageId } : {}),
                content: cleaned,
                status: "done",
                answerMode: finalMode,
                answerClass: finalAnswerClass,
                navType: finalNavType,
                sources: finalSources != null ? finalSources : (m.sources || []),
                followups: finalFollowups,
                ...(finalAttachments ? { attachments: finalAttachments } : {}),
                ...(finalListing && !m.listing?.length ? { listing: finalListing } : {}),
                ...(finalBreadcrumb && !m.breadcrumb?.length ? { breadcrumb: finalBreadcrumb } : {}),
              };
            })
          );

          setIsStreaming(false);
          abortRef.current = null;

          try {
            if (typeof onAssistantFinal === "function") {
              const finalAttachments = Array.isArray(msg.attachments)
                ? msg.attachments
                : (Array.isArray(evt.attachments) ? evt.attachments : []);
              onAssistantFinal({
                message: msg,
                event: evt,
                attachments: finalAttachments,
                conversationId: evt.conversationId || msg.conversationId || conversationId,
              });
            }
          } catch {
            // Never let callbacks break chat streaming finalization.
          }

          // Update conversation title in sidebar if backend generated one
          const genTitle = evt.generatedTitle || msg.generatedTitle;
          if (genTitle && onConversationUpdate) {
            const cId = evt.conversationId || msg.conversationId || conversationId;
            onConversationUpdate({ id: cId, title: genTitle });
          }

          if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }

          break;
        }

        if (type === "error") {
          setStreamError(String(evt.message || "Request failed"));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, status: "error", error: String(evt.message || "Request failed") }
                : m
            )
          );
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
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, status: (m.content || "").trim() ? "done" : "done" }
              : m
          )
        );
      } else {
        setStreamError("Stream interrupted.");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, status: "error", error: "Stream interrupted." }
              : m
          )
        );
      }
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [
    beginAssistantPlaceholder,
    conversationId,
    createConversationIfNeeded,
    detectMessageLang,
    answerLang,
    connectorStatus,
    activeConnectors,
    fetchDocuments,
    fetchFolders,
    onConversationUpdate,
    onAssistantFinal,
  ]);

  const sendMessage = useCallback(async (overrideText) => {
    if (isStreaming) return;

    // Guest users: open auth modal when trying to send
    if (!isAuthenticated) {
      triggerAuthGate('send_message');
      return;
    }

    const trimmed = (typeof overrideText === 'string' ? overrideText : (input || "")).trim();
    const effectiveAttachedDocs = isViewerVariant ? pinnedDocs : attachedDocs;
    const hasAttachments = effectiveAttachedDocs.length > 0;

    if (!trimmed && !hasAttachments) return;

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
      // Viewer chat should be clean: no visible attachment pills on the message.
      // The backend still receives pinned docs via docAttachments below.
      attachments: isViewerVariant ? [] : effectiveAttachedDocs.map((d) => ({
        type: "attached_file",
        id: d.id,
        filename: d.filename || d.name,
        mimeType: d.mimeType || d.type,
      })),
      attachedFiles: isViewerVariant ? [] : effectiveAttachedDocs.map((d) => ({
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

    const docAttachments = effectiveAttachedDocs.map((d) => ({
      id: d.id,
      name: d.filename || d.name,
      type: d.mimeType || d.type,
    }));

    if (!isViewerVariant) {
      // Clear non-pinned attachments, keep pinned documents sticky.
      setAttachedDocs((prev) => prev.filter((d) => pinnedIds.has(d.id)));
    }

    await streamNewResponse(trimmed, docAttachments);
  }, [
    attachedDocs,
    conversationId,
    input,
    isAuthenticated,
    isStreaming,
    navigate,
    streamNewResponse,
    pinnedIds,
    pinnedDocs,
    isViewerVariant,
  ]);

  // Optional imperative API (used by PPTX Studio quick actions).
  useEffect(() => {
    if (!apiRef || typeof apiRef !== 'object') return undefined;
    apiRef.current = {
      focus: () => inputRef.current?.focus(),
      setDraft: (text) => setInput(String(text || '')),
      send: (text) => sendMessage(String(text || '')),
    };
    return () => {
      try { apiRef.current = null; } catch {}
    };
  }, [apiRef, sendMessage]);

  // ---- Regenerate: replace last assistant answer with a fresh stream ----
  const regenerateLastAnswer = useCallback(async () => {
    if (isStreaming) return;

    // Find last assistant message
    let lastAssistantIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") { lastAssistantIdx = i; break; }
    }
    if (lastAssistantIdx < 0) return;

    // Find the user message that triggered it
    let userIdx = -1;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === "user") { userIdx = i; break; }
    }
    if (userIdx < 0) return;

    const userMessage = messages[userIdx];

    // Remove the old assistant answer
    setMessages((prev) => prev.filter((_, i) => i !== lastAssistantIdx));

    // Build attachments from the original user message
    const docAttachments = (userMessage.attachments || []).map((a) => ({
      id: a.id,
      name: a.filename || a.name,
      type: a.mimeType || a.type,
    }));

    await streamNewResponse(userMessage.content, docAttachments, { isRegenerate: true });
  }, [isStreaming, messages, streamNewResponse]);

  // -------------------------
  // Render helpers
  // -------------------------
  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  const openFolderPreview = useCallback(async (folderId) => {
    let folder = folders.find(f => f.id === folderId);

    // If not in local state, refresh folders and retry
    if (!folder) {
      try {
        await fetchFolders();
      } catch (_) { /* ignore */ }
      // Re-check after refresh (folders state may not be updated yet, so fetch directly)
      try {
        const res = await api.get(`/api/folders/${folderId}`);
        folder = res.data?.folder || res.data;
      } catch (_) {
        // Folder doesn't exist — nothing to show
        return;
      }
      if (!folder || !folder.id) return;
    }

    // Include documents from the folder AND all descendant subfolders so counts and the file table
    // match what the user expects from the Home/Documents screens.
    const collectFolderIds = (rootId) => {
      const ids = new Set([rootId]);
      const stack = [rootId];
      while (stack.length) {
        const cur = stack.pop();
        for (const f of folders) {
          if (f?.parentFolderId === cur && f?.id && !ids.has(f.id)) {
            ids.add(f.id);
            stack.push(f.id);
          }
        }
      }
      return ids;
    };
    const folderIds = collectFolderIds(folderId);
    const files = documents.filter(d => folderIds.has(d.folderId) && d.status !== 'deleted');
    const subs = folders.filter(f => f.parentFolderId === folderId);
    setPreviewFolder({ id: folder.id, name: folder.name, emoji: folder.emoji });
    setPreviewFolderContents({
      files: files.map(d => ({ id: d.id, filename: d.filename, mimeType: d.mimeType, fileSize: d.fileSize, createdAt: d.createdAt })),
      subfolders: subs.map(s => ({ id: s.id, name: s.name, emoji: s.emoji, fileCount: docTotalByFolderId.get(s.id) ?? 0 })),
    });
  }, [folders, documents, fetchFolders, docTotalByFolderId]);

  const openPreviewFromSource = useCallback((src) => {
    if (src?.type === 'folder' && src?.folderId) {
      openFolderPreview(src.folderId);
      return;
    }
    const filename = src?.title || src?.filename || "Document";
    let docId = src?.docId || src?.documentId || src?.id;

    // If no ID, try to find the document by filename match
    if (!docId && filename) {
      const normalize = (s) => (s || '').replace(/[_\s]+/g, '').toLowerCase();
      const cleanName = normalize(filename);
      const match = documents.find(d => {
        const dName = normalize(d.filename || d.name || '');
        const dOriginal = normalize(d.originalName || '');
        return dName === cleanName || dOriginal === cleanName ||
               dName.includes(cleanName) || cleanName.includes(dName) ||
               dOriginal.includes(cleanName) || cleanName.includes(dOriginal);
      });
      if (match) {
        docId = match.id;
      }
    }

    setPreviewDocument({
      id: docId,
      filename,
      mimeType: src?.mimeType || "application/octet-stream",
      fileSize: src?.fileSize,
      initialPage: src?.page || 1,
    });
  }, [openFolderPreview, documents]);

  const renderSources = (m) => {
    let sources = Array.isArray(m.sources) ? m.sources : [];
    // Hide connector-generated email artifacts like: "outlook <messageId>.txt".
    sources = sources.filter((s) => {
      const name = s?.filename || s?.title || s?.name || "";
      return !isConnectorEmailArtifactName(name);
    });
    if (!sources.length) return null;

    // Deduplicate by filename, keep the first (most relevant) occurrence
    const seen = new Set();
    const unique = [];
    for (const s of sources) {
      const key = cleanSourceFilename(s.filename || s.title || s.name || '').toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }

    // For action_receipt mode, show all action sources as pills
    // For other modes, show only the top 1 source
    const isActionReceipt = m.answerMode === 'action_receipt' || m.answerMode === 'action_confirmation';
    const displaySources = isActionReceipt ? unique : (unique.length > 0 ? [unique[0]] : []);
    if (!displaySources.length) return null;

    const isNav = m.answerMode === "nav_pills" || !!m.navType;
    const navType = m.navType || (m.answerMode === "nav_pills" ? "discover" : null);

    return (
      <SourcesList
        sources={displaySources.map((s) => ({
          type: s.type,
          folderId: s.folderId,
          docId: s.docId || s.documentId || s.id,
          title: cleanSourceFilename(s.title || s.filename || s.name || ""),
          filename: cleanSourceFilename(s.filename || s.title || s.name || ""),
          mimeType: s.mimeType,
          url: s.url,
          page: s.page,
          slide: s.slide,
          sheet: s.sheet,
          locationKey: s.locationKey,
        }))}
        variant={isNav ? "pills" : "inline"}
        navType={isNav ? navType : null}
        introText=""
        onSelect={(src) => {
          openPreviewFromSource(src);
        }}
      />
    );
  };

  // Render action confirmation buttons (for destructive actions like delete)
  const renderActionConfirmation = (m) => {
    const attachments = Array.isArray(m.attachments) ? m.attachments : [];
    const confirmation = attachments.find(a => a.type === 'action_confirmation');
    if (!confirmation) return null;

    // Find the original user message that triggered this confirmation
    const findUserMessage = () => {
      const idx = messages.findIndex(msg => msg.id === m.id);
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i].role === 'user') return messages[i];
      }
      return null;
    };

    const sendWithToken = async (tokenOverride) => {
      // Only allow sending when we're in confirmation mode.
      if (m.answerMode !== 'action_confirmation') return;

      const userMsg = findUserMessage();
      if (!userMsg) {
        console.error('Could not find original user message');
        return;
      }

      // Update the current message to show "processing..."
      setMessages(prev => prev.map(msg =>
        msg.id === m.id
          ? { ...msg, content: 'Processing...', answerMode: 'action_receipt', attachments: [confirmation] }
          : msg
      ));

      // Re-send the original message with confirmation token
      const token = localStorage.getItem("accessToken");
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify({
            conversationId,
            message: userMsg.content,
            confirmationToken: tokenOverride || confirmation.confirmationId,
            language: "en",
            client: { wantsStreaming: true },
            connectorContext: {
              activeProvider: activeConnectors[0] || null,
              activeProviders: activeConnectors,
              gmail: { connected: !!connectorStatus?.gmail?.connected, canSend: !!connectorStatus?.gmail?.connected && !!connectorStatus?.gmail?.capabilities?.send },
              outlook: { connected: !!connectorStatus?.outlook?.connected, canSend: !!connectorStatus?.outlook?.connected && !!connectorStatus?.outlook?.capabilities?.send },
              slack: { connected: !!connectorStatus?.slack?.connected, canSend: false },
            },
          }),
        });

        if (!response.ok) throw new Error('Request failed');

        // Process SSE response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let finalContent = '';
        let finalSources = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'delta' && data.text) {
                finalContent += data.text;
              }
              if (data.type === 'final') {
                finalContent = data.content || finalContent;
                finalSources = data.sources || [];
              }
            } catch {}
          }
        }

        // Update the message with the result
        setMessages(prev => prev.map(msg =>
          msg.id === m.id
            ? { ...msg, content: finalContent || 'Done.', answerMode: 'action_receipt', sources: finalSources, attachments: [confirmation] }
            : msg
        ));

        // Trigger folder refresh if needed
        if (confirmation.operator?.includes('folder')) {
          window.dispatchEvent(new CustomEvent('koda:folders-changed'));
        }
      } catch (err) {
        console.error('Confirmation failed:', err);
        setMessages(prev => prev.map(msg =>
          msg.id === m.id
            ? { ...msg, content: 'Action failed. Please try again.', answerMode: 'action_receipt', attachments: [confirmation] }
            : msg
        ));
      }
    };

    // Special case: keep the email draft card visible after sending (read-only, no Send button).
    if (confirmation.operator === 'EMAIL_SEND') {
      return (
        <div style={{ marginTop: 10 }}>
          <EmailDraftActionCard
            message={m}
            confirmationToken={confirmation.confirmationId}
            documents={documents}
            folders={folders}
            isMobile={isMobile}
            readOnly={m.answerMode !== 'action_confirmation'}
            onConfirmToken={async (tok, _snapshot) => {
              await sendWithToken(tok);
            }}
            onCancel={() => {
              // In receipt mode, "Cancel" just closes the modal.
              if (m.answerMode !== 'action_confirmation') return;
              // In confirmation mode, cancel the action.
              setMessages(prev => prev.map(msg =>
                msg.id === m.id
                  ? { ...msg, content: 'Action cancelled.', answerMode: 'action_receipt', attachments: [confirmation] }
                  : msg
              ));
            }}
          />
        </div>
      );
    }

    // Only render generic confirm/cancel buttons for confirmation mode.
    if (m.answerMode !== 'action_confirmation') return null;

    const handleCancel = () => {
      // Update message to show cancelled
      setMessages(prev => prev.map(msg =>
        msg.id === m.id
          ? { ...msg, content: 'Action cancelled.', answerMode: 'action_receipt', attachments: [confirmation] }
          : msg
      ));
    };

    const isDanger = confirmation.confirmStyle === 'danger';

    return (
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button
          type="button"
          onClick={() => sendWithToken(null)}
          style={{
            padding: '4px 12px',
            borderRadius: 14,
            border: 'none',
            background: isDanger ? '#DC2626' : '#1A1A1A',
            color: 'white',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.target.style.opacity = '0.85'}
          onMouseLeave={e => e.target.style.opacity = '1'}
        >
          {confirmation.confirmLabel || 'Confirm'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          style={{
            padding: '4px 12px',
            borderRadius: 14,
            border: '1px solid #E5E5E5',
            background: 'white',
            color: '#6B7280',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.target.style.opacity = '0.85'}
          onMouseLeave={e => e.target.style.opacity = '1'}
        >
          {confirmation.cancelLabel || 'Cancel'}
        </button>
      </div>
    );
  };

  const renderAssistantAttachments = (m) => {
    if (isViewerVariant) return null;
    const a = Array.isArray(m.attachments) ? m.attachments : [];
    if (!a.length) return null;
    // Avoid double-render: action confirmations have a dedicated UI below.
    const filtered = a.filter((x) => x && x.type !== "action_confirmation");
    if (!filtered.length) return null;

    return (
      <div style={{ marginTop: 10 }}>
        <AttachmentsRenderer
          attachments={filtered}
          variant="inline"
          onFileClick={(att) => openPreviewFromSource(att)}
          onFolderClick={(att) => openPreviewFromSource(att)}
          onEmailClick={(email) => setPreviewEmail(email)}
          onConnectorClick={(connector) => {
            if (!connector?.provider) return;
            const isConnected = Boolean(connector.connected);
            if (isConnected) {
              setInput(`sync ${connector.provider}`);
            } else {
              setInput(`connect ${connector.provider}`);
            }
            setTimeout(() => inputRef.current?.focus(), 10);
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
              icon={<FileTypeIcon filename={name} mimeType={att.mimeType} />}
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

  const LISTING_MAX_VISIBLE = 10;

  const renderFileListing = (m) => {
    const items = Array.isArray(m.listing) ? m.listing : [];
    if (!items.length) return null;

    const breadcrumb = Array.isArray(m.breadcrumb) ? m.breadcrumb : [];
    const hasDepth = items.some(i => typeof i.depth === 'number' && i.depth > 0);
    const visibleItems = items.length > LISTING_MAX_VISIBLE ? items.slice(0, LISTING_MAX_VISIBLE) : items;
    const hasMore = items.length > LISTING_MAX_VISIBLE;

    const renderItem = (item, idx) => {
      const label = cleanDocumentName(item.title || 'Untitled');
      const indent = hasDepth ? (item.depth || 0) * 20 : 0;
      const computedFolderCount =
        item.kind === "folder" && item?.id
          ? (docTotalByFolderId.get(item.id) ?? null)
          : null;
      const displayedFolderCount =
        item.kind === "folder"
          ? (computedFolderCount ?? (typeof item.itemCount === "number" ? item.itemCount : null))
          : null;

      return (
        <div key={`listing-${item.kind}-${item.id || idx}`}
             style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: indent }}>
          {item.kind === 'folder' ? (
            <FolderPill
              folder={{ id: item.id, name: label }}
              onOpen={() => openFolderPreview?.(item.id)}
            />
          ) : (
            <InlineNavPill
              label={label}
              icon={<FileTypeIcon filename={label} mimeType={item.mimeType} />}
              onClick={() =>
                setPreviewDocument({
                  id: item.id,
                  filename: label,
                  mimeType: item.mimeType || 'application/octet-stream',
                })
              }
              title={label}
            />
          )}
          {item.kind === 'folder' && displayedFolderCount > 0 && (
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>({displayedFolderCount})</span>
          )}
        </div>
      );
    };

    return (
      <div style={{ marginTop: 12, width: '100%' }}>
        {/* Breadcrumb navigation */}
        {breadcrumb.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            {breadcrumb.map((crumb, idx) => (
              <React.Fragment key={crumb.id}>
                {idx > 0 && (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M7.5 4.5L13 10L7.5 15.5" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                <FolderPill
                  folder={{ id: crumb.id, name: crumb.name }}
                  onOpen={() => openFolderPreview?.(crumb.id)}
                />
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Render capped items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: hasDepth ? 4 : 6 }}>
          {visibleItems.map(renderItem)}
        </div>

        {/* Show all button */}
        {hasMore && (
          <button
            type="button"
            onClick={() => setAllFilesListing({ items, breadcrumb })}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              marginTop: 10, padding: '8px 16px',
              background: '#FAFAFA', border: '1px solid #E5E7EB', borderRadius: 20,
              cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: 14, fontWeight: 500, color: '#6B7280',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F3F4F6'; e.currentTarget.style.borderColor = '#D1D5DB'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#FAFAFA'; e.currentTarget.style.borderColor = '#E5E7EB'; }}
          >
            <span>Show all {items.length} files</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
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
      {/* Mobile: Floating upload button (paperclip) */}
      {isMobile && (
        <div
          data-mobile-upload-button="true"
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 1000,
          }}>
          <button
            type="button"
            onClick={() => {
              if (isUnauthenticated) {
                triggerAuthGate('upload');
                return;
              }
              setShowUploadModal(true);
            }}
            aria-label="Upload files"
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#fff',
              border: '1px solid #E6E6EC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#18181B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
        </div>
      )}

      {/* Mobile: Fixed bottom message bar - rendered via portal to document.body for proper z-index */}
      {isMobile && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            // When keyboard is open: position at bottom (keyboard pushes viewport)
            // When keyboard is closed: position above tab bar (70px)
            bottom: isKeyboardVisible ? 8 : 70,
            padding: '8px 16px',
            background: '#F5F5F5',
            zIndex: isKeyboardVisible ? 9999 : 19, // Above everything when keyboard open
            transition: 'bottom 0.15s ease-out',
          }}
        >
          {hasViewerSelection ? (
            <div style={{ marginBottom: 8 }}>
              {ViewerSelectionPill}
            </div>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 24,
              background: 'white',
              border: '1px solid #E6E6EC',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              placeholder="Ask Allybi..."
              onChange={(e) => setInput(e.target.value)}
              onPaste={onPaste}
              onFocus={() => {
                if (isUnauthenticated) {
                  triggerAuthGate('input');
                  inputRef.current?.blur();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 16,
                fontWeight: 500,
                color: '#18181B',
                background: 'transparent',
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

            {/* Send button */}
            {isStreaming ? (
              <button
                type="button"
                onClick={() => stopStreaming(true)}
                aria-label="Stop generating"
                style={{
                  width: 36,
                  height: 36,
                  padding: 0,
                  borderRadius: '50%',
                  border: 'none',
                  background: '#18181B',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span style={{ display: 'block', width: 10, height: 10, borderRadius: 2, backgroundColor: 'white' }} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() && attachedDocs.length === 0}
                aria-label="Send"
                style={{
                  width: 36,
                  height: 36,
                  padding: 0,
                  borderRadius: '50%',
                  border: 'none',
                  background: input.trim() || attachedDocs.length ? '#18181B' : '#E5E7EB',
                  color: input.trim() || attachedDocs.length ? 'white' : '#9CA3AF',
                  cursor: input.trim() || attachedDocs.length ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.2s, color 0.2s',
                }}
              >
                <ArrowUpIcon style={{ width: 18, height: 18 }} />
              </button>
            )}
          </form>
        </div>,
        document.body
      )}

      {/* Document Scanner (mobile only) */}
      <DocumentScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScanComplete={handleScanComplete}
      />

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
          // Mobile: Reserve space for fixed input bar + tab bar
          paddingBottom: isMobile
            ? "calc(var(--tabbar-h, 70px) + env(safe-area-inset-bottom) + 100px)"
            : 20,
          WebkitOverflowScrolling: "touch",
          scrollPaddingBottom: isMobile ? 120 : 20,
        }}
      >
        <div
          style={{
            // Allow cards (emails, previews, etc.) to breathe; keep centered.
            maxWidth: isViewerVariant ? '100%' : (isMobile ? '100%' : 1180),
            margin: isViewerVariant ? '0' : '0 auto',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {messages.length === 0 && (loadingChat || (!isEphemeral && !isAuthenticated)) ? (
            /* Switching to an existing chat or auth resolving — show subtle loader, not the welcome screen */
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', opacity: 0.5 }}>
              <img src={kodaIcon} alt="" style={{ width: 40, height: 40, animation: 'pulse 1.2s ease-in-out infinite' }} />
            </div>
          ) : messages.length === 0 ? (
            isViewerVariant ? (
              <div
                className="koda-welcome-enter"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-start',
                  alignItems: 'stretch',
                  height: '100%',
                  padding: isMobile ? 14 : 16,
                }}
              >
                <div
                  style={{
                    border: '1px solid #E5E7EB',
                    borderRadius: 16,
                    background: 'white',
                    padding: 14,
                    boxShadow: '0 10px 24px rgba(17, 24, 39, 0.06)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Watermark */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      inset: -20,
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-end',
                      pointerEvents: 'none',
                      opacity: 0.06,
                      transform: 'rotate(-8deg)',
                    }}
                  >
                    <img src={kodaIconBlack} alt="" style={{ width: 220, height: 220 }} />
                  </div>

                  <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 950, fontSize: 14, color: '#111827' }}>
                    Edit with Allybi
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      'Rewrite the intro to be more concise and professional.',
                      'Fix grammar and tighten the bullet points.',
                      'Change the tone to match an executive summary.',
                    ].map((ex) => (
                      <button
                        key={ex}
                        onClick={() => setInput(ex)}
                        style={{
                          textAlign: 'left',
                          border: '1px solid #EEF2F7',
                          background: '#F9FAFB',
                          borderRadius: 14,
                          padding: '10px 12px',
                          cursor: 'pointer',
                          fontFamily: 'Plus Jakarta Sans',
                          fontWeight: 800,
                          fontSize: 13,
                          color: '#111827',
                        }}
                        title="Use this prompt"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="koda-welcome-enter" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <div style={{ textAlign: 'center' }}>
                  {/* Logo */}
                  <div style={{ margin: '0 auto 32px', position: 'relative' }}>
                    <div style={{
                      position: 'absolute',
                      bottom: -6,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: isMobile ? 60 : 80,
                      height: isMobile ? 10 : 14,
                      borderRadius: '50%',
                      background: 'radial-gradient(ellipse, rgba(0,0,0,0.12) 0%, transparent 70%)',
                    }} />
                    <img src={kodaIconBlack} alt="" style={{
                        width: isMobile ? 80 : 120,
                        height: isMobile ? 80 : 120,
                        filter: 'drop-shadow(0 6px 12px rgba(0, 0, 0, 0.18)) drop-shadow(0 12px 32px rgba(0, 0, 0, 0.14)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.08))',
                      }} />
                  </div>
                  {/* Mobile: static headline; Desktop: streaming welcome message */}
                  {isMobile ? (
                    <h1 style={{
                      fontSize: 22,
                      fontWeight: 600,
                      color: '#18181B',
                      fontFamily: 'Plus Jakarta Sans, sans-serif',
                      lineHeight: 1.3,
                      margin: 0,
                    }}>
                      {t('chat.mobileHeadline')}
                    </h1>
                  ) : (
                    <StreamingWelcomeMessage
                      userName={userName}
                      isFirstChat={messages.length === 0 && !sessionStorage.getItem('hasShownGreeting')}
                    />
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="koda-chat-enter" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
                      <div className="assistant-message" data-testid="msg-assistant" style={{display: 'flex', gap: 14, alignItems: 'flex-start', maxWidth: '100%', width: '100%'}}>
                        {/* Allybi Avatar — crossfade between static icon and animated thinking */}
                        <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0, marginTop: -2 }}>
                          <img src={kodaIconBlack} alt="Allybi" style={{
                            width: 28,
                            height: 28,
                            opacity: isStreamingMsg && !m.content ? 0 : 1,
                            transition: 'opacity 0.3s ease',
                          }} />
                          {isStreamingMsg && !m.content && (
                            <ChromaKeyVideo
                              src={thinkingVideo}
                              width={28}
                              height={28}
                              mode="pingpong"
                              speed={2}
                              trimEndSeconds={0.18}
                              style={{ position: 'absolute', top: 0, left: 0 }}
                            />
                          )}
                        </div>
                        <div className="message-content" data-testid="assistant-message-content" style={{display: 'flex', flexDirection: 'column', gap: 0, alignItems: 'stretch', flex: 1, maxWidth: '100%'}}>
                          {/* Thinking state: show stage label */}
                          {isStreamingMsg && !m.content ? (
                            <div style={{
                              color: '#9CA3AF',
                              fontSize: 15,
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                              fontWeight: 600,
                              fontStyle: 'italic',
                              lineHeight: '32px',
                              height: 32,
                              display: 'flex',
                              alignItems: 'center',
                            }}>
                              {stage?.message || stageLabel || 'Thinking...'}
                            </div>
                          ) : (
                            /* Content + pills rendering */
                            (() => {
                              const isNavPills = m.answerMode === 'nav_pills';
                              const hasPills = m.listing && m.listing.length > 0;

                              if (isNavPills && hasPills) {
                                // NAV_PILLS MODE: intro sentence + pills as primary UI
                                const intro = isStreamingMsg
                                  ? (m.content || "")
                                  : extractIntroSentence(fixCurrencyArtifacts(stripSourcesLabels(m.content || "")));

                                return (
                                  <>
                                    {intro && (
                                      <div style={{
                                        color: '#1F2937', fontSize: 15, fontFamily: 'Plus Jakarta Sans',
                                        fontWeight: '400', lineHeight: 1.65, paddingTop: 0, marginBottom: 4, maxWidth: '100%',
                                      }}>
                                        {intro}
                                      </div>
                                    )}
                                    {renderFileListing(m)}
                                  </>
                                );
                              }

                              // ANSWER MODE: full markdown + pills below if any
                              return (
                                <>
                                  {(() => {
                                    const attachments = Array.isArray(m.attachments) ? m.attachments : [];
                                    const confirm = attachments.find((a) => a && a.type === 'action_confirmation');
                                    const isEmailDraft = m.answerMode === 'action_confirmation' && confirm?.operator === 'EMAIL_SEND';
                                    if (isEmailDraft) return null;

                                    return (
                                      <div className="markdown-preview-container" style={{
                                        color: '#1F2937',
                                        fontSize: 15,
                                        fontFamily: 'Plus Jakarta Sans',
                                        fontWeight: '400',
                                        lineHeight: 1.65,
                                        width: '100%',
                                        whiteSpace: 'normal',
                                        wordWrap: 'break-word',
                                        overflowWrap: 'break-word',
                                        padding: 0,
                                      }}>
                                        <StreamingMarkdown
                                          content={isStreamingMsg ? (m.content || "") : fixCurrencyArtifacts(stripSourcesLabels(m.content || ""))}
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
                                          onSourceClick={openPreviewFromSource}
                                          onUpload={() => setShowUploadModal(true)}
                                        />
                                      </div>
                                    );
                                  })()}
                                  {renderAssistantAttachments(m)}
                                  {m.listing && m.listing.length > 0 && renderFileListing(m)}
                                </>
                              );
                            })()
                          )}

                          {/* Action confirmation + (special) email send receipt card */}
                          {!isStreamingMsg && (m.answerMode === 'action_confirmation' || m.answerMode === 'action_receipt') && renderActionConfirmation(m)}

                          {/* Error */}
                          {isError ? (
                            <div style={{ color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: 500, marginTop: 4 }}>
                              {m.error || "Something went wrong"}
                            </div>
                          ) : null}

                          {/* Source pill + action icons (Copy/Regenerate) */}
                          {!isStreamingMsg && !isError && m.answerMode !== 'nav_pills' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, width: '100%' }}>
                              {(m.answerClass === 'DOCUMENT' || (!m.answerClass && m.answerMode?.startsWith('doc_grounded')) || m.answerMode === 'action_receipt') ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  {renderSources(m)}
                                </div>
                              ) : null}
                              <MessageActions
                                message={m}
                                onRegenerate={m.id === lastAssistant?.id ? regenerateLastAnswer : () => {
                                  const idx = messages.indexOf(m);
                                  let userMsg = null;
                                  for (let i = idx - 1; i >= 0; i--) {
                                    if (messages[i].role === "user") { userMsg = messages[i]; break; }
                                  }
                                  if (userMsg?.content) setInput(userMsg.content);
                                  setTimeout(() => inputRef.current?.focus(), 10);
                                }}
                                isRegenerating={isStreaming && m.id === lastAssistant?.id}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          maxWidth: isMobile ? "92%" : "min(70%, 720px)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: 8,
                          minWidth: 0,
                        }}
                      >
                        {renderUserAttachments(m)}
                        {m.content?.trim() ? (
                          (() => {
                            const content = String(m.content || "");
                            const isLong =
                              content.length > 280 ||
                              content.split("\n").length > 6;
                            const isExpanded = !!expandedUserMessages[m.id];
                            const shouldClamp = isLong && !isExpanded;

                            return (
                              <>
                                <div
                                  className="user-message-text"
                                  style={{
                                    padding: isLong ? "14px 20px" : "10px 18px",
                                    borderRadius: isLong ? 22 : 999,
                                    background: "#18181B",
                                    color: "rgba(255,255,255,0.95)",
                                    fontSize: 15,
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    fontWeight: 500,
                                    lineHeight: "24px",
                                    letterSpacing: "0.01em",
                                    whiteSpace: "pre-wrap",
                                    overflowWrap: "anywhere",
                                    wordBreak: "break-word",
                                    width: "fit-content",
                                    maxWidth: "100%",
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)",
                                  }}
                                >
                                  <div
                                    style={{
                                      position: "relative",
                                      maxHeight: shouldClamp ? 168 : "none",
                                      overflow: shouldClamp ? "hidden" : "visible",
                                    }}
                                  >
                                    {content}
                                    {shouldClamp ? (
                                      <div
                                        aria-hidden="true"
                                        style={{
                                          position: "absolute",
                                          left: 0,
                                          right: 0,
                                          bottom: 0,
                                          height: 64,
                                          background:
                                            "linear-gradient(to bottom, rgba(24,24,27,0), rgba(24,24,27,1))",
                                          pointerEvents: "none",
                                        }}
                                      />
                                    ) : null}
                                  </div>
                                </div>

                                {isLong ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedUserMessages((prev) => ({
                                        ...prev,
                                        [m.id]: !prev[m.id],
                                      }))
                                    }
                                    style={{
                                      border: "none",
                                      background: "transparent",
                                      color: "#71717A",
                                      fontFamily: "Plus Jakarta Sans, sans-serif",
                                      fontSize: 12,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      padding: "2px 6px",
                                    }}
                                  >
                                    {isExpanded ? "Show less" : "Show more"}
                                  </button>
                                ) : null}
                              </>
                            );
                          })()
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}


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

      </div>

      {/* Jump to bottom — glued above input bar */}
      {!atBottom ? (
        <div style={{ display: "flex", justifyContent: "center", position: "relative", zIndex: 10 }}>
          <button
            type="button"
            onClick={scrollToBottom}
            style={{
              position: "absolute",
              bottom: 8,
              width: 32,
              height: 32,
              borderRadius: 999,
              background: "#1A1A1A",
              border: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Jump to latest"
          >
            <ArrowUpIcon style={{ width: 18, height: 18, color: "white", transform: "rotate(180deg)" }} />
          </button>
        </div>
      ) : null}

      {/* Input + attachments */}
      <div
        className={isMobile ? "chat-input-area" : "chat-input-area"}
        style={{
          padding: isMobile ? "12px 16px" : "14px 20px 20px",
          // Mobile: Add padding for fixed input bar + tab bar
          paddingBottom: isMobile
            ? "calc(var(--tabbar-h, 70px) + env(safe-area-inset-bottom) + 80px)"
            : "20px",
          background: "#FFFFFF",
          borderTop: "none",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          {/* Uploading previews */}
          {!isViewerVariant && uploading.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {uploading.map((f) => (
                <div
                  key={f.name}
                  className="koda-source-pill"
                  style={{ cursor: "default" }}
                >
                  <span className="koda-source-pill__icon">
                    <FileTypeIcon filename={f.name} mimeType={f.type} />
                  </span>
                  <span className="koda-source-pill__text">{cleanDocumentName(f.name)}</span>
                  <UploadSpinner />
                </div>
              ))}
            </div>
          ) : null}

          {/* Attached docs (already uploaded, pending next send) */}
          {!isViewerVariant && attachedDocs.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {attachedDocs.map((d) => (
                <div key={d.id} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <InlineNavPill
                    label={d.filename || d.name}
                    icon={<FileTypeIcon filename={d.filename || d.name} mimeType={d.mimeType || d.type} />}
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

          {/* Active connector pills */}
          {!isViewerVariant && activeConnectors.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {activeConnectors.map((provider) => {
                const opt = CONNECTOR_OPTIONS.find((o) => o.provider === provider);
                if (!opt) return null;
                return (
                  <div
                    key={provider}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      height: 38,
                      padding: "0 6px 0 10px",
                      borderRadius: 999,
                      border: "1.5px solid #18181B",
                      background: "#FAFAFA",
                      transition: "box-shadow 0.15s, border-color 0.15s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    }}
                  >
                    <img
                      src={opt.icon}
                      alt=""
                      width={22}
                      height={22}
                      style={{ flexShrink: 0, objectFit: "contain" }}
                    />
                    <span
                      style={{
                        fontFamily: "Plus Jakarta Sans, sans-serif",
                        fontSize: 13,
                        fontWeight: 800,
                        color: "#18181B",
                      }}
                    >
                      {opt.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveConnectors((prev) => prev.filter((p) => p !== provider))}
                      aria-label={`Deactivate ${opt.label}`}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        border: "1.5px solid #D4D4D8",
                        background: "white",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#71717A",
                        fontSize: 11,
                        fontWeight: 900,
                        padding: 0,
                        marginLeft: 2,
                        transition: "background 0.15s, border-color 0.15s, color 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#F4F4F5"; e.currentTarget.style.borderColor = "#18181B"; e.currentTarget.style.color = "#18181B"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#D4D4D8"; e.currentTarget.style.color = "#71717A"; }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Desktop: Original animated input card */}
          {!isMobile && (
            <motion.div
              data-input-card
              animate={{ y: isFocused ? -2 : 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onMouseEnter={() => setIsFocused(true)}
              onMouseLeave={() => setIsFocused(false)}
            >
              {hasViewerSelection ? (
                <div style={{ marginBottom: 10 }}>
                  {ViewerSelectionPill}
                </div>
              ) : null}
              <motion.form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                animate={{
                  scale: isFocused ? 1.01 : 1,
                  boxShadow: isFocused
                    ? "0 20px 40px -12px rgba(0,0,0,0.15), 0 8px 20px -8px rgba(0,0,0,0.1), 0 2px 6px -2px rgba(0,0,0,0.05)"
                    : "0 10px 30px -10px rgba(0,0,0,0.1), 0 4px 12px -4px rgba(0,0,0,0.06), 0 1px 4px -1px rgba(0,0,0,0.04)",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 16px",
                  borderRadius: 24,
                  border: "none",
                  background: "white",
                }}
              >
                <style>{`.chat-v3-textarea::placeholder { color: #9CA3AF; }`}</style>
                <textarea
                  ref={inputRef}
                  data-chat-input="true"
                  className="chat-v3-textarea"
                  value={input}
                  placeholder="Ask Allybi…"
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={onPaste}
                  onFocus={() => {
                    if (isUnauthenticated) {
                      triggerAuthGate('input');
                      inputRef.current?.blur();
                    }
                  }}
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
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 15,
                    fontWeight: 500,
                    color: "#18181B",
                    lineHeight: "24px",
                    maxHeight: "200px",
                    minHeight: "24px",
                    overflowY: "hidden",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    background: "transparent",
                  }}
                />

                {/* Viewer chat is document-scoped and intentionally clean: no connector/tools menu. */}
                {!isViewerVariant ? (
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <motion.button
                      ref={connectorMenuBtnRef}
                      type="button"
                      onClick={() => {
                        setConnectorError(null);
                        setConnectorMenuOpen((v) => !v);
                        if (!connectorMenuOpen) refreshConnectorStatus({ silent: true });
                      }}
                      aria-label="Connectors"
                      whileHover={{ scale: 1.08, backgroundColor: "#F4F4F5", color: "#52525B" }}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        background: connectorMenuOpen ? "#F4F4F5" : "none",
                        border: "none",
                        padding: 10,
                        borderRadius: 12,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#A1A1AA",
                        transition: "background 0.15s, color 0.15s",
                      }}
                    >
                      <AddIcon width={20} height={20} />
                    </motion.button>

                    <AnimatePresence>
                      {connectorMenuOpen ? (
                        <motion.div
                          ref={connectorMenuRef}
                          initial={{ opacity: 0, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.98 }}
                          transition={{ type: "spring", stiffness: 500, damping: 35 }}
                          style={{
                            position: "absolute",
                            bottom: 48,
                            left: 0,
                            zIndex: 50,
                            background: "white",
                            borderRadius: 14,
                            border: "1px solid #E6E6EC",
                            boxShadow: "0 16px 40px rgba(0,0,0,0.14), 0 6px 16px rgba(0,0,0,0.08)",
                            padding: 6,
                            minWidth: 220,
                          }}
                        >
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {/* Upload / tools */}
                          <div style={{ padding: "8px 10px 4px", fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "#6B7280", textTransform: "uppercase" }}>
                            Tools
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (isUnauthenticated) {
                                triggerAuthGate("upload");
                                return;
                              }
                              setConnectorMenuOpen(false);
                              fileInputRef.current?.click();
                            }}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              fontFamily: "Plus Jakarta Sans, sans-serif",
                              fontSize: 14,
                              fontWeight: 700,
                              color: "#18181B",
                              textAlign: "left",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                          >
                            <span>Upload files</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#71717A" }}>⌘U</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isUnauthenticated) {
                                triggerAuthGate("upload");
                                return;
                              }
                              setConnectorMenuOpen(false);
                              setShowUploadModal(true);
                            }}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              fontFamily: "Plus Jakarta Sans, sans-serif",
                              fontSize: 14,
                              fontWeight: 700,
                              color: "#18181B",
                              textAlign: "left",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                          >
                            <span>Upload folder</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#71717A" }}>Browse</span>
                          </button>

                          <div style={{ height: 1, background: "#F3F4F6", margin: "4px 6px" }} />

                          <div style={{ padding: "8px 10px 4px", fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "#6B7280", textTransform: "uppercase" }}>
                            Connectors
                          </div>
                          {CONNECTOR_OPTIONS.map((opt) => {
                            const status = connectorStatus?.[opt.provider];
                            const isConnected = Boolean(status?.connected);
                            const isExpired = Boolean(status?.expired);
                            const isBusy = activatingConnector === opt.provider;
                            const isActive = activeConnectors.includes(opt.provider);

                            return (
                              <button
                                key={opt.provider}
                                type="button"
                                disabled={connectorStatusLoading || isBusy}
                                onClick={async () => {
                                  const status = connectorStatus?.[opt.provider];
                                  const isConnected = Boolean(status?.connected);
                                  const isExpired = Boolean(status?.expired);

                                  // If already connected and not expired, toggle in active list.
                                  if (isConnected && !isExpired) {
                                    setActiveConnectors((prev) =>
                                      prev.includes(opt.provider)
                                        ? prev.filter((p) => p !== opt.provider)
                                        : [...prev, opt.provider]
                                    );
                                    await maybeAutoSyncConnector(opt.provider);
                                    return;
                                  }

                                  // If expired, try a status refresh first (it may auto-refresh tokens).
                                  if (isConnected && isExpired) {
                                    const refreshed = await refreshConnectorStatus({ silent: true });
                                    const updated = refreshed?.[opt.provider];
                                    const stillExpired = Boolean(updated?.expired);
                                    const stillConnected = Boolean(updated?.connected);
                                    if (stillConnected && !stillExpired) {
                                      setActiveConnectors((prev) =>
                                        prev.includes(opt.provider) ? prev : [...prev, opt.provider]
                                      );
                                      await maybeAutoSyncConnector(opt.provider);
                                      return;
                                    }
                                  }

                                  setConnectorMenuOpen(false);
                                  await startConnectorOAuth(opt.provider);
                                }}
                                style={{
                                  width: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  padding: "10px 12px",
                                  borderRadius: 12,
                                  border: isActive ? "1.5px solid #18181B" : "1.5px solid transparent",
                                  background: isActive ? "#F9FAFB" : "transparent",
                                  cursor: connectorStatusLoading || isBusy ? "not-allowed" : "pointer",
                                  fontFamily: "Plus Jakarta Sans, sans-serif",
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color: "#18181B",
                                  opacity: connectorStatusLoading || isBusy ? 0.6 : 1,
                                  textAlign: "left",
                                  transition: "border-color 0.15s, background 0.15s",
                                }}
                                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                              >
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                                  <span style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 6,
                                    border: isActive ? "1.5px solid #18181B" : "1.5px solid #D4D4D8",
                                    background: isActive ? "#18181B" : "white",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                    transition: "background 0.15s, border-color 0.15s",
                                  }}>
                                    {isActive ? (
                                      <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1.5 4.5L4 7L9.5 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    ) : null}
                                  </span>
                                  <img src={opt.icon} alt={opt.label} width={26} height={26} style={{ flexShrink: 0, objectFit: "contain" }} />
                                  <span>{opt.label}</span>
                                </span>
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: isActive ? "#18181B" : isExpired ? "#F59E0B" : isConnected ? "#22C55E" : "#A1A1AA",
                                  background: isActive ? "#E8F5E9" : "transparent",
                                  padding: isActive ? "2px 8px" : 0,
                                  borderRadius: 999,
                                }}>
                                  {isBusy ? "Connecting\u2026" : isActive ? "Active" : isConnected ? "Connected" : isExpired ? "Expired" : "Connect"}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {connectorError ? (
                          <div style={{
                            marginTop: 6,
                            padding: "8px 10px",
                            borderRadius: 12,
                            background: "#FEF2F2",
                            color: "#DC2626",
                            fontFamily: "Plus Jakarta Sans, sans-serif",
                            fontSize: 12,
                            fontWeight: 600,
                          }}>
                            {connectorError}
                          </div>
                        ) : null}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                ) : null}

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
                <motion.button
                  type="button"
                  onClick={() => {
                    if (isUnauthenticated) {
                      triggerAuthGate('upload');
                      return;
                    }
                    fileInputRef.current?.click();
                  }}
                  aria-label="Attach files"
                  whileHover={{ scale: 1.08, backgroundColor: "#F4F4F5" }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 10,
                    borderRadius: 12,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "color 0.15s",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#18181B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </motion.button>

                {/* Send / Stop */}
                {isStreaming ? (
                  <motion.button
                    type="button"
                    onClick={() => stopStreaming(true)}
                    aria-label="Stop generating"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    style={{
                      width: 34,
                      height: 34,
                      padding: 0,
                      borderRadius: "50%",
                      border: "none",
                      background: "#18181B",
                      color: "white",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ display: 'block', width: 10, height: 10, borderRadius: 2, backgroundColor: 'white' }} />
                  </motion.button>
                ) : (
                  <motion.button
                    type="submit"
                    disabled={!input.trim() && attachedDocs.length === 0}
                    aria-label="Send"
                    whileHover={
                      input.trim() || attachedDocs.length
                        ? { scale: 1.08, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }
                        : {}
                    }
                    whileTap={input.trim() || attachedDocs.length ? { scale: 0.92 } : {}}
                    style={{
                      width: 34,
                      height: 34,
                      padding: 0,
                      borderRadius: "50%",
                      border: "none",
                      background: input.trim() || attachedDocs.length ? "#18181B" : "#F4F4F5",
                      color: input.trim() || attachedDocs.length ? "white" : "#9CA3AF",
                      cursor: input.trim() || attachedDocs.length ? "pointer" : "default",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background 0.2s, color 0.2s",
                    }}
                  >
                    <ArrowUpIcon style={{ width: 18, height: 18 }} />
                  </motion.button>
                )}
              </motion.form>
            </motion.div>
          )}

          {/* Trust & Security Footer */}
          <div style={{
            marginTop: isMobile ? 8 : 10,
            paddingTop: isMobile ? 6 : 8,
            borderTop: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: isMobile ? 11 : 12,
            color: '#B9B9BD',
            fontFamily: 'Plus Jakarta Sans',
            textAlign: 'center',
            lineHeight: '16px',
            whiteSpace: 'normal',
            flexWrap: 'wrap',
            paddingBottom: 2,
          }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span style={{ maxWidth: isMobile ? 520 : 820 }}>
              {(() => {
                const msg = String(t('fileBreakdown.encryptionMessage') || '');
                const parts = msg.split('Allybi');
                if (parts.length <= 1) return msg;
                return parts.map((p, idx) => (
                  <React.Fragment key={`${idx}:${p}`}>
                    {p}
                    {idx < parts.length - 1 ? (
                      <span style={{ color: '#111827', fontWeight: 900 }}>Allybi</span>
                    ) : null}
                  </React.Fragment>
                ));
              })()}
            </span>
          </div>
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

      <EmailPreviewModal
        isOpen={!!previewEmail}
        email={previewEmail}
        folders={folders}
        onSavedToKoda={() => {
          // Ensure new files show up in the library picker immediately.
          try { fetchDocuments?.(true); } catch {}
          try { fetchFolders?.(true); } catch {}
        }}
        onClose={() => setPreviewEmail(null)}
      />

      {/* Folder preview modal */}
      <FolderPreviewModal
        isOpen={!!previewFolder}
        onClose={() => setPreviewFolder(null)}
        folder={previewFolder}
        contents={previewFolderContents}
        onNavigateToFolder={(folderId) => {
          setPreviewFolder(null);
          openFolderPreview(folderId);
        }}
        onOpenFile={(fileId) => {
          setPreviewFolder(null);
          const doc = documents.find(d => d.id === fileId);
          if (doc) setPreviewDocument({ id: doc.id, filename: doc.filename, mimeType: doc.mimeType, initialPage: 1 });
        }}
      />

      {/* All files listing modal */}
      {allFilesListing && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setAllFilesListing(null)}
        >
          {/* Backdrop */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
          {/* Modal */}
          <div
            style={{
              position: 'relative', background: '#fff', borderRadius: 16,
              width: '90%', maxWidth: 600, maxHeight: '80vh',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid #E5E7EB',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 600, fontSize: 16, color: '#111827' }}>
                  All files ({allFilesListing.items.length})
                </span>
              </div>
              <button
                onClick={() => setAllFilesListing(null)}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: 'none',
                  background: '#F3F4F6', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>

            {/* Breadcrumb */}
            {allFilesListing.breadcrumb?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '12px 20px 0' }}>
                {allFilesListing.breadcrumb.map((crumb, idx) => (
                  <React.Fragment key={crumb.id}>
                    {idx > 0 && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M7.5 4.5L13 10L7.5 15.5" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    <FolderPill
                      folder={{ id: crumb.id, name: crumb.name }}
                      onOpen={() => { setAllFilesListing(null); openFolderPreview?.(crumb.id); }}
                    />
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Scrollable item list */}
            <div style={{ overflowY: 'auto', padding: '12px 20px 20px', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {allFilesListing.items.map((item, idx) => {
                  const label = cleanDocumentName(item.title || 'Untitled');
                  const indent = (item.depth || 0) * 20;
                  return (
                    <div key={`all-${item.kind}-${item.id || idx}`}
                         style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: indent }}>
                      {item.kind === 'folder' ? (
                        <FolderPill
                          folder={{ id: item.id, name: label }}
                          onOpen={() => { setAllFilesListing(null); openFolderPreview?.(item.id); }}
                        />
                      ) : (
                        <InlineNavPill
                          label={label}
                          icon={<FileTypeIcon filename={label} mimeType={item.mimeType} />}
                          onClick={() => {
                            setAllFilesListing(null);
                            setPreviewDocument({
                              id: item.id,
                              filename: label,
                              mimeType: item.mimeType || 'application/octet-stream',
                            });
                          }}
                          title={label}
                        />
                      )}
                      {item.kind === 'folder' && item.itemCount > 0 && (
                        <span style={{ fontSize: 12, color: '#9CA3AF' }}>({item.itemCount})</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload modal (triggered by inline upload marker in markdown) */}
      <UniversalUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={() => setShowUploadModal(false)}
      />
    </div>
  );
}
