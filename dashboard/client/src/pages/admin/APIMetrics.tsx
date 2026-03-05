/**
 * API Metrics Page
 * Swiss Brutalist Tech Design
 * 
 * Goal: Monitor all API metrics across Koda's internal and external services
 * Shows endpoint performance, provider status, error rates, and usage patterns
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, getStatusVariant, PageHeader, Section, KPICard } from "@/components/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from "recharts";

// ============================================================================
// MOCK DATA - Replace with actual API calls to your backend
// ============================================================================

const mockOverviewStats = {
  totalRequests24h: 156789,
  avgLatency: 187,
  errorRate: 0.42,
  uptime: 99.97,
  activeEndpoints: 47,
  externalProviders: 8,
};

// ----------------------------------------------------------------------------
// INTERNAL API ENDPOINTS (Koda Backend)
// ----------------------------------------------------------------------------
const mockInternalEndpoints = [
  // Auth Routes
  { id: "api_001", endpoint: "/api/auth/login", method: "POST", calls24h: 2345, avgLatency: 89, p95Latency: 156, errorRate: 0.12, status: "Healthy" },
  { id: "api_002", endpoint: "/api/auth/register", method: "POST", calls24h: 456, avgLatency: 124, p95Latency: 234, errorRate: 0.08, status: "Healthy" },
  { id: "api_003", endpoint: "/api/auth/refresh", method: "POST", calls24h: 8934, avgLatency: 45, p95Latency: 89, errorRate: 0.02, status: "Healthy" },
  { id: "api_004", endpoint: "/api/auth/logout", method: "POST", calls24h: 1234, avgLatency: 32, p95Latency: 56, errorRate: 0.01, status: "Healthy" },
  
  // User Routes
  { id: "api_005", endpoint: "/api/users/me", method: "GET", calls24h: 12456, avgLatency: 34, p95Latency: 67, errorRate: 0.05, status: "Healthy" },
  { id: "api_006", endpoint: "/api/users/settings", method: "PATCH", calls24h: 567, avgLatency: 78, p95Latency: 145, errorRate: 0.15, status: "Healthy" },
  
  // Conversation Routes
  { id: "api_007", endpoint: "/api/conversations", method: "GET", calls24h: 8765, avgLatency: 56, p95Latency: 112, errorRate: 0.08, status: "Healthy" },
  { id: "api_008", endpoint: "/api/conversations", method: "POST", calls24h: 2345, avgLatency: 123, p95Latency: 234, errorRate: 0.12, status: "Healthy" },
  { id: "api_009", endpoint: "/api/conversations/:id", method: "GET", calls24h: 15678, avgLatency: 45, p95Latency: 89, errorRate: 0.03, status: "Healthy" },
  { id: "api_010", endpoint: "/api/conversations/:id", method: "DELETE", calls24h: 234, avgLatency: 67, p95Latency: 134, errorRate: 0.05, status: "Healthy" },
  
  // Query/Chat Routes (Core RAG)
  { id: "api_011", endpoint: "/api/query", method: "POST", calls24h: 45678, avgLatency: 2345, p95Latency: 4567, errorRate: 0.85, status: "Healthy" },
  { id: "api_012", endpoint: "/api/query/stream", method: "POST", calls24h: 34567, avgLatency: 3456, p95Latency: 5678, errorRate: 0.92, status: "Healthy" },
  { id: "api_013", endpoint: "/api/query/feedback", method: "POST", calls24h: 5678, avgLatency: 45, p95Latency: 89, errorRate: 0.02, status: "Healthy" },
  
  // Document Routes
  { id: "api_014", endpoint: "/api/documents", method: "GET", calls24h: 6789, avgLatency: 78, p95Latency: 156, errorRate: 0.06, status: "Healthy" },
  { id: "api_015", endpoint: "/api/documents/upload", method: "POST", calls24h: 1234, avgLatency: 2345, p95Latency: 4567, errorRate: 1.2, status: "Degraded" },
  { id: "api_016", endpoint: "/api/documents/:id", method: "GET", calls24h: 8901, avgLatency: 56, p95Latency: 112, errorRate: 0.04, status: "Healthy" },
  { id: "api_017", endpoint: "/api/documents/:id", method: "DELETE", calls24h: 345, avgLatency: 89, p95Latency: 178, errorRate: 0.08, status: "Healthy" },
  { id: "api_018", endpoint: "/api/documents/:id/status", method: "GET", calls24h: 4567, avgLatency: 34, p95Latency: 67, errorRate: 0.02, status: "Healthy" },
  
  // File Routes
  { id: "api_019", endpoint: "/api/files/presign", method: "POST", calls24h: 1234, avgLatency: 123, p95Latency: 234, errorRate: 0.15, status: "Healthy" },
  { id: "api_020", endpoint: "/api/files/:id/download", method: "GET", calls24h: 2345, avgLatency: 234, p95Latency: 456, errorRate: 0.18, status: "Healthy" },
  
  // Search Routes
  { id: "api_021", endpoint: "/api/search", method: "POST", calls24h: 12345, avgLatency: 345, p95Latency: 678, errorRate: 0.25, status: "Healthy" },
  { id: "api_022", endpoint: "/api/search/semantic", method: "POST", calls24h: 8901, avgLatency: 456, p95Latency: 890, errorRate: 0.32, status: "Healthy" },
  
  // Workspace Routes
  { id: "api_023", endpoint: "/api/workspaces", method: "GET", calls24h: 3456, avgLatency: 45, p95Latency: 89, errorRate: 0.03, status: "Healthy" },
  { id: "api_024", endpoint: "/api/workspaces/:id/members", method: "GET", calls24h: 2345, avgLatency: 56, p95Latency: 112, errorRate: 0.04, status: "Healthy" },
  
  // Admin Routes
  { id: "api_025", endpoint: "/api/admin/stats", method: "GET", calls24h: 567, avgLatency: 234, p95Latency: 456, errorRate: 0.08, status: "Healthy" },
  { id: "api_026", endpoint: "/api/admin/users", method: "GET", calls24h: 234, avgLatency: 123, p95Latency: 234, errorRate: 0.05, status: "Healthy" },
  
  // Webhook Routes
  { id: "api_027", endpoint: "/api/webhooks/stripe", method: "POST", calls24h: 456, avgLatency: 89, p95Latency: 178, errorRate: 0.02, status: "Healthy" },
  { id: "api_028", endpoint: "/api/webhooks/clerk", method: "POST", calls24h: 789, avgLatency: 67, p95Latency: 134, errorRate: 0.01, status: "Healthy" },
];

// ----------------------------------------------------------------------------
// EXTERNAL API PROVIDERS
// ----------------------------------------------------------------------------
const mockExternalProviders = [
  // LLM Providers
  {
    id: "ext_001",
    provider: "OpenAI",
    category: "LLM",
    endpoints: [
      { endpoint: "chat/completions", calls24h: 23456, avgLatency: 1234, errorRate: 0.45, cost24h: 28.50 },
      { endpoint: "embeddings", calls24h: 45678, avgLatency: 234, errorRate: 0.12, cost24h: 4.50 },
    ],
    totalCalls24h: 69134,
    avgLatency: 734,
    errorRate: 0.28,
    cost24h: 33.00,
    status: "Healthy",
  },
  {
    id: "ext_002",
    provider: "Google Gemini",
    category: "LLM",
    endpoints: [
      { endpoint: "generateContent", calls24h: 34567, avgLatency: 987, errorRate: 0.32, cost24h: 12.30 },
      { endpoint: "embedContent", calls24h: 23456, avgLatency: 156, errorRate: 0.08, cost24h: 2.10 },
    ],
    totalCalls24h: 58023,
    avgLatency: 571,
    errorRate: 0.20,
    cost24h: 14.40,
    status: "Healthy",
  },
  {
    id: "ext_003",
    provider: "Gemini",
    category: "LLM",
    endpoints: [
      { endpoint: "generateContent", calls24h: 5678, avgLatency: 1567, errorRate: 0.52, cost24h: 8.90 },
    ],
    totalCalls24h: 5678,
    avgLatency: 1567,
    errorRate: 0.52,
    cost24h: 8.90,
    status: "Healthy",
  },
  
  // Vector Database
  {
    id: "ext_004",
    provider: "Pinecone",
    category: "Vector DB",
    endpoints: [
      { endpoint: "query", calls24h: 45678, avgLatency: 45, errorRate: 0.05, cost24h: 0 },
      { endpoint: "upsert", calls24h: 12345, avgLatency: 89, errorRate: 0.08, cost24h: 0 },
      { endpoint: "delete", calls24h: 1234, avgLatency: 34, errorRate: 0.02, cost24h: 0 },
    ],
    totalCalls24h: 59257,
    avgLatency: 56,
    errorRate: 0.05,
    cost24h: 0,
    status: "Healthy",
  },
  
  // Storage
  {
    id: "ext_005",
    provider: "AWS S3",
    category: "Storage",
    endpoints: [
      { endpoint: "PutObject", calls24h: 2345, avgLatency: 234, errorRate: 0.12, cost24h: 0.15 },
      { endpoint: "GetObject", calls24h: 8901, avgLatency: 123, errorRate: 0.05, cost24h: 0.08 },
      { endpoint: "DeleteObject", calls24h: 567, avgLatency: 89, errorRate: 0.02, cost24h: 0.01 },
      { endpoint: "CreatePresignedUrl", calls24h: 3456, avgLatency: 45, errorRate: 0.01, cost24h: 0 },
    ],
    totalCalls24h: 15269,
    avgLatency: 122,
    errorRate: 0.05,
    cost24h: 0.24,
    status: "Healthy",
  },
  
  // Cache
  {
    id: "ext_006",
    provider: "Redis (Upstash)",
    category: "Cache",
    endpoints: [
      { endpoint: "GET", calls24h: 123456, avgLatency: 2, errorRate: 0.001, cost24h: 0 },
      { endpoint: "SET", calls24h: 45678, avgLatency: 3, errorRate: 0.001, cost24h: 0 },
      { endpoint: "DEL", calls24h: 5678, avgLatency: 2, errorRate: 0.001, cost24h: 0 },
    ],
    totalCalls24h: 174812,
    avgLatency: 2,
    errorRate: 0.001,
    cost24h: 0,
    status: "Healthy",
  },
  
  // Auth
  {
    id: "ext_007",
    provider: "Clerk",
    category: "Auth",
    endpoints: [
      { endpoint: "verifyToken", calls24h: 34567, avgLatency: 45, errorRate: 0.02, cost24h: 0 },
      { endpoint: "getUser", calls24h: 12345, avgLatency: 67, errorRate: 0.03, cost24h: 0 },
    ],
    totalCalls24h: 46912,
    avgLatency: 56,
    errorRate: 0.025,
    cost24h: 0,
    status: "Healthy",
  },
  
  // Payments
  {
    id: "ext_008",
    provider: "Stripe",
    category: "Payments",
    endpoints: [
      { endpoint: "customers", calls24h: 234, avgLatency: 234, errorRate: 0.08, cost24h: 0 },
      { endpoint: "subscriptions", calls24h: 567, avgLatency: 345, errorRate: 0.12, cost24h: 0 },
      { endpoint: "invoices", calls24h: 123, avgLatency: 189, errorRate: 0.05, cost24h: 0 },
    ],
    totalCalls24h: 924,
    avgLatency: 256,
    errorRate: 0.08,
    cost24h: 0,
    status: "Healthy",
  },
];

// ----------------------------------------------------------------------------
// TIME SERIES DATA
// ----------------------------------------------------------------------------
const mockRequestsTrend = [
  { time: "00:00", internal: 4500, external: 8200 },
  { time: "04:00", internal: 2300, external: 4100 },
  { time: "08:00", internal: 8900, external: 15600 },
  { time: "12:00", internal: 12400, external: 21800 },
  { time: "16:00", internal: 10200, external: 18400 },
  { time: "20:00", internal: 7800, external: 14200 },
  { time: "Now", internal: 6500, external: 11800 },
];

const mockLatencyTrend = [
  { time: "00:00", p50: 145, p95: 456, p99: 890 },
  { time: "04:00", p50: 132, p95: 412, p99: 834 },
  { time: "08:00", p50: 189, p95: 567, p99: 1023 },
  { time: "12:00", p50: 234, p95: 678, p99: 1234 },
  { time: "16:00", p50: 198, p95: 589, p99: 1089 },
  { time: "20:00", p50: 167, p95: 512, p99: 956 },
  { time: "Now", p50: 187, p95: 534, p99: 989 },
];

const mockErrorTrend = [
  { time: "00:00", rate: 0.35 },
  { time: "04:00", rate: 0.28 },
  { time: "08:00", rate: 0.52 },
  { time: "12:00", rate: 0.68 },
  { time: "16:00", rate: 0.45 },
  { time: "20:00", rate: 0.38 },
  { time: "Now", rate: 0.42 },
];

const mockTopEndpoints = [
  { endpoint: "/api/query/stream", calls: 34567 },
  { endpoint: "/api/query", calls: 45678 },
  { endpoint: "/api/conversations/:id", calls: 15678 },
  { endpoint: "/api/search", calls: 12345 },
  { endpoint: "/api/users/me", calls: 12456 },
  { endpoint: "/api/documents/:id", calls: 8901 },
  { endpoint: "/api/search/semantic", calls: 8901 },
  { endpoint: "/api/conversations", calls: 8765 },
];

const mockRecentErrors = [
  { id: "err_001", timestamp: "2025-01-27 14:32:15", endpoint: "/api/documents/upload", method: "POST", statusCode: 500, error: "S3 upload timeout", count: 3 },
  { id: "err_002", timestamp: "2025-01-27 14:28:45", endpoint: "/api/query/stream", method: "POST", statusCode: 504, error: "LLM provider timeout", count: 5 },
  { id: "err_003", timestamp: "2025-01-27 14:25:12", endpoint: "/api/search/semantic", method: "POST", statusCode: 429, error: "Pinecone rate limit", count: 2 },
  { id: "err_004", timestamp: "2025-01-27 14:20:33", endpoint: "/api/auth/login", method: "POST", statusCode: 401, error: "Invalid credentials", count: 12 },
  { id: "err_005", timestamp: "2025-01-27 14:15:08", endpoint: "/api/query", method: "POST", statusCode: 400, error: "Invalid query format", count: 8 },
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function APIMetrics() {
  const [activeTab, setActiveTab] = useState("overview");

  // Internal endpoints table columns
  const internalColumns = [
    { key: "method", header: "Method", render: (item: typeof mockInternalEndpoints[0]) => (
      <span className={`font-mono text-xs px-2 py-0.5 ${
        item.method === "GET" ? "bg-emerald-100 text-emerald-800" :
        item.method === "POST" ? "bg-blue-100 text-blue-800" :
        item.method === "PATCH" ? "bg-amber-100 text-amber-800" :
        item.method === "DELETE" ? "bg-red-100 text-red-800" : "bg-gray-100"
      }`}>{item.method}</span>
    )},
    { key: "endpoint", header: "Endpoint", className: "font-mono text-sm" },
    { key: "calls24h", header: "Calls (24h)", className: "font-mono text-right", render: (item: typeof mockInternalEndpoints[0]) => item.calls24h.toLocaleString() },
    { key: "avgLatency", header: "Avg Latency", className: "font-mono text-right", render: (item: typeof mockInternalEndpoints[0]) => `${item.avgLatency}ms` },
    { key: "p95Latency", header: "p95 Latency", className: "font-mono text-right", render: (item: typeof mockInternalEndpoints[0]) => `${item.p95Latency}ms` },
    { key: "errorRate", header: "Error Rate", className: "font-mono text-right", render: (item: typeof mockInternalEndpoints[0]) => (
      <span className={item.errorRate > 1 ? "text-[oklch(0.45_0.15_25)]" : ""}>{item.errorRate.toFixed(2)}%</span>
    )},
    { key: "status", header: "Status", render: (item: typeof mockInternalEndpoints[0]) => (
      <StatusBadge variant={getStatusVariant(item.status)}>{item.status}</StatusBadge>
    )},
  ];

  // External providers table columns
  const providerColumns = [
    { key: "provider", header: "Provider", className: "font-medium" },
    { key: "category", header: "Category", render: (item: typeof mockExternalProviders[0]) => (
      <StatusBadge variant="neutral">{item.category}</StatusBadge>
    )},
    { key: "totalCalls24h", header: "Calls (24h)", className: "font-mono text-right", render: (item: typeof mockExternalProviders[0]) => item.totalCalls24h.toLocaleString() },
    { key: "avgLatency", header: "Avg Latency", className: "font-mono text-right", render: (item: typeof mockExternalProviders[0]) => `${item.avgLatency}ms` },
    { key: "errorRate", header: "Error Rate", className: "font-mono text-right", render: (item: typeof mockExternalProviders[0]) => `${item.errorRate.toFixed(2)}%` },
    { key: "cost24h", header: "Cost (24h)", className: "font-mono text-right", render: (item: typeof mockExternalProviders[0]) => item.cost24h > 0 ? `$${item.cost24h.toFixed(2)}` : "—" },
    { key: "status", header: "Status", render: (item: typeof mockExternalProviders[0]) => (
      <StatusBadge variant={getStatusVariant(item.status)}>{item.status}</StatusBadge>
    )},
  ];

  // Error log columns
  const errorColumns = [
    { key: "timestamp", header: "Time", className: "font-mono text-sm text-muted-foreground whitespace-nowrap" },
    { key: "method", header: "Method", render: (item: typeof mockRecentErrors[0]) => (
      <span className="font-mono text-xs">{item.method}</span>
    )},
    { key: "endpoint", header: "Endpoint", className: "font-mono text-sm" },
    { key: "statusCode", header: "Status", render: (item: typeof mockRecentErrors[0]) => (
      <span className={`font-mono ${item.statusCode >= 500 ? "text-[oklch(0.45_0.15_25)]" : "text-amber-600"}`}>
        {item.statusCode}
      </span>
    )},
    { key: "error", header: "Error", className: "text-sm" },
    { key: "count", header: "Count", className: "font-mono text-right" },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="API Metrics"
        description="Monitor all internal and external API performance"
      />

      <div className="p-8 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard
            label="Total Requests (24h)"
            value={mockOverviewStats.totalRequests24h.toLocaleString()}
          />
          <KPICard
            label="Avg Latency"
            value={`${mockOverviewStats.avgLatency}ms`}
          />
          <KPICard
            label="Error Rate"
            value={`${mockOverviewStats.errorRate}%`}
          />
          <KPICard
            label="Uptime"
            value={`${mockOverviewStats.uptime}%`}
          />
          <KPICard
            label="Active Endpoints"
            value={mockOverviewStats.activeEndpoints}
          />
          <KPICard
            label="External Providers"
            value={mockOverviewStats.externalProviders}
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="internal">Internal APIs</TabsTrigger>
            <TabsTrigger value="external">External Providers</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Request Volume (24h)">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={mockRequestsTrend}>
                      <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          background: "#fff",
                          border: "1px solid #e5e5e5",
                          fontSize: "12px",
                        }}
                      />
                      <Area type="monotone" dataKey="internal" stackId="1" stroke="#0a0a0a" fill="#0a0a0a" fillOpacity={0.8} name="Internal" />
                      <Area type="monotone" dataKey="external" stackId="1" stroke="#606060" fill="#606060" fillOpacity={0.6} name="External" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-[#0a0a0a]" />
                    <span>Internal APIs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-[#606060]" />
                    <span>External Providers</span>
                  </div>
                </div>
              </Section>

              <Section title="Latency Percentiles (24h)">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mockLatencyTrend}>
                      <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          background: "#fff",
                          border: "1px solid #e5e5e5",
                          fontSize: "12px",
                        }}
                        formatter={(value: number, name: string) => [`${value}ms`, name.toUpperCase()]}
                      />
                      <Line type="monotone" dataKey="p50" stroke="#0a0a0a" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="p95" stroke="#606060" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="p99" stroke="#a0a0a0" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-[#0a0a0a]" />
                    <span>p50</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-[#606060]" />
                    <span>p95</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-[#a0a0a0]" />
                    <span>p99</span>
                  </div>
                </div>
              </Section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Top Endpoints by Volume">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mockTopEndpoints} layout="vertical" margin={{ left: 120 }}>
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="endpoint" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip
                        contentStyle={{
                          background: "#fff",
                          border: "1px solid #e5e5e5",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="calls" fill="#0a0a0a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>

              <Section title="Error Rate Trend (24h)">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={mockErrorTrend}>
                      <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} domain={[0, 1]} />
                      <Tooltip
                        contentStyle={{
                          background: "#fff",
                          border: "1px solid #e5e5e5",
                          fontSize: "12px",
                        }}
                        formatter={(value: number) => [`${value}%`, "Error Rate"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="rate"
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

            {/* External Providers Summary */}
            <Section title="External Provider Status">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                {mockExternalProviders.map((provider) => (
                  <div key={provider.id} className="border border-border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{provider.provider}</span>
                      <div className={`w-2 h-2 rounded-full ${provider.status === "Healthy" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    </div>
                    <div className="text-xs text-muted-foreground">{provider.category}</div>
                    <div className="font-mono text-lg">{provider.avgLatency}ms</div>
                    <div className="text-xs text-muted-foreground">{provider.totalCalls24h.toLocaleString()} calls</div>
                  </div>
                ))}
              </div>
            </Section>
          </TabsContent>

          {/* Internal APIs Tab */}
          <TabsContent value="internal" className="space-y-6 mt-6">
            <Section title="Internal API Endpoints" description="All Koda backend API endpoints">
              <DataTable
                columns={internalColumns}
                data={mockInternalEndpoints}
                emptyMessage="No endpoints found"
              />
            </Section>
          </TabsContent>

          {/* External Providers Tab */}
          <TabsContent value="external" className="space-y-6 mt-6">
            <Section title="External API Providers" description="Third-party services and APIs">
              <DataTable
                columns={providerColumns}
                data={mockExternalProviders}
                emptyMessage="No providers found"
              />
            </Section>

            {/* Provider Details */}
            {mockExternalProviders.map((provider) => (
              <Section key={provider.id} title={`${provider.provider} Endpoints`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 font-medium">Endpoint</th>
                        <th className="text-right py-3 px-4 font-medium">Calls (24h)</th>
                        <th className="text-right py-3 px-4 font-medium">Avg Latency</th>
                        <th className="text-right py-3 px-4 font-medium">Error Rate</th>
                        <th className="text-right py-3 px-4 font-medium">Cost (24h)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {provider.endpoints.map((ep, idx) => (
                        <tr key={idx} className="border-b border-border/50">
                          <td className="py-3 px-4 font-mono text-sm">{ep.endpoint}</td>
                          <td className="py-3 px-4 font-mono text-right">{ep.calls24h.toLocaleString()}</td>
                          <td className="py-3 px-4 font-mono text-right">{ep.avgLatency}ms</td>
                          <td className="py-3 px-4 font-mono text-right">{ep.errorRate.toFixed(2)}%</td>
                          <td className="py-3 px-4 font-mono text-right">{ep.cost24h > 0 ? `$${ep.cost24h.toFixed(2)}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            ))}
          </TabsContent>

          {/* Errors Tab */}
          <TabsContent value="errors" className="space-y-6 mt-6">
            <Section title="Recent API Errors" description="Last 24 hours">
              <DataTable
                columns={errorColumns}
                data={mockRecentErrors}
                emptyMessage="No errors"
              />
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
