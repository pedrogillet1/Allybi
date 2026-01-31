/**
 * Keywords/SEO Page - Keyword analytics, trending, and SEO insights
 * Swiss Brutalist Tech Design - White/Black Minimalist
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tag, TrendingUp, Search, Download, ArrowUp, ArrowDown, Minus, BarChart3 } from "lucide-react";
import {
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
const mockKeywordStats = {
  totalKeywords: 1847,
  uniqueKeywordsToday: 234,
  avgKeywordsPerQuery: 3.2,
  trendingCount: 45,
};

const mockKeywords = [
  { keyword: "revenue", count: 2456, trend: 20.0, trendDirection: "up", domains: ["finance"], intents: ["extract", "compute"], avgEvidence: 87, queries: 1234 },
  { keyword: "contract", count: 1987, trend: 10.3, trendDirection: "up", domains: ["legal"], intents: ["compare", "extract"], avgEvidence: 79, queries: 987 },
  { keyword: "quarterly", count: 1654, trend: 15.2, trendDirection: "up", domains: ["finance"], intents: ["extract", "summarize"], avgEvidence: 92, queries: 876 },
  { keyword: "compliance", count: 1432, trend: 8.5, trendDirection: "up", domains: ["legal", "compliance"], intents: ["validate", "extract"], avgEvidence: 85, queries: 765 },
  { keyword: "summary", count: 1298, trend: 4.6, trendDirection: "up", domains: ["general"], intents: ["summarize"], avgEvidence: 88, queries: 654 },
  { keyword: "deadline", count: 1156, trend: -4.8, trendDirection: "down", domains: ["general", "product"], intents: ["extract"], avgEvidence: 82, queries: 543 },
  { keyword: "expenses", count: 1087, trend: 17.0, trendDirection: "up", domains: ["finance"], intents: ["compute", "extract"], avgEvidence: 91, queries: 498 },
  { keyword: "NDA", count: 976, trend: 8.5, trendDirection: "up", domains: ["legal"], intents: ["extract", "compare"], avgEvidence: 89, queries: 432 },
  { keyword: "methodology", count: 854, trend: 3.2, trendDirection: "up", domains: ["technical"], intents: ["explain"], avgEvidence: 84, queries: 387 },
  { keyword: "action items", count: 765, trend: -2.1, trendDirection: "down", domains: ["general"], intents: ["list"], avgEvidence: 76, queries: 345 },
  { keyword: "budget", count: 698, trend: 12.4, trendDirection: "up", domains: ["finance"], intents: ["extract", "compute"], avgEvidence: 90, queries: 312 },
  { keyword: "performance", count: 654, trend: 6.7, trendDirection: "up", domains: ["product", "hr"], intents: ["compare", "extract"], avgEvidence: 83, queries: 298 },
  { keyword: "policy", count: 612, trend: -1.5, trendDirection: "down", domains: ["hr", "legal"], intents: ["extract"], avgEvidence: 94, queries: 276 },
  { keyword: "architecture", count: 543, trend: 9.8, trendDirection: "up", domains: ["technical"], intents: ["explain", "extract"], avgEvidence: 81, queries: 234 },
  { keyword: "GDPR", count: 498, trend: 22.3, trendDirection: "up", domains: ["compliance", "legal"], intents: ["validate", "extract"], avgEvidence: 88, queries: 212 },
];

const mockTrendingKeywords = [
  { keyword: "GDPR", trend: 22.3, count: 498, isNew: false },
  { keyword: "revenue", trend: 20.0, count: 2456, isNew: false },
  { keyword: "expenses", trend: 17.0, count: 1087, isNew: false },
  { keyword: "quarterly", trend: 15.2, count: 1654, isNew: false },
  { keyword: "budget", trend: 12.4, count: 698, isNew: false },
  { keyword: "AI integration", trend: 45.6, count: 156, isNew: true },
  { keyword: "automation", trend: 38.2, count: 234, isNew: true },
  { keyword: "sustainability", trend: 32.1, count: 189, isNew: true },
];

const mockNewKeywords = [
  { keyword: "AI integration", count: 156, firstSeen: "2025-01-25", domains: ["technical", "product"] },
  { keyword: "automation", count: 234, firstSeen: "2025-01-24", domains: ["technical", "general"] },
  { keyword: "sustainability", count: 189, firstSeen: "2025-01-23", domains: ["compliance", "general"] },
  { keyword: "carbon footprint", count: 87, firstSeen: "2025-01-22", domains: ["compliance"] },
  { keyword: "hybrid work", count: 123, firstSeen: "2025-01-21", domains: ["hr", "general"] },
];

const mockKeywordTrends = [
  { date: "Jan 20", revenue: 320, contract: 280, quarterly: 210, compliance: 180, summary: 160 },
  { date: "Jan 21", revenue: 350, contract: 290, quarterly: 240, compliance: 195, summary: 170 },
  { date: "Jan 22", revenue: 310, contract: 260, quarterly: 200, compliance: 170, summary: 150 },
  { date: "Jan 23", revenue: 380, contract: 310, quarterly: 260, compliance: 210, summary: 180 },
  { date: "Jan 24", revenue: 420, contract: 340, quarterly: 290, compliance: 230, summary: 195 },
  { date: "Jan 25", revenue: 390, contract: 300, quarterly: 250, compliance: 200, summary: 175 },
  { date: "Jan 26", revenue: 410, contract: 320, quarterly: 270, compliance: 220, summary: 185 },
];

export default function Keywords() {
  const [rangeFilter, setRangeFilter] = useState<string>("7d");
  const [searchQuery, setSearchQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");

  const filteredKeywords = mockKeywords.filter(k => {
    const matchesSearch = k.keyword.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDomain = domainFilter === "all" || k.domains.includes(domainFilter);
    return matchesSearch && matchesDomain;
  });

  const keywordColumns = [
    { 
      key: "keyword", 
      header: "Keyword", 
      render: (item: typeof mockKeywords[0]) => (
        <span className="font-mono font-medium">{item.keyword}</span>
      )
    },
    { key: "count", header: "Total Uses", className: "font-mono text-right", render: (item: typeof mockKeywords[0]) => item.count.toLocaleString() },
    { key: "queries", header: "Queries", className: "font-mono text-right", render: (item: typeof mockKeywords[0]) => item.queries.toLocaleString() },
    { 
      key: "domains", 
      header: "Domains", 
      render: (item: typeof mockKeywords[0]) => (
        <div className="flex gap-1 flex-wrap">
          {item.domains.map(d => (
            <StatusBadge key={d} variant="info">{d}</StatusBadge>
          ))}
        </div>
      )
    },
    { 
      key: "intents", 
      header: "Intents", 
      render: (item: typeof mockKeywords[0]) => (
        <div className="flex gap-1 flex-wrap">
          {item.intents.map(i => (
            <span key={i} className="text-xs bg-muted px-1.5 py-0.5 font-mono">{i}</span>
          ))}
        </div>
      )
    },
    { 
      key: "avgEvidence", 
      header: "Avg Evidence", 
      className: "font-mono text-right",
      render: (item: typeof mockKeywords[0]) => (
        <span className={item.avgEvidence < 80 ? 'text-yellow-600' : ''}>{item.avgEvidence}%</span>
      )
    },
    {
      key: "trend",
      header: "Trend (7d)",
      className: "font-mono text-right",
      render: (item: typeof mockKeywords[0]) => (
        <div className="flex items-center justify-end gap-1">
          {item.trendDirection === "up" ? (
            <ArrowUp className="w-3 h-3 text-green-600" />
          ) : item.trendDirection === "down" ? (
            <ArrowDown className="w-3 h-3 text-red-600" />
          ) : (
            <Minus className="w-3 h-3 text-muted-foreground" />
          )}
          <span className={item.trendDirection === "up" ? 'text-green-600' : item.trendDirection === "down" ? 'text-red-600' : ''}>
            {Math.abs(item.trend).toFixed(1)}%
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (item: typeof mockKeywords[0]) => (
        <Link href={`/admin/queries?keyword=${encodeURIComponent(item.keyword)}`}>
          <Button variant="ghost" size="sm">View Queries</Button>
        </Link>
      ),
    },
  ];

  const trendingColumns = [
    { 
      key: "keyword", 
      header: "Keyword", 
      render: (item: typeof mockTrendingKeywords[0]) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{item.keyword}</span>
          {item.isNew && <StatusBadge variant="success">NEW</StatusBadge>}
        </div>
      )
    },
    { key: "count", header: "Uses", className: "font-mono text-right", render: (item: typeof mockTrendingKeywords[0]) => item.count.toLocaleString() },
    {
      key: "trend",
      header: "Growth",
      className: "font-mono text-right",
      render: (item: typeof mockTrendingKeywords[0]) => (
        <span className="text-green-600 flex items-center justify-end gap-1">
          <ArrowUp className="w-3 h-3" />
          {item.trend.toFixed(1)}%
        </span>
      ),
    },
  ];

  const newKeywordColumns = [
    { key: "keyword", header: "Keyword", render: (item: typeof mockNewKeywords[0]) => <span className="font-mono font-medium">{item.keyword}</span> },
    { key: "count", header: "Uses", className: "font-mono text-right", render: (item: typeof mockNewKeywords[0]) => item.count.toLocaleString() },
    { key: "firstSeen", header: "First Seen", className: "font-mono", render: (item: typeof mockNewKeywords[0]) => item.firstSeen },
    { 
      key: "domains", 
      header: "Domains", 
      render: (item: typeof mockNewKeywords[0]) => (
        <div className="flex gap-1 flex-wrap">
          {item.domains.map(d => (
            <StatusBadge key={d} variant="info">{d}</StatusBadge>
          ))}
        </div>
      )
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Keywords"
        description="Analyze keyword usage, trends, and SEO insights"
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
            label="Total Keywords" 
            value={mockKeywordStats.totalKeywords.toLocaleString()}
            icon={<Tag className="w-4 h-4" />}
          />
          <KPICard 
            label="Unique Today" 
            value={mockKeywordStats.uniqueKeywordsToday}
            icon={<BarChart3 className="w-4 h-4" />}
            trend={{ value: 8.5 }}
          />
          <KPICard 
            label="Avg per Query" 
            value={mockKeywordStats.avgKeywordsPerQuery.toFixed(1)}
            icon={<Search className="w-4 h-4" />}
          />
          <KPICard 
            label="Trending" 
            value={mockKeywordStats.trendingCount}
            icon={<TrendingUp className="w-4 h-4" />}
            trend={{ value: 12.3 }}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="all" className="gap-2 data-[state=active]:bg-background">
              All Keywords
            </TabsTrigger>
            <TabsTrigger value="trending" className="gap-2 data-[state=active]:bg-background">
              Trending
            </TabsTrigger>
            <TabsTrigger value="new" className="gap-2 data-[state=active]:bg-background">
              New Keywords
            </TabsTrigger>
            <TabsTrigger value="analysis" className="gap-2 data-[state=active]:bg-background">
              Analysis
            </TabsTrigger>
          </TabsList>

          {/* All Keywords Tab */}
          <TabsContent value="all" className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-4 p-4 bg-muted/50 border border-border">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search keywords..."
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
                <option value="finance">Finance</option>
                <option value="legal">Legal</option>
                <option value="general">General</option>
                <option value="technical">Technical</option>
                <option value="product">Product</option>
                <option value="hr">HR</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>

            {/* Top Keywords Chart */}
            <Section title="Top Keywords by Usage">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filteredKeywords.slice(0, 10)} layout="vertical" margin={{ left: 100 }}>
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="keyword" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                      formatter={(value: number) => [value.toLocaleString(), "Uses"]}
                    />
                    <Bar dataKey="count" fill="#0a0a0a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="All Keywords" description={`${filteredKeywords.length} keywords found`}>
              <DataTable 
                columns={keywordColumns} 
                data={filteredKeywords} 
                emptyMessage="No keywords found" 
              />
            </Section>
          </TabsContent>

          {/* Trending Tab */}
          <TabsContent value="trending" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Fastest Growing Keywords" description="Keywords with highest growth rate">
                <DataTable 
                  columns={trendingColumns} 
                  data={mockTrendingKeywords} 
                  emptyMessage="No trending keywords" 
                />
              </Section>
              <Section title="Declining Keywords" description="Keywords losing popularity">
                <div className="space-y-3">
                  {mockKeywords
                    .filter(k => k.trendDirection === "down")
                    .sort((a, b) => a.trend - b.trend)
                    .slice(0, 5)
                    .map((k) => (
                      <div key={k.keyword} className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                        <div>
                          <span className="font-mono font-medium">{k.keyword}</span>
                          <span className="text-sm text-muted-foreground ml-2">{k.count.toLocaleString()} uses</span>
                        </div>
                        <span className="font-mono text-red-600 flex items-center gap-1">
                          <ArrowDown className="w-3 h-3" />
                          {Math.abs(k.trend).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                </div>
              </Section>
            </div>

            <Section title="Keyword Trends Over Time" description="Daily usage of top keywords">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mockKeywordTrends} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                    />
                    <Line type="monotone" dataKey="revenue" stroke="#0a0a0a" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="contract" stroke="#404040" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="quarterly" stroke="#737373" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="compliance" stroke="#a3a3a3" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="summary" stroke="#d4d4d4" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#0a0a0a]" /><span className="text-sm">revenue</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#404040]" /><span className="text-sm">contract</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#737373]" /><span className="text-sm">quarterly</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#a3a3a3]" /><span className="text-sm">compliance</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#d4d4d4]" /><span className="text-sm">summary</span></div>
              </div>
            </Section>
          </TabsContent>

          {/* New Keywords Tab */}
          <TabsContent value="new" className="space-y-6">
            <Section title="Recently Discovered Keywords" description="Keywords that appeared for the first time recently">
              <DataTable 
                columns={newKeywordColumns} 
                data={mockNewKeywords} 
                emptyMessage="No new keywords" 
              />
            </Section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="New Keyword Sources">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                    <span className="font-mono">technical</span>
                    <span className="font-mono text-muted-foreground">12 new keywords</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                    <span className="font-mono">compliance</span>
                    <span className="font-mono text-muted-foreground">8 new keywords</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                    <span className="font-mono">hr</span>
                    <span className="font-mono text-muted-foreground">5 new keywords</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                    <span className="font-mono">general</span>
                    <span className="font-mono text-muted-foreground">4 new keywords</span>
                  </div>
                </div>
              </Section>
              <Section title="Keyword Discovery Rate">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { day: "Mon", count: 12 },
                      { day: "Tue", count: 18 },
                      { day: "Wed", count: 8 },
                      { day: "Thu", count: 15 },
                      { day: "Fri", count: 22 },
                      { day: "Sat", count: 6 },
                      { day: "Sun", count: 4 },
                    ]}>
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                      />
                      <Bar dataKey="count" fill="#0a0a0a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            </div>
          </TabsContent>

          {/* Analysis Tab */}
          <TabsContent value="analysis" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Keywords by Domain">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { domain: "finance", count: 456 },
                      { domain: "legal", count: 342 },
                      { domain: "general", count: 298 },
                      { domain: "technical", count: 234 },
                      { domain: "product", count: 189 },
                      { domain: "hr", count: 156 },
                    ]} layout="vertical" margin={{ left: 80 }}>
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="domain" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                      />
                      <Bar dataKey="count" fill="#0a0a0a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
              <Section title="Keywords by Intent">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { intent: "extract", count: 567 },
                      { intent: "compare", count: 345 },
                      { intent: "summarize", count: 289 },
                      { intent: "explain", count: 234 },
                      { intent: "compute", count: 178 },
                      { intent: "list", count: 145 },
                    ]} layout="vertical" margin={{ left: 80 }}>
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="intent" tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                      />
                      <Bar dataKey="count" fill="#0a0a0a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>
            </div>

            <Section title="Keyword-Evidence Correlation" description="Keywords with lowest average evidence strength">
              <div className="space-y-3">
                {mockKeywords
                  .sort((a, b) => a.avgEvidence - b.avgEvidence)
                  .slice(0, 5)
                  .map((k) => (
                    <div key={k.keyword} className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                      <div className="flex items-center gap-4">
                        <span className="font-mono font-medium">{k.keyword}</span>
                        <div className="flex gap-1">
                          {k.domains.map(d => (
                            <StatusBadge key={d} variant="info">{d}</StatusBadge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">{k.count.toLocaleString()} uses</span>
                        <span className={`font-mono ${k.avgEvidence < 80 ? 'text-yellow-600' : ''}`}>
                          {k.avgEvidence}% evidence
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
