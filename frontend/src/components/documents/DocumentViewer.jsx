import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';
import api from '../../services/api';
import { applyEdit, undoEdit, extractVerifiedApply } from '../../services/editingService';
import LeftNav from '../app-shell/LeftNav';
import NotificationPanel from '../notifications/NotificationPanel';
import SearchInDocumentModal from './SearchInDocumentModal';
import DeleteConfirmationModal from '../library/DeleteConfirmationModal';
import MoveToCategoryModal from '../library/MoveToCategoryModal';
import CreateCategoryModal from '../library/CreateCategoryModal';
import { ReactComponent as ArrowLeftIcon } from '../../assets/arrow-narrow-left.svg';
import { ReactComponent as UploadIcon } from '../../assets/upload.svg';
import { ReactComponent as DownloadWhiteIcon } from '../../assets/download.svg';
import logoSvg from '../../assets/logo.svg';
import cleanDocumentName from '../../utils/cleanDocumentName';
import { getApiBaseUrl } from '../../services/runtimeConfig';
import sphereIcon from '../../assets/allybi-knot-black.svg';
import allybiLogoWhite from '../../assets/koda-knot-white.svg';
import { ReactComponent as TrashCanIcon } from '../../assets/Trash can.svg';
import printIcon from '../../assets/print-icon.svg';
import folderPlusIcon from '../../assets/folder-plus.svg';
import { ReactComponent as DownloadIcon } from '../../assets/download.svg';
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
import { getDocxViewerSelectionV2, getDocxViewerSelectionV2ClientRects, getDocxViewerSelectionV2FromRange } from '../../utils/editor/docxSelectionModel';

const AUTH_LOCALSTORAGE_COMPAT = process.env.REACT_APP_AUTH_LOCALSTORAGE_COMPAT === 'true';
const getCompatAccessToken = () => {
  if (!AUTH_LOCALSTORAGE_COMPAT) return null;
  return localStorage.getItem('accessToken') || localStorage.getItem('token');
};

// Keep this at module scope: React render ordering + const TDZ can otherwise throw in dev builds.
function getFileType(filename, mimeType) {
  const extension = (filename || '').split('.').pop()?.toLowerCase() || '';

  // Try extension first
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(extension)) return 'image';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(extension)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(extension)) return 'audio';
  if (extension === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(extension)) return 'word';
  if (['xls', 'xlsx'].includes(extension)) return 'excel';
  if (['ppt', 'pptx'].includes(extension)) return 'powerpoint';
  if (['txt', 'md', 'json', 'xml', 'csv'].includes(extension)) return 'text';
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'html', 'css', 'php', 'rb', 'go'].includes(extension)) return 'code';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'archive';

  // Fallback: if extension detection failed, use mimeType
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('wordprocessingml')) return 'word';
    if (mimeType.includes('spreadsheetml')) return 'excel';
    if (mimeType.includes('presentationml')) return 'powerpoint';
    if (mimeType.startsWith('text/')) return 'text';
  }

  return 'unknown';
}

function getSelectionElement(node) {
  if (!node) return null;
  return node.nodeType === 1 ? node : node.parentElement;
}

function getBoundaryProbeElement(node, offset, preferPrevious = false) {
  if (!node) return null;
  if (node.nodeType === 3) return node.parentElement || null;
  if (node.nodeType !== 1) return node.parentElement || null;
  const children = Array.from(node.childNodes || []);
  if (!children.length) return node;
  const rawOffset = Number(offset);
  const clamped = Number.isFinite(rawOffset)
    ? Math.max(0, Math.min(children.length, Math.floor(rawOffset)))
    : 0;
  const primaryIndex = preferPrevious
    ? Math.max(0, clamped - 1)
    : Math.min(children.length - 1, clamped);
  const secondaryIndex = preferPrevious
    ? Math.min(children.length - 1, clamped)
    : Math.max(0, clamped - 1);
  const child = children[primaryIndex] || children[secondaryIndex] || null;
  return getSelectionElement(child) || node;
}

function getFirstTextProbeElement(root, range = null) {
  if (!root || typeof window === 'undefined' || !window.document?.createTreeWalker) return null;
  const showText = window.NodeFilter?.SHOW_TEXT ?? 4;
  const accept = window.NodeFilter?.FILTER_ACCEPT ?? 1;
  const skip = window.NodeFilter?.FILTER_SKIP ?? 3;
  const walker = window.document.createTreeWalker(
    root,
    showText,
    {
      acceptNode(node) {
        const text = String(node?.nodeValue || '');
        if (!text.trim()) return skip;
        if (range) {
          try {
            if (!range.intersectsNode(node)) return skip;
          } catch {
            return skip;
          }
        }
        return accept;
      },
    }
  );
  const textNode = walker.nextNode();
  return textNode?.parentElement || null;
}

function getFirstTextNode(root) {
  if (!root || typeof window === 'undefined' || !window.document?.createTreeWalker) return null;
  const showText = window.NodeFilter?.SHOW_TEXT ?? 4;
  const accept = window.NodeFilter?.FILTER_ACCEPT ?? 1;
  const skip = window.NodeFilter?.FILTER_SKIP ?? 3;
  const walker = window.document.createTreeWalker(
    root,
    showText,
    {
      acceptNode(node) {
        const text = String(node?.nodeValue || '');
        return text.trim() ? accept : skip;
      },
    }
  );
  return walker.nextNode() || null;
}

function resolveStyledProbeWithinParagraph(paragraphEl) {
  if (!paragraphEl) return null;
  const selectors = ['strong', 'b', 'em', 'i', 'u', 'strike', 's'];
  for (const selector of selectors) {
    const nodes = Array.from(paragraphEl.querySelectorAll?.(selector) || []);
    for (const node of nodes) {
      const textNode = getFirstTextNode(node);
      if (textNode) return textNode.parentElement || node;
    }
  }

  // Detect class-based styling (not only inline style attrs) by comparing each text run's
  // computed style against the paragraph's base style.
  try {
    const base = window.getComputedStyle?.(paragraphEl) || null;
    const baseColor = normalizeCssColorToHex(base?.color || '', '');
    const baseWeight = String(base?.fontWeight || '').trim().toLowerCase();
    const baseStyle = String(base?.fontStyle || '').trim().toLowerCase();
    const baseDeco = String(base?.textDecorationLine || base?.textDecoration || '').trim().toLowerCase();
    const showText = window.NodeFilter?.SHOW_TEXT ?? 4;
    const accept = window.NodeFilter?.FILTER_ACCEPT ?? 1;
    const skip = window.NodeFilter?.FILTER_SKIP ?? 3;
    const walker = window.document.createTreeWalker(
      paragraphEl,
      showText,
      {
        acceptNode(node) {
          const text = String(node?.nodeValue || '');
          return text.trim() ? accept : skip;
        },
      }
    );
    let textNode = walker.nextNode();
    while (textNode) {
      const el = textNode.parentElement || null;
      if (el) {
        const cs = window.getComputedStyle?.(el) || null;
        const color = normalizeCssColorToHex(cs?.color || '', '');
        const weight = String(cs?.fontWeight || '').trim().toLowerCase();
        const style = String(cs?.fontStyle || '').trim().toLowerCase();
        const deco = String(cs?.textDecorationLine || cs?.textDecoration || '').trim().toLowerCase();
        const differs =
          (color && baseColor && color !== baseColor) ||
          (weight && baseWeight && weight !== baseWeight) ||
          (style && baseStyle && style !== baseStyle) ||
          (deco && baseDeco && deco !== baseDeco);
        if (differs) return el;
      }
      textNode = walker.nextNode();
    }
  } catch {
    // best effort
  }

  // Last chance: explicit inline style inside this paragraph.
  const styledNodes = Array.from(paragraphEl.querySelectorAll?.('[style]') || []);
  for (const node of styledNodes) {
    const textNode = getFirstTextNode(node);
    if (textNode) return textNode.parentElement || node;
  }

  return getFirstTextProbeElement(paragraphEl);
}

