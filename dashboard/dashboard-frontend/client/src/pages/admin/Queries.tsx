/**
 * Queries Page - Enhanced with tokens, cost, providerMix, sourcesCount, fallbackReason
 * Swiss Brutalist Tech Design - White/Black Minimalist
 */

import { useState, useMemo } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, MessageSquare, TrendingUp, FileText, Tag, Download, Zap, DollarSign, AlertTriangle } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Link } from "wouter";

// Mock data - Replace with API calls
const mockStats = {
  totalQueries: 45678,
  avgTokensPerQuery: 1847,
  totalCost: 87.90,
  weakEvidenceRate: 8.4,
};

const mockQueries = [
  {
    id: "q_001",
    traceId: "trace-001",
    timestamp: "2025-01-27 14:32:15",
    userId: "u_***42",
    userName: "John Doe",
    query: "What was the Q4 revenue growth?",
    intent: "extract",
    operator: "locate_content",
    scopeMode: "doc_lock",
    domain: "finance",
    keywords: ["revenue", "Q4", "growth"],
    tokens: 1247,
    cost: 0.0124,
    providerMix: ["gemini", "openai"],
    sourcesCount: 4,
    resultType: "answered",
    evidenceStrength: 0.89,
    hadFallback: false,
    fallbackReason: null,
    qualityOutcome: "adequate",
    latencyMs: 1850,
  },
  {
    id: "q_002",
    traceId: "trace-002",
    timestamp: "2025-01-27 14:28:45",
    userId: "u_***17",
    userName: "Jane Smith",
    query: "Compare the two contract versions",
    intent: "compare",
    operator: "compare",
    scopeMode: "discovery",
    domain: "legal",
    keywords: ["contract", "compare", "versions"],
    tokens: 2156,
    cost: 0.0215,
    providerMix: ["openai"],
    sourcesCount: 6,
    resultType: "answered",
    evidenceStrength: 0.72,
    hadFallback: true,
    fallbackReason: "weak_evidence",
    qualityOutcome: "weak",
    latencyMs: 2340,
  },
  {
    id: "q_003",
    traceId: "trace-003",
    timestamp: "2025-01-27 14:25:12",
    userId: "u_***89",
    userName: "Mike Johnson",
    query: "Summarize the meeting notes",
    intent: "summarize",
    operator: "summarize",
    scopeMode: "doc_lock",
    domain: "general",
    keywords: ["meeting", "notes", "summary"],
    tokens: 1834,
    cost: 0.0183,
    providerMix: ["gemini", "openai", "anthropic"],
    sourcesCount: 8,
    resultType: "answered",
    evidenceStrength: 0.95,
    hadFallback: false,
    fallbackReason: null,
    qualityOutcome: "adequate",
    latencyMs: 2100,
  },
  {
    id: "q_004",
    traceId: "trace-004",
    timestamp: "2025-01-27 14:20:33",
    userId: "u_***33",
    userName: "Sarah Wilson",
    query: "Find the deadline for the project",
    intent: "extract",
    operator: "locate_content",
    scopeMode: "discovery",
    domain: "general",
    keywords: ["deadline", "project"],
    tokens: 987,
    cost: 0.0098,
    providerMix: ["gemini"],
    sourcesCount: 2,
    resultType: "asked_question",
    evidenceStrength: 0.34,
    hadFallback: true,
    fallbackReason: "insufficient_sources",
    qualityOutcome: "weak",
    latencyMs: 1200,
  },
  {
    id: "q_005",
    traceId: "trace-005",
    timestamp: "2025-01-27 14:15:08",
    userId: "u_***56",
    userName: "Tom Brown",
    query: "What are the key terms in the NDA?",
    intent: "extract",
    operator: "extract",
    scopeMode: "doc_lock",
    domain: "legal",
    keywords: ["NDA", "terms", "key"],
    tokens: 1456,
    cost: 0.0145,
    providerMix: ["openai"],
    sourcesCount: 3,
    resultType: "answered",
    evidenceStrength: 0.85,
    hadFallback: false,
    fallbackReason: null,
    qualityOutcome: "adequate",
    latencyMs: 1650,
  },
  {
    id: "q_006",
    traceId: "trace-006",
    timestamp: "2025-01-27 14:10:22",
    userId: "u_***78",
    userName: "Emily Davis",
    query: "Calculate the total expenses",
    intent: "compute",
    operator: "compute",
    scopeMode: "doc_lock",
    domain: "finance",
    keywords: ["expenses", "total", "calculate"],
    tokens: 1123,
    cost: 0.0112,
    providerMix: ["gemini", "openai"],
    sourcesCount: 5,
    resultType: "answered",
    evidenceStrength: 0.91,
    hadFallback: false,
    fallbackReason: null,
    qualityOutcome: "adequate",
    latencyMs: 1450,
  },
  {
    id: "q_007",
    traceId: "trace-007",
    timestamp: "2025-01-27 14:05:45",
    userId: "u_***12",
    userName: "Chris Lee",
    query: "Explain the methodology section",
    intent: "explain",
    operator: "explain",
    scopeMode: "doc_lock",
    domain: "technical",
    keywords: ["methodology", "explain"],
    tokens: 2345,
    cost: 0.0234,
    providerMix: ["openai", "anthropic"],
    sourcesCount: 4,
    resultType: "answered",
    evidenceStrength: 0.88,
    hadFallback: false,
    fallbackReason: null,
    qualityOutcome: "adequate",
    latencyMs: 2500,
  },
  {
    id: "q_008",
    traceId: "trace-008",
    timestamp: "2025-01-27 14:00:18",
    userId: "u_***99",
    userName: "Alex Kim",
    query: "List all the action items",
    intent: "list",
    operator: "list",
    scopeMode: "discovery",
    domain: "general",
    keywords: ["action items", "list"],
    tokens: 876,
    cost: 0.0087,
    providerMix: ["gemini"],
    sourcesCount: 1,
    resultType: "fallback",
    evidenceStrength: 0.28,
    hadFallback: true,
    fallbackReason: "no_relevant_content",
    qualityOutcome: "blocked",
    latencyMs: 980,
  },
];

