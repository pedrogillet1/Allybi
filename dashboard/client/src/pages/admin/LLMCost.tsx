/**
 * LLM / Cost Page
 * Swiss Brutalist Tech Design
 * 
 * Goal: Understand LLM usage, costs, and performance
 * Shows provider breakdown, model usage, cost trends, and error tracking
 */

import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard } from "@/components/shared";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Mock data - Replace with API calls
const mockStats = {
  totalCostToday: 42.87,
  totalCostMonth: 1245.32,
  totalTokensToday: 2450000,
  avgLatency: 245,
  errorRate: 0.8,
  cacheHitRate: 34.5,
};

const mockCostTrend = [
  { date: "Jan 21", cost: 38.50, tokens: 2100000 },
  { date: "Jan 22", cost: 41.20, tokens: 2250000 },
  { date: "Jan 23", cost: 39.80, tokens: 2180000 },
  { date: "Jan 24", cost: 44.50, tokens: 2420000 },
  { date: "Jan 25", cost: 43.10, tokens: 2350000 },
  { date: "Jan 26", cost: 45.20, tokens: 2480000 },
  { date: "Jan 27", cost: 42.87, tokens: 2450000 },
];

const mockProviderBreakdown = [
  { provider: "OpenAI", cost: 28.50, tokens: 1200000, calls: 2450, percentage: 66 },
  { provider: "Gemini", cost: 12.30, tokens: 1100000, calls: 3200, percentage: 29 },
  { provider: "Local", cost: 2.07, tokens: 150000, calls: 450, percentage: 5 },
];

const mockModelUsage = [
  { id: "m_001", provider: "OpenAI", model: "gpt-5.2", tokens: 850000, cost: 21.25, calls: 1850, avgLatency: 312 },
  { id: "m_002", provider: "Gemini", model: "gemini-2.5-flash", tokens: 980000, cost: 9.80, calls: 2800, avgLatency: 198 },
  { id: "m_003", provider: "OpenAI", model: "text-embedding-3-small", tokens: 350000, cost: 3.50, calls: 600, avgLatency: 45 },
  { id: "m_004", provider: "Gemini", model: "gemini-2.5-flash", tokens: 120000, cost: 2.50, calls: 400, avgLatency: 456 },
  { id: "m_005", provider: "OpenAI", model: "gpt-5-mini", tokens: 280000, cost: 3.75, calls: 890, avgLatency: 189 },
  { id: "m_006", provider: "Local", model: "llama-3.2-8b", tokens: 150000, cost: 2.07, calls: 450, avgLatency: 234 },
];

const mockErrors = [
  { id: "e_001", timestamp: "2025-01-27 14:32:15", provider: "OpenAI", model: "gpt-5.2", error: "Rate limit exceeded", count: 3 },
  { id: "e_002", timestamp: "2025-01-27 14:28:45", provider: "Gemini", model: "gemini-2.5-flash", error: "Context length exceeded", count: 1 },
  { id: "e_003", timestamp: "2025-01-27 14:20:33", provider: "OpenAI", model: "gpt-5.2", error: "Timeout (30s)", count: 2 },
  { id: "e_004", timestamp: "2025-01-27 13:45:22", provider: "Local", model: "llama-3.2-8b", error: "Model unavailable", count: 1 },
];

const mockLatencyDistribution = [
  { range: "0-100ms", count: 450 },
  { range: "100-200ms", count: 1200 },
  { range: "200-300ms", count: 2100 },
  { range: "300-500ms", count: 1800 },
  { range: "500-1000ms", count: 650 },
  { range: "1000ms+", count: 120 },
];

const COLORS = ["#0a0a0a", "#404040", "#808080"];

