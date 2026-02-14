import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../services/api';
import { buildRoute } from '../../../constants/routes';
import ChatInterface from '../../chat/ChatInterface';

import './PptxStudio.css';
import '../editor/allybi-toolbar/AllybiEditingToolbar.css';

import BoldIcon from '../editor/allybi-toolbar/icons/bold-text.svg';
import ItalicIcon from '../editor/allybi-toolbar/icons/italic-text.svg';
import UnderlineIcon from '../editor/allybi-toolbar/icons/underline-text.svg';
import AlignLeftIcon from '../editor/allybi-toolbar/icons/align-left.svg';
import AlignCenterIcon from '../editor/allybi-toolbar/icons/align-center.svg';
import AlignRightIcon from '../editor/allybi-toolbar/icons/align-right.svg';
import ListBulletIcon from '../editor/allybi-toolbar/icons/list-bullet.svg';
import ListNumberedIcon from '../editor/allybi-toolbar/icons/list-numbered.svg';
import DropdownIcon from '../editor/allybi-toolbar/icons/dropdown.svg';
import UndoIcon from '../editor/allybi-toolbar/icons/undo.svg';
import RedoIcon from '../editor/allybi-toolbar/icons/redo.svg';
import PlusIcon from '../editor/allybi-toolbar/icons/plus.svg';
import MinusIcon from '../editor/allybi-toolbar/icons/minus.svg';

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function isPptxMime(m) {
  const mime = String(m || '').toLowerCase();
  return (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime.includes('presentationml')
  );
}