const mockDomainData = [
  { name: "finance", count: 1456, percentage: 28.5, avgTokens: 1650, totalCost: 24.5, weakEvidenceRate: 7 },
  { name: "legal", count: 987, percentage: 19.3, avgTokens: 2200, totalCost: 21.7, weakEvidenceRate: 14 },
  { name: "general", count: 876, percentage: 17.1, avgTokens: 1400, totalCost: 12.3, weakEvidenceRate: 9 },
  { name: "technical", count: 765, percentage: 15.0, avgTokens: 1900, totalCost: 14.5, weakEvidenceRate: 11 },
  { name: "product", count: 543, percentage: 10.6, avgTokens: 1800, totalCost: 9.8, weakEvidenceRate: 6 },
  { name: "hr", count: 487, percentage: 9.5, avgTokens: 1500, totalCost: 7.3, weakEvidenceRate: 8 },
];

const mockIntentData = [
  { intent: "extract", count: 1245, percentage: 32.5, avgTokens: 1450, avgCost: 0.014, weakEvidenceRate: 8, trend: 13.2 },
  { intent: "explain", count: 876, percentage: 22.8, avgTokens: 2100, avgCost: 0.021, weakEvidenceRate: 12, trend: -2.7 },
  { intent: "compare", count: 654, percentage: 17.1, avgTokens: 1800, avgCost: 0.018, weakEvidenceRate: 6, trend: 9.0 },
  { intent: "summarize", count: 543, percentage: 14.2, avgTokens: 2500, avgCost: 0.025, weakEvidenceRate: 15, trend: 4.4 },
  { intent: "list", count: 398, percentage: 10.4, avgTokens: 1100, avgCost: 0.011, weakEvidenceRate: 5, trend: 6.7 },
  { intent: "compute", count: 112, percentage: 3.0, avgTokens: 1300, avgCost: 0.013, weakEvidenceRate: 4, trend: 2.1 },
];

const mockKeywords = [
  { keyword: "revenue", count: 456, trend: 20.0, domains: ["finance"], intents: ["extract"], avgEvidence: 87 },
  { keyword: "contract", count: 342, trend: 10.3, domains: ["legal"], intents: ["compare", "extract"], avgEvidence: 79 },
  { keyword: "summary", count: 298, trend: 4.6, domains: ["general"], intents: ["summarize"], avgEvidence: 92 },
  { keyword: "deadline", count: 276, trend: -4.8, domains: ["general", "product"], intents: ["extract"], avgEvidence: 85 },
  { keyword: "expenses", count: 234, trend: 17.0, domains: ["finance"], intents: ["compute", "extract"], avgEvidence: 88 },
  { keyword: "NDA", count: 189, trend: 8.5, domains: ["legal"], intents: ["extract"], avgEvidence: 91 },
  { keyword: "methodology", count: 156, trend: 3.2, domains: ["technical"], intents: ["explain"], avgEvidence: 84 },
  { keyword: "action items", count: 134, trend: -2.1, domains: ["general"], intents: ["list"], avgEvidence: 76 },
];

const COLORS = ["#0a0a0a", "#404040", "#606060", "#808080", "#a0a0a0", "#c0c0c0"];