export default function LLMCost() {
  const modelColumns = [
    { key: "provider", header: "Provider" },
    { key: "model", header: "Model", className: "font-mono" },
    {
      key: "tokens",
      header: "Tokens",
      className: "font-mono text-right",
      render: (item: typeof mockModelUsage[0]) => item.tokens.toLocaleString(),
    },
    {
      key: "cost",
      header: "Cost",
      className: "font-mono text-right",
      render: (item: typeof mockModelUsage[0]) => `$${item.cost.toFixed(2)}`,
    },
    {
      key: "calls",
      header: "Calls",
      className: "font-mono text-right",
      render: (item: typeof mockModelUsage[0]) => item.calls.toLocaleString(),
    },
    {
      key: "avgLatency",
      header: "Avg Latency",
      className: "font-mono text-right",
      render: (item: typeof mockModelUsage[0]) => `${item.avgLatency}ms`,
    },
  ];

  const errorColumns = [
    { key: "timestamp", header: "Time", className: "font-mono text-sm text-muted-foreground whitespace-nowrap" },
    { key: "provider", header: "Provider" },
    { key: "model", header: "Model", className: "font-mono" },
    {
      key: "error",
      header: "Error",
      render: (item: typeof mockErrors[0]) => (
        <StatusBadge variant="error">{item.error}</StatusBadge>
      ),
    },
    { key: "count", header: "Count", className: "font-mono text-right" },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="LLM / Cost"
        description="LLM usage, costs, and performance metrics"
      />

      <div className="p-8 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard
            label="Cost Today"
            value={`$${mockStats.totalCostToday.toFixed(2)}`}
            trend={{ value: 5.4, label: "vs yesterday" }}
          />
          <KPICard
            label="Cost This Month"
            value={`$${mockStats.totalCostMonth.toFixed(2)}`}
          />
          <KPICard
            label="Tokens Today"
            value={`${(mockStats.totalTokensToday / 1000000).toFixed(2)}M`}
          />
          <KPICard
            label="Avg Latency"
            value={`${mockStats.avgLatency}ms`}
          />
          <KPICard
            label="Error Rate"
            value={`${mockStats.errorRate}%`}
          />
          <KPICard
            label="Cache Hit Rate"
            value={`${mockStats.cacheHitRate}%`}
          />
        </div>

        {/* Cost Trend and Provider Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Section title="Cost Trend (7 days)" className="lg:col-span-2">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockCostTrend}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e5e5e5",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Cost"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="#0a0a0a"
                    strokeWidth={2}
                    dot={{ fill: "#0a0a0a", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Provider Breakdown">
            <div className="flex flex-col items-center gap-4">
              <div className="w-32 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={mockProviderBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={55}
                      dataKey="cost"
                      stroke="none"
                    >
                      {mockProviderBreakdown.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full space-y-2">
                {mockProviderBreakdown.map((p, i) => (
                  <div key={p.provider} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3" style={{ backgroundColor: COLORS[i] }} />
                      <span>{p.provider}</span>
                    </div>
                    <span className="font-mono">${p.cost.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        </div>

        {/* Latency Distribution */}
        <Section title="Latency Distribution">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockLatencyDistribution}>
                <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid #e5e5e5",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="count" fill="#0a0a0a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* Model Usage Table */}
        <Section title="Model Usage" description="Token and cost breakdown by model">
          <DataTable
            columns={modelColumns}
            data={mockModelUsage}
            emptyMessage="No model usage data"
          />
          <div className="mt-4 pt-4 border-t border-border flex justify-between text-sm">
            <span className="font-medium">Total</span>
            <span className="font-mono">
              {mockModelUsage.reduce((sum, m) => sum + m.tokens, 0).toLocaleString()} tokens • 
              ${mockModelUsage.reduce((sum, m) => sum + m.cost, 0).toFixed(2)} • 
              {mockModelUsage.reduce((sum, m) => sum + m.calls, 0).toLocaleString()} calls
            </span>
          </div>
        </Section>

        {/* Error Log */}
        <Section title="Recent Errors" description="LLM API errors in the last 24 hours">
          <DataTable
            columns={errorColumns}
            data={mockErrors}
            emptyMessage="No errors"
          />
        </Section>
      </div>
    </AdminLayout>
  );
}
