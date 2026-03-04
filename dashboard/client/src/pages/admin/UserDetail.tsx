/**
 * User Detail Page
 * Swiss Brutalist Tech Design
 * 
 * Shows detailed user analytics with tabs:
 * - Activity: sessions, conversations, messages/day
 * - Files: uploaded files + doc types
 * - Queries: top intents, domains, keywords
 * - Costs: tokens/cost by provider
 * - Quality: weak evidence, fallback, ask-one-question counts
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { KPICard, DataTable, StatusBadge, PageHeader, Section, TabNav, MiniChart } from "@/components/shared";
import { useParams } from "wouter";

// Mock data - Replace with API calls
const mockUser = {
  id: "u_001",
  email: "j***@company.com",
  locale: "en-US",
  device: "Desktop (Chrome)",
  firstUse: "2025-01-15",
  lastActive: "2 min ago",
  totalSessions: 89,
  totalConversations: 156,
  totalMessages: 1247,
  totalUploads: 45,
  storageUsed: "1.2 GB",
  subscriptionTier: "Pro",
};

const mockActivityData = [
  { value: 12 }, { value: 18 }, { value: 15 }, { value: 22 },
  { value: 19 }, { value: 25 }, { value: 21 },
];

const mockFiles = [
  { id: "f_001", filename: "Q4_Report.pdf", type: "PDF", size: "2.4 MB", uploadedAt: "2025-01-25", status: "Indexed" },
  { id: "f_002", filename: "Contract_Draft.docx", type: "DOCX", size: "156 KB", uploadedAt: "2025-01-24", status: "Indexed" },
  { id: "f_003", filename: "Financial_Data.xlsx", type: "XLSX", size: "890 KB", uploadedAt: "2025-01-23", status: "Indexed" },
  { id: "f_004", filename: "Presentation.pptx", type: "PPTX", size: "5.2 MB", uploadedAt: "2025-01-22", status: "Processing" },
  { id: "f_005", filename: "Notes.txt", type: "TXT", size: "12 KB", uploadedAt: "2025-01-21", status: "Indexed" },
];

const mockQueries = [
  { intent: "summarize", count: 45, percentage: 28.8 },
  { intent: "extract", count: 32, percentage: 20.5 },
  { intent: "compare", count: 28, percentage: 17.9 },
  { intent: "locate_content", count: 24, percentage: 15.4 },
  { intent: "explain", count: 18, percentage: 11.5 },
  { intent: "other", count: 9, percentage: 5.8 },
];

const mockDomains = [
  { domain: "finance", count: 52, percentage: 33.3 },
  { domain: "legal", count: 38, percentage: 24.4 },
  { domain: "general", count: 34, percentage: 21.8 },
  { domain: "technical", count: 20, percentage: 12.8 },
  { domain: "medical", count: 12, percentage: 7.7 },
];

const mockCosts = [
  { id: "c_001", provider: "OpenAI", model: "gpt-5.2", tokens: 125000, cost: 12.50, calls: 89 },
  { id: "c_002", provider: "Gemini", model: "gemini-2.5-flash", tokens: 450000, cost: 4.50, calls: 312 },
  { id: "c_003", provider: "OpenAI", model: "text-embedding-3-small", tokens: 890000, cost: 0.89, calls: 156 },
];

const mockQuality = {
  weakEvidenceCount: 12,
  weakEvidenceRate: 3.2,
  fallbackCount: 5,
  askOneQuestionCount: 8,
  avgEvidenceStrength: 0.78,
  refinementLoopRate: 2.1,
};

const tabs = [
  { id: "activity", label: "Activity" },
  { id: "files", label: "Files" },
  { id: "queries", label: "Queries" },
  { id: "costs", label: "Costs" },
  { id: "quality", label: "Quality" },
];

export default function UserDetail() {
  const params = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("activity");

  const fileColumns = [
    { key: "filename", header: "Filename" },
    { key: "type", header: "Type", render: (item: typeof mockFiles[0]) => (
      <StatusBadge variant="neutral">{item.type}</StatusBadge>
    )},
    { key: "size", header: "Size", className: "font-mono" },
    { key: "uploadedAt", header: "Uploaded", className: "font-mono text-muted-foreground" },
    { key: "status", header: "Status", render: (item: typeof mockFiles[0]) => (
      <StatusBadge variant={item.status === "Indexed" ? "success" : "warning"}>
        {item.status}
      </StatusBadge>
    )},
  ];

  const costColumns = [
    { key: "provider", header: "Provider" },
    { key: "model", header: "Model", className: "font-mono" },
    { key: "tokens", header: "Tokens", className: "font-mono text-right", render: (item: typeof mockCosts[0]) => item.tokens.toLocaleString() },
    { key: "cost", header: "Cost", className: "font-mono text-right", render: (item: typeof mockCosts[0]) => `$${item.cost.toFixed(2)}` },
    { key: "calls", header: "Calls", className: "font-mono text-right" },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title={mockUser.email}
        description={`User ID: ${params.id} • ${mockUser.subscriptionTier} tier`}
        backLink="/admin/users"
      />

      {/* User Summary */}
      <div className="px-8 py-6 border-b border-border bg-muted/30">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 text-sm">
          <div>
            <span className="label-uppercase">Locale</span>
            <p className="mt-1 font-mono">{mockUser.locale}</p>
          </div>
          <div>
            <span className="label-uppercase">Device</span>
            <p className="mt-1">{mockUser.device}</p>
          </div>
          <div>
            <span className="label-uppercase">First Use</span>
            <p className="mt-1 font-mono">{mockUser.firstUse}</p>
          </div>
          <div>
            <span className="label-uppercase">Last Active</span>
            <p className="mt-1">{mockUser.lastActive}</p>
          </div>
          <div>
            <span className="label-uppercase">Storage Used</span>
            <p className="mt-1 font-mono">{mockUser.storageUsed}</p>
          </div>
          <div>
            <span className="label-uppercase">Tier</span>
            <p className="mt-1">
              <StatusBadge variant="info">{mockUser.subscriptionTier}</StatusBadge>
            </p>
          </div>
        </div>
      </div>

      <TabNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} className="px-8" />

      <div className="p-8">
        {activeTab === "activity" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard label="Total Sessions" value={mockUser.totalSessions} />
              <KPICard label="Conversations" value={mockUser.totalConversations} />
              <KPICard label="Messages" value={mockUser.totalMessages.toLocaleString()} />
              <KPICard label="Uploads" value={mockUser.totalUploads} />
            </div>
            <Section title="Messages per Day (7 days)">
              <MiniChart data={mockActivityData} type="bar" height={120} showTooltip />
            </Section>
          </div>
        )}

        {activeTab === "files" && (
          <Section title="Uploaded Files" description={`${mockFiles.length} files`}>
            <DataTable columns={fileColumns} data={mockFiles} />
          </Section>
        )}

        {activeTab === "queries" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Section title="Top Intents">
              <div className="space-y-3">
                {mockQueries.map((q) => (
                  <div key={q.intent} className="flex items-center justify-between">
                    <span className="font-mono text-sm">{q.intent}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-2 bg-muted overflow-hidden">
                        <div
                          className="h-full bg-foreground"
                          style={{ width: `${q.percentage}%` }}
                        />
                      </div>
                      <span className="font-mono text-sm text-muted-foreground w-12 text-right">
                        {q.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Top Domains">
              <div className="space-y-3">
                {mockDomains.map((d) => (
                  <div key={d.domain} className="flex items-center justify-between">
                    <span className="font-mono text-sm">{d.domain}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-2 bg-muted overflow-hidden">
                        <div
                          className="h-full bg-foreground"
                          style={{ width: `${d.percentage}%` }}
                        />
                      </div>
                      <span className="font-mono text-sm text-muted-foreground w-12 text-right">
                        {d.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {activeTab === "costs" && (
          <Section title="Token Usage by Provider">
            <DataTable columns={costColumns} data={mockCosts} />
            <div className="mt-4 pt-4 border-t border-border flex justify-between text-sm">
              <span className="font-medium">Total</span>
              <span className="font-mono">
                {mockCosts.reduce((sum, c) => sum + c.tokens, 0).toLocaleString()} tokens • 
                ${mockCosts.reduce((sum, c) => sum + c.cost, 0).toFixed(2)}
              </span>
            </div>
          </Section>
        )}

        {activeTab === "quality" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KPICard
                label="Weak Evidence Count"
                value={mockQuality.weakEvidenceCount}
                subValue={`${mockQuality.weakEvidenceRate}% rate`}
              />
              <KPICard label="Fallback Count" value={mockQuality.fallbackCount} />
              <KPICard label="Ask-One-Question" value={mockQuality.askOneQuestionCount} />
              <KPICard
                label="Avg Evidence Strength"
                value={mockQuality.avgEvidenceStrength.toFixed(2)}
              />
              <KPICard
                label="Refinement Loop Rate"
                value={`${mockQuality.refinementLoopRate}%`}
              />
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