function resolveDocxSelectionProbeElement({ container, selection, range, fallbackParagraphIds = [] }) {
  if (!container) return null;
  const candidates = [];
  const pushCandidate = (nodeOrEl) => {
    const el = getSelectionElement(nodeOrEl);
    if (!el || !container.contains(el) || candidates.includes(el)) return;
    candidates.push(el);
  };

  if (range) {
    pushCandidate(getBoundaryProbeElement(range.startContainer, range.startOffset, false));
    if (!range.collapsed) {
      pushCandidate(getBoundaryProbeElement(range.endContainer, range.endOffset, true));
    }
    const commonEl = getSelectionElement(range.commonAncestorContainer);
    pushCandidate(getFirstTextProbeElement(commonEl || container, range));
    pushCandidate(getSelectionElement(range.startContainer));
    pushCandidate(getSelectionElement(range.endContainer));
  }

  if (selection) {
    pushCandidate(getSelectionElement(selection.anchorNode));
    pushCandidate(getSelectionElement(selection.focusNode));
  }

  for (const rawPid of fallbackParagraphIds) {
    const pid = String(rawPid || '').trim();
    if (!pid) continue;
    const safeId = (() => {
      try {
        if (typeof window !== 'undefined' && window.CSS?.escape) return window.CSS.escape(pid);
      } catch {}
      return pid.replace(/"/g, '\\"');
    })();
    const paragraphEl = container.querySelector?.(`[data-paragraph-id="${safeId}"]`) || null;
    if (!paragraphEl) continue;
    pushCandidate(resolveStyledProbeWithinParagraph(paragraphEl));
    pushCandidate(getFirstTextProbeElement(paragraphEl));
    pushCandidate(paragraphEl);
  }

  if (!candidates.length) return null;
  const styled = candidates.find((el) => String(el.getAttribute?.('style') || '').trim());
  return styled || candidates[0];
}

function normalizeFontFamily(raw, fallback = 'Calibri') {
  const first = String(raw || '')
    .split(',')
    .map((part) => String(part || '').trim())
    .find(Boolean);
  if (!first) return fallback;
  const cleaned = first.replace(/^["']+|["']+$/g, '').trim();
  return cleaned || fallback;
}

function normalizeFontSizePx(raw, fallback = '16px') {
  const n = Number.parseFloat(String(raw || '').trim());
  if (!Number.isFinite(n)) return fallback;
  return `${Math.max(8, Math.min(72, Math.round(n)))}px`;
}

function channelToHex(v) {
  const n = Math.max(0, Math.min(255, Number.parseInt(String(v || 0), 10) || 0));
  return n.toString(16).padStart(2, '0');
}

function normalizeCssColorToHex(raw, fallback = '#111827') {
  const s = String(raw || '').trim();
  if (!s) return fallback;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();

  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = String(m[1] || '').split(',').map((p) => p.trim());
    if (parts.length >= 3) {
      const r = channelToHex(parts[0]);
      const g = channelToHex(parts[1]);
      const b = channelToHex(parts[2]);
      return `#${r}${g}${b}`;
    }
  }
  return fallback;
}

function alignmentFromTextAlign(raw) {
  const textAlign = String(raw || '').trim().toLowerCase();
  if (!textAlign) return '';
  if (textAlign === 'start' || textAlign === 'left') return 'left';
  if (textAlign === 'end' || textAlign === 'right') return 'right';
  if (textAlign === 'center') return 'center';
  if (textAlign === 'justify') return 'justify';
  return '';
}

function listTypeFromElement(el, container) {
  if (!el || !container || !container.contains(el)) return '';
  const listEl = el.closest?.('ul,ol');
  if (!listEl || !container.contains(listEl)) return '';
  return listEl.tagName?.toLowerCase?.() === 'ol' ? 'numbered' : 'bullet';
}

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
  const { showSuccess, showError, showInfo } = useNotifications();
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

  const currentFileType = useMemo(() => {
    if (!document?.filename && !document?.mimeType) return 'unknown';
    return getFileType(document?.filename, document?.mimeType);
  }, [document?.filename, document?.mimeType]);
  const supportsViewerEditing = currentFileType === 'word' || currentFileType === 'excel';

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
    if (cid && isUuid(cid)) {
      viewerConvIdRef.current = cid;
    }
  }, [editingConversation?.id]);

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
    if (!supportsViewerEditing) {
      showInfo(t('documentViewer.comingSoon'));
      return;
    }
    setEditingOpen(true);
    if (initialTabParam === 'targets' || initialTabParam === 'changes' || initialTabParam === 'ask') {
      setAssistantTab(initialTabParam);
    } else {
      setAssistantTab('ask');
    }
    setViewerFocusNonce((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditOpenParam, initialTabParam, documentId, supportsViewerEditing, showInfo, t]);

  // Deep-link behavior: load an edit_session into the viewer canvas/queue without
  // injecting an edit card into chat (viewer chat stays clean; Changes tab is the review surface).
  useEffect(() => {
    if (!injectedEditSession) return;
    if (!supportsViewerEditing) {
      showInfo(t('documentViewer.comingSoon'));
      setInjectedEditSession(null);
      return;
    }
    setEditingOpen(true);
    setAssistantTab('changes');
    setViewerFocusNonce((n) => n + 1);
    setInjectedEditSessionForDraft(injectedEditSession);
    setInjectedEditSession(null);
  }, [injectedEditSession, supportsViewerEditing, showInfo, t]);

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
    autoApplyInViewer: false,
    autoApplyComputeBundles: false,
  }));

  const docxCanvasRef = useRef(null);
  const excelCanvasRef = useRef(null);
  // Ref to hold syncToolbarAfterDocxReload (defined later) so early useEffects can call it.
  const syncToolbarAfterDocxReloadRef = useRef(null);

  // DOCX formatting controls (drives execCommand + span styling).
  const [docxFontFamily, setDocxFontFamily] = useState('Calibri');
  const [docxFontSizePx, setDocxFontSizePx] = useState('16px');
  const [docxColorHex, setDocxColorHex] = useState('#111827');
  const [docxActiveFormats, setDocxActiveFormats] = useState({ bold: false, italic: false, underline: false, strikethrough: false });
  const [docxListType, setDocxListType] = useState('');
  // No default active alignment button; Word-like behavior comes from the document itself.
  const [docxAlignment, setDocxAlignment] = useState('');

  // XLSX toolbar state
  const [excelSelectedInfo, setExcelSelectedInfo] = useState(null);
  const [excelDraftValue, setExcelDraftValue] = useState('');
  const [excelSheetMeta, setExcelSheetMeta] = useState(null);
  const [excelFontFamily, setExcelFontFamily] = useState('Calibri');
  const [excelFontSizePt, setExcelFontSizePt] = useState(11);
  const [excelColorHex, setExcelColorHex] = useState('#000000');
  const [excelBold, setExcelBold] = useState(false);
  const [excelItalic, setExcelItalic] = useState(false);
  const [excelUnderline, setExcelUnderline] = useState(false);
  const [excelHistoryState, setExcelHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const excelCanApply = useMemo(() => {
    if (!excelSelectedInfo?.a1) return false;
    const draft = String(excelDraftValue ?? '');
    const before = String(excelSelectedInfo?.beforeText ?? '');
    const isGrid = draft.includes('\n') || draft.includes('\t');
    if (isGrid) return Boolean(draft.trim());
    return draft.trim() !== before.trim();
  }, [excelDraftValue, excelSelectedInfo]);

  // PPTX toolbar state
  const [pptxDraftText, setPptxDraftText] = useState('');
  const [pptxLayout, setPptxLayout] = useState('TITLE_AND_BODY');
  const [pptxStatusMsg, setPptxStatusMsg] = useState('');
  const [pptxApplying, setPptxApplying] = useState(false);

  // PDF revise toolbar state
  const [pdfStatusMsg, setPdfStatusMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/editing/policy');
        const data = res?.data?.data || {};
        const alwaysConfirmOperators = Array.isArray(data?.alwaysConfirmOperators)
          ? data.alwaysConfirmOperators.map((x) => String(x || '').trim()).filter(Boolean)
          : [];
        const silentExecuteConfidence = Number(data?.silentExecuteConfidence);
        if (cancelled) return;
        setEditingPolicy({
          alwaysConfirmOperators,
          silentExecuteConfidence: Number.isFinite(silentExecuteConfidence) ? silentExecuteConfidence : 0.9,
          autoApplyInViewer: Boolean(data?.autoApplyInViewer),
          autoApplyComputeBundles: Boolean(data?.autoApplyComputeBundles),
        });
      } catch {
        if (cancelled) return;
        setEditingPolicy({ alwaysConfirmOperators: [], silentExecuteConfidence: 1.01, autoApplyInViewer: false, autoApplyComputeBundles: false });
      }
    })();
    return () => {
      cancelled = true;
    };
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
    setExcelHistoryState({ canUndo: false, canRedo: false });
    setExcelFontFamily('Calibri');
    setExcelFontSizePt(11);
    setExcelColorHex('#000000');
    setPptxDraftText('');
    setPptxLayout('TITLE_AND_BODY');
    setPptxStatusMsg('');
    setPdfStatusMsg('');
    setDocxFontFamily('Calibri');
    setDocxFontSizePx('16px');
    setDocxColorHex('#111827');
    setDocxActiveFormats({ bold: false, italic: false, underline: false, strikethrough: false });
    setDocxListType('');
    setDocxAlignment('');
  }, [documentId]);

  const editSessionSignature = useCallback((sessionLike) => {
    const s = sessionLike || {};
    const targetId = String(s?.target?.id || s?.targetId || s?.targetHint || '').trim();
    const afterText = String(s?.proposedText || s?.diff?.after || '').trim().slice(0, 240);
    const beforeText = String(s?.beforeText || s?.diff?.before || '').trim().slice(0, 240);
    const op = String(s?.canonicalOperator || s?.operator || '').trim().toUpperCase();
    const domain = String(s?.domain || '').trim().toLowerCase();
    const docId = String(s?.documentId || '').trim();
    return `${docId}|${domain}|${op}|${targetId}|${beforeText}|${afterText}`;
  }, []);

  const matchesIncomingEditSession = useCallback((queueEntry, incomingSession) => {
    if (!queueEntry || !incomingSession) return false;
    const queueSession = queueEntry?.session || {};
    const entryDocId = String(queueSession?.documentId || '').trim();
    const incomingDocId = String(incomingSession?.documentId || '').trim();
    if (entryDocId && incomingDocId && entryDocId !== incomingDocId) return false;
    return editSessionSignature(queueSession) === editSessionSignature(incomingSession);
  }, [editSessionSignature]);

  // Listen for edit discard events from the chat (Cancel button)
  useEffect(() => {
    const onEditDiscard = (e) => {
      const es = e?.detail?.editSession;
      if (!es) return;
      // Match by documentId — only discard drafts for this viewer's document
      if (es.documentId && es.documentId !== documentId) return;
      const matchingDraftIds = new Set(
        (Array.isArray(editSessionsQueue) ? editSessionsQueue : [])
          .filter((entry) => entry?.status === 'drafted' && matchesIncomingEditSession(entry, es))
          .map((entry) => String(entry?.id || ''))
          .filter(Boolean),
      );
      // Discard only matching pending drafts in the canvas and update state
      setDraftEdits((prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((d) => {
          if (d?.status !== 'drafted') return d;
          if (matchingDraftIds.size > 0 && !matchingDraftIds.has(String(d?.id || ''))) return d;
          const domain = String(d?.session?.domain || '').trim().toLowerCase();
          try {
            if (domain === 'docx') docxCanvasRef.current?.discardDraft?.({ draftId: d.id });
            if (domain === 'sheets') excelCanvasRef.current?.discardDraftOps?.({ draftId: d.id });
          } catch {}
          return { ...d, status: 'discarded' };
        });
      });
      // Also mark entries in the sessions queue as discarded
      setEditSessionsQueue((prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((entry) => {
          if (entry?.status !== 'drafted') return entry;
          if (matchingDraftIds.size > 0 && !matchingDraftIds.has(String(entry?.id || ''))) return entry;
          return { ...entry, status: 'discarded' };
        });
      });
      setActiveDraftId((prev) => {
        if (!prev) return '';
        if (matchingDraftIds.size === 0) return '';
        return matchingDraftIds.has(String(prev)) ? '' : prev;
      });
      if (matchingDraftIds.size > 0) {
        setFrozenSelection(null);
        setLiveViewerSelection(null);
        lastSelectionRef.current = null;
        setSelectionOverlay({ rects: [], frozen: false });
        try { window.getSelection?.()?.removeAllRanges?.(); } catch {}
      }
    };
    window.addEventListener('koda:edit-discard', onEditDiscard);
    return () => window.removeEventListener('koda:edit-discard', onEditDiscard);
  }, [documentId, editSessionsQueue, matchesIncomingEditSession]);

  // Listen for edit applied events from the chat (Apply button)
  useEffect(() => {
    const onEditApplied = async (e) => {
      const es = e?.detail?.editSession;
      const revisionId = e?.detail?.revisionId;
      if (!es) return;
      // Match by documentId
      if (es.documentId && es.documentId !== documentId) return;
      const domain = String(es?.domain || '').trim().toLowerCase();
      const matchingDraftIds = new Set(
        (Array.isArray(editSessionsQueue) ? editSessionsQueue : [])
          .filter((entry) => entry?.status === 'drafted' && matchesIncomingEditSession(entry, es))
          .map((entry) => String(entry?.id || ''))
          .filter(Boolean),
      );

      // Accept only matching drafted entries in the canvas and mark them applied
      setDraftEdits((prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((d) => {
          if (d?.status !== 'drafted') return d;
          if (matchingDraftIds.size > 0 && !matchingDraftIds.has(String(d?.id || ''))) return d;
          try {
            if (domain === 'docx') docxCanvasRef.current?.acceptDraft?.({ draftId: d.id });
          } catch {}
          return { ...d, status: 'applied', revisionId: revisionId || null };
        });
      });
      setEditSessionsQueue((prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((entry) => {
          if (entry?.status !== 'drafted') return entry;
          if (matchingDraftIds.size > 0 && !matchingDraftIds.has(String(entry?.id || ''))) return entry;
          return { ...entry, status: 'applied', revisionId: revisionId || null };
        });
      });
      setActiveDraftId((prev) => {
        if (!prev) return '';
        if (matchingDraftIds.size === 0) return '';
        return matchingDraftIds.has(String(prev)) ? '' : prev;
      });
      if (matchingDraftIds.size > 0) {
        setFrozenSelection(null);
        setLiveViewerSelection(null);
        lastSelectionRef.current = null;
        setSelectionOverlay({ rects: [], frozen: false });
        try { window.getSelection?.()?.removeAllRanges?.(); } catch {}
      }

      // Reload the document to reflect the saved revision
      if (revisionId && revisionId !== documentId) {
        // New revision ID — navigate to it
        try {
          if (domain === 'docx' || domain === 'sheets') {
            sessionStorage.setItem('koda_open_allybi_for_doc', String(revisionId));
          }
        } catch {}
        try { navigate(buildRoute.document(revisionId)); } catch {}
      } else {
        // Same document ID (overwrite mode) — reload canvas
        // Small delay to ensure backend file upload propagated to storage
        await new Promise((r) => setTimeout(r, 350));
        try {
          if (domain === 'docx') {
            await docxCanvasRef.current?.reload?.();
            // Sync toolbar to reflect the new formatting state
            const targetPid = es?.target?.id || es?.patches?.[0]?.paragraphId || '';
            syncToolbarAfterDocxReloadRef.current?.(targetPid);
          }
          if (domain === 'sheets') await excelCanvasRef.current?.reload?.();
        } catch (reloadErr) {
          console.error('[koda:edit-applied] reload failed:', reloadErr);
        }
      }
    };
    window.addEventListener('koda:edit-applied', onEditApplied);
    return () => window.removeEventListener('koda:edit-applied', onEditApplied);
  }, [documentId, editSessionsQueue, matchesIncomingEditSession, navigate]);

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
  const overlayRefreshRafRef = useRef(0);
  const [frozenSelection, setFrozenSelection] = useState(() => (null));
  const [liveViewerSelection, setLiveViewerSelection] = useState(() => (null));
  const [excelSelectionClearNonce, setExcelSelectionClearNonce] = useState(0);
  const suppressExcelLiveSelectionUntilRef = useRef(0);
  const selectionFreezeGateUntilRef = useRef(0);
  const frozenSelectionRef = useRef(null);
  const lastSelectionRef = useRef(null);
  const lastSelectionCapturedAtRef = useRef(0);

  useEffect(() => {
    frozenSelectionRef.current = frozenSelection || null;
  }, [frozenSelection]);

  const mergeDocxSelections = useCallback((baseSel, incomingSel) => {
    if (!incomingSel || String(incomingSel?.domain || '') !== 'docx') return baseSel || null;
    if (!baseSel || String(baseSel?.domain || '') !== 'docx') return incomingSel;

    const toRanges = (sel) => {
      const existing = Array.isArray(sel?.ranges) ? sel.ranges : [];
      if (existing.length) return existing;
      const pid = String(sel?.paragraphId || '').trim();
      if (!pid) return [];
      const text = String(sel?.text || '').trim();
      const start = Number.isFinite(Number(sel?.start)) ? Number(sel.start) : 0;
      const end = Number.isFinite(Number(sel?.end)) ? Number(sel.end) : (text ? text.length : start);
      return [{ paragraphId: pid, text, start, end }];
    };

    const all = [...toRanges(baseSel), ...toRanges(incomingSel)].filter(Boolean);
    const byParagraph = new Map();
    const noParagraph = [];
    for (const range of all) {
      const paragraphId = String(range?.paragraphId || '').trim();
      if (!paragraphId) {
        noParagraph.push(range);
        continue;
      }
      // Keep the latest complete range object for each paragraph so hash/offset metadata survives.
      const normalized = {
        ...range,
        paragraphId,
      };
      byParagraph.set(paragraphId, normalized);
    }
    const mergedRanges = [
      ...Array.from(byParagraph.values()),
      ...noParagraph,
    ];

    const mergedText = mergedRanges
      .map((range) => String(range?.text || '').trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, 2000);

    return {
      ...incomingSel,
      domain: 'docx',
      paragraphId: String(baseSel?.paragraphId || incomingSel?.paragraphId || mergedRanges?.[0]?.paragraphId || '').trim(),
      ranges: mergedRanges,
      text: mergedText || String(incomingSel?.text || baseSel?.text || '').slice(0, 2000),
    };
  }, []);

  const mergeSheetsSelections = useCallback((baseSel, incomingSel) => {
    if (!incomingSel || String(incomingSel?.domain || '') !== 'sheets') return baseSel || null;
    if (!baseSel || String(baseSel?.domain || '') !== 'sheets') return incomingSel;

    const toRanges = (sel) => {
      const existing = Array.isArray(sel?.ranges) ? sel.ranges : [];
      if (existing.length) return existing;
      const rangeA1 = String(sel?.rangeA1 || '').trim().toUpperCase();
      if (!rangeA1) return [];
      return [{ sheetName: String(sel?.sheetName || '').trim(), rangeA1 }];
    };

    const all = [...toRanges(baseSel), ...toRanges(incomingSel)].filter(Boolean);
    const seen = new Set();
    const mergedRanges = all.filter((range) => {
      const key = `${String(range?.sheetName || '').trim().toLowerCase()}!${String(range?.rangeA1 || '').trim().toUpperCase()}`;
      if (!key || key === '!' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const mergedText = [String(baseSel?.text || '').trim(), String(incomingSel?.text || '').trim()]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 2000);

    return {
      ...incomingSel,
      domain: 'sheets',
      ranges: mergedRanges,
      sheetName: String(incomingSel?.sheetName || baseSel?.sheetName || mergedRanges?.[0]?.sheetName || '').trim(),
      rangeA1: mergedRanges.length === 1 ? String(mergedRanges[0]?.rangeA1 || '').trim() : '',
      text: mergedText || String(incomingSel?.text || '').slice(0, 2000),
    };
  }, []);

  const holdSelectionOverlayPosition = useCallback((ms = 220) => {
    selectionFreezeGateUntilRef.current = Date.now() + Math.max(80, Number(ms) || 0);
  }, []);

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
      setAssistantTab('changes');
      setViewerFocusNonce((n) => n + 1);

      const makeKey = (sess) => {
        const sig = JSON.stringify({
          operator: sess?.canonicalOperator || sess?.operator || '',
          domain: sess?.domain || '',
          target: sess?.target?.id || sess?.targetId || sess?.targetHint || '',
          before: String(sess?.beforeText || '').slice(0, 240),
          after: String(sess?.diff?.after || sess?.proposedText || '').slice(0, 240),
        });
        return `${sess?.documentId || ''}:${sig}`;
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
        const explicitTargetId = String(sess?.target?.id || sess?.targetId || '').trim();
        const resolutionReason = String(sess?.target?.resolutionReason || '').trim().toLowerCase();
        const isDocumentWide =
          explicitTargetId === 'document' ||
          resolutionReason === 'translate_all_docx' ||
          resolutionReason === 'normalize_headings_docx' ||
          resolutionReason === 'heading_style_normalization';
        if (isDocumentWide) return '';
        const bundlePatches = extractDocxBundlePatches(sess);
        if (bundlePatches.length) {
          const first = bundlePatches.find((p) => p?.paragraphId) || null;
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

      const domain = String(s?.domain || '').trim().toLowerCase();
      if (domain === 'docx') {
        const start = Date.now();
        while (!cancelled && !docxCanvasRef.current && Date.now() - start < 2600) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 80));
        }
        if (cancelled) return;

        try {
          // Draft preview: apply into the live editable canvas (no revision committed yet).
          const bundlePatches = extractDocxBundlePatches(s);
          if (bundlePatches.length) {
            await docxCanvasRef.current?.applyParagraphPatches?.({ draftId: entryId, patches: bundlePatches });
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
            const cRect = container.getBoundingClientRect?.();
            if (!rect || !cRect || (!rect.width && !rect.height)) return;
            const pad = 3;
            setSelectionOverlay({
              frozen: true,
              rects: [{
                top: Math.max(0, rect.top - cRect.top + container.scrollTop - pad),
                left: Math.max(0, rect.left - cRect.left + container.scrollLeft - pad),
                width: rect.width + pad * 2,
                height: rect.height + pad * 2,
              }],
            });
            const text =
              String(s?.target?.previewText || '').trim() ||
              String(s?.diff?.before || s?.beforeText || '').trim() ||
              String(el.textContent || '').trim();
            setLiveViewerSelection((prev) => prev || { domain: 'docx', paragraphId: targetId, text: String(text || '').slice(0, 2000) });
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

  const clearFrozenSelection = useCallback((opts = {}) => {
    const preserveExcelSelection = Boolean(opts?.preserveExcelSelection);
    if (!preserveExcelSelection) {
      suppressExcelLiveSelectionUntilRef.current = Date.now() + 1500;
      setFrozenSelection(null);
      frozenSelectionRef.current = null; // sync ref immediately to prevent stale lock in selectionchange
      setLiveViewerSelection(null);
      lastSelectionRef.current = null;
      lastSelectionCapturedAtRef.current = 0;
      setSelectionOverlay({ rects: [], frozen: false });
      clearSelectionBubble();
    }
    // Excel: clear the locked/drag selection only when the user explicitly clears it.
    if (!preserveExcelSelection) {
      try {
        excelCanvasRef.current?.clearSelection?.({ recordHistory: false });
        excelCanvasRef.current?.clearLockedCells?.();
      } catch {}
      // Defensive retries: the canvas can still be processing pointer-up/selection events.
      window.setTimeout(() => {
        try {
          excelCanvasRef.current?.clearSelection?.({ recordHistory: false });
          excelCanvasRef.current?.clearLockedCells?.();
        } catch {}
      }, 0);
      window.setTimeout(() => {
        try {
          excelCanvasRef.current?.clearSelection?.({ recordHistory: false });
          excelCanvasRef.current?.clearLockedCells?.();
        } catch {}
      }, 120);
    }
    try {
      const sel = window.getSelection?.();
      sel?.removeAllRanges?.();
    } catch {}
    if (!preserveExcelSelection) {
      setExcelSelectionClearNonce((n) => n + 1);
    }
  }, [clearSelectionBubble]);

  const hasSheetsSelectionPayload = useCallback((sel) => Boolean(
    sel &&
    (
      (typeof sel?.text === 'string' && sel.text.trim()) ||
      (typeof sel?.rangeA1 === 'string' && sel.rangeA1.trim()) ||
      (Array.isArray(sel?.ranges) && sel.ranges.length > 0)
    )
  ), []);

  const sheetsSelectionKey = useCallback((sel) => {
    if (!hasSheetsSelectionPayload(sel)) return '';
    const text = String(sel?.text || '').trim();
    const sheetName = String(sel?.sheetName || '').trim().toLowerCase();
    const rangeA1 = String(sel?.rangeA1 || '').trim().toUpperCase();
    const ranges = Array.isArray(sel?.ranges)
      ? sel.ranges
          .map((r) => `${String(r?.sheetName || '').trim().toLowerCase()}!${String(r?.rangeA1 || '').trim().toUpperCase()}`)
          .filter(Boolean)
          .sort()
      : [];
    return `${sheetName}|${rangeA1}|${text}|${ranges.join('||')}`;
  }, [hasSheetsSelectionPayload]);

  const handleExcelLiveSelectionChange = useCallback((sel) => {
    const suppressUntil = Number(suppressExcelLiveSelectionUntilRef.current || 0);
    if (Date.now() < suppressUntil) {
      // Ignore transient re-emits while a manual clear is in progress.
      return;
    }
    const next = hasSheetsSelectionPayload(sel) ? sel : null;
    const nextKey = sheetsSelectionKey(next);
    setLiveViewerSelection((prev) => {
      const prevKey = sheetsSelectionKey(prev);
      return prevKey === nextKey ? prev : next;
    });
  }, [hasSheetsSelectionPayload, sheetsSelectionKey]);

  const handleExcelAskAllybi = useCallback((sel) => {
    if (!hasSheetsSelectionPayload(sel)) return;
    const shouldMerge = Boolean(editingOpenRef.current && frozenSelectionRef.current);
    const nextSel = shouldMerge
      ? mergeSheetsSelections(frozenSelectionRef.current, sel)
      : sel;
    const nextKey = sheetsSelectionKey(nextSel);
    setFrozenSelection((prev) => (sheetsSelectionKey(prev) === nextKey ? prev : nextSel));
    setLiveViewerSelection((prev) => (sheetsSelectionKey(prev) === nextKey ? prev : nextSel));
    setEditingOpen(true);
    setSelectionOverlay({ rects: [], frozen: false });
    setViewerFocusNonce((n) => n + 1);
  }, [hasSheetsSelectionPayload, mergeSheetsSelections, sheetsSelectionKey]);

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
    setFrozenSelection(null);
    setLiveViewerSelection(null);
    setSelectionOverlay({ rects: [], frozen: false });
    lastSelectionRef.current = null;
    lastSelectionCapturedAtRef.current = 0;
    frozenSelectionRef.current = null;
  }, [documentId, clearSelectionBubble]);

  const clipSelection = useCallback((s, n = 280) => {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    if (!t) return '';
    return t.length <= n ? t : t.slice(0, n).trimEnd() + '…';
  }, []);

  const captureSelectionOverlayRects = useCallback(() => {
    try {
      const container = documentContainerRef.current;
      const sel = window.getSelection?.();
      if (!container || !sel || sel.rangeCount === 0 || sel.isCollapsed) return [];
      const range = sel.getRangeAt(0);
      const containerRect = container.getBoundingClientRect?.();
      // Clamp rects to the docx page so highlights never bleed into the margin.
      const pageEl = container.querySelector?.('[data-docx-edit-host]');
      const pageRect = pageEl?.getBoundingClientRect?.();
      let pageLeft = 0;
      let pageRight = Infinity;
      if (pageRect && containerRect) {
        pageLeft = pageRect.left - containerRect.left + container.scrollLeft;
        pageRight = pageLeft + pageRect.width;
      }
      const rects = Array.from(range.getClientRects?.() || [])
        .filter((r) => r && r.width > 0 && r.height > 0)
        .slice(0, 24)
        .map((r) => {
          const top = containerRect ? (r.top - containerRect.top + container.scrollTop) : r.top;
          let left = containerRect ? (r.left - containerRect.left + container.scrollLeft) : r.left;
          let width = r.width;
          if (left < pageLeft) { width -= (pageLeft - left); left = pageLeft; }
          if (left + width > pageRight) { width = pageRight - left; }
          return { top, left, width, height: r.height };
        })
        .filter((r) => r.width > 1);
      return rects;
    } catch {
      return [];
    }
  }, []);

  const captureSelectedParagraphIdsFromDom = useCallback(() => {
    try {
      const container = documentContainerRef.current;
      const sel = window.getSelection?.();
      if (!container || !sel || sel.rangeCount === 0 || sel.isCollapsed) return [];
      const range = sel.getRangeAt(0);
      const nodes = Array.from(container.querySelectorAll?.('[data-paragraph-id]') || []);
      if (!nodes.length) return [];
      const out = [];
      for (const el of nodes) {
        try {
          const pid = String(el?.getAttribute?.('data-paragraph-id') || '').trim();
          if (!pid) continue;
          const hit = typeof range.intersectsNode === 'function'
            ? range.intersectsNode(el)
            : false;
          if (hit) out.push(pid);
        } catch {
          // ignore this node
        }
      }
      return Array.from(new Set(out));
    } catch {
      return [];
    }
  }, []);

  const refreshFrozenOverlay = useCallback((selOverride) => {
    const container = documentContainerRef.current;
    const sel = selOverride || frozenSelection;
    if (!container || !sel || sel.domain !== 'docx') return;
    try {
      const out = getDocxViewerSelectionV2ClientRects(container, sel, { maxRects: 16 });
      const rects = Array.isArray(out?.rects) ? out.rects : [];
      if (!rects.length) {
        // Fallback: for coarse/fuzzy locks without exact offsets, highlight the target paragraph.
        const pid = String(
          sel?.paragraphId ||
          sel?.ranges?.[0]?.paragraphId ||
          lastSelectionRef.current?.paragraphId ||
          lastSelectionRef.current?.ranges?.[0]?.paragraphId ||
          ''
        ).trim();
        if (pid) {
          const safeId = (() => {
            try {
              if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function') {
                return window.CSS.escape(pid);
              }
            } catch {}
            return pid.replace(/"/g, '\\"');
          })();
          const el = container.querySelector?.(`[data-paragraph-id="${safeId}"]`) || null;
          const r = el?.getBoundingClientRect?.();
          const c = container.getBoundingClientRect?.();
          if (r && c && r.width > 0 && r.height > 0) {
            const pad = 3;
            setSelectionOverlay({
              rects: [{
                top: Math.max(0, r.top - c.top + container.scrollTop - pad),
                left: Math.max(0, r.left - c.left + container.scrollLeft - pad),
                width: r.width + pad * 2,
                height: r.height + pad * 2,
              }],
              frozen: true,
            });
            return;
          }
        }
        return;
      }
      setSelectionOverlay({ rects, frozen: true });
    } catch {
      // ignore
    }
  }, [frozenSelection]);

  const updateSelectionBubbleFromDom = useCallback(() => {
    // Excel has its own selection model in ExcelEditCanvas; avoid DOM selection sync loops.
    if (currentFileType === 'excel') return;
    try {
      const freezeUntil = Number(selectionFreezeGateUntilRef.current || 0);
      if (Date.now() < freezeUntil) return;

      const container = documentContainerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect?.();
      const lockedSelection = frozenSelectionRef.current;
      const hasFrozenLock = Boolean(editingOpenRef.current && lockedSelection);
      if (hasFrozenLock) {
        // If the user is making a NEW selection inside the document, let it
        // through so the lock updates to the new target.  Otherwise keep
        // the existing frozen selection (e.g. when focus moves to the chat input).
        const domSel = window.getSelection?.();
        const hasNewDomSel = domSel && domSel.rangeCount > 0 && !domSel.isCollapsed && container.contains(domSel.anchorNode);
        if (!hasNewDomSel) {
          setLiveViewerSelection((prev) => prev || lockedSelection);
          setSelectionOverlay((prev) => {
            const rects = Array.isArray(prev?.rects) ? prev.rects : [];
            if (prev?.frozen && prev?.rects === rects) return prev;
            return { rects, frozen: true };
          });
          try { refreshFrozenOverlay(lockedSelection); } catch {}
          return;
        }
        // Fall through: user is selecting new text — process it normally.
      }
      const hasSelectionPayload = (s) => Boolean(
        s &&
        (
          (typeof s?.text === 'string' && s.text.trim()) ||
          (typeof s?.rangeA1 === 'string' && s.rangeA1.trim()) ||
          (Array.isArray(s?.ranges) && s.ranges.length > 0) ||
          (typeof s?.cursorParagraphId === 'string' && s.cursorParagraphId.trim())
        )
      );
      const stickyLiveSelection =
        !hasFrozenLock &&
        Boolean(editingOpen) &&
        hasSelectionPayload(lastSelectionRef.current);

      const sel = window.getSelection?.();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        // Cursor-only: detect if the collapsed cursor is inside a paragraph in our
        // editor surface and expose it as a cursor-only selection for formatting ops.
        if (sel?.rangeCount > 0 && sel.isCollapsed && editingOpenRef.current) {
          try {
            const range = sel.getRangeAt(0);
            const node = range?.startContainer;
            const el = node?.nodeType === 1 ? node : node?.parentElement;
            const paraEl = el?.closest?.('[data-paragraph-id]');
            const pid = String(paraEl?.getAttribute?.('data-paragraph-id') || '').trim();
            if (pid && container?.contains?.(paraEl)) {
              const cursorSel = {
                domain: 'docx',
                paragraphId: pid,
                text: '',
                ranges: [],
                cursorParagraphId: pid,
                frozenAtIso: new Date().toISOString(),
                preview: '',
                selectionKind: 'cursor',
              };
              setLiveViewerSelection(cursorSel);
              lastSelectionRef.current = cursorSel;
              lastSelectionCapturedAtRef.current = Date.now();
              setFrozenSelection(cursorSel);
              return;
            }
          } catch {}
        }
        if (hasFrozenLock) {
          setLiveViewerSelection((prev) => prev || frozenSelection);
          setSelectionOverlay((prev) => (prev?.frozen ? prev : { rects: [], frozen: false }));
          return;
        }
        if (stickyLiveSelection) {
          setLiveViewerSelection((prev) => prev || lastSelectionRef.current);
          setSelectionOverlay((prev) => (
            Array.isArray(prev?.rects) && prev.rects.length
              ? { rects: prev.rects, frozen: true }
              : { rects: [], frozen: false }
          ));
          return;
        }
        setLiveViewerSelection(null);
        lastSelectionRef.current = null;
        // If the overlay is frozen (assistant open), keep the bubble so the toggle still shows.
        setSelectionOverlay((prev) => {
          if (prev?.frozen) return prev;
          clearSelectionBubble();
          return { rects: [], frozen: false };
        });
        return;
      }
      const rawText = String(sel.toString() || '').trim();
      if (!rawText || rawText.replace(/\s+/g, '').length < 2) {
        if (hasFrozenLock) {
          setLiveViewerSelection((prev) => prev || frozenSelection);
          setSelectionOverlay((prev) => (prev?.frozen ? prev : { rects: [], frozen: false }));
          return;
        }
        if (stickyLiveSelection) {
          setLiveViewerSelection((prev) => prev || lastSelectionRef.current);
          setSelectionOverlay((prev) => (
            Array.isArray(prev?.rects) && prev.rects.length
              ? { rects: prev.rects, frozen: true }
              : { rects: [], frozen: false }
          ));
          return;
        }
        setLiveViewerSelection(null);
        lastSelectionRef.current = null;
        setSelectionOverlay((prev) => {
          if (prev?.frozen) return prev;
          clearSelectionBubble();
          return { rects: [], frozen: false };
        });
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect?.();
      if (!rect || (!rect.width && !rect.height)) {
        if (!hasFrozenLock) {
          if (stickyLiveSelection) {
            setLiveViewerSelection((prev) => prev || lastSelectionRef.current);
            return;
          }
          setLiveViewerSelection(null);
          lastSelectionRef.current = null;
          clearSelectionBubble();
        }
        return;
      }

      const ancestorNode = range.commonAncestorContainer;
      const ancestorEl =
        ancestorNode?.nodeType === 1 ? ancestorNode : ancestorNode?.parentElement || null;
      if (!ancestorEl || !container.contains(ancestorEl)) {
        if (!hasFrozenLock) {
          if (stickyLiveSelection) {
            setLiveViewerSelection((prev) => prev || lastSelectionRef.current);
            return;
          }
          setLiveViewerSelection(null);
          lastSelectionRef.current = null;
          clearSelectionBubble();
        }
        return;
      }

      const p = ancestorEl.closest?.('[data-paragraph-id]');
      const paragraphId = p?.getAttribute?.('data-paragraph-id') || '';

      // Persist the selection target for the viewer chat so the backend can apply exact edits.
      // Use the richer v2 selection model (offsets + hash) when available.
      // Capture selection via the explicit Range so clicking "Ask Allybi" doesn't change the target.
      const v2 = (() => {
        try {
          const r = sel.getRangeAt(0)?.cloneRange?.();
          if (r) return getDocxViewerSelectionV2FromRange(container, r);
        } catch {}
        return docxCanvasRef.current?.getViewerSelectionV2?.() || getDocxViewerSelectionV2(container);
      })();
      const effectiveParagraphId = String(
        paragraphId ||
        v2?.paragraphId ||
        v2?.ranges?.[0]?.paragraphId ||
        ''
      ).trim();
      const selectionPayload = v2
        ? { ...v2, paragraphId: effectiveParagraphId, text: String(v2.text || rawText || '').slice(0, 2000) }
        : { domain: 'docx', paragraphId: effectiveParagraphId, text: rawText.slice(0, 2000) };

      // A fresh user selection should replace stale locked targets.
      // Merging with previous frozen selections can incorrectly keep old title targets,
      // causing follow-up transforms to apply to the wrong paragraph.
      const nextSelectionPayload = selectionPayload;

      // Always update the active viewer selection, including merged multi-paragraph selections.
      setLiveViewerSelection(nextSelectionPayload);
      lastSelectionRef.current = nextSelectionPayload;
      lastSelectionCapturedAtRef.current = Date.now();

      // When the editing panel is open, freeze the selection so it persists
      // when focus moves to the chat input. This also enables the "Selection
      // locked" pill and Clear button in the chat.
      if (editingOpenRef.current) {
        setFrozenSelection(nextSelectionPayload);
      }

      // Keep a visible lock highlight in the document.
      try {
        const toContainerRect = (r, pad = 0) => {
          const top = containerRect ? (r.top - containerRect.top + container.scrollTop) : r.top;
          const left = containerRect ? (r.left - containerRect.left + container.scrollLeft) : r.left;
          return {
            top: Math.max(0, top - pad),
            left: Math.max(0, left - pad),
            width: r.width + pad * 2,
            height: r.height + pad * 2,
          };
        };
        const rects = Array.from(range.getClientRects?.() || [])
          .filter((r) => r && r.width > 0 && r.height > 0)
          .slice(0, 16)
          .map((r) => toContainerRect(r, 0));
        setSelectionOverlay({ rects, frozen: !!editingOpen });
      } catch {}

      setSelectionBubble({
        rawText: rawText.slice(0, 2000),
        text: clipSelection(rawText),
        paragraphId: effectiveParagraphId,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      });

    } catch {
      // ignore
    }
  }, [clearSelectionBubble, clipSelection, currentFileType]);

  // Keep viewer selection lock in sync with the user's active selection, even when
  // mouseup/keyup do not fire on the container (e.g., drag release outside bounds).
  useEffect(() => {
    let raf = 0;
    const onSelectionChange = () => {
      try {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          raf = 0;
          updateSelectionBubbleFromDom();
        });
      } catch {
        updateSelectionBubbleFromDom();
      }
    };
    window.document.addEventListener('selectionchange', onSelectionChange, true);
    return () => {
      try { window.document.removeEventListener('selectionchange', onSelectionChange, true); } catch {}
      try { if (raf) cancelAnimationFrame(raf); } catch {}
    };
  }, [updateSelectionBubbleFromDom]);

  // Dismiss "Ask Allybi" bubble when clicking outside the document area.
  useEffect(() => {
    const onMouseDown = (e) => {
      const container = documentContainerRef.current;
      if (!container) return;
      // If the click is inside the document container, do nothing (selectionchange handles it).
      if (container.contains(e.target)) return;
      // Don't dismiss if clicking the bubble itself (it has e.preventDefault already).
      const bubble = e.target.closest?.('[data-ask-allybi-bubble]');
      if (bubble) return;
      clearSelectionBubble();
    };
    window.addEventListener('mousedown', onMouseDown, true);
    return () => window.removeEventListener('mousedown', onMouseDown, true);
  }, [clearSelectionBubble]);


  const onContainerScroll = useCallback(() => {
    if (!selectionOverlay?.frozen) return;
    try {
      if (overlayRefreshRafRef.current) cancelAnimationFrame(overlayRefreshRafRef.current);
      overlayRefreshRafRef.current = requestAnimationFrame(() => {
        overlayRefreshRafRef.current = 0;
        refreshFrozenOverlay();
      });
    } catch {
      refreshFrozenOverlay();
    }
  }, [refreshFrozenOverlay, selectionOverlay?.frozen]);

  useEffect(() => () => {
    try {
      if (overlayRefreshRafRef.current) cancelAnimationFrame(overlayRefreshRafRef.current);
      overlayRefreshRafRef.current = 0;
    } catch {}
  }, []);

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

  // If the editor panel opens/closes (layout change), re-anchor the frozen selection overlay
  // from the semantic selection model so it doesn't "slide" due to reflow.
  useEffect(() => {
    if (!editingOpen) return;
    refreshFrozenOverlay();
    // Also re-run after the panel has actually mounted and the layout has settled.
    const t = window.setTimeout(() => refreshFrozenOverlay(), 80);
    return () => window.clearTimeout(t);
  }, [editingOpen, refreshFrozenOverlay]);

  useEffect(() => {
    if (!editingOpen || !frozenSelection) return;
    refreshFrozenOverlay(frozenSelection);
    const t = window.setTimeout(() => refreshFrozenOverlay(frozenSelection), 80);
    return () => window.clearTimeout(t);
  }, [editingOpen, frozenSelection, refreshFrozenOverlay]);

  // Re-anchor the frozen overlay on container resize (wrap changes can otherwise desync rects).
  useEffect(() => {
    if (!editingOpen) return;
    const container = documentContainerRef.current;
    if (!container) return;
    let ro;
    try {
      ro = new ResizeObserver(() => refreshFrozenOverlay());
      ro.observe(container);
    } catch {
      // Fallback: window resize only.
      const onResize = () => refreshFrozenOverlay();
      window.addEventListener('resize', onResize, { passive: true });
      return () => window.removeEventListener('resize', onResize);
    }
    return () => {
      try { ro?.disconnect?.(); } catch {}
    };
  }, [editingOpen, refreshFrozenOverlay]);

  const editingOpenRef = useRef(false);
  useEffect(() => { editingOpenRef.current = editingOpen; }, [editingOpen]);

  const handleAskAllybiClick = useCallback((event) => {
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();
    if (!supportsViewerEditing) {
      showInfo(t('documentViewer.comingSoon'));
      return false;
    }
    return true;
  }, [supportsViewerEditing, showInfo, t]);

  const toggleEditingPanel = useCallback(() => {
    const wasOpen = editingOpenRef.current;
    const next = !wasOpen;

    if (next && !supportsViewerEditing) {
      showInfo(t('documentViewer.comingSoon'));
      return;
    }

    if (!next) {
      // Closing: unfreeze overlay and clear the bubble.
      setEditingOpen(false);
      setSelectionOverlay({ rects: [], frozen: false });
      clearSelectionBubble();
      setFrozenSelection(null);
    } else {
      // Opening — flush any pending manual edits so they aren't lost
      try { docxCanvasRef.current?.flushDirtyParagraphs?.(); } catch {}
      holdSelectionOverlayPosition(280);
      const hasActiveDomSelection = () => {
        try {
          const container = documentContainerRef.current;
          const sel = window.getSelection?.();
          if (!container || !sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
          const range = sel.getRangeAt(0);
          const node = range?.commonAncestorContainer;
          const el = node?.nodeType === 1 ? node : node?.parentElement || null;
          return Boolean(el && container.contains(el));
        } catch {
          return false;
        }
      };
      const getRecentDocxSelection = () => {
        const cached = lastSelectionRef.current;
        if (!cached || String(cached?.domain || '') !== 'docx') return null;
        const ageMs = Date.now() - Number(lastSelectionCapturedAtRef.current || 0);
        if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 10000) return null;
        const text = String(cached?.text || '').trim();
        if (!text) return null;
        return cached;
      };
      setEditingOpen(true);
      const snapRects = captureSelectionOverlayRects();
      // Freeze the overlay so selection remains visible after focus moves.
      setSelectionOverlay((prev) => ({
        rects: snapRects.length
          ? snapRects
          : (Array.isArray(prev?.rects) ? prev.rects : []),
        frozen: true,
      }));
      // Seed using the active range OR the last captured semantic range (if very recent).
      const cached = getRecentDocxSelection();
      const shouldSeedSelection = hasActiveDomSelection() || Boolean(cached);
      const sel = shouldSeedSelection
        ? String(cached?.text || lastSelectionRef.current?.text || selectionBubble?.rawText || selectionBubble?.text || '').trim()
        : '';
      const paraId = String(cached?.paragraphId || lastSelectionRef.current?.paragraphId || selectionBubble?.paragraphId || '').trim();
      const convoId = editingConversation?.id || '';
      if (sel && convoId) {
        const domParagraphIds = captureSelectedParagraphIdsFromDom();
        const v2 =
          cached ||
          (lastSelectionRef.current && lastSelectionRef.current.domain === 'docx' ? lastSelectionRef.current : null) ||
          docxCanvasRef.current?.getViewerSelectionV2?.() ||
          getDocxViewerSelectionV2(documentContainerRef.current);
        const frozenBase = v2 ? { ...v2, text: sel } : { domain: 'docx', paragraphId: paraId, text: sel };
        const frozenWithDomIds = (() => {
          if (!domParagraphIds.length) return frozenBase;
          const next = { ...frozenBase };
          if (!String(next?.paragraphId || '').trim()) next.paragraphId = domParagraphIds[0];
          const ranges = Array.isArray(next?.ranges) ? next.ranges : [];
          const existing = new Set(ranges.map((r) => String(r?.paragraphId || '').trim()).filter(Boolean));
          const add = domParagraphIds
            .filter((pid) => !existing.has(pid))
            .map((pid) => {
              const block = Array.isArray(docxBlocks)
                ? docxBlocks.find((b) => String(b?.paragraphId || '').trim() === pid)
                : null;
              const text = String(block?.text || '').trim();
              return text
                ? { paragraphId: pid, text, start: 0, end: text.length }
                : { paragraphId: pid };
            });
          next.ranges = [...ranges, ...add];
          return next;
        })();
        setFrozenSelection(frozenWithDomIds);
        // Keep the highlight pinned to the correct text even after the right panel opens and the page reflows.
        setTimeout(() => refreshFrozenOverlay(frozenWithDomIds), 90);
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
      } else {
        // Avoid stale lock when panel opens without an active selection.
        setFrozenSelection(null);
      }
    }
    setShowAskKoda(false);
    try { sessionStorage.setItem('askKodaDismissed', 'true'); } catch {}
  }, [editingConversation?.id, selectionBubble?.rawText, selectionBubble?.text, selectionBubble?.paragraphId, docxBlocks, clearSelectionBubble, holdSelectionOverlayPosition, captureSelectionOverlayRects, captureSelectedParagraphIdsFromDom, refreshFrozenOverlay, supportsViewerEditing, showInfo, t]);

  const openEditingPanel = useCallback(({ seedSelection = true, focusInput = true } = {}) => {
    if (!supportsViewerEditing) {
      showInfo(t('documentViewer.comingSoon'));
      return;
    }
    holdSelectionOverlayPosition(280);
    const hasActiveDomSelection = () => {
      try {
        const container = documentContainerRef.current;
        const sel = window.getSelection?.();
        if (!container || !sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
        const range = sel.getRangeAt(0);
        const node = range?.commonAncestorContainer;
        const el = node?.nodeType === 1 ? node : node?.parentElement || null;
        return Boolean(el && container.contains(el));
      } catch {
        return false;
      }
    };
    const getRecentDocxSelection = () => {
      const cached = lastSelectionRef.current;
      if (!cached || String(cached?.domain || '') !== 'docx') return null;
      const ageMs = Date.now() - Number(lastSelectionCapturedAtRef.current || 0);
      if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 10000) return null;
      const text = String(cached?.text || '').trim();
      if (!text) return null;
      return cached;
    };
    setEditingOpen(true);
    const snapRects = captureSelectionOverlayRects();
    // Freeze the overlay so selection remains visible after focus moves.
    setSelectionOverlay((prev) => ({
      rects: snapRects.length
        ? snapRects
        : (Array.isArray(prev?.rects) ? prev.rects : []),
      frozen: true,
    }));
    const buildExcelSelectionSnapshot = () => {
      try {
        const hasSel = (s) => Boolean(
          s &&
          (
            (typeof s?.text === 'string' && s.text.trim()) ||
            (typeof s?.rangeA1 === 'string' && s.rangeA1.trim()) ||
            (Array.isArray(s?.ranges) && s.ranges.length > 0)
          )
        );
        const fromCanvas = excelCanvasRef.current?.getViewerSelection?.();
        if (hasSel(fromCanvas)) return fromCanvas;
        if (hasSel(frozenSelection) && frozenSelection?.domain === 'sheets') return frozenSelection;
        if (hasSel(liveViewerSelection) && liveViewerSelection?.domain === 'sheets') return liveViewerSelection;
      } catch {}
      return null;
    };
    if (seedSelection) {
      if (currentFileType === 'excel') {
        const sel = buildExcelSelectionSnapshot();
        if (sel) {
          setFrozenSelection(sel);
          setLiveViewerSelection(sel);
        }
      }

      const cached = getRecentDocxSelection();
      const shouldSeedSelection = hasActiveDomSelection() || Boolean(cached);
      const sel = shouldSeedSelection
        ? String(cached?.text || lastSelectionRef.current?.text || selectionBubble?.rawText || selectionBubble?.text || '').trim()
        : '';
      const paraId = String(cached?.paragraphId || lastSelectionRef.current?.paragraphId || selectionBubble?.paragraphId || '').trim();
      const convoId = editingConversation?.id || '';
      if (sel && convoId) {
        const domParagraphIds = captureSelectedParagraphIdsFromDom();
        // Prefer the cached selection model captured on mouseup so opening the panel
        // never changes the edit target (some browsers shift selection on click/focus).
        const cachedSelectionModel = cached ||
          ((lastSelectionRef.current && lastSelectionRef.current.domain === 'docx')
            ? lastSelectionRef.current
            : null);
        const v2 =
          cachedSelectionModel ||
          docxCanvasRef.current?.getViewerSelectionV2?.() ||
          getDocxViewerSelectionV2(documentContainerRef.current);
        const frozenBase = v2 ? { ...v2, text: sel } : { domain: 'docx', paragraphId: paraId, text: sel };
        const frozenWithDomIds = (() => {
          if (!domParagraphIds.length) return frozenBase;
          const next = { ...frozenBase };
          if (!String(next?.paragraphId || '').trim()) next.paragraphId = domParagraphIds[0];
          const ranges = Array.isArray(next?.ranges) ? next.ranges : [];
          const existing = new Set(ranges.map((r) => String(r?.paragraphId || '').trim()).filter(Boolean));
          const add = domParagraphIds
            .filter((pid) => !existing.has(pid))
            .map((pid) => {
              const block = Array.isArray(docxBlocks)
                ? docxBlocks.find((b) => String(b?.paragraphId || '').trim() === pid)
                : null;
              const text = String(block?.text || '').trim();
              return text
                ? { paragraphId: pid, text, start: 0, end: text.length }
                : { paragraphId: pid };
            });
          next.ranges = [...ranges, ...add];
          return next;
        })();
        setFrozenSelection(frozenWithDomIds);
        // Re-anchor highlight after the right panel opens and layout reflows, using the
        // captured semantic selection (not the live DOM selection which can drift on click).
        setTimeout(() => {
          try { refreshFrozenOverlay(frozenWithDomIds); } catch {}
        }, 90);
        try {
          const draft = `Rewrite the selected text:\n"${sel}"\n\n`;
          localStorage.setItem(`koda_draft_${convoId}`, draft);
          const quoteStart = draft.indexOf('"');
          const start = quoteStart >= 0 ? quoteStart + 1 : 0;
          const end = start + sel.length;
          sessionStorage.setItem(`koda_draft_select_${convoId}`, JSON.stringify({ start, end }));
        } catch {}
      } else if (currentFileType !== 'excel') {
        // For non-sheets, opening panel without active selection should not keep stale lock.
        setFrozenSelection(null);
      }
    }
    if (focusInput) setViewerFocusNonce((n) => n + 1);
  }, [editingConversation?.id, selectionBubble?.rawText, selectionBubble?.text, selectionBubble?.paragraphId, docxBlocks, refreshFrozenOverlay, supportsViewerEditing, frozenSelection, liveViewerSelection, holdSelectionOverlayPosition, captureSelectionOverlayRects, captureSelectedParagraphIdsFromDom, showInfo, t]);

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
    const isBackendUrl = documentUrl.includes('allybi.co') || documentUrl.includes('localhost:5000');
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

      const token = getCompatAccessToken();
      fetch(documentUrl, {
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
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
      const token = getCompatAccessToken();
      return {
        url: actualDocumentUrl,
        httpHeaders: token ? { 'Authorization': `Bearer ${token}` } : {},
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

  // getFileType() is defined at module scope.

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

          // Record document view in localStorage for "Continue" card
          try {
            const viewHistory = JSON.parse(localStorage.getItem('documentViewHistory') || '{}');
            viewHistory[documentId] = Date.now();
            localStorage.setItem('documentViewHistory', JSON.stringify(viewHistory));
          } catch (_) { /* ignore storage errors */ }

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
      if (!container) return;

      let range = null;
      if (sel && sel.rangeCount > 0) {
        try {
          range = sel.getRangeAt(0);
        } catch {
          range = null;
        }
      }
      const aEl = getSelectionElement(sel?.anchorNode || null);
      const fEl = getSelectionElement(sel?.focusNode || null);
      const hasActiveDomSelection = Boolean(
        range &&
        aEl &&
        fEl &&
        container.contains(aEl) &&
        container.contains(fEl)
      );

      const fallbackParagraphIds = Array.from(new Set([
        String(frozenSelectionRef.current?.paragraphId || '').trim(),
        ...(Array.isArray(frozenSelectionRef.current?.ranges)
          ? frozenSelectionRef.current.ranges.map((r) => String(r?.paragraphId || '').trim())
          : []),
        String(lastSelectionRef.current?.paragraphId || '').trim(),
        ...(Array.isArray(lastSelectionRef.current?.ranges)
          ? lastSelectionRef.current.ranges.map((r) => String(r?.paragraphId || '').trim())
          : []),
      ].filter(Boolean)));
      const probeEl = resolveDocxSelectionProbeElement({
        container,
        selection: sel || null,
        range,
        fallbackParagraphIds,
      });
      if (!probeEl) return;

      const queryState = (cmd) => (
        hasActiveDomSelection
          ? Boolean(window.document.queryCommandState?.(cmd))
          : false
      );
      const computed = window.getComputedStyle?.(probeEl) || null;
      if (computed) {
        const nextFontFamily = normalizeFontFamily(computed.fontFamily, 'Calibri');
        const nextFontSize = normalizeFontSizePx(computed.fontSize, '16px');
        const nextColor = normalizeCssColorToHex(computed.color, '#111827');
        setDocxFontFamily((prev) => (prev === nextFontFamily ? prev : nextFontFamily));
        setDocxFontSizePx((prev) => (prev === nextFontSize ? prev : nextFontSize));
        setDocxColorHex((prev) => (prev === nextColor ? prev : nextColor));
      }

      const computedWeight = String(computed?.fontWeight || '').trim().toLowerCase();
      const numericWeight = Number.parseInt(computedWeight, 10);
      const computedBold = computedWeight === 'bold' || (Number.isFinite(numericWeight) && numericWeight >= 600);
      const computedItalic = /italic|oblique/i.test(String(computed?.fontStyle || ''));
      const deco = String(computed?.textDecorationLine || computed?.textDecoration || '').toLowerCase();
      const computedUnderline = deco.includes('underline');
      const computedStrike = deco.includes('line-through');

      const bold = queryState('bold') || computedBold;
      const italic = queryState('italic') || computedItalic;
      const underline = queryState('underline') || computedUnderline;
      const strikethrough = queryState('strikeThrough') || computedStrike;
      setDocxActiveFormats((prev) => {
        const next = { bold, italic, underline, strikethrough };
        return prev.bold === next.bold &&
          prev.italic === next.italic &&
          prev.underline === next.underline &&
          prev.strikethrough === next.strikethrough
          ? prev
          : next;
      });

      const left = queryState('justifyLeft');
      const center = queryState('justifyCenter');
      const right = queryState('justifyRight');
      const full = queryState('justifyFull');
      const align = center
        ? 'center'
        : right
          ? 'right'
          : full
            ? 'justify'
            : left
              ? 'left'
              : alignmentFromTextAlign(computed?.textAlign);
      setDocxAlignment((prev) => (prev === align ? prev : align));

      const unordered = queryState('insertUnorderedList');
      const ordered = queryState('insertOrderedList');
      const inferredListType =
        listTypeFromElement(probeEl, container) ||
        listTypeFromElement(aEl || probeEl, container) ||
        listTypeFromElement(fEl || probeEl, container) ||
        '';
      const listType = ordered
        ? 'numbered'
        : unordered
          ? 'bullet'
          : inferredListType;
      setDocxListType((prev) => (prev === listType ? prev : listType));
    } catch {
      // ignore
    }
  }, [currentFileType]);

  /**
   * After a chat-initiated edit reloads the DOCX canvas, the DOM selection is
   * lost and the toolbar falls back to defaults.  This helper places the cursor
   * inside the edited paragraph (or the first paragraph as fallback) so
   * `syncDocxToolbarStateFromSelection` can probe the live computed styles and
   * keep the toolbar in sync (font name, size, color dot, alignment, etc.).
   */
  const syncToolbarAfterDocxReload = useCallback((targetParagraphId) => {
    const container = documentContainerRef.current;
    if (!container) return;
    const pid = String(targetParagraphId || '').trim();
    const doSync = () => {
      try {
        const sel = window.getSelection?.();
        if (!sel) return;
        // If there's already a valid selection inside the container, just sync.
        if (sel.rangeCount > 0 && container.contains(sel.anchorNode)) {
          syncDocxToolbarStateFromSelection();
          return;
        }
        // Try to place cursor in the edited paragraph first, then fall back to first paragraph.
        let targetEl = null;
        if (pid) {
          const escaped = window.CSS?.escape ? window.CSS.escape(pid) : pid;
          targetEl = container.querySelector(`[data-paragraph-id="${escaped}"]`);
        }
        if (!targetEl) {
          targetEl =
            container.querySelector('[data-paragraph-id]') ||
            container.querySelector('[contenteditable="true"]');
        }
        if (targetEl) {
          const cursorProbe = targetEl.matches?.('[data-paragraph-id]')
            ? resolveStyledProbeWithinParagraph(targetEl) || targetEl
            : targetEl;
          // Focus the contentEditable host first (required for execCommand/queryCommand).
          const host = cursorProbe.closest?.('[contenteditable="true"]') || cursorProbe;
          host.focus?.();
          const r = window.document.createRange();
          r.selectNodeContents(cursorProbe);
          r.collapse(true); // collapse to start
          sel.removeAllRanges();
          sel.addRange(r);
        }
        syncDocxToolbarStateFromSelection();
      } catch {
        // ignore – best effort
      }
    };
    // Dual-fire: immediate + delayed to cover async renders.
    requestAnimationFrame(doSync);
    setTimeout(doSync, 150);
  }, [syncDocxToolbarStateFromSelection]);
  syncToolbarAfterDocxReloadRef.current = syncToolbarAfterDocxReload;

  // After navigating to a new revision (edit created a new doc), sync the toolbar
  // to reflect the edited paragraph's formatting (font, size, color, etc.).
  useEffect(() => {
    if (currentFileType !== 'word' && currentFileType !== 'pdf') return;
    try {
      const raw = sessionStorage.getItem('koda_toolbar_sync_paragraph');
      if (raw === null) return; // no pending sync
      const pid = (raw || '').trim();
      sessionStorage.removeItem('koda_toolbar_sync_paragraph');
      // The canvas may not be ready immediately — retry with increasing delays.
      const delays = [300, 600, 1200];
      delays.forEach((ms) => {
        setTimeout(() => syncToolbarAfterDocxReload(pid), ms);
      });
    } catch {}
  }, [document?.id, currentFileType, syncToolbarAfterDocxReload]);

  useEffect(() => {
    if (currentFileType !== 'word' && currentFileType !== 'pdf') return;
    const onSel = () => syncDocxToolbarStateFromSelection();
    window.document.addEventListener('selectionchange', onSel);
    return () => window.document.removeEventListener('selectionchange', onSel);
  }, [currentFileType, syncDocxToolbarStateFromSelection]);

  useEffect(() => {
    if (currentFileType !== 'word' && currentFileType !== 'pdf') return;
    const container = documentContainerRef.current;
    if (!container) return;

    let raf = 0;
    const queueSync = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        syncDocxToolbarStateFromSelection();
      });
    };

    const observer = new MutationObserver(() => queueSync());
    observer.observe(container, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    queueSync();
    return () => {
      observer.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [currentFileType, docxBlocks.length, previewVersion, syncDocxToolbarStateFromSelection]);

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
          el.style.backgroundColor = 'rgba(107,114,128,0.14)';
          el.style.transition = 'background-color 180ms ease';
          setTimeout(() => { el.style.backgroundColor = prev || 'transparent'; }, 750);
        } catch {}
      }, 250);
    } else if (currentFileType === 'powerpoint') {
      setSlidesSelectedAnchorId(initialTargetParam);
    }
  }, [currentFileType, initialTargetParam]);

  // Fetch PPTX anchors for top-bar target editing (keeps PPTXPreview as the main viewer).
  // Only fetches when PPTX editing is actually supported to avoid 500 errors.
  useEffect(() => {
    let cancelled = false;
    async function loadSlidesModel() {
      if (!document?.id) return;
      if (currentFileType !== 'powerpoint') return;
      if (!supportsViewerEditing) return; // PPTX editing not yet supported
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
  }, [currentFileType, document?.id, supportsViewerEditing]);

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
    const sig = JSON.stringify({
      operator: s?.canonicalOperator || s?.operator || '',
      domain: s?.domain || '',
      target: s?.target?.id || s?.targetId || s?.targetHint || '',
      before: String(s?.beforeText || '').slice(0, 240),
      after: String(s?.diff?.after || s?.proposedText || '').slice(0, 240),
    });
    return `${s?.documentId || ''}:${sig}`;
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
    const scope = String(session?.scope || '').trim().toLowerCase();
    const explicitTargetId = String(session?.target?.id || session?.targetId || '').trim();
    const resolutionReason = String(session?.target?.resolutionReason || '').trim().toLowerCase();
    const targetLabel = String(session?.target?.label || '').trim().toLowerCase();
    const isDocumentWide = scope === 'document' || explicitTargetId === 'document';
    if (isDocumentWide) return '';

    const lockedDocxSelection = (() => {
      const candidate = [liveViewerSelection, frozenSelection].find((s) => (
        s &&
        String(s?.domain || '').trim().toLowerCase() === 'docx' &&
        (
          (typeof s?.paragraphId === 'string' && s.paragraphId.trim()) ||
          (Array.isArray(s?.ranges) && s.ranges.length > 0)
        )
      )) || null;
      if (!candidate) return '';
      const fromRanges = Array.isArray(candidate?.ranges)
        ? String(candidate.ranges[0]?.paragraphId || '').trim()
        : '';
      return String(fromRanges || candidate?.paragraphId || '').trim();
    })();
    const prefersLockedSelection =
      scope === 'selection' ||
      resolutionReason.includes('viewer_selection') ||
      resolutionReason.includes('selection') ||
      targetLabel.includes('selected text');
    if (lockedDocxSelection && prefersLockedSelection) return lockedDocxSelection;

    // Bundle sessions: jump to the first changed paragraph.
    const bundlePatches = extractDocxBundlePatches(session);
    if (bundlePatches.length) {
      if (bundlePatches.length !== 1) return '';
      const first = bundlePatches.find((p) => p?.paragraphId) || null;
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
    if (extractDocxBundlePatches(session).length) return '';
    return String(session?.diff?.after || session?.proposedText || '').trim();
  };

  const parseJsonPayload = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {}
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try { return JSON.parse(String(fenced[1]).trim()); } catch {}
    }
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try { return JSON.parse(text.slice(first, last + 1)); } catch {}
    }
    return null;
  };

  const extractDocxBundlePatches = (session) => {
    const explicit = Array.isArray(session?.bundlePatches) ? session.bundlePatches : [];
    if (explicit.length) return explicit;
    const op = String(session?.operator || '').trim().toUpperCase();
    const canonicalOp = String(session?.canonicalOperator || '').trim().toUpperCase();
    const looksDocxCanonical = canonicalOp.startsWith('DOCX_');
    if (op !== 'EDIT_DOCX_BUNDLE' && !looksDocxCanonical) return [];
    const parsed = parseJsonPayload(session?.proposedText) || parseJsonPayload(session?.diff?.after) || null;
    const parsedPatches = Array.isArray(parsed?.patches) ? parsed.patches : [];
    return parsedPatches.filter((p) => p && typeof p === 'object');
  };

  /**
   * Resolve the best paragraph ID for post-edit focus.
   * For structural edits (split_to_list) the original paragraph still exists → use it.
   * For delete patches, the paragraph is gone → use session target or hint as fallback
   * (the backend may attach __focusAfterApply if available).
   */
  const resolveFocusParagraphId = (patches, session) => {
    if (!Array.isArray(patches) || !patches.length) return session?.target?.id || session?.targetHint || '';
    // If all patches are deletions, try focusAfterApply or fall back to session target
    const allDeletes = patches.every((p) => String(p?.kind || '') === 'docx_delete_paragraph');
    if (allDeletes) {
      return patches.__focusAfterApply || session?.target?.id || session?.targetHint || '';
    }
    // For split_to_list the original paragraph ID is kept; for other types, use the first patch's paragraph
    const first = patches.find((p) => p?.paragraphId && String(p?.kind || '') !== 'docx_delete_paragraph');
    return first?.paragraphId || patches[0]?.paragraphId || session?.target?.id || session?.targetHint || '';
  };

  const normalizeOpsList = (value) => {
    const list = Array.isArray(value) ? value : [];
    return list
      .map((raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const src = { ...raw };
        const nested =
          (src.params && typeof src.params === 'object' && !Array.isArray(src.params)) ? src.params :
          (src.payload && typeof src.payload === 'object' && !Array.isArray(src.payload)) ? src.payload :
          (src.arguments && typeof src.arguments === 'object' && !Array.isArray(src.arguments)) ? src.arguments :
          {};
        const op = { ...src, ...nested };
        if (!op.kind) {
          const k = String(op.kind || op.type || op.op || op.operator || op.id || '').trim();
          if (k) op.kind = k;
        }
        return op;
      })
      .filter((op) => op && typeof op === 'object' && String(op?.kind || '').trim());
  };

  const parseSheetsOpsFromSession = (session) => {
    const op = String(session?.operator || '').trim().toUpperCase();
    const canonicalOp = String(session?.canonicalOperator || '').trim().toUpperCase();
    const parseSheetRangeRef = (raw) => {
      const text = String(raw || '').trim().replace(/^xlsx:/i, '').replace(/^sheets:/i, '');
      if (!text) return null;
      const bang = text.indexOf('!');
      if (bang <= 0) return null;
      const rawSheet = text.slice(0, bang).trim();
      const sheetName = (rawSheet.startsWith("'") && rawSheet.endsWith("'"))
        ? rawSheet.slice(1, -1).replace(/''/g, "'")
        : rawSheet;
      const rangeA1 = text.slice(bang + 1).trim();
      if (!sheetName || !rangeA1) return null;
      return `${sheetName}!${rangeA1}`;
    };
    const resolveSessionRanges = () => {
      const out = [];
      const seen = new Set();
      const pushRange = (raw) => {
        const parsed = parseSheetRangeRef(raw);
        if (!parsed) return;
        const key = String(parsed).trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(parsed);
      };

      const explicit = parseSheetRangeRef(session?.targetHint || session?.target?.id || session?.targetId);
      if (explicit) {
        pushRange(explicit);
        return out;
      }

      const ranges = Array.isArray(session?.target?.ranges) ? session.target.ranges : [];
      for (const r of ranges) {
        const sheetName = String(r?.sheetName || '').trim();
        const rangeA1 = String(r?.rangeA1 || '').trim();
        if (sheetName && rangeA1) pushRange(`${sheetName}!${rangeA1}`);
      }

      return out;
    };
    const parseA1RangeOnly = (a1) => {
      const raw = String(a1 || '').trim();
      if (!raw) return null;
      const parts = raw.includes(':') ? raw.split(':') : [raw, raw];
      const parseCell = (ref) => {
        const m = String(ref || '').trim().match(/^([A-Z]{1,3})(\d{1,7})$/i);
        if (!m) return null;
        const row = Number(m[2]);
        const col = String(m[1]).toUpperCase().split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
        if (!Number.isFinite(row) || !Number.isFinite(col) || row < 1 || col < 1) return null;
        return { row, col };
      };
      const s = parseCell(parts[0]);
      const e = parseCell(parts[1]);
      if (!s || !e) return null;
      return {
        r1: Math.min(s.row, e.row),
        r2: Math.max(s.row, e.row),
        c1: Math.min(s.col, e.col),
        c2: Math.max(s.col, e.col),
      };
    };
    const expandValuesForRange = (rangeA1Full, values) => {
      const list = Array.isArray(values) ? values : [];
      if (!list.length) return list;
      const splitBang = String(rangeA1Full || '').split('!');
      const a1 = splitBang.length > 1 ? splitBang.slice(1).join('!') : splitBang[0];
      const rect = parseA1RangeOnly(a1);
      if (!rect) return list;
      const rows = rect.r2 - rect.r1 + 1;
      const cols = rect.c2 - rect.c1 + 1;
      const firstRow = Array.isArray(list[0]) ? list[0] : [];
      const isScalar = list.length === 1 && firstRow.length === 1;
      if (!isScalar) return list;
      const scalar = firstRow[0];
      return Array.from({ length: rows }, () => Array.from({ length: cols }, () => scalar));
    };
    const parseGridValuesFromText = (text) => {
      const raw = String(text || '');
      if (!raw.trim()) return [['']];
      const lines = raw.split(/\r?\n/);
      const hasTabs = lines.some((line) => line.includes('\t'));
      if (hasTabs || lines.length > 1) {
        const rows = lines.filter((line) => line.length > 0);
        return rows.length > 0 ? rows.map((line) => line.split('\t')) : [[raw.trim()]];
      }
      return [[raw.trim()]];
    };
    const parseFormatFromInstruction = (message) => {
      const low = String(message || '').toLowerCase();
      const format = {};
      if (/\b(bold|negrito)\b/.test(low)) format.bold = true;
      if (/\b(italic|it[aá]lico)\b/.test(low)) format.italic = true;
      if (/\b(underline|sublinhad[oa])\b/.test(low)) format.underline = true;
      const sizeMatch = low.match(/\b(\d{1,2})\s*(?:pt|px)\b/i);
      if (sizeMatch?.[1]) {
        const n = Number(sizeMatch[1]);
        if (Number.isFinite(n) && n >= 6 && n <= 72) format.fontSizePt = n;
      }
      const colorHex = low.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
      if (colorHex?.[0]) format.color = colorHex[0].startsWith('#') ? colorHex[0] : `#${colorHex[0]}`;
      const knownFonts = [
        'times new roman',
        'arial',
        'calibri',
        'helvetica',
        'courier new',
        'georgia',
        'cambria',
        'verdana',
        'tahoma',
      ];
      const font = knownFonts.find((f) => low.includes(f));
      if (font) format.fontFamily = font.replace(/\b\w/g, (m) => m.toUpperCase());
      return Object.keys(format).length ? format : null;
    };
    try {
      const directOps = normalizeOpsList(session?.ops);
      if (directOps.length) {
        return directOps;
      }
      const directOperations = normalizeOpsList(session?.operations);
      if (directOperations.length) {
        return directOperations;
      }
      const bundleOps = normalizeOpsList(session?.bundle?.ops);
      if (bundleOps.length) {
        return bundleOps;
      }
      const plannedOps = normalizeOpsList(session?.plan?.ops);
      if (plannedOps.length) {
        return plannedOps;
      }
      const payload =
        parseJsonPayload(session?.proposedText) ||
        parseJsonPayload(session?.diff?.after) ||
        null;
      if (payload && typeof payload === 'object') {
        const payloadOps = normalizeOpsList(payload?.ops);
        if (payloadOps.length) return payloadOps;
        const payloadOperations = normalizeOpsList(payload?.operations);
        if (payloadOperations.length) return payloadOperations;
        const payloadSteps = normalizeOpsList(payload?.steps);
        if (payloadSteps.length) return payloadSteps;
        if (String(payload?.kind || '').trim()) return [payload];
      }
      if (op === 'COMPUTE_BUNDLE' || op === 'COMPUTE') {
        return [];
      }
      if (op === 'CREATE_CHART') {
        const parsed = (payload && typeof payload === 'object') ? payload : {};
        const spec =
          String(parsed?.kind || '').trim() === 'create_chart'
            ? { ...(parsed?.spec || {}) }
            : { ...parsed };
        if (!String(spec?.range || '').trim()) {
          const hintedRange = String(session?.targetHint || session?.target?.id || '').trim();
          if (hintedRange.includes('!')) spec.range = hintedRange;
          else {
            const first = Array.isArray(session?.target?.ranges) ? session.target.ranges[0] : null;
            const sheetName = String(first?.sheetName || '').trim();
            const rangeA1 = String(first?.rangeA1 || '').trim();
            if (sheetName && rangeA1) spec.range = `${sheetName}!${rangeA1}`;
          }
        }
        if (String(spec?.range || '').trim()) return [{ kind: 'create_chart', spec }];
      }

      const resolvedRanges = resolveSessionRanges();
      const draftAfterText = String(session?.diff?.after || session?.proposedText || '').trim();
      if (
        resolvedRanges.length > 0 &&
        (
          op === 'EDIT_CELL' ||
          op === 'EDIT_RANGE' ||
          canonicalOp === 'XLSX_SET_CELL_VALUE' ||
          canonicalOp === 'XLSX_SET_RANGE_VALUES'
        )
      ) {
        const base = parseGridValuesFromText(draftAfterText);
        return resolvedRanges.map((rangeA1) => ({
          kind: 'set_values',
          rangeA1,
          values: expandValuesForRange(rangeA1, base),
        }));
      }

      if (
        resolvedRanges.length > 0 &&
        (
          canonicalOp === 'XLSX_FORMAT_RANGE' ||
          canonicalOp === 'XLSX_SET_NUMBER_FORMAT'
        )
      ) {
        const payload =
          parseJsonPayload(session?.proposedText) ||
          parseJsonPayload(session?.diff?.after) ||
          {};
        const explicitFormat = (
          (payload?.format && typeof payload.format === 'object') ? payload.format :
          (session?.format && typeof session.format === 'object') ? session.format :
          (session?.style && typeof session.style === 'object') ? session.style :
          null
        );
        const inferredFormat = parseFormatFromInstruction(session?.instruction || '');
        const format = explicitFormat || inferredFormat;
        if (format) return resolvedRanges.map((rangeA1) => ({ kind: 'format_range', rangeA1, format }));
      }
    } catch {
      return [];
    }
    return [];
  };

  const draftIntoCanvas = async (draftId, session) => {
    const domain = String(session?.domain || '').trim().toLowerCase();
    const targetId = getEditTargetId(session);
    const afterText = getDraftAfterText(session);
    const docxBundlePatches = extractDocxBundlePatches(session);
    if (domain === 'docx' && docxBundlePatches.length) {
      try {
        const first = docxBundlePatches.find((p) => p?.paragraphId) || null;
        const snap = first?.paragraphId ? await docxCanvasRef.current?.snapshotTarget?.(String(first.paragraphId)) : null;
        await docxCanvasRef.current?.applyParagraphPatches?.({ draftId, patches: docxBundlePatches });
        return { ok: true, snapshot: snap };
      } catch (e) {
        return { ok: false, error: e?.message || 'Failed to apply bulk draft preview.' };
      }
    }
    try {
      if (domain === 'docx') {
        const runtimeOp = String(session?.operator || '').trim().toUpperCase();
        const canonicalOp = String(session?.canonicalOperator || '').trim().toUpperCase();
        const isDocxTextPreviewOp =
          runtimeOp === 'EDIT_PARAGRAPH' ||
          runtimeOp === 'EDIT_SPAN' ||
          runtimeOp === 'ADD_PARAGRAPH' ||
          canonicalOp === 'DOCX_REWRITE_PARAGRAPH' ||
          canonicalOp === 'DOCX_REPLACE_SPAN' ||
          canonicalOp === 'DOCX_INSERT_AFTER' ||
          canonicalOp === 'DOCX_INSERT_BEFORE';
        if (!isDocxTextPreviewOp) {
          // Formatting/structure/list/style operators must not preview as text replacement.
          return { ok: true };
        }
        if (!targetId || !afterText) return { ok: false, error: 'Missing target or proposed text.' };
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
      if (domain === 'sheets') {
        // For sheets we preview all resolvable ops as non-committing overlays in the grid.
        const ops = parseSheetsOpsFromSession(session);
        if (!ops.length) return { ok: false, error: 'Draft preview failed: invalid spreadsheet ops.' };
        const ok = await excelCanvasRef.current?.applyDraftOps?.({ draftId, ops });
        return ok ? { ok: true } : { ok: false, error: 'Draft preview failed for spreadsheet ops.' };
      }
      return { ok: false, error: `Draft preview not supported for domain: ${domain}` };
    } catch (e) {
      return { ok: false, error: e?.message || 'Failed to apply draft preview.' };
    }
  };

  const discardDraftInCanvas = async (draftId, session) => {
    const domain = String(session?.domain || '').trim().toLowerCase();
    try {
      if (domain === 'docx') return Boolean(await docxCanvasRef.current?.discardDraft?.({ draftId }));
      if (domain === 'sheets') return Boolean(await excelCanvasRef.current?.discardDraftOps?.({ draftId }));
      return false;
    } catch {
      return false;
    }
  };

  const scrollToDraftTarget = async (session) => {
    const domain = String(session?.domain || '').trim().toLowerCase();
    const targetId = getEditTargetId(session);
    if (!targetId) return;
    try {
      if (domain === 'docx') await docxCanvasRef.current?.scrollToTarget?.(targetId);
    } catch {}
  };

  const spotlightDraftTarget = (session) => {
    const domain = String(session?.domain || '').trim().toLowerCase();
    const scope = String(session?.scope || '').trim().toLowerCase();
    const explicitTargetId = String(session?.target?.id || session?.targetId || '').trim();
    const resolutionReason = String(session?.target?.resolutionReason || '').trim().toLowerCase();
    const isDocumentWide = scope === 'document' || explicitTargetId === 'document';
    if (domain === 'docx' && isDocumentWide) {
      setFrozenSelection(null);
      setSelectionOverlay({ rects: [], frozen: false });
      return false;
    }
    if (domain === 'sheets') {
      const parseSheetRange = (raw) => {
        const text = String(raw || '').trim().replace(/^xlsx:/i, '').replace(/^sheets:/i, '');
        if (!text) return null;
        const bang = text.indexOf('!');
        if (bang <= 0) return null;
        const rawSheet = text.slice(0, bang).trim();
        const sheetName = (rawSheet.startsWith("'") && rawSheet.endsWith("'"))
          ? rawSheet.slice(1, -1).replace(/''/g, "'")
          : rawSheet;
        const rangeA1 = text.slice(bang + 1).trim();
        if (!sheetName || !rangeA1) return null;
        return { sheetName, rangeA1 };
      };
      const rangeKey = (r) => `${String(r?.sheetName || '').trim().toLowerCase()}!${String(r?.rangeA1 || '').trim().toUpperCase()}`;
      const collectRangesFromOps = (ops) => {
        const list = Array.isArray(ops) ? ops : [];
        const out = [];
        const seen = new Set();
        const pushIf = (candidate) => {
          if (!candidate) return;
          const key = rangeKey(candidate);
          if (!key || seen.has(key)) return;
          seen.add(key);
          out.push(candidate);
        };
        for (const op of list) {
          const kind = String(op?.kind || '').trim();
          if (kind === 'set_formula') {
            const a1 = String(op?.a1 || '').trim();
            pushIf(parseSheetRange(a1));
          }
          const direct = String(op?.rangeA1 || op?.range || op?.spec?.range || '').trim();
          pushIf(parseSheetRange(direct));
        }
        return out;
      };
      let parsed = parseSheetRange(session?.targetHint || session?.target?.id || session?.targetId);
      const collectedRanges = [];
      const seenCollected = new Set();
      const addCollected = (candidate) => {
        if (!candidate) return;
        const key = rangeKey(candidate);
        if (!key || seenCollected.has(key)) return;
        seenCollected.add(key);
        collectedRanges.push(candidate);
      };
      if (parsed) addCollected(parsed);
      if (!parsed && String(session?.operator || '').trim() === 'CREATE_CHART') {
        try {
          const spec = JSON.parse(String(session?.proposedText || '').trim() || '{}');
          parsed = parseSheetRange(spec?.range || '');
          if (parsed) addCollected(parsed);
        } catch {}
      }
      if (!parsed && String(session?.operator || '').trim() === 'COMPUTE_BUNDLE') {
        try {
          const payload = JSON.parse(String(session?.proposedText || '').trim() || '{}');
          const fromOps = collectRangesFromOps(payload?.ops);
          for (const r of fromOps) addCollected(r);
          parsed = collectedRanges[0] || null;
        } catch {}
      }
      const targetRanges = Array.isArray(session?.target?.ranges) ? session.target.ranges : [];
      for (const r of targetRanges) {
        addCollected(parseSheetRange(
          String(r?.sheetName || '').trim() && String(r?.rangeA1 || '').trim()
            ? `${String(r.sheetName).trim()}!${String(r.rangeA1).trim()}`
            : String(r?.rangeA1 || '').trim(),
        ));
      }
      if (!parsed) parsed = collectedRanges[0] || null;
      if (!parsed) return false;
      const quoteSheet = (name) => (/^[A-Za-z0-9_]+$/.test(String(name || '').trim()) ? String(name || '').trim() : `'${String(name || '').replace(/'/g, "''")}'`);
      const preview = `${quoteSheet(parsed.sheetName)}!${parsed.rangeA1}`;
      const normalizedRanges = (collectedRanges.length ? collectedRanges : [parsed]).map((r) => ({
        sheetName: r.sheetName,
        rangeA1: r.rangeA1,
      }));
      const nextSelection = {
        domain: 'sheets',
        text: preview,
        preview,
        sheetName: parsed.sheetName,
        rangeA1: parsed.rangeA1,
        selectionKind: String(parsed.rangeA1).includes(':') ? 'range' : 'cell',
        ranges: normalizedRanges,
      };
      setFrozenSelection(nextSelection);
      setLiveViewerSelection(nextSelection);
      setSelectionOverlay({ rects: [], frozen: false });
      return true;
    }
    if (domain !== 'docx') return false;
    if (Boolean(session?.target?.isAmbiguous) || Boolean(session?.requiresConfirmation)) {
      setSelectionOverlay({ rects: [], frozen: false });
      return false;
    }
    const bundlePatches = extractDocxBundlePatches(session);
    if (bundlePatches.length !== 0 && bundlePatches.length !== 1) {
      setFrozenSelection(null);
      setSelectionOverlay({ rects: [], frozen: false });
      return false;
    }
    const isHeuristicResolution =
      /heuristic|fuzzy|fallback|best_match|filetype_intent/.test(resolutionReason);
    if (!resolutionReason || isHeuristicResolution) {
      // Do not auto-lock random/heuristic paragraph picks in the viewer.
      setSelectionOverlay({ rects: [], frozen: false });
      return false;
    }
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

      return true;
    } catch {
      return false;
    }
  };

  const applyEditSession = async (entryId, session) => {
    if (!session?.documentId) return false;
    patchEditEntry(entryId, { status: 'applying', error: '' });
    setEditorStatusMsg('Applying edit…');

    try {
      const resolveAppliedNote = (responseLike, fallback = 'Applied.') => {
        const note =
          String(
            responseLike?.receipt?.note ||
            responseLike?.result?.receipt?.note ||
            responseLike?.note ||
            '',
          ).trim();
        return note || fallback;
      };
      const sessionDomain = String(session?.domain || '').trim().toLowerCase();

      if (sessionDomain === 'sheets') {
        const ops = parseSheetsOpsFromSession(session);
        if (ops.length) {
          const applyViaCanvas = excelCanvasRef.current?.compute;
          if (typeof applyViaCanvas !== 'function') throw new Error('Spreadsheet compute engine is unavailable.');
          await applyViaCanvas(ops);
          try { await excelCanvasRef.current?.discardDraftOps?.({ draftId: entryId }); } catch {}
          patchEditEntry(entryId, { status: 'applied', revisionId: null, appliedAt: new Date().toISOString() });
          clearFrozenSelection();
          setEditorStatusMsg(resolveAppliedNote(session, 'Applied.'));
          setTimeout(() => setEditorStatusMsg(''), 900);
          return true;
        }
        const op = String(session?.operator || '').trim().toUpperCase();
        if (op === 'COMPUTE' || op === 'COMPUTE_BUNDLE' || op === 'CREATE_CHART') {
          const err = 'Draft has no valid spreadsheet operations. Please retry the command with an explicit range.';
          patchEditEntry(entryId, { status: 'failed', error: err });
          setEditorStatusMsg(err);
          return false;
        }
      }

      // DOCX bundle edits: draft paragraph patches into the canvas for a preview,
      // then apply once to create a single new revision.
      const docxBundlePatches = extractDocxBundlePatches(session);
      if (sessionDomain === 'docx' && docxBundlePatches.length) {
        await docxCanvasRef.current?.applyParagraphPatches?.({ draftId: entryId, patches: docxBundlePatches });
        let bundlePayloadText = String(session.proposedText || '').trim();
        if (!bundlePayloadText) {
          bundlePayloadText = JSON.stringify({ patches: docxBundlePatches });
        } else {
          try {
            const parsed = JSON.parse(bundlePayloadText);
            const hasPatches = Array.isArray(parsed?.patches) && parsed.patches.length > 0;
            if (!hasPatches) bundlePayloadText = JSON.stringify({ patches: docxBundlePatches });
          } catch {
            bundlePayloadText = JSON.stringify({ patches: docxBundlePatches });
          }
        }
        const res = await applyEdit({
          instruction: String(session.instruction || '').trim() || `Bulk edit in viewer: ${cleanDocumentName(document?.filename)}`,
          operator: 'EDIT_DOCX_BUNDLE',
          domain: 'docx',
          documentId: session.documentId,
          beforeText: String(session.beforeText || '(bulk edit)'),
          proposedText: bundlePayloadText,
          bundlePatches: docxBundlePatches,
          idempotencyKey: `viewer:${entryId}:bundle`,
          expectedDocumentUpdatedAtIso: session?.baseDocumentUpdatedAtIso || undefined,
          expectedDocumentFileHash: session?.baseDocumentFileHash || undefined,
          userConfirmed: true,
        });
        const verified = extractVerifiedApply(res);
        const explicitNoop =
          res?.result?.applied === false ||
          res?.applied === false ||
          /^no changes were needed/i.test(String(res?.receipt?.note || res?.result?.receipt?.note || '').trim());
        const revisionId =
          verified?.newRevisionId ||
          res?.result?.revisionId ||
          res?.result?.restoredRevisionId ||
          res?.receipt?.documentId ||
          res?.result?.receipt?.documentId ||
          null;
        if (explicitNoop) {
          const err = 'No changes were saved because the document already matched this edit.';
          patchEditEntry(entryId, { status: 'failed', error: err });
          setEditorStatusMsg(err);
          return false;
        }
        if (!revisionId) {
          const err = 'Apply did not return a saved revision. Please retry.';
          patchEditEntry(entryId, { status: 'failed', error: err });
          setEditorStatusMsg(err);
          return false;
        }
        patchEditEntry(entryId, { status: 'applied', revisionId, appliedAt: new Date().toISOString() });
        if (revisionId && document?.id && revisionId !== document.id) {
          clearFrozenSelection();
          try { sessionStorage.setItem('koda_toolbar_sync_paragraph', resolveFocusParagraphId(docxBundlePatches, session)); } catch {}
          try { sessionStorage.setItem('koda_open_allybi_for_doc', String(revisionId)); } catch {}
          navigate(buildRoute.document(revisionId));
          return true;
        }
        const accepted = await docxCanvasRef.current?.acceptDraft?.({ draftId: entryId });
        // Always reload to ensure canvas reflects server-saved content
        await new Promise((r) => setTimeout(r, 350));
        await docxCanvasRef.current?.reload?.();
        syncToolbarAfterDocxReload(resolveFocusParagraphId(docxBundlePatches, session));
        clearFrozenSelection();
        setEditorStatusMsg(resolveAppliedNote(res, 'Applied.'));
        setTimeout(() => setEditorStatusMsg(''), 900);
        return true;
      }

      // DOCX selection edits: apply patches into the live canvas (preserves surrounding formatting),
      // then commit affected paragraph(s) with proposedHtml.
      const patches = Array.isArray(session?.patches) ? session.patches : [];
      const applyMode = String(session?.applyMode || '').trim();
      if (sessionDomain === 'docx' && applyMode === 'prefer_client' && patches.length) {
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
          return false;
        }
        const committedRevisionId = committed?.revisionId || null;
        if (!committedRevisionId) {
          const err = 'Apply failed: no revision was created for this DOCX change.';
          patchEditEntry(entryId, { status: 'failed', error: err });
          setEditorStatusMsg(err);
          return false;
        }
        patchEditEntry(entryId, { status: 'applied', revisionId: committedRevisionId, appliedAt: new Date().toISOString() });
        if (document?.id && committedRevisionId !== document.id) {
          clearFrozenSelection();
          try { sessionStorage.setItem('koda_toolbar_sync_paragraph', session?.patches?.[0]?.paragraphId || session?.target?.id || session?.targetHint || ''); } catch {}
          try { sessionStorage.setItem('koda_open_allybi_for_doc', String(committedRevisionId)); } catch {}
          navigate(buildRoute.document(committedRevisionId));
          return true;
        }
        const accepted = await docxCanvasRef.current?.acceptDraft?.({ draftId: entryId });
        await new Promise((r) => setTimeout(r, 350));
        await docxCanvasRef.current?.reload?.();
        syncToolbarAfterDocxReload(session?.patches?.[0]?.paragraphId || session?.target?.id || session?.targetHint);
        clearFrozenSelection();
        setEditorStatusMsg(resolveAppliedNote(committed, 'Applied.'));
        setTimeout(() => setEditorStatusMsg(''), 900);
        return true;
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
      const preferRuntimeOperator =
        sessionDomain === 'docx' &&
        (String(session?.operator || '').trim().toUpperCase() === 'EDIT_DOCX_BUNDLE' || docxBundlePatches.length);

      const res = await applyEdit({
        instruction: String(session.instruction || '').trim() || `Edit in viewer: ${cleanDocumentName(document?.filename)}`,
        operator: String(
          preferRuntimeOperator
            ? (session?.operator || session?.canonicalOperator || '')
            : (session?.canonicalOperator || session?.operator || ''),
        ).trim(),
        domain: sessionDomain || session.domain,
        documentId: session.documentId,
        targetHint: session?.targetHint || undefined,
        target: resolvedTarget || undefined,
        beforeText: String(session.beforeText || '').trim() || '(empty)',
        // Always prefer canonical proposedText. diff.after can be a UI snippet, not full paragraph content.
        proposedText: String(session.proposedText || session?.diff?.after || '').trim() || '(empty)',
        idempotencyKey: `viewer:${entryId}:apply`,
        expectedDocumentUpdatedAtIso: session?.baseDocumentUpdatedAtIso || undefined,
        expectedDocumentFileHash: session?.baseDocumentFileHash || undefined,
        // In the viewer, calling apply is always an explicit user action (or a safe auto-apply policy).
        // We prevent bypassing "always confirm" operators by never auto-applying those operators.
        userConfirmed: true,
      });

      if (res?.requiresUserChoice) {
        patchEditEntry(entryId, { status: 'blocked', error: 'This change needs review (target/confirmation).' });
        setEditorStatusMsg('');
        return false;
      }

      const verified = extractVerifiedApply(res);
      const explicitNoop =
        res?.result?.applied === false ||
        res?.applied === false ||
        /^no changes were needed/i.test(String(res?.receipt?.note || res?.result?.receipt?.note || '').trim());
      const revisionId =
        verified?.newRevisionId ||
        res?.result?.revisionId ||
        res?.result?.restoredRevisionId ||
        res?.receipt?.documentId ||
        res?.result?.receipt?.documentId ||
        null;
      if (explicitNoop) {
        const err = 'No changes were saved because the document already matched this edit.';
        patchEditEntry(entryId, { status: 'failed', error: err });
        setEditorStatusMsg(err);
        return false;
      }
      if (!revisionId) {
        const err = 'Apply did not return a saved revision. Please retry.';
        patchEditEntry(entryId, { status: 'failed', error: err });
        setEditorStatusMsg(err);
        return false;
      }
      patchEditEntry(entryId, { status: 'applied', revisionId, appliedAt: new Date().toISOString() });

      // If edits create a new revision doc, open it; otherwise reload current preview.
      if (revisionId && document?.id && revisionId !== document.id) {
        clearFrozenSelection();
        if (sessionDomain === 'docx') {
          try { sessionStorage.setItem('koda_toolbar_sync_paragraph', session?.target?.id || session?.targetHint || ''); } catch {}
        }
        if (sessionDomain === 'docx' || sessionDomain === 'sheets') {
          try { sessionStorage.setItem('koda_open_allybi_for_doc', String(revisionId)); } catch {}
        }
        navigate(buildRoute.document(revisionId));
        return true;
      }

      if (sessionDomain === 'docx') {
        const accepted = await docxCanvasRef.current?.acceptDraft?.({ draftId: entryId });
        // Always reload after apply — even if acceptDraft succeeded — to ensure
        // the canvas reflects the server-saved content (especially in overwrite mode).
        await new Promise((r) => setTimeout(r, 350));
        await docxCanvasRef.current?.reload?.();
      } else if (sessionDomain === 'sheets') {
        await excelCanvasRef.current?.reload?.();
      } else if (sessionDomain === 'slides') {
        setPreviewVersion((v) => v + 1);
        try {
          const r = await api.get(`/api/documents/${session.documentId}/editing/slides-model`);
          const nextAnchors = Array.isArray(r.data?.anchors) ? r.data.anchors : [];
          setSlidesAnchors(nextAnchors);
          setSlidesSelectedAnchorId((prev) => prev || nextAnchors?.[0]?.objectId || '');
        } catch {}
      }
      if (sessionDomain === 'docx') syncToolbarAfterDocxReload(session?.target?.id || session?.targetHint);
      clearFrozenSelection();
      setEditorStatusMsg(resolveAppliedNote(res, 'Applied.'));
      setTimeout(() => setEditorStatusMsg(''), 900);
      return true;
    } catch (e) {
      const msg =
        e?.response?.data?.error?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Apply failed.';
      patchEditEntry(entryId, { status: 'failed', error: msg });
      setEditorStatusMsg('');
      return false;
    }
  };

  const undoEditEntry = async (entry) => {
    const s = entry?.session;
    if (!s?.documentId) return;
    try {
      await undoEdit({ documentId: s.documentId, revisionId: entry?.revisionId || undefined });
      if (String(s.domain) === 'docx') await docxCanvasRef.current?.reload?.();
      if (String(s.domain) === 'sheets') await excelCanvasRef.current?.reload?.();
      if (String(s.domain) === 'slides') setPreviewVersion((v) => v + 1);
      clearFrozenSelection();
      if (String(s.domain) === 'docx') syncToolbarAfterDocxReload(s?.target?.id || s?.targetHint);
      patchEditEntry(entry?.id, { status: 'undone', undoneAt: new Date().toISOString(), error: '' });
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Undo failed.';
      patchEditEntry(entry?.id, { status: 'failed', error: msg });
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
          // Still clear stale frozen selection for document-wide operations (translate-all, etc.)
          try { spotlightDraftTarget(s); } catch {}
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
        const canonicalOp = String(s?.canonicalOperator || '').trim();
        const runtimeOp = String(s?.operator || '').trim();
        const isAlwaysConfirm = alwaysConfirm.includes(canonicalOp) || alwaysConfirm.includes(runtimeOp);

        const conf = typeof s?.target?.confidence === 'number' ? s.target.confidence : null;
        const isAmbiguous = Boolean(s?.requiresConfirmation) || Boolean(s?.target?.isAmbiguous);
        const minConf = typeof editingPolicy?.silentExecuteConfidence === 'number' ? editingPolicy.silentExecuteConfidence : 0.9;
        const autoApplyComputeBundles = Boolean(editingPolicy?.autoApplyComputeBundles);
        const isSheetsCompute =
          String(s?.domain || '').trim().toLowerCase() === 'sheets' &&
          (runtimeOp === 'COMPUTE_BUNDLE' || runtimeOp === 'COMPUTE' || runtimeOp === 'CREATE_CHART');

        const viewerAutoApplyEnabled = Boolean(editingPolicy?.autoApplyInViewer);
        const shouldAutoApply =
          viewerAutoApplyEnabled &&
          !isAlwaysConfirm &&
          !isAmbiguous &&
          (
            (conf != null && conf >= minConf) ||
            (autoApplyComputeBundles && isSheetsCompute)
          );

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

  // NOTE: These are computed inline (no hooks) because DocumentViewer has early returns.
  const editorAskTab = (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <ChatInterface
        currentConversation={editingConversation}
        onConversationUpdate={(u) => setEditingConversation((prev) => ({ ...(prev || {}), ...(u || {}) }))}
        onConversationCreated={(c) => setEditingConversation(c)}
        pinnedDocuments={pinnedDocsForChat}
        conversationCreateTitle={viewerConversationTitle}
        variant="viewer"
        viewerSelection={(() => {
          const expectedDomain = String(currentFileType || "").toLowerCase() === "excel" ? "sheets" : "docx";
          const hasSel = (s) => Boolean(
            s &&
            (
              (typeof s?.domain === "string" && String(s.domain || "").trim().toLowerCase() === expectedDomain) &&
              (
              (typeof s?.text === 'string' && s.text.trim()) ||
              (typeof s?.rangeA1 === 'string' && s.rangeA1.trim()) ||
              (Array.isArray(s?.ranges) && s.ranges.length > 0) ||
              (typeof s?.cursorParagraphId === 'string' && s.cursorParagraphId.trim())
              )
            )
          );
          // Prefer frozen selection in viewer mode because focus changes can clear live selection.
          if (hasSel(frozenSelection)) return frozenSelection;
          if (hasSel(liveViewerSelection)) return liveViewerSelection;
          return null;
        })()}
        viewerContext={{
          activeDocumentId: document?.id || null,
          fileType: currentFileType || null,
        }}
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
        await undoEditEntry(entry);
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
              el.style.backgroundColor = 'rgba(107,114,128,0.14)';
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

  // Right panel: chat-only (viewer-scoped). Draft confirmations sit above the chat stream.
  const assistantRightPanel = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {editorAskTab}
      </div>
    </div>
  );

  function clip(s, n = 48) {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    if (!t) return '';
    return t.length <= n ? t : t.slice(0, n).trimEnd() + '…';
  }

  const isEditableType = currentFileType === 'word' || currentFileType === 'excel';

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
      try {
        const restored = Boolean(wordCanvasRef.current?.restoreSelection?.());
        if (!restored) {
          wordCanvasRef.current?.focus?.();
          wordCanvasRef.current?.restoreSelection?.();
        }
      } catch {}
      if (typeof cmd === 'object' && cmd?.type === 'applyStyle') {
        // Apply explicit styles immediately (toolbar has no "Style" button).
        wordCanvasRef.current?.wrapSelectionStyle?.(cmd.style || {});
        setTimeout(() => syncDocxToolbarStateFromSelection(), 0);
        setTimeout(() => syncDocxToolbarStateFromSelection(), 90);
        return;
      }
      if (cmd === 'applyStyle') {
        applyDocxStyle();
        setTimeout(() => syncDocxToolbarStateFromSelection(), 0);
        setTimeout(() => syncDocxToolbarStateFromSelection(), 90);
        return;
      }
      exec(cmd);
      setTimeout(() => syncDocxToolbarStateFromSelection(), 0);
      setTimeout(() => syncDocxToolbarStateFromSelection(), 90);
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
        listType={docxListType}
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
        excelCanApply={excelCanApply}
        excelSelectedInfo={excelSelectedInfo}
        excelSheetMeta={excelSheetMeta}
        onExcelPrevSheet={() => excelCanvasRef.current?.prevSheet?.()}
        onExcelNextSheet={() => excelCanvasRef.current?.nextSheet?.()}
        onExcelSetSheetIndex={(i) => excelCanvasRef.current?.setActiveSheet?.(i)}
        onExcelUndo={() => {
          if (excelCanvasRef.current?.canUndo?.()) {
            excelCanvasRef.current?.undo?.();
            return;
          }
          if (excelCanvasRef.current?.canUndoSelection?.()) {
            excelCanvasRef.current?.undoSelection?.();
          }
        }}
        onExcelRedo={() => {
          if (excelCanvasRef.current?.canRedo?.()) {
            excelCanvasRef.current?.redo?.();
            return;
          }
          if (excelCanvasRef.current?.canRedoSelection?.()) {
            excelCanvasRef.current?.redoSelection?.();
          }
        }}
        excelCanUndo={Boolean(excelHistoryState?.canUndo)}
        excelCanRedo={Boolean(excelHistoryState?.canRedo)}
        excelFontFamily={excelFontFamily}
        excelFontSizePt={excelFontSizePt}
        excelColorHex={excelColorHex}
        excelBold={excelBold}
        excelItalic={excelItalic}
        excelUnderline={excelUnderline}
        onExcelFormatChange={(fmt) => {
          if (fmt?.undo) {
            if (excelCanvasRef.current?.canUndo?.()) {
              excelCanvasRef.current?.undo?.();
            } else {
              excelCanvasRef.current?.undoSelection?.();
            }
            return;
          }
          if (fmt?.redo) {
            if (excelCanvasRef.current?.canRedo?.()) {
              excelCanvasRef.current?.redo?.();
            } else {
              excelCanvasRef.current?.redoSelection?.();
            }
            return;
          }
          if (fmt?.fontFamily) setExcelFontFamily(fmt.fontFamily);
          if (fmt?.fontSizePt != null) setExcelFontSizePt(fmt.fontSizePt);
          if (fmt?.color) setExcelColorHex(fmt.color);
          if (typeof fmt?.bold === 'boolean') setExcelBold(fmt.bold);
          if (typeof fmt?.italic === 'boolean') setExcelItalic(fmt.italic);
          if (typeof fmt?.underline === 'boolean') setExcelUnderline(fmt.underline);
          excelCanvasRef.current?.applyFormat?.(fmt);
        }}
        excelStatusMsg={currentFileType === 'excel' ? editorStatusMsg : ''}
        excelLogoSrc={sphereIcon}
        onExcelLogoClick={() => {
          openEditingPanel({ seedSelection: true, focusInput: true });
        }}

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

        // Keep PDF/PPTX previews clean: no authoring controls in the viewer.
        pptxControlsEnabled={false}
        pdfControlsEnabled={false}

        onBackgroundClick={() => {
          // Clicking empty toolbar area clears the document selection.
          clearFrozenSelection();
        }}
      />
    );
  };

  const previewCanvas = (
    <div
      ref={documentContainerRef}
      className="document-container"
      onMouseUp={() => updateSelectionBubbleFromDom()}
      onKeyUp={() => updateSelectionBubbleFromDom()}
      onScroll={onContainerScroll}
      style={{
        width: '100%',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        padding: currentFileType === 'excel' ? 0 : (isMobile ? 8 : 24),
        overflow: 'auto',
        overflowX: 'auto',
        overflowY: 'auto',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: currentFileType === 'excel' ? 'stretch' : 'center',
        display: 'flex',
        position: 'relative',
        background: currentFileType === 'excel' ? 'white' : '#F5F5F5',
        WebkitOverflowScrolling: 'touch',
        boxShadow: 'none',
        borderTop: '1px solid #E6E6EC',
        scrollbarGutter: currentFileType === 'excel' ? undefined : 'stable'
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
                background: 'rgba(107, 114, 128, 0.18)',
                borderRadius: 3,
                boxShadow: 'inset 0 0 0 1.5px rgba(107, 114, 128, 0.35)',
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
                      onApplied={({ revisionId } = {}) => {
                        setPreviewVersion(v => v + 1);
                        // Silently update the URL to the new revision so navigating
                        // away and back shows the saved content (not the old version).
                        if (revisionId && revisionId !== document?.id) {
                          try { window.history.replaceState(null, '', buildRoute.document(revisionId)); } catch {}
                        }
                      }}
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
	                          onSelectedInfoChange={(info) => {
	                            setExcelSelectedInfo(info);
	                            const fmt = info?.format;
	                            setExcelFontFamily(fmt?.fontFamily || 'Calibri');
	                            setExcelFontSizePt(fmt?.fontSizePt ?? 11);
	                            setExcelColorHex(fmt?.color || '#000000');
	                            setExcelBold(fmt?.bold ?? false);
	                            setExcelItalic(fmt?.italic ?? false);
	                            setExcelUnderline(fmt?.underline ?? false);
	                          }}
		                          onLiveSelectionChange={handleExcelLiveSelectionChange}
		                          onAskAllybi={handleExcelAskAllybi}
                            selectionHint={
                              (frozenSelection && frozenSelection.domain === 'sheets')
                                ? frozenSelection
                                : null
                            }
                            clearSelectionNonce={excelSelectionClearNonce}
	                          onStatusMsg={setEditorStatusMsg}
	                          onSheetMetaChange={setExcelSheetMeta}
                              onHistoryStateChange={(next) => {
                                setExcelHistoryState({
                                  canUndo: Boolean(next?.canUndo),
                                  canRedo: Boolean(next?.canRedo),
                                });
                              }}
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
          <div
            onMouseDown={(e) => {
              // Clicking empty header areas clears the document selection.
              const tag = String(e.target?.tagName || '').toLowerCase();
              if (tag === 'button' || tag === 'input' || tag === 'textarea' || tag === 'select') return;
              if (e.target?.closest?.('button')) return;
              clearFrozenSelection();
            }}
            style={{
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
              color: '#181818',
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
            <ArrowLeftIcon style={{ width: 18, height: 18, color: '#181818' }} />
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
                  <TrashCanIcon style={{ width: 20, height: 20, filter: 'brightness(0) saturate(100%) invert(19%) sepia(93%) saturate(3000%) hue-rotate(352deg) brightness(93%) contrast(90%)', transition: 'filter 0.2s ease' }} />
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
                <img
                  src={printIcon}
                  alt=""
                  style={{ width: 20, height: 20, filter: 'brightness(0) invert(0.2)' }}
                />
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
                <img
                  src={folderPlusIcon}
                  alt=""
                  style={{ width: 20, height: 20, filter: 'brightness(0) invert(0.2)' }}
                />
              </button>
            </div>
              <button
                data-testid="viewer-ask-allybi-toggle"
                type="button"
                onMouseDown={(e) => {
                  if (!handleAskAllybiClick(e)) return;
                  if (!editingOpen) {
                    try { docxCanvasRef.current?.restoreSelection?.(); } catch {}
                    openEditingPanel({ seedSelection: true, focusInput: false });
                  } else {
                    toggleEditingPanel();
                  }
                }}
              onClick={(e) => {
                // onMouseDown already handles everything; prevent default only
                e.preventDefault();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  if (!handleAskAllybiClick(e)) return;
                  if (!editingOpen) {
                    openEditingPanel({ seedSelection: true, focusInput: false });
                  } else {
                    toggleEditingPanel();
                  }
                }
              }}
              style={{
                height: 42,
                paddingLeft: 14,
                paddingRight: 16,
                background: editingOpen ? '#181818' : 'white',
                borderRadius: 999,
                border: editingOpen ? '1px solid #181818' : '1px solid #E2E2E6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                marginRight: 12
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = editingOpen ? '#333333' : '#F5F5F5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = editingOpen ? '#181818' : 'white';
              }}
            >
              <img
                src={editingOpen ? allybiLogoWhite : sphereIcon}
                alt="Allybi"
                style={{
                  width: 22,
                  height: 22,
                  objectFit: 'contain',
                  ...getImageRenderingCSS()
                }}
              />
	              <div style={{ color: editingOpen ? 'white' : '#181818', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', lineHeight: '20px' }}>
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

        {/* Document Toolbar + Preview + optional editing panel.
            IMPORTANT: The canvas (previewCanvas) must always live in the same
            React tree position regardless of editingOpen. Moving it between
            different parent branches causes React to unmount/remount it, which
            destroys manual DOM edits (contentEditable changes). */}
        <div style={{ width: '100%', flex: 1, minWidth: 0, minHeight: 0, display: 'flex', position: 'relative' }}>
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Toolbar */}
            <div style={{
              alignSelf: 'stretch',
              paddingLeft: (editingOpen && !isMobile) ? 24 : (isMobile ? 8 : 24),
              paddingRight: (editingOpen && !isMobile) ? 24 : (isMobile ? 8 : 24),
              paddingTop: (editingOpen && !isMobile) ? 13 : (isMobile ? 4 : 4),
              paddingBottom: (editingOpen && !isMobile) ? 13 : (isMobile ? 4 : 4),
              background: 'white',
              borderBottom: '1px #E6E6EC solid',
              justifyContent: 'flex-start',
              alignItems: 'center',
              gap: (editingOpen && !isMobile) ? 12 : (isMobile ? 8 : 12),
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
          {/* Right: Allybi panel (desktop) */}
          {editingOpen && !isMobile ? (
            <div style={{ width: 520, minWidth: 520, maxWidth: 580, height: '100%', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #E6E6EC', background: 'rgba(255,255,255,0.92)' }}>
              <div style={{ flex: 1, minHeight: 0 }}>
                {assistantRightPanel}
              </div>
            </div>
          ) : null}
          {/* Mobile: Allybi overlay */}
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
        </div>
      </div>

	      {/* Selection bubble (desktop): highlight text -> Ask Allybi */}
	      {!isMobile && selectionBubble?.rect && selectionBubble?.text ? (() => {
	        const r = selectionBubble.rect;
	        const w = 44;
        const viewportW = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1200;
        const x = Math.max(14, Math.min(viewportW - w - 14, r.left + r.width / 2 - w / 2));
        const y = Math.max(14, r.top - 46);
        return (
          <div data-ask-allybi-bubble style={{ position: 'fixed', top: y, left: x, zIndex: 3000 }}>
            <button
              type="button"
	              onMouseDown={(e) => {
	                // Keep the document selection visible when clicking the bubble.
                  if (!handleAskAllybiClick(e)) return;
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
                padding: '0 10px',
                borderRadius: 999,
                border: editingOpen ? '1px solid #181818' : '1px solid rgba(24,24,24,0.16)',
                background: editingOpen ? '#181818' : 'rgba(255,255,255,0.96)',
                boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              title={editingOpen ? 'Close assistant' : 'Ask Allybi about the selected text'}
            >
              <img src={editingOpen ? allybiLogoWhite : sphereIcon} alt="Ask Allybi" style={{ width: 20, height: 20, objectFit: 'contain' }} />
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
            type="button"
            onClick={() => {
              if (!supportsViewerEditing) {
                showInfo(t('documentViewer.comingSoon'));
                return;
              }
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
                src={allybiLogoWhite}
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
                <DownloadIcon style={{ width: 20, height: 20, pointerEvents: 'none', filter: 'brightness(0) invert(0.2)' }} />
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