function selectionOffsetsWithin(el) {
  const sel = window.getSelection?.();
  if (!el || !sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;

  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;

  const pre2 = document.createRange();
  pre2.selectNodeContents(el);
  pre2.setEnd(range.endContainer, range.endOffset);
  const end = pre2.toString().length;

  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function hexToRgb01(hex) {
  const h = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return { red: r, green: g, blue: b };
}

function mapOffsetsToSlidesRange(offsets, runs) {
  const arr = Array.isArray(runs) ? runs : [];
  const mapOne = (off) => {
    const o = Math.max(0, Number(off) || 0);
    let acc = 0;
    for (const r of arr) {
      const content = String(r?.content || '');
      const len = content.length;
      const startIndex = typeof r?.startIndex === 'number' ? r.startIndex : null;
      if (o <= acc + len) {
        return startIndex !== null ? startIndex + (o - acc) : o;
      }
      acc += len;
    }
    return o;
  };
  if (!offsets) return null;
  return {
    start: mapOne(offsets.start),
    end: mapOne(offsets.end),
  };
}

export default function PptxStudio() {
  const { documentId } = useParams();
  const navigate = useNavigate();

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [presentationId, setPresentationId] = useState('');
  const [presentationUrl, setPresentationUrl] = useState('');

  const [slideCount, setSlideCount] = useState(0);
  const [slides, setSlides] = useState([]); // [{slideNumber, slideObjectId, thumbnail}]
  const [activeSlideNumber, setActiveSlideNumber] = useState(1);
  const [scene, setScene] = useState(null); // current slide scene (with elements)

  const [zoom, setZoom] = useState(100);
  const zoomFactor = useMemo(() => clamp(zoom, 50, 200) / 100, [zoom]);
  const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'wireframe'

  const [selectedElId, setSelectedElId] = useState('');
  const selectedEl = useMemo(() => {
    const els = Array.isArray(scene?.slides?.[0]?.elements) ? scene.slides[0].elements : [];
    return els.find((e) => e?.objectId === selectedElId) || null;
  }, [scene, selectedElId]);

  const [editingText, setEditingText] = useState(false);
  const [draftText, setDraftText] = useState('');
  const editorRef = useRef(null);
  const [quickPrompt, setQuickPrompt] = useState('');

  const [status, setStatus] = useState(''); // "Syncing…" / "Synced" / errors
  const [assetPrompt, setAssetPrompt] = useState('');
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetPreviewUrl, setAssetPreviewUrl] = useState('');

  const stageRef = useRef(null);
  const [rightTab, setRightTab] = useState('inspector'); // 'inspector' | 'allybi'
  const [studioConversation, setStudioConversation] = useState(null);
  const chatApiRef = useRef(null);

  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const autosaveTimerRef = useRef(null);
  const pendingAutosaveRef = useRef(false);
  const scheduleAutosaveRef = useRef(() => {});

  const STUDIO_FONTS = useMemo(() => ([
    'Plus Jakarta Sans', 'DM Sans', 'Inter', 'IBM Plex Sans', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
    'Poppins', 'Raleway', 'Source Sans 3', 'Noto Sans', 'Nunito Sans', 'Work Sans', 'Manrope', 'Space Grotesk',
    'Playfair Display', 'Merriweather', 'Lora', 'Inconsolata', 'JetBrains Mono',
  ]), []);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [fontQuery, setFontQuery] = useState('');
  const fontMenuRef = useRef(null);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const sizeMenuRef = useRef(null);
  const [fontSizePt, setFontSizePt] = useState(18);
  const [fontFamily, setFontFamily] = useState('Plus Jakarta Sans');
  const [colorHex, setColorHex] = useState('#111827');

  const [dragState, setDragState] = useState(null); // { id, dxPx, dyPx }
  const dragRef = useRef(null); // { id, startClientX, startClientY, baseDx, baseDy, moved }

  const [resizeState, setResizeState] = useState(null); // { id, rectPx: {x,y,w,h}, handle }
  const resizeRef = useRef(null); // { id, handle, startClientX, startClientY, baseRectPx, zoom, aspect, shift }

  const filteredFonts = useMemo(() => {
    const q = String(fontQuery || '').trim().toLowerCase();
    if (!q) return STUDIO_FONTS;
    return STUDIO_FONTS.filter((f) => String(f).toLowerCase().includes(q));
  }, [STUDIO_FONTS, fontQuery]);

  useEffect(() => {
    const onDown = (e) => {
      const t = e.target;
      if (fontMenuOpen && fontMenuRef.current && !fontMenuRef.current.contains(t)) setFontMenuOpen(false);
      if (sizeMenuOpen && sizeMenuRef.current && !sizeMenuRef.current.contains(t)) setSizeMenuOpen(false);
    };
    if (!fontMenuOpen && !sizeMenuOpen) return undefined;
    window.document.addEventListener('mousedown', onDown, true);
    return () => window.document.removeEventListener('mousedown', onDown, true);
  }, [fontMenuOpen, sizeMenuOpen]);

  const loadDoc = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setErr('');
    try {
      const r = await api.get(`/api/documents/${documentId}`);
      const d = r.data?.document || r.data; // controller shapes vary; tolerate both
      if (!d?.id) throw new Error('Document not found');
      if (!isPptxMime(d.mimeType)) throw new Error('Studio only supports PPTX documents.');
      setDoc(d);
      setLoading(false);
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to load document');
      setLoading(false);
    }
  }, [documentId]);

  const loadSlidesList = useCallback(async () => {
    if (!documentId) return;
    try {
      const r = await api.get(`/api/documents/${documentId}/studio/slides/scene`, {
        params: { slideNumber: 'all', includeThumbnails: 1, includeElements: 0 },
      });
      setPresentationId(String(r.data?.presentationId || ''));
      setPresentationUrl(String(r.data?.presentationUrl || ''));
      setSlideCount(Number(r.data?.slideCount || 0));
      setSlides(Array.isArray(r.data?.slides) ? r.data.slides : []);
    } catch (e) {
      // If the scene cannot load, show an actionable error rather than a blank studio.
      setErr(e?.response?.data?.error || e?.message || 'Failed to load slides list');
    }
  }, [documentId]);

  const loadActiveScene = useCallback(async (n) => {
    if (!documentId) return;
    const slideNumber = Number(n || activeSlideNumber) || 1;
    try {
      const r = await api.get(`/api/documents/${documentId}/studio/slides/scene`, {
        params: { slideNumber, includeThumbnails: 1, includeElements: 1 },
      });
      setPresentationId(String(r.data?.presentationId || ''));
      setPresentationUrl(String(r.data?.presentationUrl || ''));
      setScene(r.data);
      setSelectedElId('');
      setEditingText(false);
      setDraftText('');
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to load slide scene');
    }
  }, [documentId, activeSlideNumber]);

  useEffect(() => {
    loadDoc();
  }, [loadDoc]);

  useEffect(() => {
    if (!doc?.id) return;
    loadSlidesList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  useEffect(() => {
    if (!doc?.id) return;
    loadActiveScene(activeSlideNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, activeSlideNumber]);

  useEffect(() => {
    if (!editingText) return;
    const el = editorRef.current;
    if (!el) return;
    // Focus on next tick to avoid selection glitches.
    setTimeout(() => {
      try {
        // Uncontrolled contenteditable: set content once.
        if (String(el.textContent || '') !== String(draftText || '')) {
          el.textContent = String(draftText || '');
        }
        el.focus();
      } catch {}
    }, 0);
  }, [editingText, draftText]);

  const activeSlide = useMemo(() => {
    const s = Array.isArray(scene?.slides) ? scene.slides[0] : null;
    return s || null;
  }, [scene]);

  const stageDims = useMemo(() => {
    const thumb = activeSlide?.thumbnail;
    const w = Number(thumb?.widthPx || 0);
    const h = Number(thumb?.heightPx || 0);
    if (!w || !h) return { w: 960, h: 540 };
    return { w, h };
  }, [activeSlide]);

  const elementsPx = useMemo(() => {
    const els = Array.isArray(activeSlide?.elements) ? activeSlide.elements : [];
    const pageSize = scene?.pageSize || {};
    const pageW = Number(pageSize?.widthPt || 0) || 960;
    const pageH = Number(pageSize?.heightPt || 0) || 540;
    const sx = stageDims.w / pageW;
    const sy = stageDims.h / pageH;
    return els.map((e) => {
      const b = e?.boundsPt;
      if (!b) return null;
      return {
        ...e,
        boundsPx: {
          x: b.x * sx,
          y: b.y * sy,
          w: b.w * sx,
          h: b.h * sy,
        },
      };
    }).filter(Boolean);
  }, [activeSlide, scene, stageDims]);

  const elementsById = useMemo(() => {
    const map = new Map();
    for (const e of elementsPx) map.set(e.objectId, e);
    return map;
  }, [elementsPx]);

  const layers = useMemo(() => {
    const els = Array.isArray(elementsPx) ? [...elementsPx] : [];
    // Higher zIndex should appear "on top" and later in list; list top-down.
    els.sort((a, b) => Number(b?.zIndex || 0) - Number(a?.zIndex || 0));
    return els.map((e) => {
      const label =
        e?.kind === 'image'
          ? 'Image'
          : e?.text?.isText
            ? (e?.placeholderType ? `Text (${e.placeholderType})` : 'Text')
            : e?.kind === 'shape'
              ? 'Shape'
              : e?.kind || 'Element';
      const subtitle = e?.text?.isText ? (e?.text?.summary || '(empty)') : '';
      return { id: e.objectId, kind: e.kind, label, subtitle };
    });
  }, [elementsPx]);

  const pxToPt = useMemo(() => {
    const pageSize = scene?.pageSize || {};
    const pageW = Number(pageSize?.widthPt || 0) || 960;
    const pageH = Number(pageSize?.heightPt || 0) || 540;
    return {
      x: pageW / (stageDims.w || 960),
      y: pageH / (stageDims.h || 540),
    };
  }, [scene, stageDims]);

  const applyTranslateDelta = useCallback(async (objectId, dxPx, dyPx) => {
    if (!documentId || !objectId) return;
    const dxPt = dxPx * pxToPt.x;
    const dyPt = dyPx * pxToPt.y;
    if (!Number.isFinite(dxPt) || !Number.isFinite(dyPt)) return;
    if (Math.abs(dxPt) < 0.2 && Math.abs(dyPt) < 0.2) return;
    await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
      ops: [{
        type: 'update_transform',
        objectId,
        applyMode: 'RELATIVE',
        transform: { a: 1, b: 0, c: 0, d: 1, tx: dxPt, ty: dyPt },
      }],
    });
    pendingAutosaveRef.current = true;
    scheduleAutosaveRef.current?.();
  }, [documentId, pxToPt]);

  const applyResize = useCallback(async (objectId, rectPx, anchor) => {
    if (!documentId || !objectId || !rectPx) return;
    const wPt = rectPx.w * pxToPt.x;
    const hPt = rectPx.h * pxToPt.y;
    if (!Number.isFinite(wPt) || !Number.isFinite(hPt)) return;
    if (wPt < 2 || hPt < 2) return;
    await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
      ops: [{
        type: 'update_size',
        objectId,
        widthPt: wPt,
        heightPt: hPt,
        anchor,
      }],
    });
    pendingAutosaveRef.current = true;
    scheduleAutosaveRef.current?.();
  }, [documentId, pxToPt]);

  const createTextBox = useCallback(async () => {
    if (!documentId || !activeSlide?.slideObjectId || !scene?.pageSize) return;
    setStatus('Syncing…');
    try {
      const pageW = Number(scene.pageSize?.widthPt || 0) || 960;
      const pageH = Number(scene.pageSize?.heightPt || 0) || 540;
      const w = Math.min(560, Math.max(220, pageW * 0.58));
      const h = Math.min(180, Math.max(90, pageH * 0.18));
      const x = Math.max(20, (pageW - w) / 2);
      const y = Math.max(20, (pageH - h) / 2);

      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{
          type: 'create_shape',
          slideObjectId: activeSlide.slideObjectId,
          shapeType: 'TEXT_BOX',
          noFillNoOutline: true,
          initialText: 'Type here…',
          elementProperties: {
            pageObjectId: activeSlide.slideObjectId,
            size: {
              width: { magnitude: w, unit: 'PT' },
              height: { magnitude: h, unit: 'PT' },
            },
            transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: 'PT' },
          },
        }],
      });
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      await loadActiveScene(activeSlideNumber);
      setStatus('Synced');
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Insert failed');
    }
  }, [documentId, activeSlide, scene, loadActiveScene, activeSlideNumber]);

  const deleteSelectedElement = useCallback(async () => {
    if (!documentId || !selectedEl?.objectId) return;
    setStatus('Syncing…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'delete_element', objectId: selectedEl.objectId }],
      });
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      setSelectedElId('');
      await loadActiveScene(activeSlideNumber);
      setStatus('Synced');
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Delete failed');
    }
  }, [documentId, selectedEl, loadActiveScene, activeSlideNumber]);

  const zOrder = useCallback(async (operation) => {
    if (!documentId || !selectedEl?.objectId) return;
    setStatus('Syncing…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'z_order', objectId: selectedEl.objectId, operation }],
      });
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      await loadActiveScene(activeSlideNumber);
      setStatus('Synced');
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Arrange failed');
    }
  }, [documentId, selectedEl, loadActiveScene, activeSlideNumber]);

  const runQuickPrompt = useCallback(() => {
    const instr = String(quickPrompt || '').trim();
    if (!instr) return;
    setRightTab('allybi');

    const slideNum = activeSlideNumber;
    const targetId = selectedEl?.objectId ? String(selectedEl.objectId) : '';
    const kind = selectedEl?.text?.isText ? 'text' : selectedEl?.kind === 'image' ? 'image' : selectedEl ? String(selectedEl.kind) : 'slide';

    const prompt = [
      `You are editing a Google Slides-backed PPTX inside Allybi.`,
      `Target: slide ${slideNum}.`,
      targetId ? `Target objectId: ${targetId}.` : '',
      `User instruction: "${instr}".`,
      `Return an edit_session with concrete operations for the slides domain.`,
      `Prefer minimal changes and preserve meaning.`,
      kind === 'text' ? `If target is text: output a REWRITE_SLIDE_TEXT operation for that objectId.` : '',
      kind === 'image' ? `If target is image: output a REPLACE_SLIDE_IMAGE for that objectId with a direct https image URL.` : '',
      kind === 'slide' ? `If no element is selected: output slide-level improvements and/or ADD_SLIDE if necessary.` : '',
    ].filter(Boolean).join(' ');

    setQuickPrompt('');
    setTimeout(() => chatApiRef.current?.send?.(prompt), 60);
  }, [quickPrompt, activeSlideNumber, selectedEl]);

  const beginInlineEdit = useCallback((el) => {
    if (!el?.text?.isText) return;
    setDraftText(String(el?.text?.raw || ''));
    setEditingText(true);
  }, []);

  const onBeginDrag = useCallback((ev, objectId) => {
    if (!objectId) return;
    // Only drag when not text-editing.
    if (editingText) return;
    if (resizeRef.current) return;
    ev.preventDefault();
    ev.stopPropagation();
    const cur = dragState && dragState.id === objectId ? dragState : null;
    const baseDx = cur ? Number(cur.dxPx || 0) : 0;
    const baseDy = cur ? Number(cur.dyPx || 0) : 0;
    dragRef.current = {
      id: objectId,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      baseDx,
      baseDy,
      zoom: zoomFactor,
      moved: false,
      lastDxPx: baseDx,
      lastDyPx: baseDy,
    };
    setDragState({ id: objectId, dxPx: baseDx, dyPx: baseDy });
  }, [editingText, dragState]);

  const onBeginResize = useCallback((ev, el, handle) => {
    if (!el?.objectId || !el?.boundsPx) return;
    if (editingText) return;
    ev.preventDefault();
    ev.stopPropagation();
    resizeRef.current = {
      id: el.objectId,
      handle,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      baseRectPx: { ...el.boundsPx },
      zoom: zoomFactor,
      aspect: (el.boundsPx.h ? (el.boundsPx.w / el.boundsPx.h) : 1),
    };
    setResizeState({ id: el.objectId, handle, rectPx: { ...el.boundsPx } });
  }, [editingText, zoomFactor]);

  useEffect(() => {
    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d?.id) return;
      const z = Number(d.zoom || 1) || 1;
      const dx = ((ev.clientX - d.startClientX) / z) + d.baseDx;
      const dy = ((ev.clientY - d.startClientY) / z) + d.baseDy;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;
      d.lastDxPx = dx;
      d.lastDyPx = dy;
      setDragState({ id: d.id, dxPx: dx, dyPx: dy });
    };
    const onUp = async () => {
      const d = dragRef.current;
      if (!d?.id) return;
      dragRef.current = null;
      const dxPx = Number(d.lastDxPx || 0);
      const dyPx = Number(d.lastDyPx || 0);
      setDragState(null);
      // Commit move if actually moved.
      if (d.moved) {
        try {
          await applyTranslateDelta(d.id, dxPx, dyPx);
          await loadActiveScene(activeSlideNumber);
        } catch (e) {
          setStatus(e?.response?.data?.error || e?.message || 'Move failed');
        }
      }
    };
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    return () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
    };
  }, [applyTranslateDelta, loadActiveScene, activeSlideNumber]);

  useEffect(() => {
    const onMove = (ev) => {
      const r = resizeRef.current;
      if (!r?.id) return;
      const z = Number(r.zoom || 1) || 1;
      const dx = (ev.clientX - r.startClientX) / z;
      const dy = (ev.clientY - r.startClientY) / z;

      const base = r.baseRectPx;
      let x = base.x;
      let y = base.y;
      let w = base.w;
      let h = base.h;

      const keepAspect = !!ev.shiftKey;
      const aspect = Number(r.aspect || 1) || 1;

      const applyAspect = (nw, nh, mode) => {
        if (!keepAspect) return { w: nw, h: nh };
        const aw = Math.max(6, nw);
        const ah = Math.max(6, nh);
        // Prefer adjusting the dimension being dragged.
        if (mode === 'w') return { w: aw, h: Math.max(6, aw / aspect) };
        if (mode === 'h') return { w: Math.max(6, ah * aspect), h: ah };
        // fallback: choose smaller distortion
        const hFromW = aw / aspect;
        const wFromH = ah * aspect;
        if (Math.abs(hFromW - ah) < Math.abs(wFromH - aw)) return { w: aw, h: Math.max(6, hFromW) };
        return { w: Math.max(6, wFromH), h: ah };
      };

      switch (r.handle) {
        case 'se': {
          const next = applyAspect(w + dx, h + dy, Math.abs(dx) >= Math.abs(dy) ? 'w' : 'h');
          w = next.w; h = next.h;
          break;
        }
        case 'sw': {
          const next = applyAspect(w - dx, h + dy, Math.abs(dx) >= Math.abs(dy) ? 'w' : 'h');
          w = next.w; h = next.h;
          x = base.x + (base.w - w);
          break;
        }
        case 'ne': {
          const next = applyAspect(w + dx, h - dy, Math.abs(dx) >= Math.abs(dy) ? 'w' : 'h');
          w = next.w; h = next.h;
          y = base.y + (base.h - h);
          break;
        }
        case 'nw': {
          const next = applyAspect(w - dx, h - dy, Math.abs(dx) >= Math.abs(dy) ? 'w' : 'h');
          w = next.w; h = next.h;
          x = base.x + (base.w - w);
          y = base.y + (base.h - h);
          break;
        }
        case 'e':
          w = Math.max(6, w + dx);
          break;
        case 'w':
          w = Math.max(6, w - dx);
          x = base.x + (base.w - w);
          break;
        case 's':
          h = Math.max(6, h + dy);
          break;
        case 'n':
          h = Math.max(6, h - dy);
          y = base.y + (base.h - h);
          break;
        default:
          break;
      }

      setResizeState({ id: r.id, handle: r.handle, rectPx: { x, y, w, h } });
    };

    const onUp = async () => {
      const r = resizeRef.current;
      if (!r?.id) return;
      resizeRef.current = null;
      const cur = resizeState && resizeState.id === r.id ? resizeState : null;
      const rectPx = cur?.rectPx || r.baseRectPx;
      setResizeState(null);

      // Map handle to anchor (opposite corner stays fixed).
      const anchorMap = {
        se: 'TOP_LEFT',
        sw: 'TOP_RIGHT',
        ne: 'BOTTOM_LEFT',
        nw: 'BOTTOM_RIGHT',
        e: 'LEFT',
        w: 'RIGHT',
        s: 'TOP',
        n: 'BOTTOM',
      };
      const anchor = anchorMap[r.handle] || 'TOP_LEFT';
      try {
        await applyResize(r.id, rectPx, anchor);
        await loadActiveScene(activeSlideNumber);
      } catch (e) {
        setStatus(e?.response?.data?.error || e?.message || 'Resize failed');
      }
    };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    return () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
    };
  }, [applyResize, loadActiveScene, activeSlideNumber, resizeState]);

  const applyText = useCallback(async () => {
    if (!documentId || !selectedEl?.objectId) return;
    const next = String(editorRef.current?.textContent ?? draftText ?? '').replace(/\r/g, '');
    const before = String(selectedEl?.text?.raw || '');
    setStatus('Syncing…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'set_text', objectId: selectedEl.objectId, text: next }],
      });
      setStatus('Synced');
      setEditingText(false);
      undoStackRef.current = [...undoStackRef.current, { type: 'set_text', objectId: selectedEl.objectId, beforeText: before, afterText: next }];
      redoStackRef.current = [];
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      await loadActiveScene(activeSlideNumber);
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Apply failed');
    }
  }, [documentId, selectedEl, draftText, loadActiveScene, activeSlideNumber]);

  const applyTextStyle = useCallback(async (partialStyle, fields) => {
    if (!documentId || !selectedEl?.objectId) return;
    const editable = editorRef.current;
    const sel = editable ? selectionOffsetsWithin(editable) : null;
    const mapped = sel && sel.end > sel.start ? mapOffsetsToSlidesRange(sel, selectedEl?.text?.runs) : null;
    const range = mapped && mapped.end > mapped.start ? mapped : null;
    setStatus('Syncing…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{
          type: 'set_text_style',
          objectId: selectedEl.objectId,
          style: partialStyle,
          fields,
          ...(range ? { range } : {}),
        }],
      });
      setStatus('Synced');
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Style apply failed');
    }
  }, [documentId, selectedEl]);

  const applyParagraphStyle = useCallback(async (style, fields) => {
    if (!documentId || !selectedEl?.objectId) return;
    setStatus('Syncing…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'set_paragraph_style', objectId: selectedEl.objectId, style, fields }],
      });
      setStatus('Synced');
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Paragraph apply failed');
    }
  }, [documentId, selectedEl]);

  const setBullets = useCallback(async (enabled, preset) => {
    if (!documentId || !selectedEl?.objectId) return;
    setStatus('Syncing…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'set_bullets', objectId: selectedEl.objectId, enabled, preset }],
      });
      setStatus('Synced');
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Bullets failed');
    }
  }, [documentId, selectedEl]);

  const generateAsset = useCallback(async (kind) => {
    if (!documentId) return;
    const p = String(assetPrompt || '').trim();
    if (!p) return;
    setAssetBusy(true);
    setStatus('Generating…');
    try {
      const r = await api.post(`/api/documents/${documentId}/studio/slides/generate-asset`, { kind, prompt: p });
      const url = String(r.data?.url || '');
      setAssetPreviewUrl(url);
      setStatus('Generated');
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Generation failed');
    } finally {
      setAssetBusy(false);
    }
  }, [documentId, assetPrompt]);

  const replaceSelectedImage = useCallback(async () => {
    if (!documentId || !selectedEl?.objectId || !assetPreviewUrl) return;
    setStatus('Syncing…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'replace_image', imageObjectId: selectedEl.objectId, url: assetPreviewUrl }],
      });
      setStatus('Synced');
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      await loadActiveScene(activeSlideNumber);
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Replace failed');
    }
  }, [documentId, selectedEl, assetPreviewUrl, loadActiveScene, activeSlideNumber]);

  const insertAssetOnSlide = useCallback(async () => {
    if (!documentId || !assetPreviewUrl || !activeSlide?.slideObjectId) return;
    setStatus('Syncing…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'create_image', slideObjectId: activeSlide.slideObjectId, url: assetPreviewUrl }],
      });
      setStatus('Synced');
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      await loadActiveScene(activeSlideNumber);
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Insert failed');
    }
  }, [documentId, assetPreviewUrl, activeSlide, loadActiveScene, activeSlideNumber]);

  const setBackground = useCallback(async (hex) => {
    if (!documentId || !activeSlide?.slideObjectId) return;
    setStatus('Syncing…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'set_slide_background', slideObjectId: activeSlide.slideObjectId, colorHex: hex }],
      });
      setStatus('Synced');
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      await loadActiveScene(activeSlideNumber);
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Background failed');
    }
  }, [documentId, activeSlide, loadActiveScene, activeSlideNumber]);

  const exportDeck = useCallback(async () => {
    if (!documentId) return;
    setStatus('Exporting…');
    try {
      const r = await api.post(`/api/documents/${documentId}/studio/slides/export`, { mode: 'revision' });
      const newId = String(r.data?.documentId || '');
      if (newId) {
        navigate(buildRoute.document(newId));
        return;
      }
      setStatus('Exported');
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Export failed');
    }
  }, [documentId, navigate]);

  const saveOverwrite = useCallback(async () => {
    if (!documentId) return;
    setStatus('Saving…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/export`, { mode: 'overwrite' });
      setStatus('Saved');
      pendingAutosaveRef.current = false;
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Save failed');
    }
  }, [documentId]);

  const scheduleAutosave = useCallback(() => {
    if (!documentId) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      if (!pendingAutosaveRef.current) return;
      saveOverwrite();
    }, 12000);
  }, [documentId, saveOverwrite]);

  // Avoid TDZ issues by routing early callers through a ref.
  scheduleAutosaveRef.current = scheduleAutosave;

  const undo = useCallback(async () => {
    const last = undoStackRef.current[undoStackRef.current.length - 1];
    if (!last || last.type !== 'set_text') return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, last];
    setStatus('Undo…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'set_text', objectId: last.objectId, text: last.beforeText }],
      });
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      await loadActiveScene(activeSlideNumber);
      setStatus('Synced');
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Undo failed');
    }
  }, [documentId, loadActiveScene, activeSlideNumber]);

  const redo = useCallback(async () => {
    const last = redoStackRef.current[redoStackRef.current.length - 1];
    if (!last || last.type !== 'set_text') return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, last];
    setStatus('Redo…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'set_text', objectId: last.objectId, text: last.afterText }],
      });
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      await loadActiveScene(activeSlideNumber);
      setStatus('Synced');
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Redo failed');
    }
  }, [documentId, loadActiveScene, activeSlideNumber]);

  const addSlideAfterCurrent = useCallback(async () => {
    if (!documentId || !activeSlide?.slideObjectId) return;
    setStatus('Adding slide…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'add_slide', layout: 'TITLE_AND_BODY', afterSlideObjectId: activeSlide.slideObjectId }],
      });
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      await loadSlidesList();
      setActiveSlideNumber((n) => n + 1);
      setStatus('Synced');
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Add slide failed');
    }
  }, [documentId, activeSlide, loadSlidesList]);

  const reorderSlides = useCallback(async (slideObjectId, insertionIndex) => {
    if (!documentId || !slideObjectId) return;
    setStatus('Reordering…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'reorder_slides', slideObjectIds: [slideObjectId], insertionIndex }],
      });
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      await loadSlidesList();
      setStatus('Synced');
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Reorder failed');
    }
  }, [documentId, loadSlidesList]);

  const deleteCurrentSlide = useCallback(async () => {
    if (!documentId || !activeSlide?.slideObjectId) return;
    const ok = window.confirm(`Delete slide ${activeSlideNumber}?`);
    if (!ok) return;
    setStatus('Deleting…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'delete_slide', slideObjectId: activeSlide.slideObjectId }],
      });
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      await loadSlidesList();
      setActiveSlideNumber((n) => Math.max(1, n - 1));
      setStatus('Synced');
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Delete failed');
    }
  }, [documentId, activeSlide, activeSlideNumber, loadSlidesList]);

  const duplicateSelectedElement = useCallback(async () => {
    if (!documentId || !selectedEl?.objectId) return;
    setStatus('Duplicating…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'duplicate_element', objectId: selectedEl.objectId, dxPt: 12, dyPt: 12 }],
      });
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      await loadActiveScene(activeSlideNumber);
      setStatus('Synced');
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Duplicate failed');
    }
  }, [documentId, selectedEl, loadActiveScene, activeSlideNumber]);

  const duplicateCurrentSlide = useCallback(async () => {
    if (!documentId || !activeSlide?.slideObjectId) return;
    setStatus('Duplicating slide…');
    try {
      await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
        ops: [{ type: 'duplicate_slide', slideObjectId: activeSlide.slideObjectId }],
      });
      pendingAutosaveRef.current = true;
      scheduleAutosaveRef.current?.();
      await loadSlidesList();
      setStatus('Synced');
      setTimeout(() => setStatus(''), 900);
    } catch (e) {
      setStatus(e?.response?.data?.error || e?.message || 'Duplicate slide failed');
    }
  }, [documentId, activeSlide, loadSlidesList]);

  const onStudioAssistantFinal = useCallback(({ attachments }) => {
    const a = Array.isArray(attachments) ? attachments : [];
    const sessions = a.filter((x) => x && x.type === 'edit_session');
    if (!sessions.length) return;

    // Apply sequentially to keep slide scene stable.
    (async () => {
      for (const s of sessions) {
        const domain = String(s?.domain || '');
        const operator = String(s?.operator || '');
        if (domain !== 'slides') continue;
        const proposedText = String(s?.diff?.after || s?.proposedText || '').trim();
        const targetId = String(s?.target?.id || s?.targetHint || s?.target?.objectId || '').trim();

        try {
          if (operator === 'REWRITE_SLIDE_TEXT' && targetId) {
            setStatus('Applying…');
            // eslint-disable-next-line no-await-in-loop
            await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
              ops: [{ type: 'set_text', objectId: targetId, text: proposedText }],
            });
            pendingAutosaveRef.current = true;
            scheduleAutosaveRef.current?.();
          } else if (operator === 'REPLACE_SLIDE_IMAGE' && targetId) {
            setStatus('Applying…');
            // eslint-disable-next-line no-await-in-loop
            await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
              ops: [{ type: 'replace_image', imageObjectId: targetId, url: proposedText }],
            });
            pendingAutosaveRef.current = true;
            scheduleAutosaveRef.current?.();
          } else if (operator === 'ADD_SLIDE') {
            setStatus('Applying…');
            // eslint-disable-next-line no-await-in-loop
            await api.post(`/api/documents/${documentId}/studio/slides/batch`, {
              ops: [{ type: 'add_slide', layout: proposedText || 'TITLE_AND_BODY', afterSlideObjectId: activeSlide?.slideObjectId }],
            });
            pendingAutosaveRef.current = true;
            scheduleAutosaveRef.current?.();
          }
        } catch (e) {
          setStatus(e?.response?.data?.error || e?.message || 'Apply failed');
        }
      }

      try {
        await loadSlidesList();
        await loadActiveScene(activeSlideNumber);
        setStatus('Synced');
        setTimeout(() => setStatus(''), 900);
      } catch {}
    })();
  }, [documentId, activeSlide, loadSlidesList, loadActiveScene, activeSlideNumber]);

  const beautifyThisSlide = useCallback(() => {
    setRightTab('allybi');

    const slideNum = activeSlideNumber;
    const hasImagePlaceholders = (elementsPx || []).some((e) => e?.kind === 'image');
    const prompt = [
      `Beautify slide ${slideNum} in this deck.`,
      `Keep the meaning, but improve layout, typography, spacing, and consistency.`,
      `If there is a placeholder image area, generate a clean on-brand image/icon and replace it.`,
      `Make it look like a premium Canva template: clean, not tight, strong hierarchy.`,
      hasImagePlaceholders ? `There are image elements available to replace.` : `If no image exists, you may add one.`,
      `Return concrete edits (rewrite text targets, add slide if needed, replace slide image).`,
    ].join(' ');

    setTimeout(() => {
      chatApiRef.current?.send?.(prompt);
    }, 80);
  }, [activeSlideNumber, elementsPx]);

  if (loading) {
    return <div className="pptx-studio-root"><div className="pptx-studio-loading" /></div>;
  }

  if (err) {
    return (
      <div className="pptx-studio-root">
        <div className="pptx-studio-error">
          <div className="pptx-studio-error-title">PPTX Studio</div>
          <div className="pptx-studio-error-msg">{String(err)}</div>
          <button className="pptx-studio-btn" onClick={() => navigate(buildRoute.document(documentId))}>Back</button>
        </div>
      </div>
    );
  }

  const studioTitle = doc?.filename || 'Presentation';
  const selectedLabel =
    selectedEl
      ? (selectedEl?.text?.isText ? 'Text' : selectedEl?.kind === 'image' ? 'Image' : String(selectedEl?.kind || 'Element'))
      : 'Slide';

  return (
    <div className="pptx-studio-root">
      <div className="pptx-studio-topbar">
        <div className="pptx-studio-titlewrap">
          <button className="pptx-studio-iconbtn" title="Back" onClick={() => navigate(buildRoute.document(documentId))}>
            ←
          </button>
          <div className="pptx-studio-title">
            <div className="pptx-studio-title-main">{studioTitle}</div>
            <div className="pptx-studio-title-sub">
              Slide {activeSlideNumber} of {slideCount || slides.length || 0}
              {presentationUrl ? (
                <>
                  {' '}•{' '}
                  <a className="pptx-studio-link" href={presentationUrl} target="_blank" rel="noreferrer">Open in Google Slides</a>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="pptx-studio-toolbar">
          <div className="pptx-studio-pill">{status || 'Ready'}</div>
          <div className="pptx-studio-divider" />
          <button className="pptx-studio-btn" onClick={addSlideAfterCurrent}>Add slide</button>
          <button className="pptx-studio-btn" onClick={duplicateCurrentSlide}>Duplicate</button>
          <button className="pptx-studio-btn" onClick={deleteCurrentSlide} disabled={(slideCount || slides.length || 0) <= 1}>Delete</button>
          <div className="pptx-studio-divider" />
          <button className="pptx-studio-btn" onClick={saveOverwrite}>Save</button>
          <button className="pptx-studio-btn primary" onClick={exportDeck}>Export PPTX</button>
        </div>
      </div>

      <div className="pptx-studio-formatbar">
        <div className="formatting-toolbar allybi-one-line" style={{ width: '100%', background: 'transparent', border: 'none', padding: 0 }}>
          <div className="allybi-toolbar-center" style={{ width: '100%', justifyContent: 'space-between' }}>
            <div className="toolbar-section" style={{ gap: 10 }}>
              <div className="toolbar-btn" style={{ fontWeight: 950, borderRadius: 999, padding: '0 12px' }} title="Selection">
                Slide {activeSlideNumber} • {selectedLabel}
              </div>

              <div className="toolbar-divider" />

              <button
                className="toolbar-btn icon-btn"
                title="Undo"
                onMouseDown={(e) => { e.preventDefault(); undo(); }}
                disabled={!undoStackRef.current.length}
              >
                <img src={UndoIcon} alt="" />
              </button>
              <button
                className="toolbar-btn icon-btn"
                title="Redo"
                onMouseDown={(e) => { e.preventDefault(); redo(); }}
                disabled={!redoStackRef.current.length}
              >
                <img src={RedoIcon} alt="" />
              </button>

              <div className="toolbar-divider" />

              <button className="toolbar-btn" onMouseDown={(e) => { e.preventDefault(); createTextBox(); }}>
                Text box
              </button>
              <button
                className="toolbar-btn"
                disabled={!selectedEl}
                onMouseDown={(e) => { e.preventDefault(); deleteSelectedElement(); }}
                title="Delete selected element"
              >
                Delete
              </button>
              <button
                className="toolbar-btn"
                disabled={!selectedEl}
                onMouseDown={(e) => { e.preventDefault(); duplicateSelectedElement(); }}
                title="Duplicate selected element"
              >
                Duplicate
              </button>
              <button
                className="toolbar-btn"
                disabled={!selectedEl}
                onMouseDown={(e) => { e.preventDefault(); zOrder('BRING_TO_FRONT'); }}
                title="Bring to front"
              >
                Front
              </button>
              <button
                className="toolbar-btn"
                disabled={!selectedEl}
                onMouseDown={(e) => { e.preventDefault(); zOrder('SEND_TO_BACK'); }}
                title="Send to back"
              >
                Back
              </button>
            </div>

            {selectedEl?.text?.isText ? (
              <div className="toolbar-section" style={{ gap: 10 }}>
            <div ref={fontMenuRef} className="allybi-font-menu">
              <button
                type="button"
                className="toolbar-btn allybi-font-trigger"
                title="Font"
                onMouseDown={(e) => { e.preventDefault(); setFontMenuOpen((v) => !v); }}
              >
                <span className="allybi-font-label" style={{ fontWeight: 900 }}>{fontFamily}</span>
                <img className="allybi-dropdown-icon" src={DropdownIcon} alt="" />
              </button>
              {fontMenuOpen ? (
                <div className="allybi-font-popover" role="menu">
                  <div style={{ padding: 6 }}>
                    <input
                      className="toolbar-input"
                      value={fontQuery}
                      onChange={(e) => setFontQuery(e.target.value)}
                      placeholder="Search fonts…"
                      style={{ width: '100%', height: 34, borderRadius: 10, fontWeight: 800 }}
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setFontMenuOpen(false); } }}
                    />
                  </div>
                  {filteredFonts.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`allybi-font-option ${String(fontFamily).toLowerCase() === String(f).toLowerCase() ? 'active' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setFontFamily(f);
                        applyTextStyle({ weightedFontFamily: { fontFamily: f } }, 'weightedFontFamily');
                        setFontMenuOpen(false);
                      }}
                    >
                      <span style={{ fontFamily: f, fontWeight: 800, color: '#111827' }}>{f}</span>
                      {String(fontFamily).toLowerCase() === String(f).toLowerCase() ? <span className="allybi-font-selected">Selected</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div ref={sizeMenuRef} className="allybi-font-menu">
              <button
                type="button"
                className="toolbar-btn allybi-font-trigger allybi-size-trigger"
                title="Font size"
                onMouseDown={(e) => { e.preventDefault(); setSizeMenuOpen((v) => !v); }}
              >
                <span className="allybi-font-label" style={{ fontWeight: 950, minWidth: 44, textAlign: 'center' }}>
                  {fontSizePt}pt
                </span>
                <img className="allybi-dropdown-icon" src={DropdownIcon} alt="" />
              </button>
              {sizeMenuOpen ? (
                <div className="allybi-font-popover" role="menu" style={{ width: 160 }}>
                  {[10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map((n) => (
                    <button
                      key={String(n)}
                      type="button"
                      className={`allybi-font-option ${Number(fontSizePt) === Number(n) ? 'active' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setFontSizePt(n);
                        applyTextStyle({ fontSize: { magnitude: n, unit: 'PT' } }, 'fontSize');
                        setSizeMenuOpen(false);
                      }}
                    >
                      <span style={{ fontWeight: 900, color: '#111827' }}>{n}pt</span>
                      {Number(fontSizePt) === Number(n) ? <span className="allybi-font-selected">Selected</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button className="toolbar-btn icon-btn" title="Bold" onMouseDown={(e) => { e.preventDefault(); applyTextStyle({ bold: true }, 'bold'); }}>
              <img src={BoldIcon} alt="" />
            </button>
            <button className="toolbar-btn icon-btn" title="Italic" onMouseDown={(e) => { e.preventDefault(); applyTextStyle({ italic: true }, 'italic'); }}>
              <img src={ItalicIcon} alt="" />
            </button>
            <button className="toolbar-btn icon-btn" title="Underline" onMouseDown={(e) => { e.preventDefault(); applyTextStyle({ underline: true }, 'underline'); }}>
              <img src={UnderlineIcon} alt="" />
            </button>

            <input
              type="color"
              value={colorHex}
              onChange={(e) => {
                const next = e.target.value;
                setColorHex(next);
                const rgb = hexToRgb01(next);
                if (!rgb) return;
                applyTextStyle({ foregroundColor: { solidFill: { color: { rgbColor: rgb } } } }, 'foregroundColor');
              }}
              title="Text color"
              style={{ width: 34, height: 34, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
            />

            <div className="toolbar-divider" />
            <button className="toolbar-btn icon-btn" title="Align left" onMouseDown={(e) => { e.preventDefault(); applyParagraphStyle({ alignment: 'START' }, 'alignment'); }}>
              <img src={AlignLeftIcon} alt="" />
            </button>
            <button className="toolbar-btn icon-btn" title="Align center" onMouseDown={(e) => { e.preventDefault(); applyParagraphStyle({ alignment: 'CENTER' }, 'alignment'); }}>
              <img src={AlignCenterIcon} alt="" />
            </button>
            <button className="toolbar-btn icon-btn" title="Align right" onMouseDown={(e) => { e.preventDefault(); applyParagraphStyle({ alignment: 'END' }, 'alignment'); }}>
              <img src={AlignRightIcon} alt="" />
            </button>

            <div className="toolbar-divider" />
            <button className="toolbar-btn icon-btn" title="Bullets" onMouseDown={(e) => { e.preventDefault(); setBullets(true, 'BULLET_DISC_CIRCLE_SQUARE'); }}>
              <img src={ListBulletIcon} alt="" />
            </button>
            <button className="toolbar-btn icon-btn" title="Numbered list" onMouseDown={(e) => { e.preventDefault(); setBullets(true, 'NUMBERED_DIGIT_ALPHA_ROMAN'); }}>
              <img src={ListNumberedIcon} alt="" />
            </button>
            <button className="pptx-studio-btn" onMouseDown={(e) => { e.preventDefault(); setBullets(false); }}>No bullets</button>

            <div className="toolbar-divider" />
            <button className="pptx-studio-btn primary" onMouseDown={(e) => { e.preventDefault(); if (!editingText) beginInlineEdit(selectedEl); else applyText(); }}>
              {editingText ? 'Apply text' : 'Edit text'}
            </button>
              </div>
            ) : (
              <div className="toolbar-section" style={{ gap: 10 }}>
                <div className="pptx-studio-muted" style={{ margin: 0 }}>
                  Select any element to edit text, images, or arrangement.
                </div>
              </div>
            )}

            <div className="toolbar-section" style={{ gap: 10 }}>
              <div className="toolbar-divider" />

              <input
                className="toolbar-input"
                value={quickPrompt}
                onChange={(e) => setQuickPrompt(e.target.value)}
                placeholder={selectedEl?.text?.isText ? 'Rewrite this text…' : selectedEl ? 'Edit this element…' : 'Edit this slide…'}
                style={{ width: 240, height: 34, borderRadius: 999, fontWeight: 850 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    runQuickPrompt();
                  }
                }}
              />
              <button
                className="toolbar-btn"
                disabled={!String(quickPrompt || '').trim()}
                onMouseDown={(e) => { e.preventDefault(); runQuickPrompt(); }}
                title="Ask Allybi to apply this change"
              >
                Apply
              </button>

              <div className="toolbar-divider" />

              <button
                className={`toolbar-btn ${viewMode === 'preview' ? 'active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); setViewMode('preview'); }}
                title="Slide preview mode"
              >
                Preview
              </button>
              <button
                className={`toolbar-btn ${viewMode === 'wireframe' ? 'active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); setViewMode('wireframe'); }}
                title="Wireframe mode (HTML overlays; best for selection)"
              >
                Wireframe
              </button>

              <div className="toolbar-divider" />

              <button className="toolbar-btn icon-btn" title="Zoom out" onMouseDown={(e) => { e.preventDefault(); setZoom((z) => clamp(z - 10, 50, 200)); }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 8H12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <div className="pptx-studio-zoom">{clamp(zoom, 50, 200)}%</div>
              <button className="toolbar-btn icon-btn" title="Zoom in" onMouseDown={(e) => { e.preventDefault(); setZoom((z) => clamp(z + 10, 50, 200)); }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 4V12M4 8H12" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="pptx-studio-body">
        <div className="pptx-studio-left">
          <div className="pptx-studio-lefthdr">Slides</div>
          <div className="pptx-studio-thumbs">
            {(Array.isArray(slides) ? slides : []).map((s) => (
              <button
                key={s.slideObjectId || s.slideNumber}
                className={`pptx-studio-thumb ${Number(s.slideNumber) === activeSlideNumber ? 'active' : ''}`}
                onClick={() => setActiveSlideNumber(Number(s.slideNumber) || 1)}
                title={`Slide ${s.slideNumber}`}
                draggable
                onDragStart={(e) => {
                  try {
                    e.dataTransfer.setData('text/plain', String(s.slideObjectId || ''));
                    e.dataTransfer.effectAllowed = 'move';
                  } catch {}
                }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDrop={(e) => {
                  e.preventDefault();
                  const movedId = e.dataTransfer.getData('text/plain');
                  const targetIndex = Math.max(0, Math.floor(Number(s.slideNumber || 1)) - 1);
                  if (movedId && movedId !== String(s.slideObjectId || '')) {
                    reorderSlides(movedId, targetIndex);
                  }
                }}
              >
                <div className="pptx-studio-thumbnum">{s.slideNumber}</div>
                {s.thumbnail?.url ? (
                  <img className="pptx-studio-thumbimg" src={s.thumbnail.url} alt={`Slide ${s.slideNumber}`} />
                ) : (
                  <div className="pptx-studio-thumbph" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="pptx-studio-center">
        <div className="pptx-studio-canvaswrap">
          <div className="pptx-studio-canvas" ref={stageRef}>
            <div className="pptx-studio-stageframe">
              <div className="pptx-studio-stagecorner" />
              <div className="pptx-studio-ruler-x" style={{ width: stageDims.w * zoomFactor }}>
                {Array.from({ length: Math.max(1, Math.floor((stageDims.w * zoomFactor) / 100)) }, (_, i) => (
                  <div key={i} className="pptx-studio-ruler-tick" style={{ left: (i + 1) * 100 }}>
                    <div className="pptx-studio-ruler-line" />
                    <div className="pptx-studio-ruler-label">{i + 1}</div>
                  </div>
                ))}
              </div>
              <div className="pptx-studio-ruler-y" style={{ height: stageDims.h * zoomFactor }}>
                {Array.from({ length: Math.max(1, Math.floor((stageDims.h * zoomFactor) / 100)) }, (_, i) => (
                  <div key={i} className="pptx-studio-ruler-tick-y" style={{ top: (i + 1) * 100 }}>
                    <div className="pptx-studio-ruler-line-y" />
                    <div className="pptx-studio-ruler-label-y">{i + 1}</div>
                  </div>
                ))}
              </div>

              <div
                className="pptx-studio-stage"
                style={{
                  width: stageDims.w * zoomFactor,
                  height: stageDims.h * zoomFactor,
                  background: viewMode === 'wireframe' ? '#FFFFFF' : undefined,
                }}
              >
                {activeSlide?.thumbnail?.url ? (
                  <img
                    className="pptx-studio-slideimg"
                    src={activeSlide.thumbnail.url}
                    alt={`Slide ${activeSlideNumber}`}
                    draggable={false}
                    style={{ opacity: viewMode === 'wireframe' ? 0.0 : 1.0 }}
                  />
                ) : (
                  <div className="pptx-studio-slideph" />
                )}

                <div className="pptx-studio-overlay">
                  {elementsPx.map((e) => (
                    (() => {
                      const isDragging = dragState && dragState.id === e.objectId;
                      const isResizing = resizeState && resizeState.id === e.objectId;
                      const rect = isResizing ? resizeState.rectPx : e.boundsPx;
                      const dxPx = isDragging ? Number(dragState.dxPx || 0) : 0;
                      const dyPx = isDragging ? Number(dragState.dyPx || 0) : 0;
                      const left = (rect.x + dxPx) * zoomFactor;
                      const top = (rect.y + dyPx) * zoomFactor;
                      const width = Math.max(6, rect.w * zoomFactor);
                      const height = Math.max(6, rect.h * zoomFactor);

                      const hasRotation = Math.abs(Number(e?.transform?.b || 0)) > 1e-6 || Math.abs(Number(e?.transform?.c || 0)) > 1e-6;
                      const showHandles = e.objectId === selectedElId && !editingText && !hasRotation;
                      return (
                    <div
                      key={e.objectId}
                      className={`pptx-studio-elbox ${e.objectId === selectedElId ? 'selected' : ''}`}
                      style={{
                        left,
                        top,
                        width,
                        height,
                        transform: 'translate(0px, 0px)',
                      }}
                      onMouseDown={(ev) => {
                        // Select on mouse down so drag feels immediate.
                        ev.preventDefault();
                        setSelectedElId(e.objectId);
                        setEditingText(false);
                        setDraftText(e?.text?.isText ? String(e?.text?.raw || '') : '');
                        onBeginDrag(ev, e.objectId);
                      }}
                      onDoubleClick={(ev) => {
                        ev.preventDefault();
                        setSelectedElId(e.objectId);
                        if (e?.text?.isText) beginInlineEdit(e);
                      }}
                      title={e.kind === 'image' ? 'Image' : e?.text?.isText ? 'Text' : e.kind}
                      role="button"
                      tabIndex={0}
                    >
                      {showHandles ? (
                        <>
                          {['nw','n','ne','e','se','s','sw','w'].map((h) => (
                            <div
                              key={h}
                              className={`pptx-studio-handle ${h}`}
                              onMouseDown={(ev) => onBeginResize(ev, e, h)}
                            />
                          ))}
                        </>
                      ) : null}
                    </div>
                      );
                    })()
                  ))}
                </div>

                {selectedEl?.text?.isText && editingText ? (
                  <div
                    className="pptx-studio-textedit"
                    style={{
                      left: (((elementsById.get(selectedEl.objectId)?.boundsPx?.x || 0) + (dragState && dragState.id === selectedEl.objectId ? Number(dragState.dxPx || 0) : 0)) * zoomFactor),
                      top: (((elementsById.get(selectedEl.objectId)?.boundsPx?.y || 0) + (dragState && dragState.id === selectedEl.objectId ? Number(dragState.dyPx || 0) : 0)) * zoomFactor),
                      width: Math.max(10, (elementsById.get(selectedEl.objectId)?.boundsPx?.w || 10) * zoomFactor),
                      height: Math.max(10, (elementsById.get(selectedEl.objectId)?.boundsPx?.h || 10) * zoomFactor),
                    }}
                  >
                    <div className="pptx-studio-texttools">
                      <div style={{ fontWeight: 900, fontSize: 12, color: '#111827' }}>Editing</div>
                      <div className="pptx-studio-divider" />
                      <button className="pptx-studio-btn primary" onClick={applyText}>Apply</button>
                      <button className="pptx-studio-btn" onClick={() => { setEditingText(false); setDraftText(String(selectedEl?.text?.raw || '')); }}>Cancel</button>
                    </div>
                    <div
                      ref={editorRef}
                      className="pptx-studio-contenteditable"
                      contentEditable
                      suppressContentEditableWarning
                      onInput={() => {}}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingText(false);
                          setDraftText(String(selectedEl?.text?.raw || ''));
                          return;
                        }
                        const wantsApply = e.key === 'Enter' && (e.metaKey || e.ctrlKey);
                        if (wantsApply) {
                          e.preventDefault();
                          applyText();
                        }
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

        <div className="pptx-studio-right">
          <div className="pptx-studio-rhdr">
            <div className="pptx-studio-tabs">
              <button className={`pptx-studio-tab ${rightTab === 'inspector' ? 'active' : ''}`} onClick={() => setRightTab('inspector')}>Inspector</button>
              <button className={`pptx-studio-tab ${rightTab === 'allybi' ? 'active' : ''}`} onClick={() => setRightTab('allybi')}>Ask Allybi</button>
            </div>
          </div>

          {rightTab === 'inspector' ? (selectedEl ? (
            <div className="pptx-studio-card">
              <div className="pptx-studio-kv">
                <div className="pptx-studio-k">Type</div>
                <div className="pptx-studio-v">{selectedEl.kind}</div>
              </div>
              <div className="pptx-studio-kv">
                <div className="pptx-studio-k">Object</div>
                <div className="pptx-studio-v mono" title={selectedEl.objectId}>{selectedEl.objectId}</div>
              </div>
              {selectedEl?.text?.isText ? (
                <>
                  <div className="pptx-studio-kv">
                    <div className="pptx-studio-k">Text</div>
                    <div className="pptx-studio-v">{selectedEl.text.summary || '(empty)'}</div>
                  </div>
                  <button className="pptx-studio-btn primary" onClick={() => beginInlineEdit(selectedEl)}>Edit text</button>
                </>
              ) : null}
            </div>
          ) : (
            <div className="pptx-studio-muted">Select an element on the slide.</div>
          )) : (
            <div className="pptx-studio-chat">
              <ChatInterface
                currentConversation={studioConversation}
                onConversationUpdate={(u) => setStudioConversation((prev) => ({ ...(prev || {}), ...(u || {}) }))}
                onConversationCreated={(c) => setStudioConversation(c)}
                pinnedDocuments={doc?.id ? [{ id: doc.id, filename: doc.filename, mimeType: doc.mimeType }] : []}
                conversationCreateTitle={doc?.filename ? `Studio: ${doc.filename}` : 'Studio'}
                variant="viewer"
                apiRef={chatApiRef}
                onAssistantFinal={onStudioAssistantFinal}
              />
            </div>
          )}

          {rightTab === 'inspector' ? (
            <>
              <div className="pptx-studio-rhdr">Layers</div>
              <div className="pptx-studio-card" style={{ padding: 8, gap: 6 }}>
                {(layers || []).length ? (
                  (layers || []).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className={`pptx-studio-layer ${l.id === selectedElId ? 'active' : ''}`}
                      onClick={() => setSelectedElId(l.id)}
                      title={l.subtitle || l.label}
                    >
                      <div className="pptx-studio-layer-title">{l.label}</div>
                      {l.subtitle ? <div className="pptx-studio-layer-sub">{l.subtitle}</div> : null}
                    </button>
                  ))
                ) : (
                  <div className="pptx-studio-muted" style={{ margin: 0 }}>No elements detected.</div>
                )}
              </div>
            </>
          ) : null}

          <div className="pptx-studio-rhdr">Design</div>
          <div className="pptx-studio-card">
            <div className="pptx-studio-muted">Quick background presets (phase 1).</div>
            <div className="pptx-studio-row">
              <button className="pptx-studio-btn" onClick={() => setBackground('#FFFFFF')}>White</button>
              <button className="pptx-studio-btn" onClick={() => setBackground('#0B1220')}>Ink</button>
              <button className="pptx-studio-btn" onClick={() => setBackground('#F3F4F6')}>Mist</button>
              <button className="pptx-studio-btn" onClick={() => setBackground('#EEF2FF')}>Indigo</button>
            </div>
          </div>

          <div className="pptx-studio-rhdr">Generate</div>
          <div className="pptx-studio-card">
            <div className="pptx-studio-muted">Prompt an image or icon, then insert by replacing a selected image.</div>
            <textarea
              className="pptx-studio-textarea"
              value={assetPrompt}
              onChange={(e) => setAssetPrompt(e.target.value)}
              placeholder="A minimal blue icon of a forklift, flat, no text…"
              rows={4}
            />
            <div className="pptx-studio-row">
              <button className="pptx-studio-btn" disabled={assetBusy} onClick={() => generateAsset('icon')}>Generate icon</button>
              <button className="pptx-studio-btn" disabled={assetBusy} onClick={() => generateAsset('image')}>Generate image</button>
              <button className="pptx-studio-btn" disabled={assetBusy} onClick={() => generateAsset('background')}>Generate bg</button>
            </div>
            {assetPreviewUrl ? (
              <div className="pptx-studio-preview">
                <img src={assetPreviewUrl} alt="Generated asset" />
              </div>
            ) : null}
            <button
              className="pptx-studio-btn"
              disabled={!assetPreviewUrl}
              onClick={insertAssetOnSlide}
            >
              Insert on slide
            </button>
            <button
              className="pptx-studio-btn primary"
              disabled={!assetPreviewUrl || !selectedEl || selectedEl.kind !== 'image'}
              onClick={replaceSelectedImage}
            >
              Replace selected image
            </button>
          </div>
        </div>
      </div>

      {/* Bottom quick action (Canva-like) */}
      <div className="pptx-studio-bottomaction">
        <button className="pptx-studio-actionpill" onClick={beautifyThisSlide} title="Beautify the current slide using Allybi">
          <span className="pptx-studio-actionpill-spark">*</span>
          Beautify this slide
        </button>
      </div>
    </div>
  );
}
