/**
 * Intents Page - Dedicated intent analytics with drill-down
 * Swiss Brutalist Tech Design - White/Black Minimalist
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Zap, DollarSign, AlertTriangle, Download, ArrowRight, BarChart3 } from "lucide-react";
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
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { Link } from "wouter";

// Mock data
const mockIntentStats = {
  totalIntents: 14,
  totalQueries: 45678,
  avgTokensPerIntent: 1650,
  avgCostPerIntent: 0.0165,
};

const mockIntents = [
  { 
    intent: "extract", 
    count: 12456, 
    percentage: 27.3, 
    avgTokens: 1450, 
    avgLatency: 1800, 
    avgCost: 0.0145, 
    weakEvidenceRate: 8, 
    fallbackRate: 5,
    trend: 13.2,
    topOperators: ["locate_content", "extract", "search"],
    topDomains: ["finance", "legal", "general"],
    description: "Extract specific information from documents"
  },
  { 
    intent: "explain", 
    count: 8765, 
    percentage: 19.2, 
    avgTokens: 2100, 
    avgLatency: 2200, 
    avgCost: 0.021, 
    weakEvidenceRate: 12, 
    fallbackRate: 9,
    trend: -2.7,
    topOperators: ["explain", "elaborate"],
    topDomains: ["technical", "legal", "general"],
    description: "Explain concepts or sections in detail"
  },
  { 
    intent: "compare", 
    count: 6543, 
    percentage: 14.3, 
    avgTokens: 1800, 
    avgLatency: 2000, 
    avgCost: 0.018, 
    weakEvidenceRate: 6, 
    fallbackRate: 4,
    trend: 9.0,
    topOperators: ["compare", "contrast"],
    topDomains: ["product", "legal", "finance"],
    description: "Compare multiple items or documents"
  },
  { 
    intent: "summarize", 
    count: 5432, 
    percentage: 11.9, 
    avgTokens: 2500, 
    avgLatency: 2800, 
    avgCost: 0.025, 
    weakEvidenceRate: 15, 
    fallbackRate: 11,
    trend: 4.4,
    topOperators: ["summarize", "condense"],
    topDomains: ["general", "technical", "hr"],
    description: "Summarize documents or sections"
  },
  { 
    intent: "list", 
    count: 4321, 
    percentage: 9.5, 
    avgTokens: 1100, 
    avgLatency: 1400, 
    avgCost: 0.011, 
    weakEvidenceRate: 5, 
    fallbackRate: 3,
    trend: 6.7,
    topOperators: ["list", "enumerate"],
    topDomains: ["general", "product", "hr"],
    description: "List items, steps, or elements"
  },
  { 
    intent: "compute", 
    count: 3210, 
    percentage: 7.0, 
    avgTokens: 1300, 
    avgLatency: 1600, 
    avgCost: 0.013, 
    weakEvidenceRate: 4, 
    fallbackRate: 2,
    trend: 2.1,
    topOperators: ["compute", "calculate"],
    topDomains: ["finance", "technical"],
    description: "Perform calculations or computations"
  },
  { 
    intent: "validate", 
    count: 2109, 
    percentage: 4.6, 
    avgTokens: 1200, 
    avgLatency: 1500, 
    avgCost: 0.012, 
    weakEvidenceRate: 7, 
    fallbackRate: 5,
    trend: 8.3,
    topOperators: ["validate", "verify"],
    topDomains: ["legal", "finance", "compliance"],
    description: "Validate information or claims"
  },
  { 
    intent: "translate", 
    count: 1543, 
    percentage: 3.4, 
    avgTokens: 1600, 
    avgLatency: 1900, 
    avgCost: 0.016, 
    weakEvidenceRate: 3, 
    fallbackRate: 2,
    trend: 15.6,
    topOperators: ["translate"],
    topDomains: ["general", "legal"],
    description: "Translate content between languages"
  },
  { 
    intent: "generate", 
    count: 1234, 
    percentage: 2.7, 
    avgTokens: 2200, 
    avgLatency: 2500, 
    avgCost: 0.022, 
    weakEvidenceRate: 10, 
    fallbackRate: 8,
    trend: 22.4,
    topOperators: ["generate", "create"],
    topDomains: ["general", "marketing"],
    description: "Generate new content based on context"
  },
];

const mockTrendData = [
  { date: "Jan 20", extract: 1200, explain: 850, compare: 620, summarize: 510, list: 420 },
  { date: "Jan 21", extract: 1350, explain: 890, compare: 680, summarize: 540, list: 450 },
  { date: "Jan 22", extract: 1180, explain: 820, compare: 590, summarize: 480, list: 390 },
  { date: "Jan 23", extract: 1420, explain: 910, compare: 720, summarize: 560, list: 470 },
  { date: "Jan 24", extract: 1550, explain: 950, compare: 750, summarize: 590, list: 500 },
  { date: "Jan 25", extract: 1380, explain: 880, compare: 690, summarize: 520, list: 440 },
  { date: "Jan 26", extract: 1480, explain: 920, compare: 710, summarize: 550, list: 460 },
];

const COLORS = ["#0a0a0a", "#262626", "#404040", "#525252", "#737373", "#a3a3a3", "#d4d4d4", "#e5e5e5", "#f5f5f5"];

export default function Intents() {
  const [rangeFilter, setRangeFilter] = useState<string>("7d");
  const [selectedIntent, setSelectedIntent] = useState<string | null>(null);

  const intentColumns = [
    { 
      key: "intent", 
      header: "Intent", 
      render: (item: typeof mockIntents[0]) => (
        <div>
          <span className="font-mono font-medium">{item.intent}</span>
          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
        </div>
      )
    },
    { key: "count", header: "Queries", className: "font-mono text-right", render: (item: typeof mockIntents[0]) => item.count.toLocaleString() },
    { key: "percentage", header: "Share", className: "font-mono text-right", render: (item: typeof mockIntents[0]) => `${item.percentage.toFixed(1)}%` },
    { key: "avgTokens", header: "Avg Tokens", className: "font-mono text-right", render: (item: typeof mockIntents[0]) => item.avgTokens.toLocaleString() },
    { key: "avgLatency", header: "Avg Latency", className: "font-mono text-right", render: (item: typeof mockIntents[0]) => `${item.avgLatency}ms` },
    { key: "avgCost", header: "Avg Cost", className: "font-mono text-right", render: (item: typeof mockIntents[0]) => `$${item.avgCost.toFixed(4)}` },
    { 
      key: "weakEvidenceRate", 
      header: "Weak Evidence", 
      className: "font-mono text-right",
      render: (item: typeof mockIntents[0]) => (
        <span className={item.weakEvidenceRate > 10 ? 'text-red-600' : ''}>
          {item.weakEvidenceRate}%
        </span>
      )
    },
    { 
      key: "fallbackRate", 
      header: "Fallback", 
      className: "font-mono text-right",
      render: (item: typeof mockIntents[0]) => (
        <span className={item.fallbackRate > 8 ? 'text-red-600' : ''}>
          {item.fallbackRate}%
        </span>
      )
    },
    {
      key: "trend",
      header: "Trend",
      className: "font-mono text-right",
      render: (item: typeof mockIntents[0]) => (
        <span className={item.trend > 0 ? 'text-green-600' : item.trend < 0 ? 'text-red-600' : ''}>
          {item.trend > 0 ? '↑' : item.trend < 0 ? '↓' : '→'} {Math.abs(item.trend).toFixed(1)}%
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (item: typeof mockIntents[0]) => (
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-1"
          onClick={() => setSelectedIntent(item.intent)}
        >
          Details <ArrowRight className="w-3 h-3" />
        </Button>
      ),
    },
  ];

  const selectedIntentData = selectedIntent ? mockIntents.find(i => i.intent === selectedIntent) : null;

  return (
    <AdminLayout>
      <PageHeader
        title="Intents"
        description="Analyze query intents, performance, and trends"
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
              Export
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard 
            label="Total Intent Types" 
            value={mockIntentStats.totalIntents}
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <KPICard 
            label="Total Queries" 
            value={mockIntentStats.totalQueries.toLocaleString()}
            icon={<BarChart3 className="w-4 h-4" />}
            trend={{ value: 12.5 }}
          />
          <KPICard 
            label="Avg Tokens/Intent" 
            value={mockIntentStats.avgTokensPerIntent.toLocaleString()}
            icon={<Zap className="w-4 h-4" />}
          />
          <KPICard 
            label="Avg Cost/Intent" 
            value={`$${mockIntentStats.avgCostPerIntent.toFixed(4)}`}
            icon={<DollarSign className="w-4 h-4" />}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-background">
              Overview
            </TabsTrigger>
            <TabsTrigger value="trends" className="gap-2 data-[state=active]:bg-background">
              Trends
            </TabsTrigger>
            <TabsTrigger value="performance" className="gap-2 data-[state=active]:bg-background">
              Performance
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Distribution Chart */}
              <Section title="Intent Distribution">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={mockIntents}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        dataKey="count"
                        stroke="none"
                      >
                        {mockIntents.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => [value.toLocaleString(), "Queries"]}
                        contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {mockIntents.slice(0, 6).map((intent, i) => (
                    <div key={intent.intent} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3" style={{ backgroundColor: COLORS[i] }} />
                      <span className="font-mono">{intent.intent}</span>
                      <span className="text-muted-foreground ml-auto">{intent.percentage}%</span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Top Intents by Volume */}
              <Section title="Top Intents by Volume" className="lg:col-span-2">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mockIntents.slice(0, 6)} layout="vertical" margin={{ left: 80 }}>
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="intent" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                        formatter={(value: number) => [value.toLocaleString(), "Queries"]}
                      />
                      <Bar dataKey="count" fill="#0a0a0a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            </div>

            {/* Intent Table */}
            <Section title="All Intents" description="Complete intent analytics with drill-down">
              <DataTable 
                columns={intentColumns} 
                data={mockIntents} 
                emptyMessage="No intent data" 
              />
            </Section>
          </TabsContent>

          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-6">
            <Section title="Intent Volume Over Time" description="Daily query volume by top intents">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mockTrendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                    />
                    <Line type="monotone" dataKey="extract" stroke="#0a0a0a" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="explain" stroke="#404040" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="compare" stroke="#737373" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="summarize" stroke="#a3a3a3" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="list" stroke="#d4d4d4" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#0a0a0a]" /><span className="text-sm">extract</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#404040]" /><span className="text-sm">explain</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#737373]" /><span className="text-sm">compare</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#a3a3a3]" /><span className="text-sm">summarize</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#d4d4d4]" /><span className="text-sm">list</span></div>
              </div>
            </Section>

            {/* Trending Intents */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Rising Intents" description="Intents with increasing volume">
                <div className="space-y-3">
                  {mockIntents
                    .filter(i => i.trend > 0)
                    .sort((a, b) => b.trend - a.trend)
                    .slice(0, 5)
                    .map((intent) => (
                      <div key={intent.intent} className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                        <div>
                          <span className="font-mono font-medium">{intent.intent}</span>
                          <span className="text-sm text-muted-foreground ml-2">{intent.count.toLocaleString()} queries</span>
                        </div>
                        <span className="font-mono text-green-600">↑ {intent.trend.toFixed(1)}%</span>
                      </div>
                    ))}
                </div>
              </Section>
              <Section title="Declining Intents" description="Intents with decreasing volume">
                <div className="space-y-3">
                  {mockIntents
                    .filter(i => i.trend < 0)
                    .sort((a, b) => a.trend - b.trend)
                    .slice(0, 5)
                    .map((intent) => (
                      <div key={intent.intent} className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                        <div>
                          <span className="font-mono font-medium">{intent.intent}</span>
                          <span className="text-sm text-muted-foreground ml-2">{intent.count.toLocaleString()} queries</span>
                        </div>
                        <span className="font-mono text-red-600">↓ {Math.abs(intent.trend).toFixed(1)}%</span>
                      </div>
                    ))}
                  {mockIntents.filter(i => i.trend < 0).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No declining intents</p>
                  )}
                </div>
              </Section>
            </div>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Weak Evidence Rate by Intent" description="Intents with highest weak evidence rates">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={mockIntents.sort((a, b) => b.weakEvidenceRate - a.weakEvidenceRate).slice(0, 6)} 
                      layout="vertical" 
                      margin={{ left: 80 }}
                    >
                      <XAxis type="number" domain={[0, 20]} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="intent" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                        formatter={(value: number) => [`${value}%`, "Weak Evidence Rate"]}
                      />
                      <Bar dataKey="weakEvidenceRate" fill="#dc2626" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
              <Section title="Fallback Rate by Intent" description="Intents with highest fallback rates">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={mockIntents.sort((a, b) => b.fallbackRate - a.fallbackRate).slice(0, 6)} 
                      layout="vertical" 
                      margin={{ left: 80 }}
                    >
                      <XAxis type="number" domain={[0, 15]} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="intent" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                        formatter={(value: number) => [`${value}%`, "Fallback Rate"]}
                      />
                      <Bar dataKey="fallbackRate" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            </div>

            <Section title="Cost Efficiency by Intent" description="Average cost and token usage per intent">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mockIntents} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="intent" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                    />
                    <Bar yAxisId="left" dataKey="avgTokens" fill="#0a0a0a" name="Avg Tokens" />
                    <Bar yAxisId="right" dataKey="avgCost" fill="#737373" name="Avg Cost" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </TabsContent>
        </Tabs>

        {/* Intent Detail Modal/Drawer */}
        {selectedIntentData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedIntent(null)}>
            <div className="bg-background border border-border p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-semibold font-mono">{selectedIntentData.intent}</h2>
                  <p className="text-muted-foreground">{selectedIntentData.description}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIntent(null)}>✕</Button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Total Queries</p>
                  <p className="text-2xl font-mono">{selectedIntentData.count.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Share</p>
                  <p className="text-2xl font-mono">{selectedIntentData.percentage}%</p>
                </div>
                <div className="p-4 bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Avg Tokens</p>
                  <p className="text-2xl font-mono">{selectedIntentData.avgTokens.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Avg Cost</p>
                  <p className="text-2xl font-mono">${selectedIntentData.avgCost.toFixed(4)}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Top Operators</p>
                  <div className="flex gap-2">
                    {selectedIntentData.topOperators.map(op => (
                      <span key={op} className="px-2 py-1 bg-foreground text-background text-xs font-mono">{op}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Top Domains</p>
                  <div className="flex gap-2">
                    {selectedIntentData.topDomains.map(domain => (
                      <StatusBadge key={domain} variant="info">{domain}</StatusBadge>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Weak Evidence Rate</p>
                    <p className={`text-xl font-mono ${selectedIntentData.weakEvidenceRate > 10 ? 'text-red-600' : ''}`}>
                      {selectedIntentData.weakEvidenceRate}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Fallback Rate</p>
                    <p className={`text-xl font-mono ${selectedIntentData.fallbackRate > 8 ? 'text-red-600' : ''}`}>
                      {selectedIntentData.fallbackRate}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-border">
                <Link href={`/admin/queries?intent=${selectedIntentData.intent}`}>
                  <Button className="w-full gap-2">
                    View All Queries <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
