/**
 * Answer Quality Page
 * Swiss Brutalist Tech Design
 * 
 * Goal: Measure how well Koda is answering
 * Shows evidence strength, weak evidence cases, fallback rates, and ask-one-question metrics
 */

import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard, MiniChart } from "@/components/shared";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

// Mock data - Replace with API calls
const mockStats = {
  avgEvidenceStrength: 0.78,
  weakEvidenceRate: 4.2,
  fallbackRate: 2.1,
  askOneQuestionRate: 3.8,
  refinementLoopRate: 1.5,
  avgChunksUsed: 4.2,
};

const mockEvidenceTrend = [
  { date: "Jan 21", value: 0.74 },
  { date: "Jan 22", value: 0.76 },
  { date: "Jan 23", value: 0.75 },
  { date: "Jan 24", value: 0.78 },
  { date: "Jan 25", value: 0.77 },
  { date: "Jan 26", value: 0.79 },
  { date: "Jan 27", value: 0.78 },
];

const mockWeakEvidenceTrend = [
  { date: "Jan 21", value: 5.2 },
  { date: "Jan 22", value: 4.8 },
  { date: "Jan 23", value: 5.1 },
  { date: "Jan 24", value: 4.5 },
  { date: "Jan 25", value: 4.3 },
  { date: "Jan 26", value: 4.4 },
  { date: "Jan 27", value: 4.2 },
];

const mockWeakEvidenceCases = [
  {
    id: "we_001",
    timestamp: "2025-01-27 14:32:15",
    userId: "u_***42",
    query: "What is the revenue for Q3 2024?",
    evidenceStrength: 0.32,
    reason: "No matching documents found",
    chunksRetrieved: 2,
    topChunkScore: 0.28,
  },
  {
    id: "we_002",
    timestamp: "2025-01-27 14:28:45",
    userId: "u_***17",
    query: "Compare the two contract versions from last year",
    evidenceStrength: 0.28,
    reason: "Insufficient context for comparison",
    chunksRetrieved: 3,
    topChunkScore: 0.31,
  },
  {
    id: "we_003",
    timestamp: "2025-01-27 14:25:12",
    userId: "u_***89",
    query: "Summarize the meeting from December 15th",
    evidenceStrength: 0.41,
    reason: "Low chunk relevance",
    chunksRetrieved: 4,
    topChunkScore: 0.38,
  },
  {
    id: "we_004",
    timestamp: "2025-01-27 14:20:33",
    userId: "u_***33",
    query: "Find the deadline for project Alpha",
    evidenceStrength: 0.35,
    reason: "Ambiguous scope - multiple projects",
    chunksRetrieved: 5,
    topChunkScore: 0.42,
  },
  {
    id: "we_005",
    timestamp: "2025-01-27 14:15:08",
    userId: "u_***56",
    query: "What are the payment terms?",
    evidenceStrength: 0.29,
    reason: "Query too vague",
    chunksRetrieved: 2,
    topChunkScore: 0.25,
  },
];

const mockFallbackCases = [
  {
    id: "fb_001",
    timestamp: "2025-01-27 13:45:22",
    userId: "u_***78",
    query: "What is the weather today?",
    reason: "Out of scope - no documents",
    fallbackType: "no_evidence",
  },
  {
    id: "fb_002",
    timestamp: "2025-01-27 12:30:18",
    userId: "u_***12",
    query: "Tell me a joke",
    reason: "Non-document query",
    fallbackType: "chitchat",
  },
  {
    id: "fb_003",
    timestamp: "2025-01-27 11:15:45",
    userId: "u_***99",
    query: "Calculate 2+2",
    reason: "Pure computation - no RAG needed",
    fallbackType: "direct_answer",
  },
];

const mockAskOneQuestionCases = [
  {
    id: "aoq_001",
    timestamp: "2025-01-27 14:10:33",
    userId: "u_***42",
    originalQuery: "Find the contract",
    clarifyingQuestion: "Which contract are you looking for? I found 15 contracts in your documents.",
    resolved: true,
  },
  {
    id: "aoq_002",
    timestamp: "2025-01-27 13:55:12",
    userId: "u_***17",
    originalQuery: "Summarize the report",
    clarifyingQuestion: "Which report would you like me to summarize? I found Q3 Report, Q4 Report, and Annual Report.",
    resolved: true,
  },
  {
    id: "aoq_003",
    timestamp: "2025-01-27 13:40:08",
    userId: "u_***89",
    originalQuery: "What is the deadline?",
    clarifyingQuestion: "Which project's deadline are you asking about?",
    resolved: false,
  },
];

