/**
 * Chat UI Contract Test Harness
 *
 * Dev-only page that renders fixture messages covering every answerMode
 * so you can iterate UI rules (sources alignment, actions visibility,
 * spacing) without touching the backend.
 *
 * Route: /dev/chat-harness
 */

import React, { useState } from 'react';
import MessageActions from '../components/chat/messages/MessageActions';
import SourcesRow from '../components/sources/SourcesRow';
import AttachmentsRenderer from '../components/attachments/AttachmentsRenderer';
import StreamingMarkdown from '../components/chat/streaming/StreamingMarkdown';

// ──────────────────────────────────────────────
// Fixture messages
// ──────────────────────────────────────────────

const FIXTURES = [
  {
    label: 'nav_pills — open/locate file (no actions, no "Sources:" label)',
    message: {
      id: 'fix_nav_pills',
      role: 'assistant',
      status: 'done',
      content: 'Here is your file:',
      answerMode: 'nav_pills',
      meta: { answerMode: 'nav_pills', isNavPills: true, hideActions: true },
      attachments: [
        {
          type: 'source_buttons',
          answerMode: 'nav_pills',
          buttons: [
            { documentId: 'd1', title: 'analise_mezanino.pdf', mimeType: 'application/pdf' },
          ],
          seeAll: null,
        },
      ],
      sources: [],
      sourceButtons: {
        answerMode: 'nav_pills',
        buttons: [
          { documentId: 'd1', title: 'analise_mezanino.pdf', mimeType: 'application/pdf' },
        ],
      },
    },
  },
  {
    label: 'doc_grounded_single — answer from one document',
    message: {
      id: 'fix_doc_single',
      role: 'assistant',
      status: 'done',
      content:
        'The net profit for Q3 2025 was **R$ 4.2 million**, representing a 12% increase compared to the previous quarter. This growth was primarily driven by the expansion of the logistics division.\n\n| Quarter | Profit (R$) | Growth |\n|---------|------------|--------|\n| Q1 | 3.1M | — |\n| Q2 | 3.8M | +22% |\n| Q3 | 4.2M | +12% |',
      answerMode: 'doc_grounded_single',
      meta: { answerMode: 'doc_grounded_single', isNavPills: false, hideActions: false },
      attachments: [
        {
          type: 'source_buttons',
          buttons: [
            { documentId: 'd2', title: 'relatorio_Q3_2025.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
          ],
        },
      ],
      sources: [
        { documentId: 'd2', documentName: 'relatorio_Q3_2025.xlsx', filename: 'relatorio_Q3_2025.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      ],
      sourceButtons: {
        buttons: [
          { documentId: 'd2', title: 'relatorio_Q3_2025.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        ],
      },
    },
  },
  {
    label: 'doc_grounded_table — multi-row tabular answer',
    message: {
      id: 'fix_doc_table',
      role: 'assistant',
      status: 'done',
      content:
        'Here are all employees with salaries above R$ 10,000:\n\n| Name | Department | Salary |\n|------|-----------|--------|\n| Ana Silva | Engineering | R$ 15,200 |\n| Carlos Souza | Finance | R$ 12,800 |\n| Maria Lima | Legal | R$ 11,500 |\n| Pedro Santos | Engineering | R$ 14,300 |',
      answerMode: 'doc_grounded_table',
      meta: { answerMode: 'doc_grounded_table', isNavPills: false, hideActions: false },
      attachments: [
        {
          type: 'source_buttons',
          buttons: [
            { documentId: 'd3', title: 'folha_pagamento_jan2026.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
          ],
        },
      ],
      sources: [
        { documentId: 'd3', documentName: 'folha_pagamento_jan2026.xlsx', filename: 'folha_pagamento_jan2026.xlsx' },
      ],
      sourceButtons: {
        buttons: [
          { documentId: 'd3', title: 'folha_pagamento_jan2026.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        ],
      },
    },
  },
  {
    label: 'streaming markdown contract — preserve code fences + never render source pills inside table cells',
    message: {
      id: 'fix_stream_contract',
      role: 'assistant',
      status: 'done',
      content:
        '```json\n{ "contract": "streaming", "status": "ok" }\n```\n\n| Metric | Evidence |\n|---|---|\n| Revenue | [Q4_report.pdf](koda://source?docId=d4&filename=Q4_report.pdf&page=3) |',
      answerMode: 'doc_grounded_table',
      meta: { answerMode: 'doc_grounded_table', isNavPills: false, hideActions: false },
      attachments: [
        {
          type: 'source_buttons',
          buttons: [
            {
              documentId: 'd4',
              title: 'Q4_report.pdf',
              mimeType: 'application/pdf',
              location: { type: 'page', value: 3, label: 'Page 3' },
            },
          ],
        },
      ],
      sources: [
        {
          documentId: 'd4',
          documentName: 'Q4_report.pdf',
          filename: 'Q4_report.pdf',
          mimeType: 'application/pdf',
          page: 3,
        },
      ],
      sourceButtons: {
        buttons: [
          {
            documentId: 'd4',
            title: 'Q4_report.pdf',
            mimeType: 'application/pdf',
            location: { type: 'page', value: 3, label: 'Page 3' },
          },
        ],
      },
    },
  },
  {
    label: 'scoped_not_found — fallback when no documents match',
    message: {
      id: 'fix_scoped_not_found',
      role: 'assistant',
      status: 'done',
      content:
        "I couldn't find any documents matching your query. Try uploading the relevant file first, or rephrase your question.",
      answerMode: 'scoped_not_found',
      meta: { answerMode: 'scoped_not_found', isNavPills: false, hideActions: false },
      attachments: [],
      sources: [],
    },
  },
  {
    label: 'file_list with seeAll — inventory response',
    message: {
      id: 'fix_file_list',
      role: 'assistant',
      status: 'done',
      content: 'You have **12 Excel files** in your account:',
      answerMode: 'file_list',
      meta: { answerMode: 'file_list', isNavPills: false, hideActions: false },
      attachments: [
        {
          type: 'file_list',
          files: [
            { id: 'f1', filename: 'budget_2026.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
            { id: 'f2', filename: 'payroll_jan.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
            { id: 'f3', filename: 'expenses_q4.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
            { id: 'f4', filename: 'revenue_forecast.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
            { id: 'f5', filename: 'inventory_count.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
          ],
          totalCount: 12,
          hasMore: true,
        },
      ],
      sources: [],
    },
  },
  {
    label: 'file_action — open single file',
    message: {
      id: 'fix_file_action',
      role: 'assistant',
      status: 'done',
      content: 'Opening your document:',
      answerMode: 'file_action',
      meta: { answerMode: 'file_action', isNavPills: false, hideActions: false },
      attachments: [
        {
          type: 'file_action',
          action: 'SHOW_FILE',
          files: [
            { id: 'f6', filename: 'contract_2026.pdf', mimeType: 'application/pdf', folderPath: 'Legal' },
          ],
        },
      ],
      sources: [],
    },
  },
];

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

const ChatContractHarness = () => {
  const [expandedIdx, setExpandedIdx] = useState(null);

  const handleSourceClick = (doc) => {
    console.log('[Harness] Source clicked:', doc);
    alert(`Source clicked: ${doc.filename || doc.id}`);
  };

  const handleFileClick = (file) => {
    console.log('[Harness] File clicked:', file);
    alert(`File clicked: ${file.filename || file.id}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a1a', color: '#fff', padding: 32 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          Chat UI Contract Test Harness
        </h1>
        <p style={{ color: '#999', fontSize: 14, marginBottom: 32 }}>
          Fixture messages for every answerMode. Verify sources alignment, actions visibility, and spacing.
        </p>

        {FIXTURES.map((fixture, idx) => {
          const msg = fixture.message;
          const isExpanded = expandedIdx === idx;

          return (
            <div
              key={msg.id}
              data-testid={`fixture-${msg.id}`}
              style={{
                marginBottom: 24,
                border: '1px solid #333',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {/* Fixture header */}
              <div
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                style={{
                  padding: '12px 16px',
                  background: '#252525',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>{fixture.label}</span>
                <span style={{ color: '#666', fontSize: 12 }}>
                  {isExpanded ? 'collapse' : 'expand'} JSON
                </span>
              </div>

              {/* Rendered message */}
              <div style={{ padding: 16, background: '#1e1e1e' }}>
                {/* Content */}
                <div className="koda-markdown-content" style={{ marginBottom: 12 }}>
                  <StreamingMarkdown content={msg.content} isStreaming={false} />
                </div>

                {/* Attachments */}
                {msg.attachments?.length > 0 && (
                  <AttachmentsRenderer
                    attachments={msg.attachments}
                    onFileClick={handleFileClick}
                  />
                )}

                {/* Sources row */}
                {msg.sourceButtons && (
                  <SourcesRow
                    sourceButtons={msg.sourceButtons}
                    attachments={msg.attachments}
                    onSourceClick={handleSourceClick}
                    language="en"
                  />
                )}

                {/* MessageActions */}
                <div style={{ marginTop: 8 }}>
                  <MessageActions
                    message={msg}
                    onCopy={() => console.log('[Harness] Copy')}
                    onRegenerate={() => console.log('[Harness] Regenerate')}
                  />
                </div>

                {/* Validation badges */}
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Badge
                    label="answerMode"
                    value={msg.answerMode || 'none'}
                  />
                  <Badge
                    label="meta.isNavPills"
                    value={String(msg.meta?.isNavPills ?? false)}
                    ok={msg.meta?.isNavPills === (msg.answerMode === 'nav_pills' || msg.answerMode === 'nav_pill')}
                  />
                  <Badge
                    label="meta.hideActions"
                    value={String(msg.meta?.hideActions ?? false)}
                  />
                  <Badge
                    label="attachments"
                    value={String(msg.attachments?.length ?? 0)}
                  />
                  <Badge
                    label="sources"
                    value={String(msg.sources?.length ?? 0)}
                  />
                </div>
              </div>

              {/* JSON detail */}
              {isExpanded && (
                <pre
                  style={{
                    padding: 16,
                    background: '#111',
                    fontSize: 11,
                    overflow: 'auto',
                    maxHeight: 300,
                    borderTop: '1px solid #333',
                    color: '#aaa',
                  }}
                >
                  {JSON.stringify(msg, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Badge = ({ label, value, ok }) => (
  <span
    style={{
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 11,
      fontFamily: 'monospace',
      background: ok === false ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)',
      border: ok === false ? '1px solid #ef4444' : '1px solid #444',
      color: ok === false ? '#ef4444' : '#aaa',
    }}
  >
    {label}: {value}
  </span>
);

export default ChatContractHarness;

