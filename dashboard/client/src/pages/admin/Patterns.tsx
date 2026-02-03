/**
 * Patterns Page - Detect and analyze recurring query patterns
 * Swiss Brutalist Tech Design - White/Black Minimalist
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Repeat, TrendingUp, AlertTriangle, Users, Download, ArrowRight, Clock } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Link } from "wouter";

// Mock data
const mockPatternStats = {
  totalPatterns: 156,
  activePatterns: 89,
  avgQueriesPerPattern: 12.4,
  topPatternHits: 234,
};

const mockPatterns = [
  { 
    id: "p_001",
    pattern: "What is the {metric} for {period}?",
    category: "data_extraction",
    matches: 2456,
    uniqueUsers: 145,
    avgEvidence: 87,
    avgTokens: 1450,
    avgCost: 0.0145,
    domains: ["finance", "product"],
    intents: ["extract"],
    examples: ["What is the revenue for Q4?", "What is the growth rate for 2024?"],
    trend: 15.2,
    lastSeen: "2025-01-27 14:32:15",
  },
  { 
    id: "p_002",
    pattern: "Compare {item_a} and {item_b}",
    category: "comparison",
    matches: 1876,
    uniqueUsers: 98,
    avgEvidence: 82,
    avgTokens: 1800,
    avgCost: 0.018,
    domains: ["product", "legal"],
    intents: ["compare"],
    examples: ["Compare Product A and Product B", "Compare the two contracts"],
    trend: 8.7,
    lastSeen: "2025-01-27 14:28:45",
  },
  { 
    id: "p_003",
    pattern: "Summarize {document_type}",
    category: "summarization",
    matches: 1543,
    uniqueUsers: 112,
    avgEvidence: 91,
    avgTokens: 2200,
    avgCost: 0.022,
    domains: ["general", "legal"],
    intents: ["summarize"],
    examples: ["Summarize the meeting notes", "Summarize the contract"],
    trend: 4.3,
    lastSeen: "2025-01-27 14:25:12",
  },
  { 
    id: "p_004",
    pattern: "What are the {item_type} in {document}?",
    category: "extraction",
    matches: 1234,
    uniqueUsers: 87,
    avgEvidence: 79,
    avgTokens: 1350,
    avgCost: 0.0135,
    domains: ["legal", "general"],
    intents: ["extract", "list"],
    examples: ["What are the key terms in the NDA?", "What are the action items in the meeting?"],
    trend: -2.1,
    lastSeen: "2025-01-27 14:20:33",
  },
  { 
    id: "p_005",
    pattern: "Explain {concept} from {source}",
    category: "explanation",
    matches: 987,
    uniqueUsers: 76,
    avgEvidence: 85,
    avgTokens: 1900,
    avgCost: 0.019,
    domains: ["technical", "general"],
    intents: ["explain"],
    examples: ["Explain the methodology from the report", "Explain the architecture from the docs"],
    trend: 12.4,
    lastSeen: "2025-01-27 14:15:08",
  },
  { 
    id: "p_006",
    pattern: "Calculate {calculation} based on {data}",
    category: "computation",
    matches: 765,
    uniqueUsers: 54,
    avgEvidence: 93,
    avgTokens: 1200,
    avgCost: 0.012,
    domains: ["finance"],
    intents: ["compute"],
    examples: ["Calculate total expenses based on the report", "Calculate ROI based on the data"],
    trend: 6.8,
    lastSeen: "2025-01-27 14:10:22",
  },
  { 
    id: "p_007",
    pattern: "List all {items} from {source}",
    category: "listing",
    matches: 654,
    uniqueUsers: 67,
    avgEvidence: 88,
    avgTokens: 1100,
    avgCost: 0.011,
    domains: ["general", "hr"],
    intents: ["list"],
    examples: ["List all action items from the meeting", "List all benefits from the handbook"],
    trend: 3.2,
    lastSeen: "2025-01-27 14:05:45",
  },
  { 
    id: "p_008",
    pattern: "Find {information} about {topic}",
    category: "search",
    matches: 543,
    uniqueUsers: 89,
    avgEvidence: 72,
    avgTokens: 1400,
    avgCost: 0.014,
    domains: ["general"],
    intents: ["extract"],
    examples: ["Find information about the deadline", "Find details about the project"],
    trend: -5.4,
    lastSeen: "2025-01-27 14:00:18",
  },
];

const mockCategoryData = [
  { category: "data_extraction", count: 3456, percentage: 28 },
  { category: "comparison", count: 2345, percentage: 19 },
  { category: "summarization", count: 2100, percentage: 17 },
  { category: "extraction", count: 1876, percentage: 15 },
  { category: "explanation", count: 1234, percentage: 10 },
  { category: "computation", count: 876, percentage: 7 },
  { category: "listing", count: 543, percentage: 4 },
];

const COLORS = ["#0a0a0a", "#262626", "#404040", "#525252", "#737373", "#a3a3a3", "#d4d4d4"];

export default function Patterns() {
  const [rangeFilter, setRangeFilter] = useState<string>("30d");
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);

  const patternColumns = [
    { 
      key: "pattern", 
      header: "Pattern", 
      render: (item: typeof mockPatterns[0]) => (
        <div>
          <span className="font-mono text-sm">{item.pattern}</span>
          <div className="flex gap-1 mt-1">
            <StatusBadge variant="neutral">{item.category}</StatusBadge>
          </div>
        </div>
      )
    },
    { key: "matches", header: "Matches", className: "font-mono text-right", render: (item: typeof mockPatterns[0]) => item.matches.toLocaleString() },
    { key: "uniqueUsers", header: "Users", className: "font-mono text-right", render: (item: typeof mockPatterns[0]) => item.uniqueUsers },
    { 
      key: "domains", 
      header: "Domains", 
      render: (item: typeof mockPatterns[0]) => (
        <div className="flex gap-1 flex-wrap">
          {item.domains.slice(0, 2).map(d => (
            <StatusBadge key={d} variant="info">{d}</StatusBadge>
          ))}
          {item.domains.length > 2 && <span className="text-xs text-muted-foreground">+{item.domains.length - 2}</span>}
        </div>
      )
    },
    { 
      key: "avgEvidence", 
      header: "Avg Evidence", 
      className: "font-mono text-right",
      render: (item: typeof mockPatterns[0]) => (
        <span className={item.avgEvidence < 80 ? 'text-yellow-600' : ''}>{item.avgEvidence}%</span>
      )
    },
    { key: "avgCost", header: "Avg Cost", className: "font-mono text-right", render: (item: typeof mockPatterns[0]) => `$${item.avgCost.toFixed(4)}` },
    {
      key: "trend",
      header: "Trend",
      className: "font-mono text-right",
      render: (item: typeof mockPatterns[0]) => (
        <span className={item.trend > 0 ? 'text-green-600' : item.trend < 0 ? 'text-red-600' : ''}>
          {item.trend > 0 ? '↑' : item.trend < 0 ? '↓' : '→'} {Math.abs(item.trend).toFixed(1)}%
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (item: typeof mockPatterns[0]) => (
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-1"
          onClick={() => setSelectedPattern(item.id)}
        >
          Details <ArrowRight className="w-3 h-3" />
        </Button>
      ),
    },
  ];

  const selectedPatternData = selectedPattern ? mockPatterns.find(p => p.id === selectedPattern) : null;

  return (
    <AdminLayout>
      <PageHeader
        title="Patterns"
        description="Detect and analyze recurring query patterns"
        actions={
          <div className="flex items-center gap-3">
            <select
              value={rangeFilter}
              onChange={(e) => setRangeFilter(e.target.value)}
              className="h-9 px-3 text-sm border border-border bg-background font-mono"
            >
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
            label="Total Patterns" 
            value={mockPatternStats.totalPatterns}
            icon={<Repeat className="w-4 h-4" />}
          />
          <KPICard 
            label="Active Patterns" 
            value={mockPatternStats.activePatterns}
            icon={<TrendingUp className="w-4 h-4" />}
            trend={{ value: 8.5 }}
          />
          <KPICard 
            label="Avg Queries/Pattern" 
            value={mockPatternStats.avgQueriesPerPattern.toFixed(1)}
            icon={<Users className="w-4 h-4" />}
          />
          <KPICard 
            label="Top Pattern Hits" 
            value={mockPatternStats.topPatternHits}
            icon={<Clock className="w-4 h-4" />}
            trend={{ value: 15.2 }}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="all" className="gap-2 data-[state=active]:bg-background">
              All Patterns
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-2 data-[state=active]:bg-background">
              By Category
            </TabsTrigger>
            <TabsTrigger value="performance" className="gap-2 data-[state=active]:bg-background">
              Performance
            </TabsTrigger>
          </TabsList>

          {/* All Patterns Tab */}
          <TabsContent value="all" className="space-y-6">
            {/* Top Patterns Chart */}
            <Section title="Top Patterns by Usage">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mockPatterns.slice(0, 6)} layout="vertical" margin={{ left: 200 }}>
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="pattern" tick={{ fontSize: 10 }} width={180} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                      formatter={(value: number) => [value.toLocaleString(), "Matches"]}
                    />
                    <Bar dataKey="matches" fill="#0a0a0a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="All Patterns" description={`${mockPatterns.length} patterns detected`}>
              <DataTable 
                columns={patternColumns} 
                data={mockPatterns} 
                emptyMessage="No patterns found" 
              />
            </Section>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Pattern Categories">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={mockCategoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        dataKey="count"
                        stroke="none"
                      >
                        {mockCategoryData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => [value.toLocaleString(), "Matches"]}
                        contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", fontSize: "12px" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {mockCategoryData.map((cat, i) => (
                    <div key={cat.category} className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3" style={{ backgroundColor: COLORS[i] }} />
                      <span className="font-mono text-xs">{cat.category}</span>
                      <span className="text-muted-foreground ml-auto">{cat.percentage}%</span>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Category Performance">
                <div className="space-y-3">
                  {mockCategoryData.map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                      <div>
                        <span className="font-mono text-sm">{cat.category}</span>
                        <span className="text-sm text-muted-foreground ml-2">{cat.count.toLocaleString()} matches</span>
                      </div>
                      <span className="font-mono">{cat.percentage}%</span>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section title="Patterns with Weak Evidence" description="Patterns that often produce weak evidence">
                <div className="space-y-3">
                  {mockPatterns
                    .sort((a, b) => a.avgEvidence - b.avgEvidence)
                    .slice(0, 5)
                    .map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                        <div>
                          <span className="font-mono text-sm">{p.pattern}</span>
                          <span className="text-sm text-muted-foreground ml-2">{p.matches.toLocaleString()} matches</span>
                        </div>
                        <span className={`font-mono ${p.avgEvidence < 80 ? 'text-yellow-600' : ''}`}>
                          {p.avgEvidence}%
                        </span>
                      </div>
                    ))}
                </div>
              </Section>

              <Section title="Most Expensive Patterns" description="Patterns with highest average cost">
                <div className="space-y-3">
                  {mockPatterns
                    .sort((a, b) => b.avgCost - a.avgCost)
                    .slice(0, 5)
                    .map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                        <div>
                          <span className="font-mono text-sm">{p.pattern}</span>
                          <span className="text-sm text-muted-foreground ml-2">{p.matches.toLocaleString()} matches</span>
                        </div>
                        <span className="font-mono">${p.avgCost.toFixed(4)}</span>
                      </div>
                    ))}
                </div>
              </Section>
            </div>

            <Section title="Declining Patterns" description="Patterns with decreasing usage">
              <div className="space-y-3">
                {mockPatterns
                  .filter(p => p.trend < 0)
                  .sort((a, b) => a.trend - b.trend)
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 border border-border">
                      <div>
                        <span className="font-mono text-sm">{p.pattern}</span>
                        <div className="flex gap-1 mt-1">
                          {p.domains.map(d => (
                            <StatusBadge key={d} variant="info">{d}</StatusBadge>
                          ))}
                        </div>
                      </div>
                      <span className="font-mono text-red-600">↓ {Math.abs(p.trend).toFixed(1)}%</span>
                    </div>
                  ))}
                {mockPatterns.filter(p => p.trend < 0).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No declining patterns</p>
                )}
              </div>
            </Section>
          </TabsContent>
        </Tabs>

        {/* Pattern Detail Modal */}
        {selectedPatternData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedPattern(null)}>
            <div className="bg-background border border-border p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-mono">{selectedPatternData.pattern}</h2>
                  <StatusBadge variant="neutral" className="mt-1">{selectedPatternData.category}</StatusBadge>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedPattern(null)}>✕</Button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Total Matches</p>
                  <p className="text-2xl font-mono">{selectedPatternData.matches.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Unique Users</p>
                  <p className="text-2xl font-mono">{selectedPatternData.uniqueUsers}</p>
                </div>
                <div className="p-4 bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Avg Evidence</p>
                  <p className={`text-2xl font-mono ${selectedPatternData.avgEvidence < 80 ? 'text-yellow-600' : ''}`}>
                    {selectedPatternData.avgEvidence}%
                  </p>
                </div>
                <div className="p-4 bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground uppercase mb-1">Avg Cost</p>
                  <p className="text-2xl font-mono">${selectedPatternData.avgCost.toFixed(4)}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Example Queries</p>
                  <div className="space-y-2">
                    {selectedPatternData.examples.map((ex, i) => (
                      <div key={i} className="p-2 bg-muted/50 border border-border font-mono text-sm">
                        "{ex}"
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Domains</p>
                  <div className="flex gap-2">
                    {selectedPatternData.domains.map(d => (
                      <StatusBadge key={d} variant="info">{d}</StatusBadge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Intents</p>
                  <div className="flex gap-2">
                    {selectedPatternData.intents.map(i => (
                      <span key={i} className="px-2 py-1 bg-foreground text-background text-xs font-mono">{i}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Last Seen</p>
                  <p className="font-mono text-sm text-muted-foreground">{selectedPatternData.lastSeen}</p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-border">
                <Link href={`/admin/queries?pattern=${selectedPatternData.id}`}>
                  <Button className="w-full gap-2">
                    View Matching Queries <ArrowRight className="w-4 h-4" />
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
