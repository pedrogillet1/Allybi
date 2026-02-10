import React, { useCallback, useEffect, useMemo, useState, Suspense, lazy } from 'react';
import api from '../../../services/api';
import { applyEdit } from '../../../services/editingService';
import cleanDocumentName from '../../../utils/cleanDocumentName';
import EditorToolbar from '../editor/EditorToolbar';

// Reuse the production-hardened preview component (do not modify it).
const PPTXPreview = lazy(() => import('./PPTXPreview'));

function groupBySlide(anchors) {
  const m = new Map();
  for (const a of anchors || []) {
    const n = Number(a.slideNumber || 0) || 0;
    if (!m.has(n)) m.set(n, []);
    m.get(n).push(a);
  }
  return Array.from(m.entries())
    .filter(([n]) => n > 0)
    .sort((a, b) => a[0] - b[0]);
}

export default function PptxEditCanvas({
  document,
  zoom = 100,
  version = 0,
  onApplied,
  onCountUpdate,
  showInspector = true,
  selectedAnchorId: controlledSelectedAnchorId,
  onSelectedAnchorIdChange,
  onAnchorsLoaded,
}) {
  const docId = document?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [model, setModel] = useState(null); // { anchors, slideCount }
  const [selectedAnchorId, setSelectedAnchorId] = useState('');
  const [draftText, setDraftText] = useState('');
  const [layout, setLayout] = useState('TITLE_AND_BODY');
  const [statusMsg, setStatusMsg] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  const effectiveSelectedAnchorId = controlledSelectedAnchorId != null ? controlledSelectedAnchorId : selectedAnchorId;

  const load = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    setError('');
    setStatusMsg('');
    try {
      const res = await api.get(`/api/documents/${docId}/editing/slides-model`);
      const anchors = Array.isArray(res.data?.anchors) ? res.data.anchors : [];
      onAnchorsLoaded?.(anchors);
      setModel({
        presentationId: res.data?.presentationId,
        presentationUrl: res.data?.presentationUrl,
        slideCount: res.data?.slideCount || null,
        anchors,
      });
      const firstId = anchors?.[0]?.objectId || '';
      if (controlledSelectedAnchorId == null) {
        setSelectedAnchorId((prev) => prev || firstId);
      }
      if (!effectiveSelectedAnchorId && firstId) {
        onSelectedAnchorIdChange?.(firstId);
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load PPTX editor.');
    } finally {
      setLoading(false);
    }
  }, [controlledSelectedAnchorId, docId, effectiveSelectedAnchorId, onAnchorsLoaded, onSelectedAnchorIdChange]);

  useEffect(() => {
    load();
  }, [load, version]);

  const anchors = model?.anchors || [];
  const selected = useMemo(
    () => anchors.find((a) => a.objectId === effectiveSelectedAnchorId) || null,
    [anchors, effectiveSelectedAnchorId],
  );

  useEffect(() => {
    if (!selected) return;
    setDraftText((prev) => (!prev || prev === selected.text ? selected.text : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.objectId]);

  const slideGroups = useMemo(() => groupBySlide(anchors), [anchors]);

  const applyRewrite = useCallback(async () => {
    if (!docId || !selected?.objectId) return;
    const beforeText = String(selected.text || '').trim();
    const proposedText = String(draftText || '').trim();
    if (!proposedText) {
      setStatusMsg('Cannot apply empty text.');
      return;
    }
    if (beforeText === proposedText) {
      setStatusMsg('No changes to apply.');
      return;
    }

    setIsApplying(true);
    setStatusMsg('');
    try {
      await applyEdit({
        instruction: `Manual edit in viewer: ${cleanDocumentName(document?.filename)}`,
        operator: 'REWRITE_SLIDE_TEXT',
        domain: 'slides',
        documentId: docId,
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

      setStatusMsg('Applied. Refreshing preview…');
      onApplied?.();
      // Reload anchors (text) from Slides model after apply.
      await load();
      setStatusMsg('Applied.');
      setTimeout(() => setStatusMsg(''), 1500);
    } catch (e) {
      setStatusMsg(e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Apply failed.');
    } finally {
      setIsApplying(false);
    }
  }, [anchors, docId, document?.filename, draftText, load, onApplied, selected]);

  const applyAddSlide = useCallback(async () => {
    if (!docId) return;
    setIsApplying(true);
    setStatusMsg('');
    try {
      await applyEdit({
        instruction: `Manual add slide in viewer: ${cleanDocumentName(document?.filename)}`,
        operator: 'ADD_SLIDE',
        domain: 'slides',
        documentId: docId,
        beforeText: 'ADD_SLIDE',
        proposedText: layout,
        userConfirmed: true,
      });
      setStatusMsg('Slide added. Refreshing preview…');
      onApplied?.();
      await load();
      setStatusMsg('Slide added.');
      setTimeout(() => setStatusMsg(''), 1500);
    } catch (e) {
      setStatusMsg(e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Add slide failed.');
    } finally {
      setIsApplying(false);
    }
  }, [docId, document?.filename, layout, load, onApplied]);

  if (loading) {
    return (
      <div style={{ padding: 40, background: 'white', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        Loading editor…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, background: 'white', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 900, fontSize: 16, color: '#111827', marginBottom: 8 }}>
          PPTX editor not available
        </div>
        <div style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: '#6B7280' }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <EditorToolbar
        title={`Editing ${cleanDocumentName(document?.filename)}`}
        subtitle={showInspector ? "Select a text target, then apply changes." : "Use the Targets panel to select and rewrite slide text."}
        scopeLabel={selected ? `${selected.label} (Slide ${selected.slideNumber})` : 'Text target'}
        format="slides"
        canFormatText={false}
        onRevert={() => {
          if (!selected) return;
          setDraftText(selected.text || '');
          setStatusMsg('Reverted.');
          setTimeout(() => setStatusMsg(''), 1000);
        }}
        onApply={applyRewrite}
        applyLabel={showInspector ? "Apply rewrite" : "Apply rewrite"}
        revertLabel="Revert"
        isApplying={isApplying}
        canApply={showInspector && Boolean(selected)}
        canRevert={showInspector && Boolean(selected)}
        extraActions={showInspector ? [
          { label: 'Add slide', onClick: applyAddSlide, disabled: isApplying, variant: 'ghost', title: 'Add a new slide' },
        ] : []}
      />

      <div style={{ width: '100%', display: 'flex', gap: 16, alignItems: 'stretch' }}>
      {/* Live preview */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Suspense fallback={null}>
          <PPTXPreview document={document} zoom={zoom} version={version} onCountUpdate={onCountUpdate} />
        </Suspense>
      </div>

      {/* Inspector */}
      {showInspector ? (
        <div style={{
          width: 380,
          minWidth: 380,
          maxWidth: 420,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #E5E7EB',
          borderRadius: 16,
          boxShadow: '0 12px 32px rgba(17, 24, 39, 0.10)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignSelf: 'flex-start',
          position: 'sticky',
          top: 12,
          height: 'fit-content',
        }}>
          <div style={{ padding: '14px 14px', borderBottom: '1px solid #E5E7EB' }}>
            <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 950, fontSize: 14, color: '#111827' }}>
              Edit PPTX
            </div>
            <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 700, fontSize: 12, color: '#6B7280', marginTop: 2 }}>
              {cleanDocumentName(document?.filename)}
            </div>
          </div>

          {statusMsg ? (
            <div style={{
              margin: 12,
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid #E5E7EB',
              background: 'white',
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: 800,
              fontSize: 12,
              color: '#111827',
            }}>
              {statusMsg}
            </div>
          ) : null}

          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 900, fontSize: 12, color: '#111827' }}>
              Text targets
            </div>

            <div style={{
              maxHeight: 220,
              overflow: 'auto',
              borderRadius: 12,
              border: '1px solid #E5E7EB',
              background: 'white',
            }}>
              {slideGroups.length === 0 ? (
                <div style={{ padding: 12, fontFamily: 'Plus Jakarta Sans', fontWeight: 700, fontSize: 12, color: '#6B7280' }}>
                  No text found in slides.
                </div>
              ) : slideGroups.map(([slideNumber, items]) => (
                <div key={slideNumber} style={{ borderTop: '1px solid #F3F4F6' }}>
                  <div style={{
                    padding: '10px 12px',
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: 900,
                    fontSize: 12,
                    color: '#111827',
                    background: 'rgba(17,24,39,0.03)',
                  }}>
                    Slide {slideNumber}
                  </div>
                  {items.map((a) => (
                    <button
                      key={a.objectId}
                      onClick={() => {
                        if (controlledSelectedAnchorId == null) setSelectedAnchorId(a.objectId);
                        onSelectedAnchorIdChange?.(a.objectId);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        background: effectiveSelectedAnchorId === a.objectId ? 'rgba(17,24,39,0.06)' : 'white',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderTop: '1px solid #F3F4F6',
                      }}
                      title={a.text}
                    >
                      <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 900, fontSize: 12, color: '#111827' }}>
                        {a.label}
                      </div>
                      <div style={{
                        fontFamily: 'Plus Jakarta Sans',
                        fontWeight: 700,
                        fontSize: 12,
                        color: '#6B7280',
                        marginTop: 2,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {a.text}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 900, fontSize: 12, color: '#111827' }}>
                New text
              </div>
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={6}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  borderRadius: 12,
                  border: '1px solid #E5E7EB',
                  padding: 10,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: 700,
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                onClick={applyRewrite}
                disabled={!selected || isApplying}
                style={{
                  height: 36,
                  borderRadius: 999,
                  border: '1px solid #111827',
                  background: '#111827',
                  color: 'white',
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: 950,
                  fontSize: 13,
                  cursor: (!selected || isApplying) ? 'not-allowed' : 'pointer',
                  opacity: (!selected || isApplying) ? 0.75 : 1,
                }}
                title="Apply rewrite"
              >
                {isApplying ? 'Applying…' : 'Apply rewrite'}
              </button>
            </div>

            <div style={{ height: 1, background: '#F3F4F6', margin: '6px 0' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 900, fontSize: 12, color: '#111827' }}>
                Add slide
              </div>
              <select
                value={layout}
                onChange={(e) => setLayout(e.target.value)}
                style={{
                  height: 36,
                  borderRadius: 12,
                  border: '1px solid #E5E7EB',
                  padding: '0 10px',
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: 800,
                  fontSize: 13,
                  outline: 'none',
                  background: 'white',
                }}
              >
                <option value="TITLE_AND_BODY">Title and body</option>
                <option value="TITLE_ONLY">Title only</option>
                <option value="SECTION_HEADER">Section header</option>
                <option value="BLANK">Blank</option>
                <option value="TITLE_AND_TWO_COLUMNS">Title and two columns</option>
              </select>
              <button
                onClick={applyAddSlide}
                disabled={isApplying}
                style={{
                  height: 36,
                  borderRadius: 999,
                  border: '1px solid #E5E7EB',
                  background: 'white',
                  color: '#111827',
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: 950,
                  fontSize: 13,
                  cursor: isApplying ? 'not-allowed' : 'pointer',
                  opacity: isApplying ? 0.7 : 1,
                }}
                title="Add slide"
              >
                {isApplying ? 'Applying…' : 'Add slide'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