export default function AnswerQuality() {
  const weakEvidenceColumns = [
    { key: "timestamp", header: "Time", className: "font-mono text-sm text-muted-foreground whitespace-nowrap" },
    { key: "userId", header: "User", className: "font-mono text-muted-foreground" },
    {
      key: "query",
      header: "Query",
      render: (item: typeof mockWeakEvidenceCases[0]) => (
        <span className="max-w-xs truncate block">{item.query}</span>
      ),
    },
    {
      key: "evidenceStrength",
      header: "Evidence",
      className: "font-mono text-right",
      render: (item: typeof mockWeakEvidenceCases[0]) => (
        <span className="text-[oklch(0.45_0.15_25)]">{item.evidenceStrength.toFixed(2)}</span>
      ),
    },
    { key: "reason", header: "Reason" },
    { key: "chunksRetrieved", header: "Chunks", className: "font-mono text-right" },
    {
      key: "topChunkScore",
      header: "Top Score",
      className: "font-mono text-right",
      render: (item: typeof mockWeakEvidenceCases[0]) => item.topChunkScore.toFixed(2),
    },
  ];

  const fallbackColumns = [
    { key: "timestamp", header: "Time", className: "font-mono text-sm text-muted-foreground whitespace-nowrap" },
    { key: "userId", header: "User", className: "font-mono text-muted-foreground" },
    { key: "query", header: "Query" },
    { key: "reason", header: "Reason" },
    {
      key: "fallbackType",
      header: "Type",
      render: (item: typeof mockFallbackCases[0]) => (
        <StatusBadge variant="neutral">{item.fallbackType}</StatusBadge>
      ),
    },
  ];

  const askOneQuestionColumns = [
    { key: "timestamp", header: "Time", className: "font-mono text-sm text-muted-foreground whitespace-nowrap" },
    { key: "userId", header: "User", className: "font-mono text-muted-foreground" },
    { key: "originalQuery", header: "Original Query" },
    {
      key: "clarifyingQuestion",
      header: "Clarifying Question",
      render: (item: typeof mockAskOneQuestionCases[0]) => (
        <span className="max-w-xs truncate block text-sm">{item.clarifyingQuestion}</span>
      ),
    },
    {
      key: "resolved",
      header: "Resolved",
      render: (item: typeof mockAskOneQuestionCases[0]) => (
        <StatusBadge variant={item.resolved ? "success" : "warning"}>
          {item.resolved ? "Yes" : "No"}
        </StatusBadge>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Answer Quality"
        description="Measure how well Koda is answering user queries"
      />

      <div className="p-8 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard
            label="Avg Evidence Strength"
            value={mockStats.avgEvidenceStrength.toFixed(2)}
          />
          <KPICard
            label="Weak Evidence Rate"
            value={`${mockStats.weakEvidenceRate}%`}
            trend={{ value: -0.8, label: "vs last week" }}
          />
          <KPICard
            label="Fallback Rate"
            value={`${mockStats.fallbackRate}%`}
          />
          <KPICard
            label="Ask-One-Question Rate"
            value={`${mockStats.askOneQuestionRate}%`}
          />
          <KPICard
            label="Refinement Loop Rate"
            value={`${mockStats.refinementLoopRate}%`}
          />
          <KPICard
            label="Avg Chunks Used"
            value={mockStats.avgChunksUsed.toFixed(1)}
          />
        </div>

        {/* Trend Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Section title="Evidence Strength Trend (7 days)">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockEvidenceTrend}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0.6, 1]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e5e5e5",
                      fontSize: "12px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#0a0a0a"
                    strokeWidth={2}
                    dot={{ fill: "#0a0a0a", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Weak Evidence Rate Trend (7 days)">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockWeakEvidenceTrend}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e5e5e5",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="oklch(0.45 0.15 25)"
                    fill="oklch(0.45 0.15 25)"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>

        {/* Weak Evidence Cases */}
        <Section
          title="Weak Evidence Cases"
          description="Queries with evidence strength below threshold (< 0.5)"
        >
          <DataTable
            columns={weakEvidenceColumns}
            data={mockWeakEvidenceCases}
            emptyMessage="No weak evidence cases"
          />
        </Section>

        {/* Fallback Cases */}
        <Section
          title="Fallback Cases"
          description="Queries that triggered fallback responses"
        >
          <DataTable
            columns={fallbackColumns}
            data={mockFallbackCases}
            emptyMessage="No fallback cases"
          />
        </Section>

        {/* Ask-One-Question Cases */}
        <Section
          title="Ask-One-Question Cases"
          description="Queries that required clarification"
        >
          <DataTable
            columns={askOneQuestionColumns}
            data={mockAskOneQuestionCases}
            emptyMessage="No ask-one-question cases"
          />
        </Section>
      </div>
    </AdminLayout>
  );
}
