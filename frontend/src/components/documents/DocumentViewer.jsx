import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';
import api from '../../services/api';
import { applyEdit, undoEdit } from '../../services/editingService';
import LeftNav from '../app-shell/LeftNav';
import NotificationPanel from '../notifications/NotificationPanel';
import SearchInDocumentModal from './SearchInDocumentModal';
import DeleteConfirmationModal from '../library/DeleteConfirmationModal';
import MoveToCategoryModal from '../library/MoveToCategoryModal';
import CreateCategoryModal from '../library/CreateCategoryModal';
import { ReactComponent as ArrowLeftIcon } from '../../assets/arrow-narrow-left.svg';
import { ReactComponent as LogoutWhiteIcon } from '../../assets/Logout-white.svg';
import { ReactComponent as DownloadWhiteIcon } from '../../assets/Download 3 white.svg';
import logoSvg from '../../assets/logo.svg';
import cleanDocumentName from '../../utils/cleanDocumentName';
import { getApiBaseUrl } from '../../services/runtimeConfig';
import sphereIcon from '../../assets/koda-knot-black.svg';
import kodaLogoWhite from '../../assets/koda-knot-white.svg';
import { ReactComponent as TrashCanIcon } from '../../assets/Trash can.svg';
import { ReactComponent as PrinterIcon } from '../../assets/printer.svg';
import { ReactComponent as DownloadIcon } from '../../assets/Download 3- black.svg';
import { ReactComponent as PlusIcon } from '../../assets/Plus.svg';
import { ReactComponent as MinusIcon } from '../../assets/Minus.svg';
import { ReactComponent as StarIcon } from '../../assets/Star.svg';
import { ReactComponent as XCloseIcon } from '../../assets/x-close.svg';
import { ReactComponent as CloseIcon } from '../../assets/x-close.svg';
import { ReactComponent as AddIcon } from '../../assets/add.svg';
import folderIcon from '../../assets/folder_icon.svg';
import pdfIcon from '../../assets/pdf-icon.png';
import docIcon from '../../assets/doc-icon.png';
import xlsIcon from '../../assets/xls.png';
import jpgIcon from '../../assets/jpg-icon.png';
import pngIcon from '../../assets/png-icon.png';
import txtIcon from '../../assets/txt-icon.png';
import pptxIcon from '../../assets/pptx.png';
import movIcon from '../../assets/mov.png';
import mp4Icon from '../../assets/mp4.png';
import mp3Icon from '../../assets/mp3.svg';
import CategoryIcon from '../library/CategoryIcon';
import { ROUTES, buildRoute } from '../../constants/routes';
import { useDocuments } from '../../context/DocumentsContext';
import { useNotifications } from '../../context/NotificationsStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  isSafari,
  isMacOS,
  isIOS,
  downloadFile as safariDownloadFile,
  getImageRenderingCSS,
  logBrowserInfo
} from '../../utils/browser/browserUtils';
import {
  getOptimalPDFWidth
} from '../../utils/rendering/pdfRenderingUtils';
import { getSupportedExports, hasExportOptions } from '../../utils/files/exportUtils';
import { getPreviewCountForFile, getFileExtension } from '../../utils/files/previewCount';
import InlineNavPill from '../attachments/pills/InlineNavPill';
import ChatInterface from '../chat/ChatInterface';
import AllybiEditingToolbar from './editor/allybi-toolbar/AllybiEditingToolbar';
// EditRightPanel removed in viewer: assistant panel is chat-only.
import TargetsTab from './editor/TargetsTab';
import ChangesTab from './editor/ChangesTab';
import { getDocxViewerSelectionV2 } from '../../utils/editor/docxSelectionModel';

// ⚡ PERFORMANCE: Code-split MarkdownEditor to reduce initial bundle size
// react-markdown, remark-gfm, and rehype-raw add ~200KB to the bundle
const MarkdownEditor = lazy(() => import('./previews/MarkdownEditor'));

// ⚡ PERFORMANCE: Code-split ExcelPreview for Excel HTML table rendering
const ExcelPreview = lazy(() => import('./previews/ExcelPreview'));

// ⚡ PERFORMANCE: Code-split PPTXPreview to reduce initial bundle size
const PPTXPreview = lazy(() => import('./previews/PPTXPreview'));

// ⚡ PERFORMANCE: Code-split DOCX editing canvas (only used in edit mode)
const DocxEditCanvas = lazy(() => import('./previews/DocxEditCanvas'));

// ⚡ PERFORMANCE: Code-split Excel/PPTX/PDF edit canvases (only used in edit mode)
const ExcelEditCanvas = lazy(() => import('./previews/ExcelEditCanvas'));
const PptxEditCanvas = lazy(() => import('./previews/PptxEditCanvas'));

// Set up the worker for pdf.js - react-pdf comes with its own pdfjs version
// Use jsdelivr CDN as fallback with the bundled version
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Log browser information for debugging (only in development)
if (process.env.NODE_ENV === 'development') {
  logBrowserInfo();
}

// Text/Code Preview Component
const TextCodePreview = ({ url, document, zoom, t }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(url)
      .then(res => res.text())
      .then(text => {
        setContent(text);
        setLoading(false);
      })
      .catch(err => {
        setLoading(false);
      });
  }, [url]);

  if (loading) {
    return <div style={{ minHeight: 200 }} />;
  }

  return (
    <div style={{
      width: `${zoom}%`,
      maxWidth: '900px',
      background: 'white',
      borderRadius: 8,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      transition: 'width 0.2s ease'
    }}>
      <div style={{
        padding: 16,
        background: '#F5F5F5',
        borderBottom: '1px solid #E6E6EC',
        fontSize: 14,
        fontWeight: '600',
        color: '#32302C',
        fontFamily: 'Plus Jakarta Sans'
      }}>
        {cleanDocumentName(document.filename)}
      </div>
      <pre style={{
        padding: 20,
        margin: 0,
        overflow: 'auto',
        maxHeight: '70vh',
        fontSize: `${zoom / 10}px`,
        fontFamily: 'monospace',
        lineHeight: 1.6,
        color: '#32302C',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        transition: 'font-size 0.2s ease'
      }}>
        {content}
      </pre>
    </div>
  );
};

