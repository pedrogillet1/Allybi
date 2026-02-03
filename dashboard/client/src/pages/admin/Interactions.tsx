/**
 * Interactions Page - Full trace/interaction drill-down
 * Swiss Brutalist Tech Design - White/Black Minimalist
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Clock, Zap, DollarSign, Search, Download, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "wouter";

// Mock data
const mockInteractionStats = {
  totalInteractions: 12456,
  avgDuration: 2340,
  avgSteps: 4.2,
  avgCost: 0.0187,
};

const mockInteractions = [
  { 
    traceId: "trace-001",
    userId: "u_***42",
    userName: "John Doe",
    query: "What was the Q4 revenue growth?",
    conversationId: "conv-001",
    startTime: "2025-01-27 14:32:15",
    endTime: "2025-01-27 14:32:17",
    durationMs: 1850,
    steps: 4,
    tokens: 1247,
    cost: 0.0124,
    outcome: "answered",
    evidenceStrength: 0.89,
    domain: "finance",
    intent: "extract",
    providers: ["gemini", "openai"],
    stages: [
      { stage: "intent_classification", durationMs: 120, tokens: 45, provider: "gemini", status: "success" },
      { stage: "retrieval", durationMs: 450, tokens: 0, provider: null, status: "success", chunksRetrieved: 12 },
      { stage: "reranking", durationMs: 180, tokens: 200, provider: "openai", status: "success", chunksKept: 4 },
      { stage: "generation", durationMs: 1100, tokens: 1002, provider: "openai", status: "success" },
    ],
  },
  { 
    traceId: "trace-002",
    userId: "u_***17",
    userName: "Jane Smith",
    query: "Compare the two contract versions",
    conversationId: "conv-002",
    startTime: "2025-01-27 14:28:45",
    endTime: "2025-01-27 14:28:48",
    durationMs: 2340,
    steps: 5,
    tokens: 2156,
    cost: 0.0215,
    outcome: "answered",
    evidenceStrength: 0.72,
    domain: "legal",
    intent: "compare",
    providers: ["openai"],
    stages: [
      { stage: "intent_classification", durationMs: 110, tokens: 42, provider: "gemini", status: "success" },
      { stage: "retrieval", durationMs: 520, tokens: 0, provider: null, status: "success", chunksRetrieved: 18 },
      { stage: "reranking", durationMs: 210, tokens: 280, provider: "openai", status: "success", chunksKept: 6 },
      { stage: "evidence_check", durationMs: 150, tokens: 120, provider: "openai", status: "warning", message: "Weak evidence detected" },
      { stage: "generation", durationMs: 1350, tokens: 1714, provider: "openai", status: "success" },
    ],
  },
  { 
    traceId: "trace-003",
    userId: "u_***89",
    userName: "Mike Johnson",
    query: "Summarize the meeting notes",
    conversationId: "conv-003",
    startTime: "2025-01-27 14:25:12",
    endTime: "2025-01-27 14:25:14",
    durationMs: 2100,
    steps: 4,
    tokens: 1834,
    cost: 0.0183,
    outcome: "answered",
    evidenceStrength: 0.95,
    domain: "general",
    intent: "summarize",
    providers: ["gemini", "openai", "anthropic"],
    stages: [
      { stage: "intent_classification", durationMs: 105, tokens: 38, provider: "gemini", status: "success" },
      { stage: "retrieval", durationMs: 480, tokens: 0, provider: null, status: "success", chunksRetrieved: 8 },
      { stage: "reranking", durationMs: 195, tokens: 240, provider: "openai", status: "success", chunksKept: 8 },
      { stage: "generation", durationMs: 1320, tokens: 1556, provider: "anthropic", status: "success" },
    ],
  },
  { 
    traceId: "trace-004",
    userId: "u_***33",
    userName: "Sarah Wilson",
    query: "Find the deadline for the project",
    conversationId: "conv-004",
    startTime: "2025-01-27 14:20:33",
    endTime: "2025-01-27 14:20:35",
    durationMs: 1200,
    steps: 5,
    tokens: 987,
    cost: 0.0098,
    outcome: "fallback",
    evidenceStrength: 0.34,
    domain: "general",
    intent: "extract",
    providers: ["gemini"],
    stages: [
      { stage: "intent_classification", durationMs: 95, tokens: 35, provider: "gemini", status: "success" },
      { stage: "retrieval", durationMs: 380, tokens: 0, provider: null, status: "success", chunksRetrieved: 3 },
      { stage: "reranking", durationMs: 140, tokens: 150, provider: "gemini", status: "success", chunksKept: 2 },
      { stage: "evidence_check", durationMs: 85, tokens: 80, provider: "gemini", status: "error", message: "Insufficient evidence" },
      { stage: "fallback", durationMs: 500, tokens: 722, provider: "gemini", status: "success", fallbackType: "ask_question" },
    ],
  },
  { 
    traceId: "trace-005",
    userId: "u_***56",
    userName: "Tom Brown",
    query: "What are the key terms in the NDA?",
    conversationId: "conv-005",
    startTime: "2025-01-27 14:15:08",
    endTime: "2025-01-27 14:15:10",
    durationMs: 1650,
    steps: 4,
    tokens: 1456,
    cost: 0.0145,
    outcome: "answered",
    evidenceStrength: 0.85,
    domain: "legal",
    intent: "extract",
    providers: ["openai"],
    stages: [
      { stage: "intent_classification", durationMs: 100, tokens: 40, provider: "gemini", status: "success" },
      { stage: "retrieval", durationMs: 420, tokens: 0, provider: null, status: "success", chunksRetrieved: 10 },
      { stage: "reranking", durationMs: 170, tokens: 220, provider: "openai", status: "success", chunksKept: 3 },
      { stage: "generation", durationMs: 960, tokens: 1196, provider: "openai", status: "success" },
    ],
  },
];

type Stage = {
  stage: string;
  durationMs: number;
  tokens: number;
  provider: string | null;
  status: string;
  chunksRetrieved?: number;
  chunksKept?: number;
  message?: string;
  fallbackType?: string;
};

export default function Interactions() {
  const [rangeFilter, setRangeFilter] = useState<string>("7d");
  const [searchQuery, setSearchQuery] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);

  const filteredInteractions = mockInteractions.filter(i => {
    const matchesSearch = i.query.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.traceId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOutcome = outcomeFilter === "all" || i.outcome === outcomeFilter;
    return matchesSearch && matchesOutcome;
  });

  const getStageStatusColor = (status: string) => {
    switch (status) {
      case "success": return "bg-green-100 text-green-800";
      case "warning": return "bg-yellow-100 text-yellow-800";
      case "error": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Interactions"
        description="Full trace and interaction drill-down"
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
            label="Total Interactions" 
            value={mockInteractionStats.totalInteractions.toLocaleString()}
            icon={<MessageSquare className="w-4 h-4" />}
            trend={{ value: 12.5 }}
          />
          <KPICard 
            label="Avg Duration" 
            value={`${mockInteractionStats.avgDuration}ms`}
            icon={<Clock className="w-4 h-4" />}
          />
          <KPICard 
            label="Avg Steps" 
            value={mockInteractionStats.avgSteps.toFixed(1)}
            icon={<Zap className="w-4 h-4" />}
          />
          <KPICard 
            label="Avg Cost" 
            value={`$${mockInteractionStats.avgCost.toFixed(4)}`}
            icon={<DollarSign className="w-4 h-4" />}
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 p-4 bg-muted/50 border border-border">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by query, user, or trace ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="h-9 px-3 text-sm border border-border bg-background"
          >
            <option value="all">All Outcomes</option>
            <option value="answered">Answered</option>
            <option value="fallback">Fallback</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>

        {/* Interactions List */}
        <Section title="Recent Interactions" description={`${filteredInteractions.length} interactions found`}>
          <div className="space-y-2">
            {filteredInteractions.map((interaction) => (
              <div key={interaction.traceId} className="border border-border">
                {/* Interaction Header */}
                <div 
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
                  onClick={() => setExpandedTrace(expandedTrace === interaction.traceId ? null : interaction.traceId)}
                >
                  <div className="flex items-center gap-4">
                    <button className="text-muted-foreground">
                      {expandedTrace === interaction.traceId ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    <div>
                      <p className="font-mono text-sm line-clamp-1 max-w-md">{interaction.query}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{interaction.userName}</span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground font-mono">{interaction.traceId}</span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">{interaction.startTime}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusBadge variant="info">{interaction.domain}</StatusBadge>
                    <span className="font-mono text-sm">{interaction.durationMs}ms</span>
                    <span className="font-mono text-sm">{interaction.tokens} tokens</span>
                    <span className="font-mono text-sm">${interaction.cost.toFixed(4)}</span>
                    <StatusBadge 
                      variant={interaction.outcome === 'answered' ? 'success' : interaction.outcome === 'fallback' ? 'warning' : 'error'}
                    >
                      {interaction.outcome}
                    </StatusBadge>
                  </div>
                </div>

                {/* Expanded Trace Details */}
                {expandedTrace === interaction.traceId && (
                  <div className="border-t border-border p-4 bg-muted/30">
                    {/* Summary Row */}
                    <div className="grid grid-cols-6 gap-4 mb-6">
                      <div className="p-3 bg-background border border-border">
                        <p className="text-xs text-muted-foreground uppercase mb-1">Intent</p>
                        <p className="font-mono text-sm">{interaction.intent}</p>
                      </div>
                      <div className="p-3 bg-background border border-border">
                        <p className="text-xs text-muted-foreground uppercase mb-1">Domain</p>
                        <p className="font-mono text-sm">{interaction.domain}</p>
                      </div>
                      <div className="p-3 bg-background border border-border">
                        <p className="text-xs text-muted-foreground uppercase mb-1">Evidence</p>
                        <p className={`font-mono text-sm ${interaction.evidenceStrength < 0.7 ? 'text-yellow-600' : ''}`}>
                          {(interaction.evidenceStrength * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div className="p-3 bg-background border border-border">
                        <p className="text-xs text-muted-foreground uppercase mb-1">Steps</p>
                        <p className="font-mono text-sm">{interaction.steps}</p>
                      </div>
                      <div className="p-3 bg-background border border-border">
                        <p className="text-xs text-muted-foreground uppercase mb-1">Providers</p>
                        <div className="flex gap-1">
                          {interaction.providers.map(p => (
                            <span key={p} className="text-xs bg-foreground text-background px-1 font-mono">
                              {p.slice(0, 3).toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="p-3 bg-background border border-border">
                        <p className="text-xs text-muted-foreground uppercase mb-1">Conversation</p>
                        <p className="font-mono text-xs">{interaction.conversationId}</p>
                      </div>
                    </div>

                    {/* Stage Timeline */}
                    <div className="mb-4">
                      <p className="text-sm font-medium mb-3">Pipeline Stages</p>
                      <div className="space-y-2">
                        {interaction.stages.map((stage: Stage, index: number) => (
                          <div key={index} className="flex items-center gap-4 p-3 bg-background border border-border">
                            <div className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-mono">
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm">{stage.stage}</span>
                                <span className={`text-xs px-1.5 py-0.5 ${getStageStatusColor(stage.status)}`}>
                                  {stage.status}
                                </span>
                              </div>
                              {stage.message && (
                                <p className="text-xs text-muted-foreground mt-1">{stage.message}</p>
                              )}
                              {stage.chunksRetrieved !== undefined && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Retrieved: {stage.chunksRetrieved} chunks
                                  {stage.chunksKept !== undefined && ` → Kept: ${stage.chunksKept}`}
                                </p>
                              )}
                              {stage.fallbackType && (
                                <p className="text-xs text-muted-foreground mt-1">Fallback type: {stage.fallbackType}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm">{stage.durationMs}ms</p>
                              {stage.tokens > 0 && (
                                <p className="text-xs text-muted-foreground">{stage.tokens} tokens</p>
                              )}
                            </div>
                            <div className="w-20 text-right">
                              {stage.provider ? (
                                <span className="text-xs bg-foreground text-background px-1.5 py-0.5 font-mono">
                                  {stage.provider.slice(0, 3).toUpperCase()}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Duration Bar */}
                    <div className="mb-4">
                      <p className="text-sm font-medium mb-2">Duration Breakdown</p>
                      <div className="h-8 flex overflow-hidden border border-border">
                        {interaction.stages.map((stage: Stage, index: number) => {
                          const width = (stage.durationMs / interaction.durationMs) * 100;
                          const colors = ["#0a0a0a", "#404040", "#737373", "#a3a3a3", "#d4d4d4"];
                          return (
                            <div 
                              key={index}
                              className="h-full flex items-center justify-center text-xs font-mono"
                              style={{ 
                                width: `${width}%`, 
                                backgroundColor: colors[index % colors.length],
                                color: index < 2 ? '#fff' : '#0a0a0a'
                              }}
                              title={`${stage.stage}: ${stage.durationMs}ms`}
                            >
                              {width > 10 && `${stage.durationMs}ms`}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <Link href={`/admin/users/${interaction.userId}`}>
                        <Button variant="outline" size="sm">View User</Button>
                      </Link>
                      <Link href={`/admin/queries?trace=${interaction.traceId}`}>
                        <Button variant="outline" size="sm">View Query</Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      </div>
    </AdminLayout>
  );
}
