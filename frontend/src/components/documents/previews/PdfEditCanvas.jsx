import React, { useCallback, useEffect, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../services/api';
import cleanDocumentName from '../../../utils/cleanDocumentName';
import { buildRoute } from '../../../constants/routes';
import EditorToolbar from '../editor/EditorToolbar';

const PdfEditCanvas = forwardRef(function PdfEditCanvas(
  {
    document,
    hideToolbar = false,
    outputFormat = 'docx', // 'docx' | 'pdf'
    onStatusMsg,
    onCreated,
  },
  ref
) {
  const navigate = useNavigate();
  const docId = document?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [draft, setDraft] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const filenameBase = useMemo(() => {
    const f = cleanDocumentName(document?.filename || 'document.pdf');
    return f.replace(/\.pdf$/i, '');
  }, [document?.filename]);

  const load = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    setError('');
    setStatusMsg('');
    try {
      const res = await api.get(`/api/documents/${docId}/editing/pdf-text`);
      const extracted = String(res.data?.text || '');
      setText(extracted);
      setDraft((prev) => (prev ? prev : extracted));
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to extract PDF text.');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    load();
  }, [load]);

  const createRevisedCopy = useCallback(async () => {
    if (!docId) return;
    const revisedText = String(draft || '').trim();
    if (!revisedText) {
      const msg = 'Revised text is empty.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
      return;
    }

    setIsSaving(true);
    setStatusMsg('');
    onStatusMsg?.('');
    try {
      const res = await api.post(`/api/documents/${docId}/editing/pdf-revise`, {
        revisedText,
        filename: outputFormat === 'pdf' ? `${filenameBase} (Revised).pdf` : `${filenameBase} (Revised).docx`,
        outputFormat,
      });
      const createdId = res.data?.createdDocumentId;
      if (createdId) {
        const msg = outputFormat === 'pdf' ? 'Created revised PDF. Opening…' : 'Created revised DOCX. Opening…';
        setStatusMsg(msg);
        onStatusMsg?.(msg);
        onCreated?.({ documentId: createdId, mimeType: res.data?.mimeType, filename: res.data?.filename });
        navigate(buildRoute.document(createdId));
        return;
      }
      setStatusMsg('Created revised copy.');
      onStatusMsg?.('Created revised copy.');
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to create revised copy.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
    } finally {
      setIsSaving(false);
    }
  }, [docId, draft, filenameBase, navigate, onCreated, onStatusMsg, outputFormat]);

  useImperativeHandle(ref, () => ({
    apply: createRevisedCopy,
    revert: () => {
      setDraft(text || '');
      const msg = 'Reverted.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
      setTimeout(() => { setStatusMsg(''); onStatusMsg?.(''); }, 1000);
    },
    getDraft: () => draft,
    setDraft: (v) => setDraft(String(v ?? '')),
    getIsSaving: () => isSaving,
  }), [createRevisedCopy, draft, isSaving, onStatusMsg, text]);

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
          PDF revise not available
        </div>
        <div style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, color: '#6B7280' }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 1080 }}>
      {!hideToolbar ? (
        <EditorToolbar
          title={outputFormat === 'pdf' ? "Revise PDF (save as PDF)" : "Revise PDF (create new DOCX)"}
          subtitle={`${cleanDocumentName(document?.filename)} | Original PDF stays unchanged.`}
          scopeLabel="Revised copy"
          format="pdf"
          canFormatText={false}
          onRevert={() => {
            setDraft(text || '');
            setStatusMsg('Reverted.');
            onStatusMsg?.('Reverted.');
            setTimeout(() => { setStatusMsg(''); onStatusMsg?.(''); }, 1000);
          }}
          onApply={createRevisedCopy}
          applyLabel={outputFormat === 'pdf' ? "Create revised PDF" : "Create revised DOCX"}
          revertLabel="Revert"
          isApplying={isSaving}
          canApply={Boolean(draft && draft.trim())}
          canRevert={Boolean(text)}
        />
      ) : null}

      <div style={{
        background: 'white',
        borderRadius: 16,
        boxShadow: '0 12px 32px rgba(17, 24, 39, 0.10)',
        border: '1px solid #E5E7EB',
        overflow: 'hidden',
      }}>
        {statusMsg ? (
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid #E5E7EB',
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: 800,
            fontSize: 12,
            color: '#111827',
            background: 'rgba(249, 250, 251, 0.9)',
          }}>
            {statusMsg}
          </div>
        ) : null}

        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 900, fontSize: 12, color: '#111827' }}>
              Extracted text
            </div>
            <textarea
              value={text}
              readOnly
              rows={18}
              style={{
                width: '100%',
                resize: 'vertical',
                borderRadius: 12,
                border: '1px solid #E5E7EB',
                padding: 10,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace',
                fontSize: 12,
                lineHeight: 1.5,
                outline: 'none',
                background: '#F9FAFB',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 900, fontSize: 12, color: '#111827' }}>
              Revised text (edit this)
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={18}
              style={{
                width: '100%',
                resize: 'vertical',
                borderRadius: 12,
                border: '1px solid #E5E7EB',
                padding: 10,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: 700,
                fontSize: 13,
                lineHeight: 1.5,
                outline: 'none',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

export default PdfEditCanvas;