export default function Queries() {
  const [searchQuery, setSearchQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [intentFilter, setIntentFilter] = useState<string>("all");
  const [qualityFilter, setQualityFilter] = useState<string>("all");
  const [rangeFilter, setRangeFilter] = useState<string>("7d");

  const filteredQueries = useMemo(() => {
    return mockQueries.filter((q) => {
      const matchesSearch = q.query.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.userName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDomain = domainFilter === "all" || q.domain === domainFilter;
      const matchesIntent = intentFilter === "all" || q.intent === intentFilter;
      const matchesQuality = qualityFilter === "all" || q.qualityOutcome === qualityFilter;
      return matchesSearch && matchesDomain && matchesIntent && matchesQuality;
    });
  }, [searchQuery, domainFilter, intentFilter, qualityFilter]);

  const queryColumns = [
    {
      key: "query",
      header: "Query",
      render: (item: typeof mockQueries[0]) => (
        <div className="max-w-xs">
          <Link href={`/admin/interactions/${item.traceId}`}>
            <span className="font-mono text-sm hover:underline cursor-pointer line-clamp-2">
              {item.query}
            </span>
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">{item.userName}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">{item.timestamp}</span>
          </div>
        </div>
      ),
    },
    {
      key: "domain",
      header: "Domain",
      render: (item: typeof mockQueries[0]) => (
        <StatusBadge variant="info">{item.domain}</StatusBadge>
      ),
    },
    {
      key: "intent",
      header: "Intent",
      render: (item: typeof mockQueries[0]) => (
        <span className="font-mono text-xs bg-muted px-2 py-1">{item.intent}</span>
      ),
    },
    {
      key: "tokens",
      header: "Tokens",
      className: "font-mono text-right",
      render: (item: typeof mockQueries[0]) => item.tokens.toLocaleString(),
    },
    {
      key: "cost",
      header: "Cost",
      className: "font-mono text-right",
      render: (item: typeof mockQueries[0]) => `$${item.cost.toFixed(4)}`,
    },
    {
      key: "providerMix",
      header: "Providers",
      render: (item: typeof mockQueries[0]) => (
        <div className="flex gap-1">
          {item.providerMix.map((p) => (
            <span key={p} className="text-xs bg-foreground text-background px-1.5 py-0.5 font-mono">
              {p.slice(0, 3).toUpperCase()}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "sourcesCount",
      header: "Sources",
      className: "font-mono text-center",
      render: (item: typeof mockQueries[0]) => item.sourcesCount,
    },
    {
      key: "evidenceStrength",
      header: "Evidence",
      render: (item: typeof mockQueries[0]) => (
        <div className="flex items-center gap-2">
          <div className="w-12 h-1.5 bg-muted overflow-hidden">
            <div 
              className={`h-full ${
                item.evidenceStrength >= 0.8 ? 'bg-green-600' :
                item.evidenceStrength >= 0.6 ? 'bg-yellow-600' : 'bg-red-600'
              }`}
              style={{ width: `${item.evidenceStrength * 100}%` }}
            />
          </div>
          <span className="text-xs font-mono">{(item.evidenceStrength * 100).toFixed(0)}%</span>
        </div>
      ),
    },
    {
      key: "quality",
      header: "Quality",
      render: (item: typeof mockQueries[0]) => (
        <div>
          <StatusBadge 
            variant={item.qualityOutcome === 'adequate' ? 'success' : item.qualityOutcome === 'weak' ? 'warning' : 'error'}
          >
            {item.qualityOutcome}
          </StatusBadge>
          {item.hadFallback && item.fallbackReason && (
            <div className="text-xs text-red-600 mt-1 font-mono">
              {item.fallbackReason.replace(/_/g, ' ')}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "latencyMs",
      header: "Latency",
      className: "font-mono text-right",
      render: (item: typeof mockQueries[0]) => `${item.latencyMs.toLocaleString()}ms`,
    },
  ];

  const domainColumns = [
    { key: "name", header: "Domain", render: (item: typeof mockDomainData[0]) => <StatusBadge variant="info">{item.name}</StatusBadge> },
    { key: "count", header: "Queries", className: "font-mono text-right", render: (item: typeof mockDomainData[0]) => item.count.toLocaleString() },
    { key: "percentage", header: "Share", className: "font-mono text-right", render: (item: typeof mockDomainData[0]) => `${item.percentage.toFixed(1)}%` },
    { key: "avgTokens", header: "Avg Tokens", className: "font-mono text-right", render: (item: typeof mockDomainData[0]) => item.avgTokens.toLocaleString() },
    { key: "totalCost", header: "Total Cost", className: "font-mono text-right", render: (item: typeof mockDomainData[0]) => `$${item.totalCost.toFixed(2)}` },
    { 
      key: "weakEvidenceRate", 
      header: "Weak Evidence", 
      className: "font-mono text-right",
      render: (item: typeof mockDomainData[0]) => (
        <span className={item.weakEvidenceRate > 10 ? 'text-red-600' : ''}>
          {item.weakEvidenceRate}%
        </span>
      )
    },
  ];

  const intentColumns = [
    { key: "intent", header: "Intent", render: (item: typeof mockIntentData[0]) => <span className="font-mono">{item.intent}</span> },
    { key: "count", header: "Count", className: "font-mono text-right", render: (item: typeof mockIntentData[0]) => item.count.toLocaleString() },
    { key: "percentage", header: "Share", className: "font-mono text-right", render: (item: typeof mockIntentData[0]) => `${item.percentage.toFixed(1)}%` },
    { key: "avgTokens", header: "Avg Tokens", className: "font-mono text-right", render: (item: typeof mockIntentData[0]) => item.avgTokens.toLocaleString() },
    { key: "avgCost", header: "Avg Cost", className: "font-mono text-right", render: (item: typeof mockIntentData[0]) => `$${item.avgCost.toFixed(3)}` },
    { 
      key: "weakEvidenceRate", 
      header: "Weak Evidence", 
      className: "font-mono text-right",
      render: (item: typeof mockIntentData[0]) => (
        <span className={item.weakEvidenceRate > 10 ? 'text-red-600' : ''}>
          {item.weakEvidenceRate}%
        </span>
      )
    },
    {
      key: "trend",
      header: "Trend",
      className: "font-mono text-right",
      render: (item: typeof mockIntentData[0]) => (
        <span className={item.trend > 0 ? 'text-green-600' : item.trend < 0 ? 'text-red-600' : ''}>
          {item.trend > 0 ? '↑' : item.trend < 0 ? '↓' : '→'} {Math.abs(item.trend).toFixed(1)}%
        </span>
      ),
    },
  ];

  const keywordColumns = [
    { key: "keyword", header: "Keyword", render: (item: typeof mockKeywords[0]) => <span className="font-mono font-medium">{item.keyword}</span> },
    { key: "count", header: "Count", className: "font-mono text-right", render: (item: typeof mockKeywords[0]) => item.count.toLocaleString() },
    { key: "domains", header: "Domains", render: (item: typeof mockKeywords[0]) => item.domains.join(", ") },
    { key: "intents", header: "Intents", render: (item: typeof mockKeywords[0]) => item.intents.join(", ") },
    { key: "avgEvidence", header: "Avg Evidence", className: "font-mono text-right", render: (item: typeof mockKeywords[0]) => `${item.avgEvidence}%` },
    {
      key: "trend",
      header: "Trend",
      className: "font-mono text-right",
      render: (item: typeof mockKeywords[0]) => (
        <span className={item.trend > 0 ? 'text-green-600' : item.trend < 0 ? 'text-red-600' : ''}>
          {item.trend > 0 ? '↑' : item.trend < 0 ? '↓' : '→'} {Math.abs(item.trend).toFixed(1)}%
        </span>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Queries"
        description="Analyze query patterns, intents, domains, and keywords"
        actions={
          <div className="flex items-center gap-3">
            <select
              value={rangeFilter}
              onChange={(e) => setRangeFilter(e.target.value)}
              className="h-9 px-3 text-sm border border-border bg-background font-mono"
            >
              <option value="1d">Last 24h</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard 
            label="Total Queries" 
            value={mockStats.totalQueries.toLocaleString()}
            icon={<MessageSquare className="w-4 h-4" />}
            trend={{ value: 12.5, direction: "up" }}
          />
          <KPICard 
            label="Avg Tokens/Query" 
            value={mockStats.avgTokensPerQuery.toLocaleString()}
            icon={<Zap className="w-4 h-4" />}
            trend={{ value: 3.2, direction: "down" }}
          />
          <KPICard 
            label="Total Cost" 
            value={`$${mockStats.totalCost.toFixed(2)}`}
            icon={<DollarSign className="w-4 h-4" />}
            trend={{ value: 8.7, direction: "up" }}
          />
          <KPICard 
            label="Weak Evidence Rate" 
            value={`${mockStats.weakEvidenceRate}%`}
            icon={<AlertTriangle className="w-4 h-4" />}
            trend={{ value: 2.1, direction: "down" }}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="queries" className="space-y-4">
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="queries" className="gap-2 data-[state=active]:bg-background">
              <MessageSquare className="w-4 h-4" />
              Query Feed
            </TabsTrigger>
            <TabsTrigger value="intents" className="gap-2 data-[state=active]:bg-background">
              <TrendingUp className="w-4 h-4" />
              Intents
            </TabsTrigger>
            <TabsTrigger value="domains" className="gap-2 data-[state=active]:bg-background">
              <FileText className="w-4 h-4" />
              Domains
            </TabsTrigger>
            <TabsTrigger value="keywords" className="gap-2 data-[state=active]:bg-background">
              <Tag className="w-4 h-4" />
              Keywords
            </TabsTrigger>
          </TabsList>

          {/* Query Feed Tab */}
          <TabsContent value="queries" className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-4 p-4 bg-muted/50 border border-border">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search queries or users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                className="h-9 px-3 text-sm border border-border bg-background"
              >
                <option value="all">All Domains</option>
                {mockDomainData.map((d) => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
              <select
                value={intentFilter}
                onChange={(e) => setIntentFilter(e.target.value)}
                className="h-9 px-3 text-sm border border-border bg-background"
              >
                <option value="all">All Intents</option>
                {mockIntentData.map((i) => (
                  <option key={i.intent} value={i.intent}>{i.intent}</option>
                ))}
              </select>
              <select
                value={qualityFilter}
                onChange={(e) => setQualityFilter(e.target.value)}
                className="h-9 px-3 text-sm border border-border bg-background"
              >
                <option value="all">All Quality</option>
                <option value="adequate">Adequate</option>
                <option value="weak">Weak</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>

            <Section title="Recent Queries" description={`${filteredQueries.length} queries found`}>
              <DataTable columns={queryColumns} data={filteredQueries} emptyMessage="No queries found" />
            </Section>
          </TabsContent>

          {/* Intents Tab */}
          <TabsContent value="intents" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Intent Distribution">
                <div className="flex items-center gap-8">
                  <div className="w-40 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={mockIntentData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          dataKey="count"
                          stroke="none"
                        >
                          {mockIntentData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {mockIntentData.map((d, i) => (
                      <div key={d.intent} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3" style={{ backgroundColor: COLORS[i] }} />
                          <span className="font-mono">{d.intent}</span>
                        </div>
                        <span className="font-mono text-muted-foreground">{d.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
              <Section title="Intent Performance">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mockIntentData} layout="vertical" margin={{ left: 80 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="intent" tick={{ fontSize: 12 }} />
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
            </div>
            <Section title="Intent Analytics" description="Query volume and performance by intent">
              <DataTable columns={intentColumns} data={mockIntentData} emptyMessage="No intent data" />
            </Section>
          </TabsContent>

          {/* Domains Tab */}
          <TabsContent value="domains" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Domain Distribution">
                <div className="flex items-center gap-8">
                  <div className="w-40 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={mockDomainData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          dataKey="count"
                          stroke="none"
                        >
                          {mockDomainData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {mockDomainData.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3" style={{ backgroundColor: COLORS[i] }} />
                          <span className="font-mono">{d.name}</span>
                        </div>
                        <span className="font-mono text-muted-foreground">{d.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
              <Section title="Domain Cost Analysis">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mockDomainData} layout="vertical" margin={{ left: 80 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          background: "#fff",
                          border: "1px solid #e5e5e5",
                          fontSize: "12px",
                        }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, "Cost"]}
                      />
                      <Bar dataKey="totalCost" fill="#0a0a0a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            </div>
            <Section title="Domain Analytics" description="Query volume and performance by domain">
              <DataTable columns={domainColumns} data={mockDomainData} emptyMessage="No domain data" />
            </Section>
          </TabsContent>

          {/* Keywords Tab */}
          <TabsContent value="keywords" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Top Keywords (7 days)">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mockKeywords} layout="vertical" margin={{ left: 80 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="keyword" tick={{ fontSize: 12 }} />
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
              <Section title="Trending Keywords">
                <div className="space-y-3">
                  {mockKeywords
                    .filter(k => k.trend > 0)
                    .sort((a, b) => b.trend - a.trend)
                    .slice(0, 5)
                    .map((k) => (
                      <div key={k.keyword} className="flex items-center justify-between p-2 bg-muted/50">
                        <span className="font-mono">{k.keyword}</span>
                        <span className="font-mono text-green-600">↑ {k.trend.toFixed(1)}%</span>
                      </div>
                    ))}
                </div>
              </Section>
            </div>
            <Section title="Keyword Analytics" description="Most frequently used keywords in queries">
              <DataTable columns={keywordColumns} data={mockKeywords} emptyMessage="No keyword data" />
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