const DocumentViewer = () => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const { documentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { documents: contextDocuments, moveToFolder, createFolder, getRootFolders, getDocumentCountByFolder } = useDocuments();

  // Parse ?page=X query param for jump-to-page support
  const searchParams = new URLSearchParams(location.search);
  const initialPageParam = parseInt(searchParams.get('page'), 10) || 1;
  const initialTargetParam = String(searchParams.get('target') || '').trim();
  const initialEditOpenParam = String(searchParams.get('edit') || '').trim() === '1';
  const initialTabParam = String(searchParams.get('tab') || '').trim(); // ask|targets|changes
  const initialEditSessionParam = String(searchParams.get('kodaEditSession') || '').trim();

  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [documentUrl, setDocumentUrl] = useState(null);
  // Zoom is controlled in the Allybi toolbar; no dropdown state needed here.
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [showNotificationsPopup, setShowNotificationsPopup] = useState(false);
  const [extractedText, setExtractedText] = useState(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedDocumentForCategory, setSelectedDocumentForCategory] = useState(null);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(initialPageParam);
  const [pendingInitialPage, setPendingInitialPage] = useState(initialPageParam);
  const [showAskKoda, setShowAskKoda] = useState(() => {
    // Only show if not dismissed in this session
    return sessionStorage.getItem('askKodaDismissed') !== 'true';
  });
  const [showExtractedText, setShowExtractedText] = useState(false);
  // PDF: default preview is the real PDF. Editing is done via "working copy" conversion to DOCX.
  const [pdfCanEditText, setPdfCanEditText] = useState(null); // null=unknown, true, false
  const [pdfEditBlockedMsg, setPdfEditBlockedMsg] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [exportingFormat, setExportingFormat] = useState(null); // Track which export is in progress
  const [previewVersion, setPreviewVersion] = useState(0); // Used to force re-fetch of preview after regeneration
  const [containerWidth, setContainerWidth] = useState(null); // Track container width for responsive PDF sizing
  const [childPreviewCount, setChildPreviewCount] = useState(null); // Count from child previews (PPTX, Excel)

  // ---------------------------------------------------------------------------
  // Embedded editing panel (Ask Allybi -> assistant panel)
  // ---------------------------------------------------------------------------
  const makeEphemeralConversation = useCallback((docId) => {
    const now = new Date().toISOString();
    const seed = `viewer-new:${docId || "unknown"}:${Math.random().toString(16).slice(2)}:${Date.now().toString(16)}`;
    // Keep the reserved prefix aligned with backend listConversations() filtering.
    return { id: seed, title: `__viewer__:${docId || "unknown"}`, createdAt: now, updatedAt: now, isEphemeral: true };
  }, []);

  // Assistant panel visibility (editing tools are always available for supported formats).
  const [editingOpen, setEditingOpen] = useState(false);
  const [assistantTab, setAssistantTab] = useState('ask'); // 'ask' | 'targets' | 'changes'
  const [editingConversation, setEditingConversation] = useState(() => makeEphemeralConversation(documentId));
  const [viewerFocusNonce, setViewerFocusNonce] = useState(0);
  const viewerConvIdRef = useRef('');
  const viewerChatApiRef = useRef(null);

  const [injectedEditSession, setInjectedEditSession] = useState(() => {
    if (!initialEditSessionParam) return null;
    try {
      const padded = initialEditSessionParam.replace(/-/g, '+').replace(/_/g, '/');
      const pad = padded.length % 4 ? '='.repeat(4 - (padded.length % 4)) : '';
      const json = decodeURIComponent(escape(window.atob(padded + pad)));
      return JSON.parse(json);
    } catch {
      return null;
    }
  });
  // When deep-linking from an edit card, we inject the card into chat immediately (so the user
  // sees it), and separately trigger the viewer-side draft preview/highlight once the editor
  // pipeline is ready.
  const [injectedEditSessionForDraft, setInjectedEditSessionForDraft] = useState(null);

  const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || ''));

  const deleteViewerConversationIfNeeded = useCallback(async () => {
    const id = String(viewerConvIdRef.current || '');
    if (!id || !isUuid(id)) return;
    try {
      await api.delete(`/api/chat/conversations/${id}`);
    } catch {}
    viewerConvIdRef.current = '';
  }, []);

  // Track created viewer conversation (uuid) so we can soft-delete it on close/unmount.
  useEffect(() => {
    const cid = String(editingConversation?.id || '');
    const title = String(editingConversation?.title || '');
    if (cid && isUuid(cid) && title.startsWith('__viewer__:')) {
      viewerConvIdRef.current = cid;
    }
  }, [editingConversation?.id, editingConversation?.title]);

  useEffect(() => {
    // Reset editing state when switching documents.
    setEditingOpen(false);
    setAssistantTab('ask');
    setEditingConversation(makeEphemeralConversation(documentId));
    setPdfCanEditText(null);
    setPdfEditBlockedMsg('');
    setViewerFocusNonce(0);
    setSelectionOverlay({ rects: [], frozen: false });
    setFrozenSelection(null);
  }, [documentId, makeEphemeralConversation]);

  // Deep-link behavior: open editor + choose tab
  useEffect(() => {
    if (!initialEditOpenParam) return;
    setEditingOpen(true);
    if (initialTabParam === 'targets' || initialTabParam === 'changes' || initialTabParam === 'ask') {
      setAssistantTab(initialTabParam);
    } else {
      setAssistantTab('ask');
    }
    setViewerFocusNonce((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditOpenParam, initialTabParam, documentId]);

  // Deep-link behavior: inject an edit_session card into the viewer chat.
  useEffect(() => {
    if (!injectedEditSession) return;
    const api = viewerChatApiRef.current;
    if (!api?.injectAssistant) return;
    api.injectAssistant({
      content: `Edit preview loaded for ${String(injectedEditSession?.filename || 'this document')}.`,
      attachments: [{ type: 'edit_session', ...(injectedEditSession || {}) }],
      answerMode: 'action_receipt',
    });
    setEditingOpen(true);
    setAssistantTab('ask');
    setViewerFocusNonce((n) => n + 1);
    setInjectedEditSessionForDraft(injectedEditSession);
    setInjectedEditSession(null);
  }, [injectedEditSession]);

  // Session-only behavior: when leaving the document viewer (or switching docs),
  // delete the backing conversation so it never becomes part of the main chat universe.
  useEffect(() => {
    return () => {
      deleteViewerConversationIfNeeded();
    };
  }, [deleteViewerConversationIfNeeded]);

  const viewerConversationTitle = useMemo(() => {
    const name = cleanDocumentName(document?.filename || '');
    const suffix = name ? `:${name}` : '';
    // Keep the reserved prefix aligned with backend listConversations() filtering.
    return `__viewer__:${documentId}${suffix}`;
  }, [documentId, document?.filename]);

  const pinnedDocsForChat = useMemo(() => {
    if (!document?.id) return [];
    return [{ id: document.id, filename: document.filename, mimeType: document.mimeType }];
  }, [document?.id, document?.filename, document?.mimeType]);

  // ---------------------------------------------------------------------------
  // Editor shell state (targets + changes queue)
  // ---------------------------------------------------------------------------
  const [docxBlocks, setDocxBlocks] = useState([]);
  const [docxSelectedId, setDocxSelectedId] = useState('');
  const [slidesAnchors, setSlidesAnchors] = useState([]);
  const [slidesSelectedAnchorId, setSlidesSelectedAnchorId] = useState('');
  const [editSessionsQueue, setEditSessionsQueue] = useState([]); // { id, session, status, revisionId?, error?, autoApplied? }
  const [editorStatusMsg, setEditorStatusMsg] = useState('');
  const [draftEdits, setDraftEdits] = useState([]); // { id, session, status: 'drafted'|'applying'|'applied'|'discarded'|'failed', targetId, domain }
  const [activeDraftId, setActiveDraftId] = useState('');
  const [editingPolicy, setEditingPolicy] = useState(() => ({
    alwaysConfirmOperators: [],
    silentExecuteConfidence: 0.9,
  }));

  const docxCanvasRef = useRef(null);
  const excelCanvasRef = useRef(null);

  // DOCX formatting controls (drives execCommand + span styling).
  const [docxFontFamily, setDocxFontFamily] = useState('Calibri');
  const [docxFontSizePx, setDocxFontSizePx] = useState('16px');
  const [docxColorHex, setDocxColorHex] = useState('#111827');
  const [docxActiveFormats, setDocxActiveFormats] = useState({ bold: false, italic: false, underline: false, strikethrough: false });
  // No default active alignment button; Word-like behavior comes from the document itself.
  const [docxAlignment, setDocxAlignment] = useState('');

  // XLSX toolbar state
  const [excelSelectedInfo, setExcelSelectedInfo] = useState(null);
  const [excelDraftValue, setExcelDraftValue] = useState('');
  const [excelSheetMeta, setExcelSheetMeta] = useState(null);

  // PPTX toolbar state
  const [pptxDraftText, setPptxDraftText] = useState('');
  const [pptxLayout, setPptxLayout] = useState('TITLE_AND_BODY');
  const [pptxStatusMsg, setPptxStatusMsg] = useState('');
  const [pptxApplying, setPptxApplying] = useState(false);

  // PDF revise toolbar state
  const [pdfStatusMsg, setPdfStatusMsg] = useState('');

  // Editing policy (frontend default): safest mode.
  // We intentionally do NOT call /api/editing/policy from the viewer because:
  // - it's optional for UX, and
  // - a missing endpoint spams 404s in the browser console.
  useEffect(() => {
    setEditingPolicy({ alwaysConfirmOperators: [], silentExecuteConfidence: 1.01 });
  }, []);

  useEffect(() => {
    // Reset per-document editor state.
    setDocxBlocks([]);
    setDocxSelectedId('');
    setSlidesAnchors([]);
    setSlidesSelectedAnchorId('');
    setEditSessionsQueue([]);
    setEditorStatusMsg('');
    setDraftEdits([]);
    setActiveDraftId('');
    setExcelSelectedInfo(null);
    setExcelDraftValue('');
    setExcelSheetMeta(null);
    setPptxDraftText('');
    setPptxLayout('TITLE_AND_BODY');
    setPptxStatusMsg('');
    setPdfStatusMsg('');
  }, [documentId]);

  // (intentionally removed) zoom presets dropdown UI

  // Refs to track PDF pages for scroll position
  const pageRefs = useRef({});
  const documentContainerRef = useRef(null);

  // ---------------------------------------------------------------------------
  // Selection -> "Ask Allybi" bubble (selection-first editing)
  // ---------------------------------------------------------------------------
  const [selectionBubble, setSelectionBubble] = useState(() => ({
    rawText: '',
    text: '',
    paragraphId: '',
    rect: null, // { top, left, width, height } in viewport coords
  }));
  const [selectionOverlay, setSelectionOverlay] = useState(() => ({ rects: [], frozen: false }));
  const [frozenSelection, setFrozenSelection] = useState(() => (null));
  const lastSelectionRef = useRef(null);

  // Deep-link injected sessions: when we open the viewer from an edit receipt/card, we want:
  // 1) the edit card visible in chat, and
  // 2) a draft preview + highlight on the exact target in the document.
  useEffect(() => {
    if (!injectedEditSessionForDraft) return;
    const s = injectedEditSessionForDraft || null;
    if (!s) return;

    let cancelled = false;

    const run = async () => {
      setEditingOpen(true);
      setAssistantTab('ask');
      setViewerFocusNonce((n) => n + 1);

      const makeKey = (sess) => {
        const sig = String(sess?.bundle?.summary || sess?.diff?.after || sess?.proposedText || '').slice(0, 120);
        return `${sess?.documentId || ''}:${sess?.operator || ''}:${sess?.domain || ''}:${sig}`;
      };
      const entryId = makeKey(s);

      // Persist in the viewer "Changes" log and mark as the active draft.
      setEditSessionsQueue((prev) => {
        const next = Array.isArray(prev) ? [...prev] : [];
        const idx = next.findIndex((x) => x?.id === entryId);
        const entry = { id: entryId, session: s, status: 'drafted', autoApplied: false, createdAt: new Date().toISOString() };
        if (idx >= 0) next[idx] = { ...next[idx], ...entry };
        else next.unshift(entry);
        return next;
      });

      const getTargetId = (sess) => {
        if (sess?.bundle && Array.isArray(sess?.bundlePatches)) {
          const first = sess.bundlePatches.find((p) => p?.paragraphId) || null;
          if (first?.paragraphId) return String(first.paragraphId);
        }
        return (
          String(sess?.target?.id || '') ||
          String(sess?.targetId || '') ||
          String(sess?.targetHint || '')
        ).trim();
      };
      const targetId = getTargetId(s);
      setDraftEdits((prev) => {
        const next = Array.isArray(prev) ? [...prev] : [];
        if (!next.some((d) => d?.id === entryId)) next.unshift({ id: entryId, session: s, status: 'drafted', targetId, domain: String(s?.domain || '') });
        return next;
      });
      setActiveDraftId(entryId);

      const domain = String(s?.domain || '').trim();
      if (domain === 'docx') {
        const start = Date.now();
        while (!cancelled && !docxCanvasRef.current && Date.now() - start < 2600) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 80));
        }
        if (cancelled) return;

        try {
          // Draft preview: apply into the live editable canvas (no revision committed yet).
          if (s?.bundle && Array.isArray(s?.bundlePatches) && s.bundlePatches.length) {
            await docxCanvasRef.current?.applyParagraphPatches?.({ draftId: entryId, patches: s.bundlePatches });
          } else {
            const patches = Array.isArray(s?.patches) ? s.patches : [];
            const afterText = String(s?.diff?.after || s?.proposedText || '').trim();
            if (patches.length) {
              await docxCanvasRef.current?.applySpanPatches?.({ draftId: entryId, patches });
            } else if (targetId && afterText) {
              await docxCanvasRef.current?.applyDraft?.({ draftId: entryId, targetId, afterText });
            }
          }
        } catch {
          // Even if draft fails, still try to locate/highlight the target.
        }

        try {
          if (targetId) await docxCanvasRef.current?.scrollToTarget?.(targetId);
        } catch {}

        // Highlight the exact paragraph so the user sees where this edit will land.
        setTimeout(() => {
          if (cancelled) return;
          try {
            const container = documentContainerRef.current;
            if (!container || !targetId) return;
            const safeId = (() => {
              try {
                if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(targetId);
              } catch {}
              return String(targetId).replace(/"/g, '\\"');
            })();
            const el = container.querySelector?.(`[data-paragraph-id="${safeId}"]`) || null;
            if (!el) return;
            const rect = el.getBoundingClientRect?.();
            if (!rect || (!rect.width && !rect.height)) return;
            const pad = 3;
            setSelectionOverlay({
              frozen: true,
              rects: [{
                top: Math.max(0, rect.top - pad),
                left: Math.max(0, rect.left - pad),
                width: rect.width + pad * 2,
                height: rect.height + pad * 2,
              }],
            });
            const text =
              String(s?.target?.previewText || '').trim() ||
              String(s?.diff?.before || s?.beforeText || '').trim() ||
              String(el.textContent || '').trim();
            setFrozenSelection({ domain: 'docx', paragraphId: targetId, text: String(text || '').slice(0, 2000) });
          } catch {}
        }, 240);
      }

      setInjectedEditSessionForDraft(null);
    };

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedEditSessionForDraft, documentId]);

  const clearSelectionBubble = useCallback(() => {
    setSelectionBubble({ rawText: '', text: '', paragraphId: '', rect: null });
  }, []);

  const clearFrozenSelection = useCallback(() => {
    setFrozenSelection(null);
    setSelectionOverlay({ rects: [], frozen: false });
    clearSelectionBubble();
    try {
      const sel = window.getSelection?.();
      sel?.removeAllRanges?.();
    } catch {}
  }, [clearSelectionBubble]);

  useEffect(() => {
    if (!editingOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        clearFrozenSelection();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [editingOpen, clearFrozenSelection]);

  useEffect(() => {
    // Clear selection UI when switching documents.
    clearSelectionBubble();
    setSelectionOverlay({ rects: [], frozen: false });
  }, [documentId, clearSelectionBubble]);

  const clipSelection = useCallback((s, n = 280) => {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    if (!t) return '';
    return t.length <= n ? t : t.slice(0, n).trimEnd() + '…';
  }, []);

  const updateSelectionBubbleFromDom = useCallback(() => {
    try {
      const container = documentContainerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect?.();

      const sel = window.getSelection?.();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        clearSelectionBubble();
        // If the overlay is frozen (assistant open), keep it; otherwise clear.
        setSelectionOverlay((prev) => (prev?.frozen ? prev : { rects: [], frozen: false }));
        return;
      }
      const rawText = String(sel.toString() || '').trim();
      if (!rawText || rawText.replace(/\s+/g, '').length < 2) {
        clearSelectionBubble();
        setSelectionOverlay((prev) => (prev?.frozen ? prev : { rects: [], frozen: false }));
        return;
      }
      const range = sel.getRangeAt(0);
      // Update overlay rects (used to keep selection visible after focus moves).
      try {
        const rects = Array.from(range.getClientRects?.() || [])
          .filter((r) => r && r.width > 0 && r.height > 0)
          .slice(0, 16)
          .map((r) => {
            // Store rects in container-content coordinates so they scroll with the document.
            const top = containerRect ? (r.top - containerRect.top + container.scrollTop) : r.top;
            const left = containerRect ? (r.left - containerRect.left + container.scrollLeft) : r.left;
            return { top, left, width: r.width, height: r.height };
          });
        // While the assistant panel is open, keep selection frozen so clicking into chat
        // doesn't lose the active edit target.
        setSelectionOverlay({ rects, frozen: !!editingOpen });
      } catch {}
      const rect = range.getBoundingClientRect?.();
      if (!rect || (!rect.width && !rect.height)) {
        clearSelectionBubble();
        return;
      }

      const ancestorNode = range.commonAncestorContainer;
      const ancestorEl =
        ancestorNode?.nodeType === 1 ? ancestorNode : ancestorNode?.parentElement || null;
      if (!ancestorEl || !container.contains(ancestorEl)) {
        clearSelectionBubble();
        return;
      }

      const p = ancestorEl.closest?.('[data-paragraph-id]');
      const paragraphId = p?.getAttribute?.('data-paragraph-id') || '';

      // Persist the selection target for the viewer chat so the backend can apply exact edits.
      // Use the richer v2 selection model (offsets + hash) when available.
      const v2 = getDocxViewerSelectionV2(container);
      if (editingOpen && paragraphId) {
        setFrozenSelection(v2 ? { ...v2, text: String(v2.text || '').slice(0, 2000) } : { domain: 'docx', paragraphId, text: rawText.slice(0, 2000) });
      }
      if (paragraphId) {
        lastSelectionRef.current = v2 ? { ...v2, text: String(v2.text || '').slice(0, 2000) } : { domain: 'docx', paragraphId, text: rawText.slice(0, 2000) };
      }

      setSelectionBubble({
        rawText: rawText.slice(0, 2000),
        text: clipSelection(rawText),
        paragraphId,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      });
    } catch {
      // ignore
    }
  }, [clearSelectionBubble, clipSelection, editingOpen]);

  // Targets -> scroll to paragraph (DOCX) when selected in Targets tab.
  useEffect(() => {
    if (!docxSelectedId) return;
    const container = documentContainerRef.current;
    if (!container) return;
    const safeId = (() => {
      try {
        // Prefer CSS.escape when available; fall back to a conservative quote escape.
        if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function') {
          return window.CSS.escape(docxSelectedId);
        }
      } catch {}
      return String(docxSelectedId).replaceAll('"', '\\"');
    })();
    const el = container.querySelector?.(`[data-paragraph-id="${safeId}"]`);
    if (!el) return;
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {
      // ignore
    }
  }, [docxSelectedId]);

  const toggleEditingPanel = useCallback(() => {
    setEditingOpen((v) => {
      const next = !v;
      if (next) {
        // Freeze the overlay so selection remains visible after focus moves.
        setSelectionOverlay((prev) => ({ rects: Array.isArray(prev?.rects) ? prev.rects : [], frozen: true }));
        // If the user has an active selection, seed the assistant input by quoting it.
        const sel = String(lastSelectionRef.current?.text || selectionBubble?.rawText || selectionBubble?.text || '').trim();
        const paraId = String(lastSelectionRef.current?.paragraphId || selectionBubble?.paragraphId || '').trim();
        const convoId = editingConversation?.id || '';
        if (sel && convoId) {
          const v2 =
            docxCanvasRef.current?.getViewerSelectionV2?.() ||
            getDocxViewerSelectionV2(documentContainerRef.current);
          setFrozenSelection(v2 ? { ...v2, text: sel } : { domain: 'docx', paragraphId: paraId, text: sel });
          try {
            const draft = `Rewrite the selected text:\n"${sel}"\n\n`;
            localStorage.setItem(
              `koda_draft_${convoId}`,
              draft,
            );
            // Tell ChatInterface to select just the quoted text for quick replacement.
            const quoteStart = draft.indexOf('"');
            const start = quoteStart >= 0 ? quoteStart + 1 : 0;
            const end = start + sel.length;
            sessionStorage.setItem(`koda_draft_select_${convoId}`, JSON.stringify({ start, end }));
          } catch {}
        }
      }
      return next;
    });
    setShowAskKoda(false);
    try { sessionStorage.setItem('askKodaDismissed', 'true'); } catch {}
  }, [editingConversation?.id, selectionBubble?.rawText, selectionBubble?.text, selectionBubble?.paragraphId]);

  const openEditingPanel = useCallback(({ seedSelection = true, focusInput = true } = {}) => {
    setEditingOpen(true);
    // Freeze the overlay so selection remains visible after focus moves.
    setSelectionOverlay((prev) => ({ rects: Array.isArray(prev?.rects) ? prev.rects : [], frozen: true }));
    if (seedSelection) {
      const sel = String(lastSelectionRef.current?.text || selectionBubble?.rawText || selectionBubble?.text || '').trim();
      const paraId = String(lastSelectionRef.current?.paragraphId || selectionBubble?.paragraphId || '').trim();
      const convoId = editingConversation?.id || '';
      if (sel && convoId) {
        const v2 =
          docxCanvasRef.current?.getViewerSelectionV2?.() ||
          getDocxViewerSelectionV2(documentContainerRef.current);
        setFrozenSelection(v2 ? { ...v2, text: sel } : { domain: 'docx', paragraphId: paraId, text: sel });
        try {
          const draft = `Rewrite the selected text:\n"${sel}"\n\n`;
          localStorage.setItem(`koda_draft_${convoId}`, draft);
          const quoteStart = draft.indexOf('"');
          const start = quoteStart >= 0 ? quoteStart + 1 : 0;
          const end = start + sel.length;
          sessionStorage.setItem(`koda_draft_select_${convoId}`, JSON.stringify({ start, end }));
        } catch {}
      }
    }
    if (focusInput) setViewerFocusNonce((n) => n + 1);
  }, [editingConversation?.id, selectionBubble?.rawText, selectionBubble?.text, selectionBubble?.paragraphId]);

  // Measure container width for responsive PDF/DOCX sizing
  useEffect(() => {
    const measureContainer = () => {
      if (documentContainerRef.current) {
        const padding = isMobile ? 16 : 48; // Account for container padding (8*2 or 24*2)
        const availableWidth = documentContainerRef.current.clientWidth - padding;
        setContainerWidth(availableWidth);
      }
    };

    // Initial measurement
    measureContainer();

    // Re-measure on window resize
    window.addEventListener('resize', measureContainer);

    // Use ResizeObserver for more accurate container size tracking
    const resizeObserver = new ResizeObserver(measureContainer);
    if (documentContainerRef.current) {
      resizeObserver.observe(documentContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', measureContainer);
      resizeObserver.disconnect();
    };
  }, [isMobile]);

  // Calculate responsive PDF page width - constrained to container
  // Uses cross-platform utility to handle Mac vs Windows scrollbar differences
  const getPdfPageWidth = useCallback(() => {
    if (isMobile) {
      return window.innerWidth - 16;
    }
    // Use cross-platform utility for better Mac/Windows compatibility
    const effectiveContainerWidth = containerWidth || (window.innerWidth - 250); // 250px for sidebar
    return getOptimalPDFWidth(effectiveContainerWidth, zoom, isMobile);
  }, [zoom, isMobile, containerWidth]);

  // Canonical preview count computation for PDF/Word documents
  const previewCount = useMemo(() => {
    if (!document) return null;
    const fileExt = getFileExtension(document.filename || '');

    // Only use `loading` (document fetch state) — not `imageLoading` which is
    // an image-specific flag that never resolves for PDF/DOCX files.
    return getPreviewCountForFile({
      mimeType: document.mimeType,
      fileExt,
      numPages,
      currentPage,
      isLoading: loading,
      previewType: 'pdf'
    }, t);
  }, [document, numPages, currentPage, loading, t]);

  // Handler for saving markdown edits
  const handleSaveMarkdown = async (docId, newMarkdownContent) => {
    try {
      await api.patch(`/api/documents/${docId}/markdown`, {
        markdownContent: newMarkdownContent
      });

      // Update local document state
      setDocument(prev => ({
        ...prev,
        metadata: {
          ...prev.metadata,
          markdownContent: newMarkdownContent
        }
      }));
    } catch (error) {
      throw error; // Re-throw to let the editor handle the error
    }
  };

  // Handler for exporting document
  const handleExport = async (format) => {
    if (exportingFormat) return; // Prevent multiple exports at once
    setExportingFormat(format);
    try {
      // Request with blob response type to handle both JSON and binary responses
      const response = await api.post(`/api/documents/${documentId}/export`, {
        format: format
      }, {
        responseType: 'blob'
      });

      // Check if response is JSON (URL response) or binary (direct file)
      const contentType = response.headers['content-type'] || '';

      if (contentType.includes('application/json')) {
        // Parse JSON response
        const text = await response.data.text();
        const jsonData = JSON.parse(text);

        if (jsonData.error) {
          throw new Error(jsonData.error);
        }

        const downloadUrl = jsonData.downloadUrl || jsonData.url;
        if (jsonData.success && downloadUrl) {
          const filename = jsonData.filename || `${(document.filename || 'document').split('.').slice(0, -1).join('.')}.${format}`;

          // Fetch the file with proper auth
          const fileResponse = await api.get(downloadUrl, {
            responseType: 'blob'
          });

          // Create blob URL and trigger download
          const blobUrl = window.URL.createObjectURL(fileResponse.data);
          const link = window.document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          link.style.display = 'none';
          window.document.body.appendChild(link);
          link.click();
          window.document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        } else {
          throw new Error(jsonData.error || 'Export failed');
        }
      } else {
        // Direct binary response - extract filename from Content-Disposition header
        const disposition = response.headers['content-disposition'] || '';
        let filename = `${(document.filename || 'document').split('.').slice(0, -1).join('.')}.${format}`;
        const filenameMatch = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
        }

        // Create blob URL and trigger download
        const blobUrl = window.URL.createObjectURL(response.data);
        const link = window.document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      // Handle blob error responses
      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const jsonData = JSON.parse(text);
          showError(jsonData.error || 'Export failed');
          return;
        } catch (e) {
          // Not JSON, show generic error
        }
      }
      showError(error.response?.data?.error || error.message || t('documentViewer.exportFailed'));
    } finally {
      setExportingFormat(null);
    }
  };

  // Handler for regenerating preview (markdown/slides)
  const handleRegeneratePreview = async () => {
    if (!document) return;

    try {
      setIsRegenerating(true);
      // Call reprocess endpoint to regenerate markdown/slides
      const response = await api.post(`/api/documents/${documentId}/reprocess`);
      // Reload the document to get fresh metadata
      const updatedDoc = await api.get(`/api/documents/${documentId}/status`);

      // Update document state
      setDocument(updatedDoc.data);

      // Increment preview version to force re-fetch of preview content
      setPreviewVersion(v => v + 1);

      // Clear cached URLs to force reload
      setDocumentUrl(null);
      setActualDocumentUrl(null);

      // Show success message (no reload needed)
      showSuccess(t('documentViewer.previewRegenerated'));
    } catch (error) {
      showError(t('documentViewer.failedToRegeneratePreview'));
    } finally {
      setIsRegenerating(false);
    }
  };

  // Determine breadcrumb start based on location state or default to Documents
  const breadcrumbStart = useMemo(() => {
    const from = location.state?.from;
    if (from === ROUTES.HOME || from === 'home') {
      return { label: t('nav.home'), path: ROUTES.HOME };
    }
    return { label: t('nav.documents'), path: ROUTES.DOCUMENTS };
  }, [location.state, t]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    // Clamp pendingInitialPage to valid range and jump to that page
    const targetPage = Math.max(1, Math.min(pendingInitialPage, numPages));
    setPageNumber(targetPage);
    setCurrentPage(targetPage);
  };

  // Handle URL ?page= param changes (e.g., from citation links)
  useEffect(() => {
    const newPageParam = parseInt(new URLSearchParams(location.search).get('page'), 10) || 1;
    setPendingInitialPage(newPageParam);
    if (numPages && numPages > 0) {
      const targetPage = Math.max(1, Math.min(newPageParam, numPages));
      setCurrentPage(targetPage);
      setPageNumber(targetPage);
    }
  }, [location.search, numPages]);

  // State to hold the actual document URL (with backend URL prepended for API endpoints)
  const [actualDocumentUrl, setActualDocumentUrl] = useState(null);
  const [isFetchingImage, setIsFetchingImage] = useState(false);
  const [imageRetryNonce, setImageRetryNonce] = useState(0);

  // Process document URL to use correct backend URL for API endpoints
  // For encrypted images, fetch with auth and create blob URL
  useEffect(() => {
    if (!documentUrl) {
      setActualDocumentUrl(null);
      return;
    }

    // Check if it's a relative API path (starts with /api/) or already a full backend URL
    const isRelativeApiPath = documentUrl.startsWith('/api/');
    const isBackendUrl = documentUrl.includes('getkoda.ai') || documentUrl.includes('localhost:5000');
    const isCloudStorageUrl =
      documentUrl.includes('storage.googleapis.com') ||
      documentUrl.includes('googleapis.com/storage') ||
      documentUrl.includes('s3.amazonaws.com') ||
      documentUrl.includes('.s3.');
    const isStreamEndpoint = documentUrl.includes('/stream');

    // For encrypted images (stream endpoint), fetch with auth and create blob URL
    if (isStreamEndpoint && document?.mimeType?.startsWith('image/')) {
      setIsFetchingImage(true);
      setImageError(false);

      const token = localStorage.getItem('accessToken');
      fetch(documentUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.blob();
        })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob);
          setActualDocumentUrl(blobUrl);
          setIsFetchingImage(false);
        })
        .catch(error => {
          setIsFetchingImage(false);
          setImageError(true);
        });

      // Cleanup blob URL when component unmounts or URL changes
      return () => {
        if (actualDocumentUrl && actualDocumentUrl.startsWith('blob:')) {
          URL.revokeObjectURL(actualDocumentUrl);
        }
      };
    } else if (isRelativeApiPath) {
      // Relative API path - prepend backend URL
      const fullUrl = `${getApiBaseUrl()}${documentUrl}`;
      setActualDocumentUrl(fullUrl);
    } else if (isBackendUrl || isCloudStorageUrl) {
      // Already a full URL (backend or cloud storage) - use directly
      setActualDocumentUrl(documentUrl);
    } else {
      // Unknown URL format - use as is
      setActualDocumentUrl(documentUrl);
    }
  }, [documentUrl, document?.mimeType, imageRetryNonce]);

  // Memoize the file config for PDF.js
  const fileConfig = useMemo(() => {
    if (!actualDocumentUrl) return null;

    // For preview-pdf and stream endpoints (encrypted files), fetch with auth headers
    if (actualDocumentUrl.includes('/preview-pdf') || actualDocumentUrl.includes('/stream')) {
      const token = localStorage.getItem('accessToken');
      return {
        url: actualDocumentUrl,
        httpHeaders: {
          'Authorization': `Bearer ${token}`
        }
      };
    }

    return { url: actualDocumentUrl };
  }, [actualDocumentUrl]);

  const pdfOptions = useMemo(() => {
    const isMacOS = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isSafari = navigator.userAgent.toLowerCase().indexOf('safari') !== -1 &&
                     navigator.userAgent.toLowerCase().indexOf('chrome') === -1;

    const baseOptions = {
      cMapUrl: 'https://unpkg.com/pdfjs-dist@' + pdfjs.version + '/cmaps/',
      cMapPacked: true,
      isEvalSupported: false,
    };

    // Mac Safari: Use additional options for better text rendering
    if (isMacOS && isSafari) {
      return {
        ...baseOptions,
        disableAutoFetch: false,
        disableStream: false,
        rangeChunkSize: 65536,
        useSystemFonts: true,
        standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@' + pdfjs.version + '/standard_fonts/',
      };
    }

    return baseOptions;
  }, []);

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileType = (filename, mimeType) => {
    const extension = (filename || '').split('.').pop()?.toLowerCase() || '';

    // Try extension first
    // Image formats
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(extension)) {
      return 'image';
    }

    // Video formats
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(extension)) {
      return 'video';
    }

    // Audio formats
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(extension)) {
      return 'audio';
    }

    // PDF
    if (extension === 'pdf') {
      return 'pdf';
    }

    // Microsoft Office documents
    if (['doc', 'docx'].includes(extension)) {
      return 'word';
    }

    if (['xls', 'xlsx'].includes(extension)) {
      return 'excel';
    }

    if (['ppt', 'pptx'].includes(extension)) {
      return 'powerpoint';
    }

    // Text files
    if (['txt', 'md', 'json', 'xml', 'csv'].includes(extension)) {
      return 'text';
    }

    // Code files
    if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'html', 'css', 'php', 'rb', 'go'].includes(extension)) {
      return 'code';
    }

    // Archives
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
      return 'archive';
    }

    // ✅ FALLBACK: If extension detection failed, use mimeType
    if (mimeType) {
      // Image types
      if (mimeType.startsWith('image/')) return 'image';

      // Video types
      if (mimeType.startsWith('video/')) return 'video';

      // Audio types
      if (mimeType.startsWith('audio/')) return 'audio';

      // PDF
      if (mimeType === 'application/pdf') return 'pdf';

      // Microsoft Office documents
      if (mimeType.includes('msword') || mimeType.includes('wordprocessingml')) return 'word';
      if (mimeType.includes('excel') || mimeType.includes('spreadsheetml')) return 'excel';
      if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'powerpoint';

      // Text files
      if (mimeType.startsWith('text/')) return 'text';

      // Archives
      if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z') || mimeType.includes('tar') || mimeType.includes('gzip')) {
        return 'archive';
      }
    }

    return 'unknown';
  };

  // Get file icon based on extension
  const getFileIcon = (filename) => {
    if (!filename) return null;
    const extension = filename.split('.').pop().toLowerCase();

    switch (extension) {
      case 'pdf':
        return pdfIcon;
      case 'doc':
      case 'docx':
        return docIcon;
      case 'xls':
      case 'xlsx':
        return xlsIcon;
      case 'ppt':
      case 'pptx':
        return pptxIcon;
      case 'jpg':
      case 'jpeg':
        return jpgIcon;
      case 'png':
        return pngIcon;
      case 'txt':
      case 'md':
        return txtIcon;
      case 'mov':
        return movIcon;
      case 'mp4':
        return mp4Icon;
      case 'mp3':
        return mp3Icon;
      default:
        return txtIcon; // Default to txt icon for unknown types
    }
  };

  // Reset childPreviewCount when document changes
  useEffect(() => {
    setChildPreviewCount(null);
  }, [documentId]);

  useEffect(() => {
    const fetchDocument = async () => {
      try {
        // Fetch only the specific document instead of all documents
        const response = await api.get(`/api/documents/${documentId}/status`);
        const foundDocument = response.data;

        if (foundDocument) {
          setDocument(foundDocument);

          // Store extracted text if available
          if (foundDocument.metadata && foundDocument.metadata.extractedText) {
            setExtractedText(foundDocument.metadata.extractedText);
          }

          // AUTO-REGENERATE: Check if markdown content is missing for Excel (keep for Excel only)
          const isExcel = foundDocument.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          const hasMarkdown = foundDocument.metadata && foundDocument.metadata.markdownContent;

          if (isExcel && !hasMarkdown) {
            // Trigger reprocess in background (don't await, let it run async)
            api.post(`/api/documents/${documentId}/reprocess`)
              .then(response => {
                // Reload document to get updated metadata
                return api.get(`/api/documents/${documentId}/status`);
              })
              .then(response => {
                setDocument(response.data);
              })
              .catch(error => {
              });
          }

          // DOCX FILES: Fetch preview information from backend
          // Backend will return previewType='pdf' with a URL to the converted PDF
          const isDocx = foundDocument.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

          if (isDocx) {
            const previewResponse = await api.get(`/api/documents/${documentId}/preview`);
            const { previewType, previewUrl } = previewResponse.data;
            // For DOCX converted to PDF, set the preview-pdf URL
            if (previewType === 'pdf' && previewUrl) {
              setDocumentUrl(previewUrl);
            }
          } else {
            // For non-DOCX files, use the existing view-url logic
            const viewUrlResponse = await api.get(`/api/documents/${documentId}/view-url`);
            const { url: documentUrl } = viewUrlResponse.data;

            const isStreamEndpoint = documentUrl.includes('/stream');
            if (isStreamEndpoint) {
              setDocumentUrl(documentUrl);
            } else {
              const cacheKey = `document_signed_url_${documentId}`;
              const cachedData = sessionStorage.getItem(cacheKey);
              if (cachedData) {
                try {
                  const { url, timestamp } = JSON.parse(cachedData);
                  const age = Date.now() - timestamp;
                  if (age < 3000000) {
                    setDocumentUrl(url);
                  } else {
                    throw new Error('Cached URL expired');
                  }
                } catch (err) {
                  sessionStorage.removeItem(cacheKey);
                  sessionStorage.setItem(cacheKey, JSON.stringify({ url: documentUrl, timestamp: Date.now() }));
                  setDocumentUrl(documentUrl);
                }
              } else {
                sessionStorage.setItem(cacheKey, JSON.stringify({ url: documentUrl, timestamp: Date.now() }));
                setDocumentUrl(documentUrl);
              }
            }
          }
        }
        setLoading(false);
      } catch (error) {
        console.error('[DocumentViewer] Error fetching document:', {
          documentId,
          errorMessage: error.message,
          errorResponse: error.response?.data,
          errorStatus: error.response?.status,
          errorStatusText: error.response?.statusText,
          fullError: error
        });
        setLoading(false);
      }
    };

    if (documentId) {
      fetchDocument();
    }

    // Cleanup blob URL
    return () => {
      if (documentUrl && documentUrl.startsWith('blob:')) {
        URL.revokeObjectURL(documentUrl);
      }
    };
  }, [documentId]);

  // Add Ctrl+F / Cmd+F keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearchModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Track which page is currently visible using Intersection Observer
  useEffect(() => {
    if (!numPages || numPages === 0) return;

    const observerOptions = {
      root: documentContainerRef.current,
      rootMargin: '-50% 0px -50% 0px', // Trigger when page crosses the center of viewport
      threshold: 0
    };

    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const pageNum = parseInt(entry.target.getAttribute('data-page-number'), 10);
          if (pageNum) {
            setCurrentPage(pageNum);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    // Observe all page elements
    Object.values(pageRefs.current).forEach((pageElement) => {
      if (pageElement) {
        observer.observe(pageElement);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [numPages]);

  const currentFileType = useMemo(() => {
    if (!document?.filename && !document?.mimeType) return 'unknown';
    return getFileType(document?.filename, document?.mimeType);
  }, [document?.filename, document?.mimeType]);

  // PDF: detect scanned (no text layer) up-front so we can disable "Edit text".
  useEffect(() => {
    let cancelled = false;
    async function probePdfText() {
      if (!document?.id) return;
      if (currentFileType !== 'pdf') return;
      try {
        const res = await api.get(`/api/documents/${document.id}/editing/pdf-text?meta=1`);
        if (cancelled) return;
        const charCount = Number(res.data?.charCount || 0);
        if (charCount < 50) {
          setPdfCanEditText(false);
          setPdfEditBlockedMsg('This PDF appears to be scanned (no selectable text).');
        } else {
          setPdfCanEditText(true);
          setPdfEditBlockedMsg('');
        }
      } catch (e) {
        if (cancelled) return;
        // Be conservative: if we can't tell, keep enabled but show a fallback error on click.
        setPdfCanEditText(null);
        setPdfEditBlockedMsg(e?.response?.data?.error || e?.message || '');
      }
    }
    probePdfText();
    return () => { cancelled = true; };
  }, [currentFileType, document?.id]);

  // After a conversion (PDF->DOCX working copy), auto-open Allybi for that new doc.
  useEffect(() => {
    try {
      const key = sessionStorage.getItem('koda_open_allybi_for_doc') || '';
      if (!key) return;
      if (document?.id && String(document.id) === String(key)) {
        sessionStorage.removeItem('koda_open_allybi_for_doc');
        openEditingPanel({ seedSelection: false, focusInput: true });
      }
    } catch {}
  }, [document?.id, openEditingPanel]);

  // Keep formatting toolbar state in sync with the current selection (Word-like).
  const syncDocxToolbarStateFromSelection = useCallback(() => {
    if (currentFileType !== 'word' && currentFileType !== 'pdf') return;
    try {
      const container = documentContainerRef.current;
      const sel = window.getSelection?.();
      if (!container || !sel || sel.rangeCount === 0) return;
      const a = sel.anchorNode;
      const f = sel.focusNode;
      if (!a || !f) return;
      const aEl = a.nodeType === 1 ? a : a.parentElement;
      const fEl = f.nodeType === 1 ? f : f.parentElement;
      if (!aEl || !fEl) return;
      if (!container.contains(aEl) || !container.contains(fEl)) return;

      const bold = Boolean(window.document.queryCommandState?.('bold'));
      const italic = Boolean(window.document.queryCommandState?.('italic'));
      const underline = Boolean(window.document.queryCommandState?.('underline'));
      const strikethrough = Boolean(window.document.queryCommandState?.('strikeThrough'));
      setDocxActiveFormats((prev) => {
        const next = { bold, italic, underline, strikethrough };
        return prev.bold === next.bold &&
          prev.italic === next.italic &&
          prev.underline === next.underline &&
          prev.strikethrough === next.strikethrough
          ? prev
          : next;
      });

      const left = Boolean(window.document.queryCommandState?.('justifyLeft'));
      const center = Boolean(window.document.queryCommandState?.('justifyCenter'));
      const right = Boolean(window.document.queryCommandState?.('justifyRight'));
      const full = Boolean(window.document.queryCommandState?.('justifyFull'));
      const align = center ? 'center' : right ? 'right' : full ? 'justify' : left ? 'left' : '';
      setDocxAlignment((prev) => (prev === align ? prev : align));
    } catch {
      // ignore
    }
  }, [currentFileType]);

  useEffect(() => {
    if (currentFileType !== 'word' && currentFileType !== 'pdf') return;
    const onSel = () => syncDocxToolbarStateFromSelection();
    window.document.addEventListener('selectionchange', onSel);
    return () => window.document.removeEventListener('selectionchange', onSel);
  }, [currentFileType, syncDocxToolbarStateFromSelection]);

  // Deep-link to a specific edit target (used by "Go to location" from receipts/cards).
  useEffect(() => {
    if (!initialTargetParam) return;
    if (currentFileType === 'word') {
      setDocxSelectedId(initialTargetParam);
      // Flash highlight (no borders/boxes).
      setTimeout(() => {
        try {
          const escaped = window.CSS?.escape ? window.CSS.escape(initialTargetParam) : initialTargetParam;
          const el = window.document.querySelector(`[data-paragraph-id="${escaped}"]`);
          if (!el) return;
          const prev = el.style.backgroundColor;
          el.style.backgroundColor = 'rgba(59,130,246,0.10)';
          el.style.transition = 'background-color 180ms ease';
          setTimeout(() => { el.style.backgroundColor = prev || 'transparent'; }, 750);
        } catch {}
      }, 250);
    } else if (currentFileType === 'powerpoint') {
      setSlidesSelectedAnchorId(initialTargetParam);
    }
  }, [currentFileType, initialTargetParam]);

  // Fetch PPTX anchors for top-bar target editing (keeps PPTXPreview as the main viewer).
  useEffect(() => {
    let cancelled = false;
    async function loadSlidesModel() {
      if (!document?.id) return;
      if (currentFileType !== 'powerpoint') return;
      try {
        const res = await api.get(`/api/documents/${document.id}/editing/slides-model`);
        const anchors = Array.isArray(res.data?.anchors) ? res.data.anchors : [];
        if (cancelled) return;
        setSlidesAnchors(anchors);
        setSlidesSelectedAnchorId((prev) => prev || anchors?.[0]?.objectId || '');
      } catch {
        // ignore; PPTX can still render preview even if editing model isn't available
      }
    }
    loadSlidesModel();
    return () => { cancelled = true; };
  }, [currentFileType, document?.id]);

  useEffect(() => {
    if (currentFileType !== 'powerpoint') return;
    const anchors = Array.isArray(slidesAnchors) ? slidesAnchors : [];
    const selected = anchors.find((a) => a?.objectId === slidesSelectedAnchorId) || null;
    if (!selected) return;
    setPptxDraftText((prev) => (!prev || prev === String(selected.text || '') ? String(selected.text || '') : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFileType, slidesSelectedAnchorId]);

  if (loading) {
    return (
      <div style={{ width: '100%', height: '100vh', background: '#F5F5F5' }} />
    );
  }

  if (!document) {
    return (
      <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#6C6B6E', fontSize: 16, fontFamily: 'Plus Jakarta Sans' }}>{t('documentViewer.documentNotFound')}</div>
      </div>
    );
  }

  const makeEditKey = (s) => {
    const sig = String(s?.bundle?.summary || s?.diff?.after || s?.proposedText || '').slice(0, 120);
    return `${s?.documentId || ''}:${s?.operator || ''}:${s?.domain || ''}:${sig}`;
  };

  const upsertEditEntry = (entry) => {
    if (!entry?.id) return;
    setEditSessionsQueue((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      const idx = next.findIndex((x) => x?.id === entry.id);
      if (idx >= 0) next[idx] = { ...next[idx], ...entry };
      else next.unshift(entry);
      return next;
    });
  };

  const patchEditEntry = (id, patch) => {
    if (!id) return;
    setEditSessionsQueue((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      const idx = next.findIndex((x) => x?.id === id);
      if (idx < 0) return next;
      next[idx] = { ...next[idx], ...(patch || {}) };
      return next;
    });
  };

  const getEditTargetId = (session) => {
    // Bundle sessions: jump to the first changed paragraph.
    if (session?.bundle && Array.isArray(session?.bundlePatches)) {
      const first = session.bundlePatches.find((p) => p?.paragraphId) || null;
      if (first?.paragraphId) return String(first.paragraphId);
    }
    const direct =
      String(session?.target?.id || '') ||
      String(session?.targetId || '') ||
      String(session?.targetHint || '');
    if (direct) return direct;

    const candidates = Array.isArray(session?.targetCandidates)
      ? session.targetCandidates
      : Array.isArray(session?.target?.candidates)
        ? session.target.candidates
        : [];
    if (!candidates.length) return '';

    // Draft preview: pick the highest-confidence candidate so the user sees something "live"
    // even if the backend marked the target ambiguous.
    let best = candidates[0];
    for (const c of candidates.slice(1)) {
      const bc = typeof best?.confidence === 'number' ? best.confidence : 0;
      const cc = typeof c?.confidence === 'number' ? c.confidence : 0;
      if (cc > bc) best = c;
    }
    return String(best?.id || '');
  };

  const getDraftAfterText = (session) => {
    // Bundle sessions draft via explicit paragraph patches (no single "afterText").
    if (session?.bundle && Array.isArray(session?.bundlePatches)) return '';
    return String(session?.diff?.after || session?.proposedText || '').trim();
  };

  const draftIntoCanvas = async (draftId, session) => {
    const domain = String(session?.domain || '');
    const targetId = getEditTargetId(session);
    const afterText = getDraftAfterText(session);
    if (domain === 'docx' && session?.bundle && Array.isArray(session?.bundlePatches)) {
      try {
        const bp = session.bundlePatches;
        const first = bp.find((p) => p?.paragraphId) || null;
        const snap = first?.paragraphId ? await docxCanvasRef.current?.snapshotTarget?.(String(first.paragraphId)) : null;
        await docxCanvasRef.current?.applyParagraphPatches?.({ draftId, patches: bp });
        return { ok: true, snapshot: snap };
      } catch (e) {
        return { ok: false, error: e?.message || 'Failed to apply bulk draft preview.' };
      }
    }
    if (!targetId || !afterText) return { ok: false, error: 'Missing target or proposed text.' };

    try {
      if (domain === 'docx') {
        const patches = Array.isArray(session?.patches) ? session.patches : [];
        if (patches.length) {
          const ids = Array.from(new Set(patches.map((p) => String(p?.paragraphId || '')).filter(Boolean)));
          const snap = ids.length ? await docxCanvasRef.current?.snapshotTarget?.(ids[0]) : null;
          await docxCanvasRef.current?.applySpanPatches?.({ draftId, patches });
          return { ok: true, snapshot: snap };
        }
        const snap = await docxCanvasRef.current?.snapshotTarget?.(targetId);
        await docxCanvasRef.current?.applyDraft?.({ draftId, targetId, afterText });
        return { ok: true, snapshot: snap };
      }
      // TODO: sheets/slides in follow-up.
      return { ok: false, error: `Draft preview not supported for domain: ${domain}` };
    } catch (e) {
      return { ok: false, error: e?.message || 'Failed to apply draft preview.' };
    }
  };

  const discardDraftInCanvas = async (draftId, session) => {
    const domain = String(session?.domain || '');
    try {
      if (domain === 'docx') return Boolean(await docxCanvasRef.current?.discardDraft?.({ draftId }));
      return false;
    } catch {
      return false;
    }
  };

  const scrollToDraftTarget = async (session) => {
    const domain = String(session?.domain || '');
    const targetId = getEditTargetId(session);
    if (!targetId) return;
    try {
      if (domain === 'docx') await docxCanvasRef.current?.scrollToTarget?.(targetId);
    } catch {}
  };

  const spotlightDraftTarget = (session) => {
    const domain = String(session?.domain || '');
    if (domain !== 'docx') return false;
    const targetId = getEditTargetId(session);
    if (!targetId) return false;

    try {
      const container = documentContainerRef.current;
      if (!container) return false;
      const containerRect = container.getBoundingClientRect?.();
      const safeId = (() => {
        try {
          if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(targetId);
          }
        } catch {}
        return String(targetId).replace(/"/g, '\\"');
      })();
      const el = container.querySelector?.(`[data-paragraph-id="${safeId}"]`) || null;
      if (!el) return false;

      const rect = el.getBoundingClientRect?.();
      if (!rect || (!rect.width && !rect.height)) return false;

      const pad = 3;
      const top = containerRect ? (rect.top - containerRect.top + container.scrollTop) : rect.top;
      const left = containerRect ? (rect.left - containerRect.left + container.scrollLeft) : rect.left;
      setSelectionOverlay({
        frozen: true,
        rects: [{
          top: Math.max(0, top - pad),
          left: Math.max(0, left - pad),
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
        }],
      });

      const text =
        String(session?.target?.previewText || '').trim() ||
        String(session?.diff?.before || session?.beforeText || '').trim() ||
        String(el.textContent || '').trim();
      setFrozenSelection({
        domain: 'docx',
        paragraphId: targetId,
        text: String(text || '').slice(0, 2000),
      });
      return true;
    } catch {
      return false;
    }
  };

  const applyEditSession = async (entryId, session) => {
    if (!session?.documentId) return;
    patchEditEntry(entryId, { status: 'applying', error: '' });
    setEditorStatusMsg('Applying edit…');

    try {
      // DOCX bundle edits: draft paragraph patches into the canvas for a preview,
      // then apply once to create a single new revision.
      if (String(session?.domain) === 'docx' && String(session?.operator) === 'EDIT_DOCX_BUNDLE' && session?.bundle && Array.isArray(session?.bundlePatches)) {
        await docxCanvasRef.current?.applyParagraphPatches?.({ draftId: entryId, patches: session.bundlePatches });
        const res = await applyEdit({
          instruction: String(session.instruction || '').trim() || `Bulk edit in viewer: ${cleanDocumentName(document?.filename)}`,
          operator: 'EDIT_DOCX_BUNDLE',
          domain: 'docx',
          documentId: session.documentId,
          beforeText: String(session.beforeText || '(bulk edit)'),
          proposedText: String(session.proposedText || ''),
          userConfirmed: true,
        });
        const revisionId = res?.result?.revisionId || res?.result?.restoredRevisionId || res?.revisionId || null;
        patchEditEntry(entryId, { status: 'applied', revisionId, appliedAt: new Date().toISOString() });
        if (revisionId && document?.id && revisionId !== document.id) {
          navigate(buildRoute.document(revisionId));
          return;
        }
        await docxCanvasRef.current?.reload?.();
        setEditorStatusMsg('Applied.');
        setTimeout(() => setEditorStatusMsg(''), 900);
        return;
      }

      // DOCX selection edits: apply patches into the live canvas (preserves surrounding formatting),
      // then commit affected paragraph(s) with proposedHtml.
      const patches = Array.isArray(session?.patches) ? session.patches : [];
      const applyMode = String(session?.applyMode || '').trim();
      if (String(session?.domain) === 'docx' && applyMode === 'prefer_client' && patches.length) {
        const paragraphIds = Array.from(new Set(patches.map((p) => String(p?.paragraphId || '')).filter(Boolean)));
        // Ensure the draft is reflected in the canvas (in case user skipped preview).
        await docxCanvasRef.current?.applySpanPatches?.({ draftId: entryId, patches });
        const committed = await docxCanvasRef.current?.commitParagraphs?.({
          paragraphIds,
          instruction: String(session?.instruction || '').trim() || `Edit in viewer: ${cleanDocumentName(document?.filename)}`,
          operator: String(session?.operator || '') === 'EDIT_SPAN' ? 'EDIT_SPAN' : 'EDIT_PARAGRAPH',
        });
        if (!committed?.ok) {
          patchEditEntry(entryId, { status: 'failed', error: committed?.error || 'Apply failed.' });
          setEditorStatusMsg('');
          return;
        }
        patchEditEntry(entryId, { status: 'applied', revisionId: committed?.revisionId || session?.documentId || null, appliedAt: new Date().toISOString() });
        await docxCanvasRef.current?.reload?.();
        setEditorStatusMsg('Applied.');
        setTimeout(() => setEditorStatusMsg(''), 900);
        return;
      }

      const resolveViewerTarget = () => {
        const direct = session?.target;
        if (direct?.id && direct?.isAmbiguous === false) return direct;

        const candidates = Array.isArray(session?.targetCandidates)
          ? session.targetCandidates
          : Array.isArray(session?.target?.candidates)
            ? session.target.candidates
            : [];
        if (!candidates.length) return direct || undefined;

        const sorted = [...candidates].sort((a, b) => (Number(b?.confidence || 0) - Number(a?.confidence || 0)));
        const best = sorted[0];
        const second = sorted[1] || null;
        const bestConf = typeof best?.confidence === 'number' ? best.confidence : 0;
        const secondConf = typeof second?.confidence === 'number' ? second.confidence : 0;
        const margin = bestConf - secondConf;

        // Only auto-pick when it is clearly the best option; otherwise preserve ambiguity and let backend block.
        if (best?.id && bestConf >= 0.78 && margin >= 0.12) {
          return {
            id: String(best.id),
            label: String(best.label || 'Target'),
            confidence: bestConf,
            candidates: [],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: 'viewer_autopick',
          };
        }

        return direct || undefined;
      };

      const resolvedTarget = resolveViewerTarget();

      const res = await applyEdit({
        instruction: String(session.instruction || '').trim() || `Edit in viewer: ${cleanDocumentName(document?.filename)}`,
        operator: session.operator,
        domain: session.domain,
        documentId: session.documentId,
        targetHint: session?.targetHint || undefined,
        target: resolvedTarget || undefined,
        beforeText: String(session.beforeText || '').trim() || '(empty)',
        proposedText: String(session?.diff?.after || session.proposedText || '').trim() || '(empty)',
        // In the viewer, calling apply is always an explicit user action (or a safe auto-apply policy).
        // We prevent bypassing "always confirm" operators by never auto-applying those operators.
        userConfirmed: true,
      });

      if (res?.requiresUserChoice) {
        patchEditEntry(entryId, { status: 'blocked', error: 'This change needs review (target/confirmation).' });
        setEditorStatusMsg('');
        return;
      }

      const revisionId = res?.result?.revisionId || res?.result?.restoredRevisionId || null;
      patchEditEntry(entryId, { status: 'applied', revisionId, appliedAt: new Date().toISOString() });

      // If edits create a new revision doc, open it; otherwise reload current preview.
      if (revisionId && document?.id && revisionId !== document.id) {
        navigate(buildRoute.document(revisionId));
        return;
      }

      if (String(session.domain) === 'docx') {
        await docxCanvasRef.current?.reload?.();
      } else if (String(session.domain) === 'sheets') {
        await excelCanvasRef.current?.reload?.();
      } else if (String(session.domain) === 'slides') {
        setPreviewVersion((v) => v + 1);
        try {
          const r = await api.get(`/api/documents/${session.documentId}/editing/slides-model`);
          const nextAnchors = Array.isArray(r.data?.anchors) ? r.data.anchors : [];
          setSlidesAnchors(nextAnchors);
          setSlidesSelectedAnchorId((prev) => prev || nextAnchors?.[0]?.objectId || '');
        } catch {}
      }

      setEditorStatusMsg('Applied.');
      setTimeout(() => setEditorStatusMsg(''), 900);
    } catch (e) {
      const msg =
        e?.response?.data?.error?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Apply failed.';
      patchEditEntry(entryId, { status: 'failed', error: msg });
      setEditorStatusMsg('');
    }
  };

  const onEditorAssistantFinal = ({ attachments }) => {
    const a = Array.isArray(attachments) ? attachments : [];
    const sessions = a.filter((x) => x && x.type === 'edit_session');
    if (!sessions.length) return;

    (async () => {
      for (const s of sessions) {
        const id = makeEditKey(s);
        // Viewer behavior: always create a draft preview in the document, then require explicit confirmation.
        upsertEditEntry({
          id,
          session: s,
          status: 'drafted',
          autoApplied: false,
          createdAt: new Date().toISOString(),
        });

        const targetId = getEditTargetId(s);
        setDraftEdits((prev) => {
          const next = Array.isArray(prev) ? [...prev] : [];
          if (!next.some((d) => d?.id === id)) {
            next.unshift({ id, session: s, status: 'drafted', targetId, domain: String(s?.domain || '') });
          }
          return next;
        });
        setActiveDraftId(id);

        // eslint-disable-next-line no-await-in-loop
        const r = await draftIntoCanvas(id, s);
        if (!r?.ok) {
          patchEditEntry(id, { status: 'failed', error: r?.error || 'Draft preview failed.' });
          setDraftEdits((prev) => (Array.isArray(prev) ? prev.map((d) => (d?.id === id ? { ...d, status: 'failed', error: r?.error } : d)) : prev));
          continue;
        }

        // Bring the user to the exact spot, and keep a visible highlight while they work in chat.
        // This makes "open edit preview from receipt" feel concrete and trustworthy.
        try {
          // eslint-disable-next-line no-await-in-loop
          await scrollToDraftTarget(s);
        } catch {}
        setTimeout(() => {
          try { spotlightDraftTarget(s); } catch {}
        }, 220);

        // Auto-apply safe edits so changes reflect in the document immediately (bank-driven).
        const alwaysConfirm = Array.isArray(editingPolicy?.alwaysConfirmOperators) ? editingPolicy.alwaysConfirmOperators : [];
        const op = String(s?.operator || '').trim();
        const isAlwaysConfirm = alwaysConfirm.includes(op);

        const conf = typeof s?.target?.confidence === 'number' ? s.target.confidence : null;
        const isAmbiguous = Boolean(s?.requiresConfirmation) || Boolean(s?.target?.isAmbiguous);
        const minConf = typeof editingPolicy?.silentExecuteConfidence === 'number' ? editingPolicy.silentExecuteConfidence : 0.9;

        const shouldAutoApply =
          !isAlwaysConfirm &&
          !isAmbiguous &&
          conf != null &&
          conf >= minConf;

        if (shouldAutoApply) {
          patchEditEntry(id, { status: 'applying', autoApplied: true, error: '' });
          setDraftEdits((prev) => (Array.isArray(prev) ? prev.map((d) => (d?.id === id ? { ...d, status: 'applying' } : d)) : prev));
          // eslint-disable-next-line no-await-in-loop
          await applyEditSession(id, s);
          // Successful applyEditSession may navigate; still clear local draft state defensively.
          setDraftEdits((prev) => (Array.isArray(prev) ? prev.filter((x) => x?.id !== id) : prev));
          setActiveDraftId((prev) => (prev === id ? '' : prev));
        }
      }
    })();
  };

  const editorAskTab = (
    <div style={{ height: '100%', minHeight: 0 }}>
      <ChatInterface
        currentConversation={editingConversation}
        onConversationUpdate={(u) => setEditingConversation((prev) => ({ ...(prev || {}), ...(u || {}) }))}
        onConversationCreated={(c) => setEditingConversation(c)}
        pinnedDocuments={pinnedDocsForChat}
        conversationCreateTitle={viewerConversationTitle}
        variant="viewer"
        viewerSelection={frozenSelection?.text ? frozenSelection : null}
        onClearViewerSelection={() => clearFrozenSelection()}
        focusNonce={viewerFocusNonce}
        onAssistantFinal={onEditorAssistantFinal}
        apiRef={viewerChatApiRef}
      />
    </div>
  );
  const editorTargetsTab = (
    <TargetsTab
      document={document}
      fileType={currentFileType}
      docxBlocks={docxBlocks}
      docxSelectedId={docxSelectedId}
      onSelectDocxParagraphId={(pid) => {
        if (!pid) return;
        setDocxSelectedId(pid);
        setTimeout(() => {
          try {
            const escaped = window.CSS?.escape ? window.CSS.escape(pid) : pid;
            const el = window.document.querySelector(`[data-paragraph-id="${escaped}"]`);
            el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
          } catch {}
        }, 0);
      }}
      slidesAnchors={slidesAnchors}
      slidesSelectedAnchorId={slidesSelectedAnchorId}
      onSelectSlidesAnchorId={setSlidesSelectedAnchorId}
      onSlidesApplied={() => {
        setPreviewVersion((v) => v + 1);
      }}
    />
  );

  const editorChangesTab = (
    <ChangesTab
      entries={editSessionsQueue}
      onOpenDoc={(id) => {
        if (!id) return;
        navigate(buildRoute.document(id));
      }}
      onRetry={(entry) => {
        const s = entry?.session;
        if (!s) return;
        applyEditSession(entry?.id, s);
      }}
      onUndo={async (entry) => {
        const s = entry?.session;
        if (!s?.documentId) return;
        try {
          await undoEdit({ documentId: s.documentId, revisionId: entry?.revisionId || undefined });
          // Reload preview for current doc.
          if (String(s.domain) === 'docx') await docxCanvasRef.current?.reload?.();
          if (String(s.domain) === 'sheets') await excelCanvasRef.current?.reload?.();
          if (String(s.domain) === 'slides') setPreviewVersion((v) => v + 1);
        } catch (e) {
          // Keep errors in the entry.
          const msg = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Undo failed.';
          patchEditEntry(entry?.id, { status: 'failed', error: msg });
        }
      }}
      onGoToTarget={(entry) => {
        const s = entry?.session || {};
        const tid = s?.target?.id || s?.targetId || '';
        if (!tid) return;
        if (String(s.domain) === 'docx') {
          setDocxSelectedId(tid);
          setTimeout(() => {
            try {
              const escaped = window.CSS?.escape ? window.CSS.escape(tid) : tid;
              const el = window.document.querySelector(`[data-paragraph-id="${escaped}"]`);
              if (!el) return;
              el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
              const prev = el.style.backgroundColor;
              el.style.backgroundColor = 'rgba(59,130,246,0.10)';
              el.style.transition = 'background-color 180ms ease';
              setTimeout(() => { el.style.backgroundColor = prev || 'transparent'; }, 750);
            } catch {}
          }, 0);
        } else if (String(s.domain) === 'slides') {
          setSlidesSelectedAnchorId(tid);
        } else if (String(s.domain) === 'pdf') {
          // PDF edits require a working copy (PDF -> DOCX).
          convertPdfToDocxWorkingCopy();
        }
      }}
    />
  );

  // NOTE: These are computed inline (no hooks) because DocumentViewer has early returns.
  const activeDraft = (() => {
    const list = Array.isArray(draftEdits) ? draftEdits : [];
    if (activeDraftId) return list.find((d) => d?.id === activeDraftId) || list[0] || null;
    return list[0] || null;
  })();

  const pendingDraftCount = (() => {
    const list = Array.isArray(draftEdits) ? draftEdits : [];
    return list.filter((d) => d && (d.status === 'drafted' || d.status === 'applying')).length;
  })();

  const applyActiveDraft = async () => {
    const d = activeDraft;
    if (!d?.id || !d?.session) return;
    setDraftEdits((prev) => (Array.isArray(prev) ? prev.map((x) => (x?.id === d.id ? { ...x, status: 'applying' } : x)) : prev));
    patchEditEntry(d.id, { status: 'applying', error: '' });
    await applyEditSession(d.id, d.session);
    // Successful applyEditSession may navigate; still clear local draft state defensively.
    setDraftEdits((prev) => (Array.isArray(prev) ? prev.filter((x) => x?.id !== d.id) : prev));
    setActiveDraftId((prev) => (prev === d.id ? '' : prev));
  };

  const discardActiveDraft = async () => {
    const d = activeDraft;
    if (!d?.id || !d?.session) return;
    await discardDraftInCanvas(d.id, d.session);
    patchEditEntry(d.id, { status: 'discarded' });
    setDraftEdits((prev) => (Array.isArray(prev) ? prev.filter((x) => x?.id !== d.id) : prev));
    setActiveDraftId((prev) => (prev === d.id ? '' : prev));
  };

  const jumpToActiveDraft = async () => {
    const d = activeDraft;
    if (!d?.session) return;
    await scrollToDraftTarget(d.session);
  };

  const assistantConfirmStrip = !pendingDraftCount ? null : (
    <div
      style={{
        height: 46,
        padding: '0 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        borderBottom: '1px solid #E6E6EC',
        background: 'rgba(255,255,255,0.92)',
      }}
    >
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            border: '1px solid rgba(17,24,39,0.12)',
            background: 'rgba(17,24,39,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          title="Draft"
        >
          <img src={sphereIcon} alt="" style={{ width: 16, height: 16 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 950, fontSize: 12, color: '#111827' }}>
            {pendingDraftCount} draft change{pendingDraftCount === 1 ? '' : 's'}
          </div>
          <div
            style={{
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: 700,
              fontSize: 11,
              color: '#6B7280',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={String(activeDraft?.session?.locationLabel || activeDraft?.session?.target?.label || '')}
          >
            {String(activeDraft?.session?.locationLabel || activeDraft?.session?.target?.label || '').trim() || 'Change ready'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => jumpToActiveDraft()}
          style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 999,
            border: '1px solid #E6E6EC',
            background: 'white',
            cursor: 'pointer',
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: 900,
            fontSize: 12,
            color: '#111827',
          }}
          title="Jump to change"
        >
          Jump
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => discardActiveDraft()}
          style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 999,
            border: '1px solid #E6E6EC',
            background: 'white',
            cursor: 'pointer',
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: 900,
            fontSize: 12,
            color: '#111827',
          }}
          title="Discard draft"
        >
          Discard
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyActiveDraft()}
          style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 999,
            border: '1px solid #111827',
            background: '#111827',
            cursor: 'pointer',
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: 900,
            fontSize: 12,
            color: 'white',
            opacity: activeDraft?.status === 'applying' ? 0.7 : 1,
          }}
          disabled={activeDraft?.status === 'applying'}
          title="Apply and save as new version"
        >
          Apply
        </button>
      </div>
    </div>
  );

  // Right panel: chat-only (viewer-scoped). Draft confirmations sit above the chat stream.
  const assistantRightPanel = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          height: 48,
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #E6E6EC',
          background: 'rgba(255,255,255,0.92)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <img src={sphereIcon} alt="" style={{ width: 16, height: 16, flexShrink: 0 }} />
          <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 950, fontSize: 12, color: '#111827' }}>
            Ask Allybi
          </div>
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setEditingOpen(false);
            clearFrozenSelection();
            deleteViewerConversationIfNeeded();
          }}
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            border: '1px solid #E6E6EC',
            background: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Close"
        >
          <CloseIcon style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {assistantConfirmStrip}

      <div style={{ flex: 1, minHeight: 0 }}>
        {editorAskTab}
      </div>
    </div>
  );

  const clip = (s, n = 48) => {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    if (!t) return '';
    return t.length <= n ? t : t.slice(0, n).trimEnd() + '…';
  };

  const isEditableType = currentFileType !== 'image';

  const applyPptxRewrite = async () => {
    if (!document?.id) return;
    const anchors = Array.isArray(slidesAnchors) ? slidesAnchors : [];
    const selected = anchors.find((a) => a?.objectId === slidesSelectedAnchorId) || null;
    if (!selected) {
      setPptxStatusMsg('Select a text target first.');
      return;
    }
    const beforeText = String(selected.text || '').trim();
    const proposedText = String(pptxDraftText || '').trim();
    if (!proposedText) {
      setPptxStatusMsg('Cannot apply empty text.');
      return;
    }
    if (beforeText === proposedText) {
      setPptxStatusMsg('No changes to apply.');
      return;
    }

    setPptxApplying(true);
    setPptxStatusMsg('');
    try {
      await applyEdit({
        instruction: `Manual edit in viewer: ${cleanDocumentName(document?.filename)}`,
        operator: 'REWRITE_SLIDE_TEXT',
        domain: 'slides',
        documentId: document.id,
        targetHint: selected.objectId,
        target: {
          id: selected.objectId,
          label: `${selected.label} (Slide ${selected.slideNumber})`,
          confidence: 1,
          candidates: [],
          decisionMargin: 1,
          isAmbiguous: false,
          resolutionReason: 'viewer_selection',
        },
        beforeText: beforeText || '(empty)',
        proposedText,
        slidesCandidates: anchors.slice(0, 3).map((a) => ({
          objectId: a.objectId,
          label: a.label,
          text: a.text,
          slideNumber: a.slideNumber,
        })),
        userConfirmed: true,
      });

      setPptxStatusMsg('Applied. Refreshing preview…');
      setPreviewVersion((v) => v + 1);
      // Reload anchors after apply
      try {
        const res = await api.get(`/api/documents/${document.id}/editing/slides-model`);
        const nextAnchors = Array.isArray(res.data?.anchors) ? res.data.anchors : [];
        setSlidesAnchors(nextAnchors);
      } catch {}
      setPptxStatusMsg('Applied.');
      setTimeout(() => setPptxStatusMsg(''), 1500);
    } catch (e) {
      setPptxStatusMsg(e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Apply failed.');
    } finally {
      setPptxApplying(false);
    }
  };

  const applyPptxAddSlide = async () => {
    if (!document?.id) return;
    setPptxApplying(true);
    setPptxStatusMsg('');
    try {
      await applyEdit({
        instruction: `Manual add slide in viewer: ${cleanDocumentName(document?.filename)}`,
        operator: 'ADD_SLIDE',
        domain: 'slides',
        documentId: document.id,
        beforeText: 'ADD_SLIDE',
        proposedText: pptxLayout,
        userConfirmed: true,
      });
      setPptxStatusMsg('Slide added. Refreshing preview…');
      setPreviewVersion((v) => v + 1);
      setPptxStatusMsg('Slide added.');
      setTimeout(() => setPptxStatusMsg(''), 1500);
    } catch (e) {
      setPptxStatusMsg(e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Add slide failed.');
    } finally {
      setPptxApplying(false);
    }
  };

  const convertPdfToDocxWorkingCopy = async () => {
    if (!document?.id) return;

    // If we already know this PDF is scanned, block early.
    if (pdfCanEditText === false) {
      showError(pdfEditBlockedMsg || 'This PDF appears to be scanned (no selectable text).');
      return;
    }

    setPdfStatusMsg('Preparing editable copy…');
    try {
      const res = await api.post(`/api/documents/${document.id}/editing/pdf-to-docx`, {});
      const createdId = res.data?.createdDocumentId || null;
      if (!createdId) throw new Error('Failed to create editable copy.');

      setPdfStatusMsg('Opening editable copy…');
      try { sessionStorage.setItem('koda_open_allybi_for_doc', String(createdId)); } catch {}
      navigate(buildRoute(ROUTES.DOCUMENT_VIEW, { id: createdId }));
    } catch (e) {
      const status = Number(e?.response?.status || 0);
      const rawMsg = e?.response?.data?.error || e?.message || 'Failed to create editable copy.';
      const msg = (() => {
        if (status === 404) {
          return 'Your backend does not have the PDF conversion endpoint. Make sure you are running the latest backend on localhost:5000 (cd backend && npm run dev), and that the frontend API URL points to that server.';
        }
        if (status === 503 && String(rawMsg).toLowerCase().includes('cloudconvert')) {
          return 'Conversion is not configured locally. Set CLOUDCONVERT_API_KEY in backend/.env and restart the backend.';
        }
        if (status === 422) {
          return String(rawMsg || 'This PDF appears to be scanned (no selectable text).');
        }
        return String(rawMsg);
      })();
      if (status === 422) {
        setPdfCanEditText(false);
        setPdfEditBlockedMsg(String(msg || 'This PDF appears to be scanned (no selectable text).'));
      }
      showError(String(msg));
      setPdfStatusMsg('');
    }
  };

  const renderEditingToolsBar = () => {
    // Show the Allybi toolbar for all editable document formats (not for images).
    if (!isEditableType) return null;

    const toolbarType = currentFileType;
    const wordCanvasRef = docxCanvasRef;

    const exec = (cmd) => wordCanvasRef.current?.exec?.(cmd);
    const applyDocxStyle = () =>
      wordCanvasRef.current?.wrapSelectionStyle?.({ color: docxColorHex, 'font-size': docxFontSizePx, 'font-family': docxFontFamily });

    const onDocxCommand = (cmd) => {
      if (!cmd) return;
      // Toolbar clicks can steal focus; restore the last selection before applying commands.
      wordCanvasRef.current?.restoreSelection?.();
      if (typeof cmd === 'object' && cmd?.type === 'applyStyle') {
        // Apply explicit styles immediately (toolbar has no "Style" button).
        wordCanvasRef.current?.wrapSelectionStyle?.(cmd.style || {});
        setTimeout(() => syncDocxToolbarStateFromSelection(), 0);
        return;
      }
      if (cmd === 'applyStyle') {
        applyDocxStyle();
        setTimeout(() => syncDocxToolbarStateFromSelection(), 0);
        return;
      }
      exec(cmd);
      setTimeout(() => syncDocxToolbarStateFromSelection(), 0);
    };

    const anchors = Array.isArray(slidesAnchors) ? slidesAnchors : [];
    const pptxTargets = anchors.map((a) => ({ value: a.objectId, label: `Slide ${a.slideNumber} • ${a.label}` }));
    const pptxSelected = anchors.find((a) => a?.objectId === slidesSelectedAnchorId) || null;

    return (
      <AllybiEditingToolbar
        fileType={toolbarType}
        zoom={zoom}
        onZoomChange={setZoom}

        fontFamily={docxFontFamily}
        onFontFamilyChange={setDocxFontFamily}
        fontSize={docxFontSizePx}
        onFontSizeChange={setDocxFontSizePx}
        colorHex={docxColorHex}
        onColorHexChange={setDocxColorHex}
        activeFormats={docxActiveFormats}
        alignment={docxAlignment}
        onCommand={(cmd) => {
          const canFormat = toolbarType === 'word';
          if (!canFormat) return;
          onDocxCommand(cmd);
        }}

        excelDraftValue={excelDraftValue}
        onExcelDraftValueChange={setExcelDraftValue}
        onExcelApply={() => excelCanvasRef.current?.apply?.()}
        onExcelRevert={() => excelCanvasRef.current?.revert?.()}
        excelCanApply={Boolean(excelSelectedInfo)}
        excelSelectedInfo={excelSelectedInfo}
        excelSheetMeta={excelSheetMeta}
        onExcelPrevSheet={() => excelCanvasRef.current?.prevSheet?.()}
        onExcelNextSheet={() => excelCanvasRef.current?.nextSheet?.()}
        onExcelSetSheetIndex={(i) => excelCanvasRef.current?.setActiveSheet?.(i)}
        excelStatusMsg={currentFileType === 'excel' ? editorStatusMsg : ''}

        pptxTargets={pptxTargets}
        pptxSelectedTargetId={slidesSelectedAnchorId}
        onPptxSelectTargetId={setSlidesSelectedAnchorId}
        pptxDraftText={pptxDraftText}
        onPptxDraftTextChange={setPptxDraftText}
        onPptxApplyRewrite={applyPptxRewrite}
        pptxCanApplyRewrite={Boolean(pptxSelected) && Boolean(String(pptxDraftText || '').trim()) && !pptxApplying}
        pptxLayout={pptxLayout}
        onPptxLayoutChange={setPptxLayout}
        onPptxAddSlide={applyPptxAddSlide}
        pptxBusy={pptxApplying}
        onPptxOpenStudio={() => {
          if (!document?.id) return;
          navigate(buildRoute.documentStudio(document.id));
        }}

        onPdfSave={null}
        onPdfRevert={null}
        pdfIsEditingText={false}
        pdfCanEditText={pdfCanEditText !== false}
        onPdfToggleEditText={convertPdfToDocxWorkingCopy}
      />
    );
  };

  const previewCanvas = (
    <div
      ref={documentContainerRef}
      className="document-container"
      onMouseUp={() => updateSelectionBubbleFromDom()}
      onKeyUp={() => updateSelectionBubbleFromDom()}
      style={{
        width: '100%',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        padding: isMobile ? 8 : 24,
        overflow: 'auto',
        overflowX: 'auto',
        overflowY: 'auto',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
        display: 'flex',
        position: 'relative',
        background: '#F5F5F5',
        WebkitOverflowScrolling: 'touch',
        boxShadow: 'none',
        borderTop: '1px solid #E6E6EC',
        scrollbarGutter: 'stable'
      }}
    >
      {/* Frozen selection overlay: stays attached to the selected content while scrolling. */}
      {selectionOverlay?.frozen && Array.isArray(selectionOverlay?.rects) && selectionOverlay.rects.length ? (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
          {selectionOverlay.rects.map((r, idx) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              style={{
                position: 'absolute',
                top: r.top,
                left: r.left,
                width: r.width,
                height: r.height,
                background: 'rgba(17, 24, 39, 0.10)',
                borderRadius: 6,
                boxShadow: 'inset 0 0 0 1px rgba(17, 24, 39, 0.10)',
              }}
            />
          ))}
        </div>
      ) : null}
      {document ? (
        (() => {
          const fileType = getFileType(document.filename, document.mimeType);

        // For other file types, keep existing rendering
        if (!documentUrl) {
          return null;
        }

        switch (fileType) {
          case 'word': { // DOCX - show as PDF (converted during upload)
            // Preview mode: DOCX files are converted to PDF on the backend and displayed as PDF.
            // Edit mode: show a paragraph-level HTML canvas editor.
            // Zoom: apply a visual scale so the toolbar zoom control actually works for the HTML editor.
            // (We avoid CSS `zoom` for cross-browser consistency.)
            const docxScale = Math.max(0.5, Math.min(2, Number(zoom || 100) / 100));
            return (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                <Suspense fallback={null}>
                  <div
                    style={{
                      width: `${100 / docxScale}%`,
                      transform: `scale(${docxScale})`,
                      transformOrigin: 'top center',
                      display: 'flex',
                      justifyContent: 'center',
                    }}
                  >
                    <DocxEditCanvas
                      document={document}
                      selectedId={docxSelectedId}
                      onSelectedIdChange={setDocxSelectedId}
                      onBlocksLoaded={setDocxBlocks}
                      hideToolbar
                      readOnly={false}
                      autoSaveOnBlur
                      ref={docxCanvasRef}
                      onStatusMsg={setEditorStatusMsg}
                      onApplied={() => setPreviewVersion(v => v + 1)}
                    />
                  </div>
                </Suspense>
              </div>
            );
          }

                case 'excel': // XLSX - always editable; Ask Allybi only toggles the assistant panel
                  return (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                      <Suspense fallback={null}>
	                        <ExcelEditCanvas
	                          ref={excelCanvasRef}
	                          document={document}
	                          zoom={zoom}
	                          hideToolbar
	                          hideSheetTabs
	                          draftValue={excelDraftValue}
	                          onDraftValueChange={setExcelDraftValue}
	                          onSelectedInfoChange={setExcelSelectedInfo}
	                          onAskAllybi={(sel) => {
	                            if (!sel?.text) return;
	                            // Seed the viewer chat with a stable sheet selection payload.
	                            setFrozenSelection(sel);
	                            setEditingOpen(true);
	                            setSelectionOverlay({ rects: [], frozen: false });
	                            setViewerFocusNonce((n) => n + 1);
	                          }}
	                          onStatusMsg={setEditorStatusMsg}
	                          onSheetMetaChange={setExcelSheetMeta}
	                          onApplied={() => setPreviewVersion(v => v + 1)}
	                          onCountUpdate={setChildPreviewCount}
	                        />
                      </Suspense>
                    </div>
                  );

                case 'powerpoint': // PPTX - show with PPTXPreview component
                  return (
                    <Suspense fallback={null}>
                      <PPTXPreview document={document} zoom={zoom} version={previewVersion} onCountUpdate={setChildPreviewCount} />
                    </Suspense>
                  );

                case 'pdf': {
                  // Always render the real PDF normally (react-pdf).
                  // "Edit text" creates a DOCX working copy (PDF->DOCX) and opens it for editing.
                  const pageWidth = getPdfPageWidth();
                  const hasNumPages = Number.isFinite(numPages) && Number(numPages) > 0;
                  return (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                      {fileConfig ? (
                        <Document
                          // Changing the URL should fully reset internal pdf.js state.
                          key={String(actualDocumentUrl || documentUrl || document?.id || 'pdf')}
                          file={fileConfig}
                          onLoadSuccess={(info) => {
                            pageRefs.current = {};
                            onDocumentLoadSuccess(info);
                          }}
                          options={pdfOptions}
                          loading={
                            <div style={{ padding: 24, fontFamily: 'Plus Jakarta Sans', fontWeight: 700, color: '#6B7280' }}>
                              Loading PDF…
                            </div>
                          }
                          error={
                            <div style={{ padding: 24, fontFamily: 'Plus Jakarta Sans', fontWeight: 700, color: '#991B1B' }}>
                              Failed to load PDF preview.
                            </div>
                          }
                          onLoadError={() => {
                            // Keep viewer resilient; PDF failures are handled by the empty-state UI.
                          }}
                        >
                          {/* Important: don't render any <Page> until numPages is known.
                              Rendering a fake page then expanding to N pages can trigger pdf.js DOM errors
                              like "Node cannot be found in the current page." */}
                          {hasNumPages ? (
                            Array.from(new Array(numPages), (el, index) => (
                              <div
                                key={`page_${index + 1}`}
                                data-page-number={index + 1}
                                ref={(ref) => {
                                  pageRefs.current[index + 1] = ref;
                                }}
                                style={{
                                  marginBottom: 20,
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                  borderRadius: 8,
                                  overflow: 'hidden',
                                  background: 'white'
                                }}
                              >
                                <Page
                                  pageNumber={index + 1}
                                  width={pageWidth}
                                  renderTextLayer
                                  renderAnnotationLayer
                                  loading={
                                    <div style={{ padding: 24, fontFamily: 'Plus Jakarta Sans', fontWeight: 700, color: '#6B7280' }}>
                                      Rendering…
                                    </div>
                                  }
                                />
                              </div>
                            ))
                          ) : null}
                        </Document>
                      ) : null}
                    </div>
                  );
                }

                case 'image':
                  return (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {imageLoading && !imageError && (
                  <div style={{ minHeight: 200 }} />
                )}
                {imageError ? (
                  <div style={{
                    padding: 40,
                    background: 'white',
                    borderRadius: 12,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 64, marginBottom: 20 }}>🖼️</div>
                    <div style={{ fontSize: 18, fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans', marginBottom: 12 }}>
                      Failed to load image
                    </div>
                    <div style={{ fontSize: 14, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', marginBottom: 24 }}>
                      {cleanDocumentName(document.filename)}
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => {
                          setImageLoading(true);
                          setImageError(false);
                          setImageRetryNonce((n) => n + 1);
                        }}
                        style={{
                          display: 'inline-block',
                          padding: '12px 18px',
                          background: 'white',
                          color: '#181818',
                          borderRadius: 14,
                          fontSize: 14,
                          fontWeight: '600',
                          fontFamily: 'Plus Jakarta Sans',
                          border: '1px solid #E6E6EC',
                          cursor: 'pointer'
                        }}>
                        Retry
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const response = await api.get(`/api/documents/${document.id}/download`);
                            const downloadUrl = response.data.url;
                            safariDownloadFile(downloadUrl, document.filename);
                          } catch (error) {
                            showError(t('alerts.failedToDownload'));
                          }
                        }}
                        style={{
                          display: 'inline-block',
                          padding: '12px 18px',
                          background: 'rgba(24, 24, 24, 0.90)',
                          color: 'white',
                          borderRadius: 14,
                          textDecoration: 'none',
                          fontSize: 14,
                          fontWeight: '600',
                          fontFamily: 'Plus Jakarta Sans',
                          border: 'none',
                          cursor: 'pointer'
                        }}>
                        {isSafari() || isIOS() ? t('documentViewer.openImage') : t('documentViewer.downloadImage')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <img
                    key={`img-${imageRetryNonce}`}
                    src={actualDocumentUrl}
                    alt={cleanDocumentName(document.filename)}
                    onLoad={(e) => {
                      setImageLoading(false);
                    }}
                    onError={(e) => {
                      setImageLoading(false);
                      setImageError(true);
                    }}
                    style={{
                      width: 'auto',
                      height: 'auto',
                      maxWidth: '100%',
                      maxHeight: '80vh',
                      transform: `scale(${zoom / 100})`,
                      transformOrigin: 'top left',
                      objectFit: 'contain',
                      borderRadius: 8,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      background: 'white',
                      transition: 'transform 0.2s ease',
                      display: imageLoading ? 'none' : 'block'
                    }}
                  />
                )}
              </div>
            );

          case 'video':
            return (
              <div style={{
                display: 'inline-block',
                maxWidth: '100%',
                maxHeight: '80vh'
              }}>
                <video
                  src={documentUrl}
                  controls
                  preload="metadata"
                  playsInline
                  onLoadedMetadata={(e) => {
                  }}
                  onError={(e) => {
                  }}
                  style={{
                    width: 'auto',
                    height: 'auto',
                    maxWidth: '100%',
                    maxHeight: '80vh',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    background: 'black'
                  }}
                >
                  <source src={documentUrl} type={document.mimeType || 'video/mp4'} />
                  Your browser does not support video playback.
                </video>
              </div>
            );

          case 'audio':
            return (
              <div style={{
                background: 'white',
                padding: 40,
                borderRadius: 12,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                textAlign: 'center',
                maxWidth: '500px',
                width: '100%'
              }}>
                <div style={{ fontSize: 48, marginBottom: 20 }}>🎵</div>
                <div style={{ fontSize: 18, fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans', marginBottom: 20 }}>
                  {cleanDocumentName(document.filename)}
                </div>
                <audio src={documentUrl} controls style={{ width: '100%' }}>
                  Your browser does not support audio playback.
                </audio>
              </div>
            );

          case 'text':
          case 'code':
            return <TextCodePreview url={documentUrl} document={document} zoom={zoom} />;

          case 'archive':
            return (
              <div style={{
                background: 'white',
                padding: 40,
                borderRadius: 12,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                textAlign: 'center',
                maxWidth: '500px',
                width: '100%'
              }}>
                <div style={{ fontSize: 64, marginBottom: 20 }}>📦</div>
                <div style={{ fontSize: 18, fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans', marginBottom: 12 }}>
                  Archive File
                </div>
                <div style={{ fontSize: 14, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', marginBottom: 24 }}>
                  {cleanDocumentName(document.filename)}
                </div>
                <div style={{
                  padding: 12,
                  background: '#F5F5F5',
                  borderRadius: 6,
                  fontSize: 14,
                  color: '#6C6B6E',
                  marginBottom: 20
                }}>
                  Archive files cannot be previewed. Download to extract contents.
                </div>
                <a href={documentUrl} download={cleanDocumentName(document.filename)} style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  background: 'rgba(24, 24, 24, 0.90)',
                  color: 'white',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: '600',
                  fontFamily: 'Plus Jakarta Sans'
                }}>
                  Download File
                </a>
              </div>
            );

          default:
            return (
              <div style={{
                background: 'white',
                padding: 40,
                borderRadius: 12,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                textAlign: 'center',
                maxWidth: '500px',
                width: '100%'
              }}>
                <div style={{ fontSize: 64, marginBottom: 20 }}>📄</div>
                <div style={{ fontSize: 18, fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans', marginBottom: 12 }}>
                  Preview Not Available
                </div>
                <div style={{ fontSize: 14, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', marginBottom: 24 }}>
                  {cleanDocumentName(document.filename)}
                </div>
                <div style={{
                  padding: 12,
                  background: '#F5F5F5',
                  borderRadius: 6,
                  fontSize: 14,
                  color: '#6C6B6E',
                  marginBottom: 20
                }}>
                  This file type cannot be previewed in the browser.
                </div>
                <a href={documentUrl} download={cleanDocumentName(document.filename)} style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  background: 'rgba(24, 24, 24, 0.90)',
                  color: 'white',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: '600',
                  fontFamily: 'Plus Jakarta Sans'
                }}>
                  Download File
                </a>
              </div>
            );
        }
        })()
      ) : null}
    </div>
  );

  return (
    <div style={{ width: '100%', height: '100dvh', position: 'relative', background: '#F5F5F5', overflow: 'hidden', justifyContent: 'flex-start', alignItems: 'stretch', display: 'flex' }}>
        {!isMobile && <LeftNav onNotificationClick={() => setShowNotificationsPopup(true)} />}
        <div style={{ flex: '1 1 0', height: '100%', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', display: 'flex', width: '100%', minWidth: 0, minHeight: 0 }}>
          {/* Header */}
          <div style={{
            alignSelf: 'stretch',
            minHeight: isMobile ? 'auto' : 96,
            padding: isMobile ? 12 : 16,
            background: 'white',
            borderBottom: '1px #E6E6EC solid',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: isMobile ? 8 : 12,
            display: 'flex',
            flexWrap: isMobile ? 'wrap' : 'nowrap'
          }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              width: isMobile ? 36 : 42,
              height: isMobile ? 36 : 42,
              background: 'white',
              borderRadius: 100,
              outline: '1px #E6E6EC solid',
              outlineOffset: '-1px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.2s ease',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F5F5F5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white';
            }}
          >
            <ArrowLeftIcon style={{ width: 18, height: 18, stroke: '#181818' }} />
          </button>

          <div style={{ flex: '1 1 0', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start', gap: isMobile ? 4 : 8, display: 'inline-flex', minWidth: 0, overflow: 'hidden' }}>
            {/* Breadcrumb - hidden on mobile */}
            {!isMobile && (
              <div style={{ justifyContent: 'flex-start', alignItems: 'center', display: 'inline-flex' }}>
                <div style={{ justifyContent: 'flex-start', alignItems: 'center', gap: 4, display: 'flex', flexWrap: 'wrap' }}>
                  {/* Home or Documents */}
                  <InlineNavPill
                    label={breadcrumbStart.label}
                    onClick={() => navigate(breadcrumbStart.path)}
                    style={{ height: 32 }}
                  />
                  {/* Category (if document has folderId) */}
                  {document.folderId && (() => {
                    const allFolders = getRootFolders();
                    const category = allFolders.find(cat => cat.id === document.folderId);
                    return category ? (
                      <React.Fragment>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}><path d="M7.5 4.5L13 10L7.5 15.5" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <InlineNavPill
                          label={category.name}
                          icon={<img src={folderIcon} alt="" style={{ width: 20, height: 20 }} />}
                          style={{ height: 32 }}
                        />
                      </React.Fragment>
                    ) : null;
                  })()}
                  {/* Folder path (if exists) */}
                  {document.folderPath && document.folderPath.split('/').filter(Boolean).map((folder, index) => (
                    <React.Fragment key={index}>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}><path d="M7.5 4.5L13 10L7.5 15.5" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <InlineNavPill
                        label={folder}
                        icon={<img src={folderIcon} alt="" style={{ width: 20, height: 20 }} />}
                        style={{ height: 32 }}
                      />
                    </React.Fragment>
                  ))}
                  {/* File name */}
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}><path d="M7.5 4.5L13 10L7.5 15.5" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <InlineNavPill
                    label={cleanDocumentName(document.filename)}
                    style={{ height: 32, background: '#F9FAFB' }}
                  />
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', overflow: 'hidden' }}>
              <img
                src={getFileIcon(document.filename)}
                alt=""
                style={{
                  width: isMobile ? 32 : 38,
                  height: isMobile ? 32 : 38,
                  objectFit: 'contain',
                  flexShrink: 0
                }}
              />
              <span style={{
                color: '#323232',
                fontSize: isMobile ? 16 : 20,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '700',
                lineHeight: isMobile ? '22px' : '30px',
                wordWrap: 'break-word',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>{cleanDocumentName(document.filename)}</span>
            </div>
          </div>

          {/* Action buttons - simplified on mobile */}
          {!isMobile ? (
            <div style={{ borderRadius: 12, justifyContent: 'flex-end', alignItems: 'center', display: 'flex' }}>
              {/* Utility icons group - trash & print */}
              <div style={{ justifyContent: 'flex-start', alignItems: 'center', gap: 8, display: 'flex', marginRight: 20 }}>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  style={{ width: 42, height: 42, background: 'white', overflow: 'hidden', borderRadius: 100, border: '1px solid #E6E6EC', justifyContent: 'center', alignItems: 'center', display: 'flex', cursor: 'pointer', transition: 'all 0.2s ease' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#FEF2F2';
                    e.currentTarget.style.borderColor = '#FECACA';
                    e.currentTarget.querySelector('svg').style.stroke = '#C04040';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.borderColor = '#E6E6EC';
                    e.currentTarget.querySelector('svg').style.stroke = '#181818';
                  }}
                >
                  <TrashCanIcon style={{ width: 20, height: 20, stroke: '#181818', transition: 'stroke 0.2s ease' }} />
                </button>
              <button
                onClick={async () => {
                  if (document) {
                    try {
                      const docType = getFileType(document.filename, document.mimeType);

                      // Helper function to print using hidden iframe (no new tab)
                      // Uses afterprint event to clean up only after print dialog closes
                      const printWithIframe = (htmlContent, blobUrlToRevoke = null) => {
                        const iframe = window.document.createElement('iframe');
                        iframe.style.position = 'absolute';
                        iframe.style.width = '0';
                        iframe.style.height = '0';
                        iframe.style.border = 'none';
                        iframe.style.left = '-9999px';
                        window.document.body.appendChild(iframe);

                        const iframeDoc = iframe.contentWindow.document;
                        iframeDoc.open();
                        iframeDoc.write(htmlContent);
                        iframeDoc.close();

                        // Cleanup function - only runs after print dialog closes
                        let cleanedUp = false;
                        const cleanup = () => {
                          if (cleanedUp) return;
                          cleanedUp = true;
                          if (iframe.parentNode) {
                            window.document.body.removeChild(iframe);
                          }
                          if (blobUrlToRevoke) {
                            window.URL.revokeObjectURL(blobUrlToRevoke);
                          }
                        };

                        // Wait for content to load then print
                        iframe.onload = () => {
                          setTimeout(() => {
                            // Listen for afterprint event on the iframe's window
                            iframe.contentWindow.onafterprint = cleanup;

                            // Also listen on main window as fallback
                            const mainWindowCleanup = () => {
                              cleanup();
                              window.removeEventListener('afterprint', mainWindowCleanup);
                            };
                            window.addEventListener('afterprint', mainWindowCleanup);

                            iframe.contentWindow.focus();
                            iframe.contentWindow.print();

                            // Fallback cleanup after 60 seconds (in case afterprint doesn't fire)
                            setTimeout(cleanup, 60000);
                          }, 500);
                        };
                      };

                      // For PPTX files - fetch slides and print
                      if (docType === 'powerpoint') {
                        try {
                          const slidesResponse = await api.get(`/api/documents/${documentId}/slides`);
                          if (slidesResponse.data.success && slidesResponse.data.slides?.length > 0) {
                            const slides = slidesResponse.data.slides;

                            // Create printable HTML with only slide content (no headers/names)
                            const htmlContent = `
                              <!DOCTYPE html>
                              <html>
                              <head>
                                <title>Print</title>
                                <style>
                                  @media print {
                                    @page { size: landscape; margin: 0; }
                                    body { margin: 0; }
                                    .slide-container { page-break-after: always; }
                                    .slide-container:last-child { page-break-after: auto; }
                                  }
                                  * { margin: 0; padding: 0; box-sizing: border-box; }
                                  body { margin: 0; padding: 0; }
                                  .slide-container {
                                    width: 100%;
                                    height: 100vh;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    background: white;
                                  }
                                  .slide-image {
                                    max-width: 100%;
                                    max-height: 100vh;
                                    object-fit: contain;
                                  }
                                  .slide-text {
                                    white-space: pre-wrap;
                                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                                    padding: 40px;
                                    font-size: 14px;
                                  }
                                </style>
                              </head>
                              <body>
                                ${slides.map((slide) => `
                                  <div class="slide-container">
                                    ${slide.imageUrl
                                      ? `<img src="${slide.imageUrl}" class="slide-image" />`
                                      : slide.content
                                        ? `<div class="slide-text">${slide.content}</div>`
                                        : ''
                                    }
                                  </div>
                                `).join('')}
                              </body>
                              </html>
                            `;
                            printWithIframe(htmlContent);
                          } else {
                            showError(t('documentViewer.noSlidesToPrint') || 'No slides available to print');
                          }
                        } catch (error) {
                          showError(t('documentViewer.failedToLoadForPrinting'));
                        }
                        return;
                      }

                      // For PDF - use blob iframe print
                      if (docType === 'pdf') {
                        const response = await api.get(`/api/documents/${documentId}/stream`, {
                          responseType: 'blob'
                        });
                        const blobUrl = window.URL.createObjectURL(response.data);
                        const iframe = window.document.createElement('iframe');
                        iframe.style.position = 'absolute';
                        iframe.style.width = '0';
                        iframe.style.height = '0';
                        iframe.style.border = 'none';
                        iframe.style.left = '-9999px';
                        window.document.body.appendChild(iframe);

                        // Cleanup function - only runs after print dialog closes
                        let pdfCleanedUp = false;
                        const pdfCleanup = () => {
                          if (pdfCleanedUp) return;
                          pdfCleanedUp = true;
                          if (iframe.parentNode) window.document.body.removeChild(iframe);
                          window.URL.revokeObjectURL(blobUrl);
                        };

                        iframe.onload = () => {
                          setTimeout(() => {
                            try {
                              iframe.contentWindow.onafterprint = pdfCleanup;
                              const mainCleanup = () => { pdfCleanup(); window.removeEventListener('afterprint', mainCleanup); };
                              window.addEventListener('afterprint', mainCleanup);
                              iframe.contentWindow.focus();
                              iframe.contentWindow.print();
                              setTimeout(pdfCleanup, 60000); // Fallback
                            } catch (e) {
                              showError(t('documentViewer.unableToPrint'));
                              pdfCleanup();
                            }
                          }, 500);
                        };

                        iframe.src = blobUrl;
                        return;
                      }

                      // For images - create HTML with just the image
                      if (docType === 'image') {
                        const response = await api.get(`/api/documents/${documentId}/stream`, {
                          responseType: 'blob'
                        });
                        const blobUrl = window.URL.createObjectURL(response.data);

                        const htmlContent = `
                          <!DOCTYPE html>
                          <html>
                          <head>
                            <title>Print</title>
                            <style>
                              @media print { @page { margin: 0; } }
                              * { margin: 0; padding: 0; }
                              body {
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                min-height: 100vh;
                                background: white;
                              }
                              img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                            </style>
                          </head>
                          <body>
                            <img src="${blobUrl}" onload="setTimeout(function() { window.print(); }, 100);" />
                          </body>
                          </html>
                        `;
                        printWithIframe(htmlContent, blobUrl);
                        return;
                      }

                      // For DOCX - use preview-pdf endpoint
                      if (docType === 'word') {
                        try {
                          const response = await api.get(`/api/documents/${documentId}/preview-pdf`, {
                            responseType: 'blob'
                          });
                          const blobUrl = window.URL.createObjectURL(response.data);
                          const iframe = window.document.createElement('iframe');
                          iframe.style.position = 'absolute';
                          iframe.style.width = '0';
                          iframe.style.height = '0';
                          iframe.style.border = 'none';
                          iframe.style.left = '-9999px';
                          window.document.body.appendChild(iframe);

                          // Cleanup function - only runs after print dialog closes
                          let docxCleanedUp = false;
                          const docxCleanup = () => {
                            if (docxCleanedUp) return;
                            docxCleanedUp = true;
                            if (iframe.parentNode) window.document.body.removeChild(iframe);
                            window.URL.revokeObjectURL(blobUrl);
                          };

                          iframe.onload = () => {
                            setTimeout(() => {
                              try {
                                iframe.contentWindow.onafterprint = docxCleanup;
                                const mainCleanup = () => { docxCleanup(); window.removeEventListener('afterprint', mainCleanup); };
                                window.addEventListener('afterprint', mainCleanup);
                                iframe.contentWindow.focus();
                                iframe.contentWindow.print();
                                setTimeout(docxCleanup, 60000); // Fallback
                              } catch (e) {
                                showError(t('documentViewer.unableToPrint'));
                                docxCleanup();
                              }
                            }, 500);
                          };

                          iframe.src = blobUrl;
                        } catch (error) {
                          showError(t('documentViewer.failedToLoadForPrinting'));
                        }
                        return;
                      }

                      // For Excel/spreadsheet files - fetch HTML preview and print
                      if (docType === 'excel') {
                        try {
                          const response = await api.get(`/api/documents/${documentId}/preview`);
                          if (response.data.htmlContent) {
                            const htmlContent = `
                              <!DOCTYPE html>
                              <html>
                              <head>
                                <title>Print</title>
                                <style>
                                  @media print {
                                    @page { size: landscape; margin: 0.5in; }
                                  }
                                  * { margin: 0; padding: 0; box-sizing: border-box; }
                                  body {
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                    font-size: 10px;
                                    line-height: 1.4;
                                    padding: 10px;
                                  }
                                  .sheet-container {
                                    margin-bottom: 20px;
                                    page-break-after: always;
                                  }
                                  .sheet-container:last-child {
                                    page-break-after: auto;
                                  }
                                  .sheet-name {
                                    font-size: 14px;
                                    font-weight: bold;
                                    margin-bottom: 10px;
                                    padding: 5px;
                                    background: #f0f0f0;
                                    border-radius: 4px;
                                  }
                                  table, .excel-table {
                                    border-collapse: collapse;
                                    width: 100%;
                                    font-size: 9px;
                                  }
                                  th, td {
                                    border: 1px solid #ccc;
                                    padding: 4px 6px;
                                    text-align: left;
                                    vertical-align: top;
                                    max-width: 200px;
                                    overflow: hidden;
                                    text-overflow: ellipsis;
                                  }
                                  th {
                                    background: #f5f5f5;
                                    font-weight: 600;
                                  }
                                  tr:nth-child(even) {
                                    background: #fafafa;
                                  }
                                </style>
                              </head>
                              <body>
                                ${response.data.htmlContent}
                              </body>
                              </html>
                            `;
                            printWithIframe(htmlContent);
                          } else {
                            showError(t('documentViewer.noContentToPrint') || 'No content available to print');
                          }
                        } catch (error) {
                          showError(t('documentViewer.failedToLoadForPrinting'));
                        }
                        return;
                      }

                      // For other documents - print extracted text only (no headers)
                      const textContent = document.metadata?.extractedText || '';
                      if (textContent) {
                        const htmlContent = `
                          <!DOCTYPE html>
                          <html>
                          <head>
                            <title>Print</title>
                            <style>
                              @media print { @page { margin: 0.5in; } }
                              * { margin: 0; padding: 0; }
                              body {
                                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                                font-size: 12px;
                                line-height: 1.6;
                                white-space: pre-wrap;
                                padding: 20px;
                              }
                            </style>
                          </head>
                          <body>${textContent}</body>
                          </html>
                        `;
                        printWithIframe(htmlContent);
                      } else {
                        showError(t('documentViewer.noContentToPrint') || 'No content available to print');
                      }
                    } catch (error) {
                      showError(t('documentViewer.failedToLoadForPrinting'));
                    }
                  }
                }}
                style={{ width: 42, height: 42, background: 'white', overflow: 'hidden', borderRadius: 100, border: '1px solid #E6E6EC', justifyContent: 'center', alignItems: 'center', display: 'flex', cursor: 'pointer', transition: 'all 0.2s ease' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F5F5F5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                }}
              >
                <PrinterIcon style={{ width: 20, height: 20 }} />
              </button>
              <button
                onClick={() => {
                  setSelectedDocumentForCategory(document);
                  setShowCategoryModal(true);
                }}
                style={{ width: 42, height: 42, background: 'white', overflow: 'hidden', borderRadius: 100, border: '1px solid #E6E6EC', justifyContent: 'center', alignItems: 'center', display: 'flex', cursor: 'pointer', transition: 'all 0.2s ease' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F5F5F5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                }}
                title={t('modals.moveToCategory.title')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#181818" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  <line x1="12" y1="11" x2="12" y2="17"/>
                  <line x1="9" y1="14" x2="15" y2="14"/>
                </svg>
              </button>
            </div>
              <button
                onMouseDown={(e) => {
                  // Keep any text selection active when opening the assistant.
                  // (Clicking a normal button would move focus and collapse selection.)
                  e.preventDefault();
                  try { docxCanvasRef.current?.restoreSelection?.(); } catch {}
                  openEditingPanel({ seedSelection: true, focusInput: true });
                }}
              onClick={(e) => {
                // No-op: handled in onMouseDown to preserve selection.
                e.preventDefault();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openEditingPanel({ seedSelection: true, focusInput: true });
                }
              }}
              style={{
                height: 42,
                paddingLeft: 14,
                paddingRight: 16,
                background: 'white',
                borderRadius: 999,
                border: '1px solid #E2E2E6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                marginRight: 12
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F5F5F5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white';
              }}
            >
              <img
                src={sphereIcon}
                alt="Allybi"
                style={{
                  width: 22,
                  height: 22,
                  objectFit: 'contain',
                  ...getImageRenderingCSS()
                }}
              />
	              <div style={{ color: '#181818', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', lineHeight: '20px' }}>
	                Ask Allybi
	              </div>
	            </button>
            <button
              onClick={() => setShowShareModal(true)}
              style={{ height: 42, paddingLeft: 16, paddingRight: 20, background: '#181818', overflow: 'hidden', borderRadius: 24, justifyContent: 'center', alignItems: 'center', gap: 8, display: 'flex', border: 'none', cursor: 'pointer', transition: 'all 0.2s ease' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#333333';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#181818';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.background = '#000000';
                e.currentTarget.style.transform = 'scale(0.98)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.background = '#333333';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <DownloadWhiteIcon style={{ width: 18, height: 18 }} />
              <div style={{ color: 'white', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '22px' }}>{t('documentViewer.download')}</div>
            </button>
          </div>
          ) : (
            /* Mobile: Show download button only in header */
            <button
              onClick={() => setShowShareModal(true)}
              style={{
                width: 36,
                height: 36,
                background: 'rgba(24, 24, 24, 0.90)',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <DownloadWhiteIcon style={{ width: 18, height: 18 }} />
            </button>
          )}
        </div>

        {/* Document Toolbar + Preview + optional editing panel */}
        <div style={{ width: '100%', flex: 1, minWidth: 0, minHeight: 0, display: 'flex', position: 'relative' }}>
          {editingOpen && !isMobile ? (
            <>
              {/* Document column: toolbar aligned with document, not spanning the panel */}
              <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {/* Toolbar */}
                <div style={{
                  alignSelf: 'stretch',
                  paddingLeft: 24,
                  paddingRight: 24,
                  paddingTop: 13,
                  paddingBottom: 13,
                  background: 'white',
                  borderBottom: '1px #E6E6EC solid',
                  justifyContent: 'flex-start',
                  alignItems: 'center',
                  gap: 12,
                  display: 'flex',
                  flexWrap: 'nowrap',
                  position: 'relative',
                }}>
                  <div style={{ width: '100%', minWidth: 0 }}>
                    {renderEditingToolsBar()}
                  </div>
                </div>
                {previewCanvas}
              </div>
              {/* Right: Allybi (Ask/Targets/Changes) */}
              <div style={{ width: 420, minWidth: 420, maxWidth: 480, height: '100%', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #E6E6EC', background: 'rgba(255,255,255,0.92)' }}>
                <div style={{ flex: 1, minHeight: 0 }}>
                  {assistantRightPanel}
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {/* Toolbar */}
              <div style={{
                alignSelf: 'stretch',
                paddingLeft: isMobile ? 8 : 24,
                paddingRight: isMobile ? 8 : 24,
                paddingTop: isMobile ? 10 : 13,
                paddingBottom: isMobile ? 10 : 13,
                background: 'white',
                borderBottom: '1px #E6E6EC solid',
                justifyContent: 'flex-start',
                alignItems: 'center',
                gap: isMobile ? 8 : 12,
                display: 'flex',
                flexWrap: 'nowrap',
                position: 'relative',
              }}>
                <div style={{ width: '100%', minWidth: 0 }}>
                  {renderEditingToolsBar()}
                </div>
              </div>
              {editingOpen && isMobile ? (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'white',
                  zIndex: 2000,
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    {assistantRightPanel}
                  </div>
                </div>
              ) : null}
              {previewCanvas}
            </div>
          )}
        </div>
      </div>

	      {/* Selection bubble (desktop): highlight text -> Ask Allybi */}
	      {!isMobile && !editingOpen && selectionBubble?.rect && selectionBubble?.text ? (() => {
	        const r = selectionBubble.rect;
	        const w = 190;
        const viewportW = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1200;
        const x = Math.max(14, Math.min(viewportW - w - 14, r.left + r.width / 2 - w / 2));
        const y = Math.max(14, r.top - 46);
        return (
          <div style={{ position: 'fixed', top: y, left: x, zIndex: 3000 }}>
	            <button
	              onMouseDown={(e) => {
	                // Keep the document selection visible when clicking the bubble.
	                e.preventDefault();
	                e.stopPropagation();
	                // Restore the last DOCX selection Range (some browsers shift selection on click/mouseup).
	                try { docxCanvasRef.current?.restoreSelection?.(); } catch {}
	                // Open on mousedown (like the header Ask button) to avoid selection drift.
	                toggleEditingPanel();
	              }}
	              onClick={() => {
	                // No-op: handled in onMouseDown to preserve selection.
	              }}
	              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 999,
                border: '1px solid rgba(24,24,24,0.16)',
                background: 'rgba(255,255,255,0.96)',
                boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)',
                cursor: 'pointer',
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: 850,
                fontSize: 13,
                color: '#181818',
              }}
              title="Ask Allybi about the selected text"
            >
              Ask Allybi
            </button>
          </div>
        );
      })() : null}

      {/* Floating assistant hint (desktop only) */}
      {showAskKoda && !isMobile && (
        <div style={{ width: 277, height: 82, right: 20, bottom: 20, position: 'absolute' }}>
          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              sessionStorage.setItem('askKodaDismissed', 'true');
              setShowAskKoda(false);
            }}
            style={{
              width: 24,
              height: 24,
              right: 0,
              top: 0,
              position: 'absolute',
              background: 'white',
              borderRadius: 100,
              outline: '1px rgba(55, 53, 47, 0.09) solid',
              outlineOffset: '-1px',
              justifyContent: 'center',
              alignItems: 'center',
              display: 'inline-flex',
              border: 'none',
              cursor: 'pointer',
              zIndex: 10
            }}
          >
            <div style={{ width: 12, height: 12, position: 'relative', overflow: 'hidden' }}>
              <XCloseIcon style={{ width: 12, height: 12, position: 'absolute', left: 0, top: 0 }} />
            </div>
          </button>
          <div style={{ width: 14, height: 14, right: 44, top: 9, position: 'absolute', background: '#222222', borderRadius: 9999 }} />
          <button
            onClick={() => {
              toggleEditingPanel();
            }}
            style={{
              height: 60,
              paddingLeft: 4,
              paddingRight: 18,
              paddingTop: 8,
              paddingBottom: 8,
              bottom: 0,
              right: 0,
              position: 'absolute',
              background: '#222222',
              borderRadius: 100,
              justifyContent: 'flex-start',
              alignItems: 'center',
              display: 'inline-flex',
              border: 'none',
              cursor: 'pointer',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ justifyContent: 'flex-start', alignItems: 'center', gap: 0, display: 'flex' }}>
              <img
                src={kodaLogoWhite}
                alt="Allybi"
                style={{
                  width: 36,
                  height: 36,
                  flexShrink: 0,
                  marginLeft: 8,
                  marginRight: -2
                }}
              />
              <div style={{ color: 'white', fontSize: 15, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', lineHeight: '20px', wordWrap: 'break-word' }}>{t('documentViewer.needHelpFindingSomething')}</div>
            </div>
          </button>
          <div style={{ width: 7, height: 7, right: 33, top: 0, position: 'absolute', background: '#222222', borderRadius: 9999 }} />
        </div>
      )}
      <NotificationPanel
        showNotificationsPopup={showNotificationsPopup}
        setShowNotificationsPopup={setShowNotificationsPopup}
      />

      {/* Search Modal */}
      {showSearchModal && (
        <SearchInDocumentModal
          documentId={documentId}
          document={document}
          onClose={() => setShowSearchModal(false)}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div
          onClick={() => setShowShareModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 32,
              width: 500,
              maxWidth: '90%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
            }}
          >
            <div style={{ fontSize: 20, fontWeight: '700', fontFamily: 'Plus Jakarta Sans', color: '#323232', marginBottom: 8 }}>
              Export Document
            </div>
            <div style={{ fontSize: 14, fontFamily: 'Plus Jakarta Sans', color: '#6C6B6E', marginBottom: 24 }}>
              {cleanDocumentName(document.filename)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const currentDoc = document;
                  if (currentDoc) {
                    try {
                      // Get the decrypted file from the stream endpoint
                      const response = await api.get(`/api/documents/${currentDoc.id}/stream`, {
                        responseType: 'blob'
                      });

                      // Create object URL and trigger download
                      const blobUrl = URL.createObjectURL(response.data);
                      const link = window.document.createElement('a');
                      link.href = blobUrl;
                      link.download = cleanDocumentName(currentDoc.filename) || currentDoc.filename || 'document';
                      link.style.display = 'none';
                      window.document.body.appendChild(link);
                      link.click();

                      // Clean up
                      setTimeout(() => {
                        window.document.body.removeChild(link);
                        URL.revokeObjectURL(blobUrl);
                      }, 100);
                    } catch (error) {
                      showError(t('alerts.failedToDownload'));
                    }
                  }
                }}
                style={{
                  width: 220,
                  padding: '12px 24px',
                  borderRadius: 14,
                  border: '1px solid #E6E6EC',
                  background: 'white',
                  color: '#323232',
                  fontSize: 14,
                  fontWeight: '600',
                  fontFamily: 'Plus Jakarta Sans',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F9FAFB';
                  e.currentTarget.style.borderColor = '#D1D5DB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.borderColor = '#E6E6EC';
                }}
              >
                <DownloadIcon style={{ width: 20, height: 20, pointerEvents: 'none' }} />
                Download
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExport('pdf');
                }}
                disabled={exportingFormat === 'pdf'}
                style={{
                  width: 220,
                  padding: '12px 24px',
                  borderRadius: 14,
                  border: '1px solid #E6E6EC',
                  background: 'white',
                  color: '#323232',
                  fontSize: 14,
                  fontWeight: '600',
                  fontFamily: 'Plus Jakarta Sans',
                  cursor: exportingFormat === 'pdf' ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: exportingFormat === 'pdf' ? 0.7 : 1
                }}
                onMouseEnter={(e) => {
                  if (exportingFormat !== 'pdf') {
                    e.currentTarget.style.background = '#F9FAFB';
                    e.currentTarget.style.borderColor = '#D1D5DB';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.borderColor = '#E6E6EC';
                }}
              >
                <img src={pdfIcon} alt="PDF" style={{ width: 24, height: 24, pointerEvents: 'none' }} />
                {exportingFormat === 'pdf' ? 'Exporting...' : 'Export as PDF'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExport('docx');
                }}
                disabled={exportingFormat === 'docx'}
                style={{
                  width: 220,
                  padding: '12px 24px',
                  borderRadius: 14,
                  border: '1px solid #E6E6EC',
                  background: 'white',
                  color: '#323232',
                  fontSize: 14,
                  fontWeight: '600',
                  fontFamily: 'Plus Jakarta Sans',
                  cursor: exportingFormat === 'docx' ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: exportingFormat === 'docx' ? 0.7 : 1
                }}
                onMouseEnter={(e) => {
                  if (exportingFormat !== 'docx') {
                    e.currentTarget.style.background = '#F9FAFB';
                    e.currentTarget.style.borderColor = '#D1D5DB';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.borderColor = '#E6E6EC';
                }}
              >
                <img src={docIcon} alt="DOCX" style={{ width: 24, height: 24, pointerEvents: 'none' }} />
                {exportingFormat === 'docx' ? 'Exporting...' : 'Export as Docx'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={async () => {
          try {
            await api.delete(`/api/documents/${documentId}`);
            showSuccess(t('documentViewer.documentDeleted'));
            // Go back to the previous screen instead of navigating away
            navigate(-1);
          } catch (error) {
            showError(t('documentViewer.failedToDelete', { error: error.response?.data?.error || error.message }));
          }
        }}
        itemName={document.filename || 'this document'}
        itemType="document"
      />

      {/* STANDARDIZED: Move to Category Modal with FILES section and checkmarks */}
      <MoveToCategoryModal
        isOpen={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setSelectedDocumentForCategory(null);
          setSelectedCategoryId(null);
        }}
        uploadedDocuments={selectedDocumentForCategory ? [selectedDocumentForCategory] : []}
        showFilesSection={true}
        categories={getRootFolders().filter(f => f.name.toLowerCase() !== 'recently added').map(f => ({
          ...f,
          fileCount: getDocumentCountByFolder(f.id)
        }))}
        selectedCategoryId={selectedCategoryId}
        onCategorySelect={setSelectedCategoryId}
        onCreateNew={() => {
          setShowCategoryModal(false);
          setShowCreateCategoryModal(true);
        }}
        onConfirm={async () => {
          if (!selectedCategoryId) return;

          // Capture state before closing modal
          const categoryId = selectedCategoryId;
          const docId = documentId;

          // Close modal IMMEDIATELY for snappy UX
          setShowCategoryModal(false);
          setSelectedDocumentForCategory(null);
          setSelectedCategoryId(null);

          try {
            await moveToFolder(docId, categoryId);
            showSuccess(t('documentViewer.documentMoved'));
          } catch (error) {
            showError(t('documentViewer.failedToMoveDocument', { error: error.response?.data?.error || error.message }));
          }
        }}
      />

      {/* STANDARDIZED: Create Category Modal (NO MORE "coming soon" toast!) */}
      <CreateCategoryModal
        isOpen={showCreateCategoryModal}
        onClose={() => setShowCreateCategoryModal(false)}
        onCreateCategory={async (category) => {
          setShowCreateCategoryModal(false);

          try {
            // Create the folder
            const newFolder = await createFolder(category.name, category.emoji);
            showSuccess(t('documentViewer.categoryCreated'));

            // Move the document to the new category
            if (selectedDocumentForCategory) {
              await moveToFolder(selectedDocumentForCategory.id, newFolder.id);
              showSuccess(t('documentViewer.documentMoved'));
            }

            // Clear state
            setSelectedDocumentForCategory(null);
          } catch (error) {
            showError(t('documentViewer.failedToCreateCategory', { error: error.response?.data?.error || error.message }));
          }
        }}
        uploadedDocuments={selectedDocumentForCategory ? [selectedDocumentForCategory] : []}
        allDocuments={contextDocuments}
      />
    </div>
  );
};

export default DocumentViewer;
