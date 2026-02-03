/**
 * Overview Page (AdminDashboard)
 * Swiss Brutalist Tech Design
 * 
 * Goal: Answer in 10 seconds:
 * - "Is Koda healthy today?"
 * - "Are users active?"
 * - "Is cost stable?"
 * - "Is answer quality stable?"
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { KPICard, DataTable, StatusBadge, getStatusVariant, PageHeader, MiniChart, Section } from "@/components/shared";
import { useLocation } from "wouter";

// Mock data - Replace with API calls
const mockKPIs = {
  dau: 1247,
  dauTrend: 12.5,
  messagestoday: 8432,
  messagesTrend: 8.2,
  uploadsToday: 156,
  uploadsTrend: -3.1,
  llmCostToday: 42.87,
  costTrend: 5.4,
  weakEvidenceRate: 4.2,
  weakEvidenceTrend: -1.8,
  ttftP50: 245,
  ttftP95: 890,
};

const mockDauTrend = [
  { value: 980 }, { value: 1050 }, { value: 1120 }, { value: 1080 },
  { value: 1150 }, { value: 1200 }, { value: 1247 },
];

const mockTokensTrend = [
  { value: 45000 }, { value: 52000 }, { value: 48000 }, { value: 55000 },
  { value: 51000 }, { value: 58000 }, { value: 62000 },
];

const mockWeakEvidenceTrend = [
  { value: 5.8 }, { value: 5.2 }, { value: 4.9 }, { value: 5.1 },
  { value: 4.6 }, { value: 4.4 }, { value: 4.2 },
];

const mockIngestionFailures = [
  { id: "1", filename: "report_q4_2025.pdf", error: "OCR timeout", timestamp: "2 min ago", userId: "u_***42" },
  { id: "2", filename: "contract_draft.docx", error: "Password protected", timestamp: "8 min ago", userId: "u_***17" },
  { id: "3", filename: "data_export.xlsx", error: "File corrupted", timestamp: "15 min ago", userId: "u_***89" },
  { id: "4", filename: "presentation.pptx", error: "Extraction failed", timestamp: "23 min ago", userId: "u_***33" },
  { id: "5", filename: "scan_001.pdf", error: "OCR low confidence", timestamp: "31 min ago", userId: "u_***56" },
];

const mockLLMErrors = [
  { id: "1", provider: "OpenAI", model: "gpt-5.2", error: "Rate limit exceeded", timestamp: "1 min ago" },
  { id: "2", provider: "Gemini", model: "3.0-flash", error: "Context length exceeded", timestamp: "12 min ago" },
  { id: "3", provider: "OpenAI", model: "gpt-5.2", error: "Timeout", timestamp: "28 min ago" },
];

const mockWeakEvidence = [
  { id: "1", query: "What is the revenue for Q3?", score: 0.32, reason: "No matching documents", timestamp: "3 min ago" },
  { id: "2", query: "Compare contract terms", score: 0.28, reason: "Insufficient context", timestamp: "7 min ago" },
  { id: "3", query: "Summarize the report", score: 0.41, reason: "Low chunk relevance", timestamp: "14 min ago" },
  { id: "4", query: "Find the deadline date", score: 0.35, reason: "Ambiguous scope", timestamp: "19 min ago" },
];

export default function Overview() {
  const [, setLocation] = useLocation();

  const ingestionColumns = [
    { key: "filename", header: "File" },
    { key: "error", header: "Error", render: (item: typeof mockIngestionFailures[0]) => (
      <StatusBadge variant="error">{item.error}</StatusBadge>
    )},
    { key: "userId", header: "User", className: "font-mono text-muted-foreground" },
    { key: "timestamp", header: "Time", className: "text-muted-foreground" },
  ];

  const llmErrorColumns = [
    { key: "provider", header: "Provider" },
    { key: "model", header: "Model", className: "font-mono" },
    { key: "error", header: "Error", render: (item: typeof mockLLMErrors[0]) => (
      <StatusBadge variant="error">{item.error}</StatusBadge>
    )},
    { key: "timestamp", header: "Time", className: "text-muted-foreground" },
  ];

  const weakEvidenceColumns = [
    { key: "query", header: "Query", render: (item: typeof mockWeakEvidence[0]) => (
      <span className="max-w-xs truncate block">{item.query}</span>
    )},
    { key: "score", header: "Score", className: "font-mono", render: (item: typeof mockWeakEvidence[0]) => (
      <span className="text-[oklch(0.45_0.15_25)]">{item.score.toFixed(2)}</span>
    )},
    { key: "reason", header: "Reason" },
    { key: "timestamp", header: "Time", className: "text-muted-foreground" },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Overview"
        description="System health and usage snapshot"
      />

      <div className="p-8 space-y-8">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard
            label="Active Users Today"
            value={mockKPIs.dau.toLocaleString()}
            trend={{ value: mockKPIs.dauTrend, label: "vs yesterday" }}
          />
          <KPICard
            label="Messages Today"
            value={mockKPIs.messagestoday.toLocaleString()}
            trend={{ value: mockKPIs.messagesTrend, label: "vs yesterday" }}
          />
          <KPICard
            label="Uploads Today"
            value={mockKPIs.uploadsToday}
            trend={{ value: mockKPIs.uploadsTrend, label: "vs yesterday" }}
          />
          <KPICard
            label="LLM Cost Today"
            value={`$${mockKPIs.llmCostToday.toFixed(2)}`}
            trend={{ value: mockKPIs.costTrend, label: "vs yesterday" }}
          />
          <KPICard
            label="Weak Evidence Rate"
            value={`${mockKPIs.weakEvidenceRate}%`}
            trend={{ value: mockKPIs.weakEvidenceTrend, label: "vs yesterday" }}
          />
          <KPICard
            label="TTFT (p50/p95)"
            value={`${mockKPIs.ttftP50}ms`}
            subValue={`/ ${mockKPIs.ttftP95}ms`}
          />
        </div>

        {/* Trend Charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Section title="DAU (7 days)">
            <MiniChart data={mockDauTrend} type="area" height={80} showTooltip />
          </Section>
          <Section title="LLM Tokens/Day (7 days)">
            <MiniChart data={mockTokensTrend} type="bar" height={80} showTooltip />
          </Section>
          <Section title="Weak Evidence Rate (7 days)">
            <MiniChart data={mockWeakEvidenceTrend} type="line" color="oklch(0.45 0.15 25)" height={80} showTooltip />
          </Section>
        </div>

        {/* Live Feed Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Latest Ingestion Failures" description="Last 20 failures">
            <DataTable
              columns={ingestionColumns}
              data={mockIngestionFailures}
              onRowClick={(item) => setLocation(`/admin/files/${item.id}`)}
            />
          </Section>

          <Section title="Latest LLM Errors" description="Last 20 errors">
            <DataTable
              columns={llmErrorColumns}
              data={mockLLMErrors}
              onRowClick={() => setLocation("/admin/llm")}
            />
          </Section>
        </div>

        <Section 
          title="Latest Weak Evidence Answers" 
          description="Last 20 low-confidence responses"
        >
          <DataTable
            columns={weakEvidenceColumns}
            data={mockWeakEvidence}
            onRowClick={() => setLocation("/admin/quality")}
          />
        </Section>
      </div>
    </AdminLayout>
  );
}
