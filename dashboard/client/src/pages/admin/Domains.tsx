/**
 * Domains Page - Dedicated domain analytics with drill-down and matrix
 * Swiss Brutalist Tech Design - White/Black Minimalist
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Zap, DollarSign, AlertTriangle, Download, ArrowRight, Grid3X3 } from "lucide-react";
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
const mockDomainStats = {
  totalDomains: 12,
  totalQueries: 45678,
  avgTokensPerDomain: 1720,
  totalCost: 87.90,
};

const mockDomains = [
  { 
    domain: "finance", 
    count: 12456, 
    percentage: 27.3, 
    avgTokens: 1650, 
    avgLatency: 1900, 
    totalCost: 24.50, 
    weakEvidenceRate: 7, 
    fallbackRate: 4,
    trend: 12.0,
    topIntents: ["extract", "compute", "compare"],
    topKeywords: ["revenue", "expenses", "quarterly", "budget"],
    fileCount: 234,
    description: "Financial reports, budgets, and fiscal data"
  },
  { 
    domain: "legal", 
    count: 8765, 
    percentage: 19.2, 
    avgTokens: 2200, 
    avgLatency: 2400, 
    totalCost: 21.70, 
    weakEvidenceRate: 14, 
    fallbackRate: 9,
    trend: 3.9,
    topIntents: ["extract", "compare", "validate"],
    topKeywords: ["contract", "NDA", "terms", "compliance"],
    fileCount: 189,
    description: "Contracts, legal documents, and compliance"
  },
  { 
    domain: "general", 
    count: 7654, 
    percentage: 16.8, 
    avgTokens: 1400, 
    avgLatency: 1600, 
    totalCost: 12.30, 
    weakEvidenceRate: 9, 
    fallbackRate: 6,
    trend: -1.2,
    topIntents: ["summarize", "list", "explain"],
    topKeywords: ["meeting", "notes", "summary", "action items"],
    fileCount: 456,
    description: "General documents and meeting notes"
  },
  { 
    domain: "technical", 
    count: 5432, 
    percentage: 11.9, 
    avgTokens: 1900, 
    avgLatency: 2200, 
    totalCost: 14.50, 
    weakEvidenceRate: 11, 
    fallbackRate: 7,
    trend: 5.9,
    topIntents: ["explain", "extract", "list"],
    topKeywords: ["methodology", "architecture", "API", "documentation"],
    fileCount: 123,
    description: "Technical documentation and specifications"
  },
  { 
    domain: "product", 
    count: 4321, 
    percentage: 9.5, 
    avgTokens: 1800, 
    avgLatency: 2000, 
    totalCost: 9.80, 
    weakEvidenceRate: 6, 
    fallbackRate: 4,
    trend: 8.6,
    topIntents: ["compare", "extract", "list"],
    topKeywords: ["feature", "performance", "comparison", "specs"],
    fileCount: 87,
    description: "Product documentation and comparisons"
  },
  { 
    domain: "hr", 
    count: 3210, 
    percentage: 7.0, 
    avgTokens: 1500, 
    avgLatency: 1700, 
    totalCost: 7.30, 
    weakEvidenceRate: 8, 
    fallbackRate: 5,
    trend: 2.1,
    topIntents: ["extract", "list", "summarize"],
    topKeywords: ["policy", "benefits", "employee", "handbook"],
    fileCount: 65,
    description: "HR policies and employee documentation"
  },
  { 
    domain: "compliance", 
    count: 2109, 
    percentage: 4.6, 
    avgTokens: 2100, 
    avgLatency: 2300, 
    totalCost: 5.20, 
    weakEvidenceRate: 5, 
    fallbackRate: 3,
    trend: 15.3,
    topIntents: ["validate", "extract", "compare"],
    topKeywords: ["GDPR", "SOC2", "audit", "regulation"],
    fileCount: 43,
    description: "Compliance and regulatory documents"
  },
  { 
    domain: "marketing", 
    count: 1543, 
    percentage: 3.4, 
    avgTokens: 1600, 
    avgLatency: 1800, 
    totalCost: 3.80, 
    weakEvidenceRate: 10, 
    fallbackRate: 8,
    trend: 22.4,
    topIntents: ["generate", "summarize", "extract"],
    topKeywords: ["campaign", "brand", "content", "analytics"],
    fileCount: 98,
    description: "Marketing materials and campaigns"
  },
];

const mockTrendData = [
  { date: "Jan 20", finance: 1200, legal: 850, general: 720, technical: 510, product: 420 },
  { date: "Jan 21", finance: 1350, legal: 890, general: 680, technical: 540, product: 450 },
  { date: "Jan 22", finance: 1180, legal: 820, general: 750, technical: 480, product: 390 },
  { date: "Jan 23", finance: 1420, legal: 910, general: 690, technical: 560, product: 470 },
  { date: "Jan 24", finance: 1550, legal: 950, general: 710, technical: 590, product: 500 },
  { date: "Jan 25", finance: 1380, legal: 880, general: 740, technical: 520, product: 440 },
  { date: "Jan 26", finance: 1480, legal: 920, general: 700, technical: 550, product: 460 },
];

// Domain-Intent Matrix
const mockMatrix = {
  domains: ["finance", "legal", "general", "technical", "product", "hr"],
  intents: ["extract", "explain", "compare", "summarize", "list", "compute"],
  data: [
    [3200, 1200, 2100, 800, 600, 1800], // finance
    [2800, 1500, 1800, 600, 400, 200],  // legal
    [1200, 1800, 800, 2200, 1400, 100], // general
    [1400, 2000, 600, 800, 500, 100],   // technical
    [1200, 600, 1800, 400, 300, 50],    // product
    [800, 400, 200, 600, 1000, 50],     // hr
  ],
};

const COLORS = ["#0a0a0a", "#262626", "#404040", "#525252", "#737373", "#a3a3a3", "#d4d4d4", "#e5e5e5"];

export default function Domains() {
  const [rangeFilter, setRangeFilter] = useState<string>("7d");
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  const domainColumns = [
    { 
      key: "domain", 
      header: "Domain", 
      render: (item: typeof mockDomains[0]) => (
        <div>
          <StatusBadge variant="info">{item.domain}</StatusBadge>
          <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
        </div>
      )
    },
    { key: "count", header: "Queries", className: "font-mono text-right", render: (item: typeof mockDomains[0]) => item.count.toLocaleString() },
    { key: "percentage", header: "Share", className: "font-mono text-right", render: (item: typeof mockDomains[0]) => `${item.percentage.toFixed(1)}%` },
    { key: "fileCount", header: "Files", className: "font-mono text-right", render: (item: typeof mockDomains[0]) => item.fileCount },
    { key: "avgTokens", header: "Avg Tokens", className: "font-mono text-right", render: (item: typeof mockDomains[0]) => item.avgTokens.toLocaleString() },
    { key: "totalCost", header: "Total Cost", className: "font-mono text-right", render: (item: typeof mockDomains[0]) => `$${item.totalCost.toFixed(2)}` },
    { 
      key: "weakEvidenceRate", 
      header: "Weak Evidence", 
      className: "font-mono text-right",
      render: (item: typeof mockDomains[0]) => (
        <span className={item.weakEvidenceRate > 10 ? 'text-red-600' : ''}>
          {item.weakEvidenceRate}%
        </span>
      )
    },
    {
      key: "trend",
      header: "Trend",
      className: "font-mono text-right",
      render: (item: typeof mockDomains[0]) => (
        <span className={item.trend > 0 ? 'text-green-600' : item.trend < 0 ? 'text-red-600' : ''}>
          {item.trend > 0 ? '↑' : item.trend < 0 ? '↓' : '→'} {Math.abs(item.trend).toFixed(1)}%
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (item: typeof mockDomains[0]) => (
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-1"
          onClick={() => setSelectedDomain(item.domain)}
        >
          Details <ArrowRight className="w-3 h-3" />
        </Button>
      ),
    },
  ];

  const selectedDomainData = selectedDomain ? mockDomains.find(d => d.domain === selectedDomain) : null;

  // Get max value for matrix heatmap
  const maxMatrixValue = Math.max(...mockMatrix.data.flat());

  return (
    <AdminLayout>
      <PageHeader
        title="Domains"
        description="Analyze query domains, performance, and domain-intent relationships"
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
            label="Total Domains" 
            value={mockDomainStats.totalDomains}
            icon={<FileText className="w-4 h-4" />}
          />
          <KPICard 
            label="Total Queries" 
            value={mockDomainStats.totalQueries.toLocaleString()}
            icon={<Grid3X3 className="w-4 h-4" />}
            trend={{ value: 12.5 }}
          />
          <KPICard 
            label="Avg Tokens/Domain" 
            value={mockDomainStats.avgTokensPerDomain.toLocaleString()}
            icon={<Zap className="w-4 h-4" />}
          />
          <KPICard 
            label="Total Cost" 
            value={`$${mockDomainStats.totalCost.toFixed(2)}`}
            icon={<DollarSign className="w-4 h-4" />}
            trend={{ value: 8.7 }}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-background">
              Overview
            </TabsTrigger>
            <TabsTrigger value="matrix" className="gap-2 data-[state=active]:bg-background">
              Domain-Intent Matrix
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
              <Section title="Domain Distribution">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={mockDomains}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        dataKey="count"
                        stroke="none"
                      >
                        {mockDomains.map((_, index) => (
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
                  {mockDomains.slice(0, 6).map((domain, i) => (
                    <div key={domain.domain} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3" style={{ backgroundColor: COLORS[i] }} />
                      <span className="font-mono">{domain.domain}</span>
                      <span className="text-muted-foreground ml-auto">{domain.percentage}%</span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Cost by Domain */}
              <Section title="Cost by Domain" className="lg:col-span-2">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mockDomains.slice(0, 6)} layout="vertical" margin={{ left: 80 }}>
                      <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                      <YAxis type="category" dataKey="domain" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, "Total Cost"]}
                      />
                      <Bar dataKey="totalCost" fill="#0a0a0a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            </div>

            {/* Domain Table */}
            <Section title="All Domains" description="Complete domain analytics with drill-down">
              <DataTable 
                columns={domainColumns} 
                data={mockDomains} 
                emptyMessage="No domain data" 
              />
            </Section>
          </TabsContent>

          {/* Matrix Tab */}
          <TabsContent value="matrix" className="space-y-6">
            <Section title="Domain-Intent Matrix" description="Query distribution across domains and intents">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground uppercase">Domain / Intent</th>
                      {mockMatrix.intents.map(intent => (
                        <th key={intent} className="p-2 text-center text-xs font-medium text-muted-foreground uppercase">{intent}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mockMatrix.domains.map((domain, di) => (
                      <tr key={domain} className="border-t border-border">
                        <td className="p-2 font-mono text-sm">{domain}</td>
                        {mockMatrix.data[di].map((value, ii) => {
                          const intensity = value / maxMatrixValue;
                          return (
                            <td key={ii} className="p-2 text-center">
                              <div 
                                className="w-full h-10 flex items-center justify-center font-mono text-xs"
                                style={{ 
                                  backgroundColor: `rgba(10, 10, 10, ${intensity * 0.8})`,
                                  color: intensity > 0.4 ? '#fff' : '#0a0a0a'
                                }}
                              >
                                {value.toLocaleString()}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end gap-4 mt-4">
                <span className="text-xs text-muted-foreground">Low</span>
                <div className="flex">
                  {[0.1, 0.3, 0.5, 0.7, 0.9].map(intensity => (
                    <div 
                      key={intensity}
                      className="w-8 h-4"
                      style={{ backgroundColor: `rgba(10, 10, 10, ${intensity * 0.8})` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">High</span>
              </div>
            </Section>
          </TabsContent>

          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-6">
            <Section title="Domain Volume Over Time" description="Daily query volume by top domains">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mockTrendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                    />
                    <Line type="monotone" dataKey="finance" stroke="#0a0a0a" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="legal" stroke="#404040" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="general" stroke="#737373" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="technical" stroke="#a3a3a3" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="product" stroke="#d4d4d4" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#0a0a0a]" /><span className="text-sm">finance</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#404040]" /><span className="text-sm">legal</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#737373]" /><span className="text-sm">general</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#a3a3a3]" /><span className="text-sm">technical</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#d4d4d4]" /><span className="text-sm">product</span></div>
              </div>
            </Section>

            {/* Trending Domains */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Rising Domains" description="Domains with increasing volume">
                <div className="space-y-3">
                  {mockDomains
                    .filter(d => d.trend > 0)
                    .sort((a, b) => b.trend - a.trend)
                    .slice(0, 5)
                    .map((domain) => (
                      <div key={domain.domain} className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                        <div>
                          <StatusBadge variant="info">{domain.domain}</StatusBadge>
                          <span className="text-sm text-muted-foreground ml-2">{domain.count.toLocaleString()} queries</span>
                        </div>
                        <span className="font-mono text-green-600">↑ {domain.trend.toFixed(1)}%</span>
                      </div>
                    ))}
                </div>
              </Section>
              <Section title="Declining Domains" description="Domains with decreasing volume">
                <div className="space-y-3">
                  {mockDomains
                    .filter(d => d.trend < 0)
                    .sort((a, b) => a.trend - b.trend)
                    .slice(0, 5)
                    .map((domain) => (
                      <div key={domain.domain} className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                        <div>
                          <StatusBadge variant="info">{domain.domain}</StatusBadge>
                          <span className="text-sm text-muted-foreground ml-2">{domain.count.toLocaleString()} queries</span>
                        </div>
                        <span className="font-mono text-red-600">↓ {Math.abs(domain.trend).toFixed(1)}%</span>
                      </div>
                    ))}
                  {mockDomains.filter(d => d.trend < 0).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No declining domains</p>
                  )}
                </div>
              </Section>
            </div>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Weak Evidence Rate by Domain" description="Domains with highest weak evidence rates">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={mockDomains.sort((a, b) => b.weakEvidenceRate - a.weakEvidenceRate).slice(0, 6)} 
                      layout="vertical" 
                      margin={{ left: 80 }}
                    >
                      <XAxis type="number" domain={[0, 20]} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="domain" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                        formatter={(value: number) => [`${value}%`, "Weak Evidence Rate"]}
                      />
                      <Bar dataKey="weakEvidenceRate" fill="#dc2626" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
              <Section title="Latency by Domain" description="Average response latency per domain">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={mockDomains.sort((a, b) => b.avgLatency - a.avgLatency).slice(0, 6)} 
                      layout="vertical" 
                      margin={{ left: 80 }}
                    >
                      <XAxis type="number" tickFormatter={(v) => `${v}ms`} />
                      <YAxis type="category" dataKey="domain" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                        formatter={(value: number) => [`${value}ms`, "Avg Latency"]}
                      />
                      <Bar dataKey="avgLatency" fill="#0a0a0a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            </div>
          </TabsContent>
        </Tabs>

        {/* Domain Detail Modal */}
        {selectedDomainData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedDomain(null)}>
            <div className="bg-background border border-border p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <StatusBadge variant="info" className="text-lg">{selectedDomainData.domain}</StatusBadge>
                  <p className="text-muted-foreground mt-1">{selectedDomainData.description}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedDomain(null)}>✕</Button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Total Queries</p>
                  <p className="text-2xl font-mono">{selectedDomainData.count.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Total Cost</p>
                  <p className="text-2xl font-mono">${selectedDomainData.totalCost.toFixed(2)}</p>
                </div>
                <div className="p-4 bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Files</p>
                  <p className="text-2xl font-mono">{selectedDomainData.fileCount}</p>
                </div>
                <div className="p-4 bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Avg Tokens</p>
                  <p className="text-2xl font-mono">{selectedDomainData.avgTokens.toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Top Intents</p>
                  <div className="flex gap-2">
                    {selectedDomainData.topIntents.map(intent => (
                      <span key={intent} className="px-2 py-1 bg-foreground text-background text-xs font-mono">{intent}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Top Keywords</p>
                  <div className="flex gap-2 flex-wrap">
                    {selectedDomainData.topKeywords.map(kw => (
                      <span key={kw} className="px-2 py-1 bg-muted text-xs font-mono">{kw}</span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Weak Evidence Rate</p>
                    <p className={`text-xl font-mono ${selectedDomainData.weakEvidenceRate > 10 ? 'text-red-600' : ''}`}>
                      {selectedDomainData.weakEvidenceRate}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Fallback Rate</p>
                    <p className={`text-xl font-mono ${selectedDomainData.fallbackRate > 8 ? 'text-red-600' : ''}`}>
                      {selectedDomainData.fallbackRate}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-border flex gap-3">
                <Link href={`/admin/queries?domain=${selectedDomainData.domain}`} className="flex-1">
                  <Button className="w-full gap-2">
                    View Queries <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href={`/admin/files?domain=${selectedDomainData.domain}`} className="flex-1">
                  <Button variant="outline" className="w-full gap-2">
                    View Files <ArrowRight className="w-4 h-4" />
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
