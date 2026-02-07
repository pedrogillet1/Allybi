/**
 * Trace Tail Page - Live Subsection
 * Real-time trace monitoring similar to "tail -f" for distributed traces
 */

import { useState, useEffect, useRef } from "react";
import { Terminal, Search, Pause, Play, Filter, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Link } from "wouter";
import type { TimeRange, Environment } from "@/types/admin";

interface TraceSpan {
  traceId: string;
  timestamp: string;
  userId: string;
  query: string;
  domain: string;
  intent: string;
  latencyMs: number;
  status: "success" | "error" | "warning";
  steps: {
    name: string;
    durationMs: number;
    status: "ok" | "error" | "skipped";
  }[];
}

export function TraceTailPage() {
  const [range, setRange] = useState<TimeRange>("24h");
  const [env, setEnv] = useState<Environment>("prod");
  const [isPaused, setIsPaused] = useState(false);
  const [traces, setTraces] = useState<TraceSpan[]>([]);
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "success" | "error" | "slow">("all");
  const [search, setSearch] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);

  // Simulated live trace generation
  useEffect(() => {
    if (isPaused) return;

    const domains = ["financial", "technical", "general", "marketing", "legal"];
    const intents = ["question", "summary", "comparison", "explanation", "list"];
    const steps = [
      "ROUTER", "SCOPE", "RETRIEVAL", "RANKING", "PROMPT_BUILD",
      "LLM_CALL", "POSTPROCESS", "QUALITY_CHECK", "FINALIZE"
    ];

    const interval = setInterval(() => {
      const latency = Math.floor(Math.random() * 5000) + 500;
      const hasError = Math.random() < 0.1;
      const isSlow = latency > 3000;

      const newTrace: TraceSpan = {
        traceId: `trace_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`,
        timestamp: new Date().toISOString(),
        userId: `user_${Math.floor(Math.random() * 500)}`,
        query: generateQuery(),
        domain: domains[Math.floor(Math.random() * domains.length)],
        intent: intents[Math.floor(Math.random() * intents.length)],
        latencyMs: latency,
        status: hasError ? "error" : isSlow ? "warning" : "success",
        steps: steps.map(name => ({
          name,
          durationMs: Math.floor(Math.random() * 500) + 10,
          status: hasError && Math.random() < 0.3 ? "error" : Math.random() < 0.1 ? "skipped" : "ok",
        })),
      };

      setTraces(prev => [newTrace, ...prev].slice(0, 100));
    }, 2000 + Math.random() * 3000);

    return () => clearInterval(interval);
  }, [isPaused]);

  const filteredTraces = traces.filter(trace => {
    if (filter === "success" && trace.status !== "success") return false;
    if (filter === "error" && trace.status !== "error") return false;
    if (filter === "slow" && trace.latencyMs < 3000) return false;
    if (search && !trace.query.toLowerCase().includes(search.toLowerCase()) && !trace.traceId.includes(search)) return false;
    return true;
  });

  const getStatusColor = (status: TraceSpan["status"]) => {
    switch (status) {
      case "success": return "bg-green-100 text-green-700";
      case "error": return "bg-red-100 text-red-700";
      case "warning": return "bg-amber-100 text-amber-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const getStepStatusColor = (status: string) => {
    switch (status) {
      case "ok": return "bg-green-500";
      case "error": return "bg-red-500";
      case "skipped": return "bg-gray-300";
      default: return "bg-gray-300";
    }
  };

  // Stats
  const stats = {
    total: traces.length,
    success: traces.filter(t => t.status === "success").length,
    errors: traces.filter(t => t.status === "error").length,
    avgLatency: traces.length > 0 ? Math.round(traces.reduce((s, t) => s + t.latencyMs, 0) / traces.length) : 0,
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-[#111111]">Trace Tail</h1>
            <span className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${isPaused ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
              <Terminal className={`w-3 h-3 ${!isPaused && "animate-pulse"}`} />
              {isPaused ? "Paused" : "Streaming"}
            </span>
          </div>
          <p className="text-sm text-[#6B7280] mt-1">
            Real-time query trace monitoring
          </p>
        </div>
        <button
          onClick={() => setIsPaused(!isPaused)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            isPaused
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-amber-100 text-amber-700 hover:bg-amber-200"
          }`}
        >
          {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          {isPaused ? "Resume" : "Pause"}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">Total Traces</div>
          <div className="text-2xl font-semibold text-[#111111]">{stats.total}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm text-green-700 mb-1">Success</div>
          <div className="text-2xl font-semibold text-green-700">{stats.success}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm text-red-700 mb-1">Errors</div>
          <div className="text-2xl font-semibold text-red-700">{stats.errors}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-700 mb-1">Avg Latency</div>
          <div className="text-2xl font-semibold text-blue-700">{stats.avgLatency}ms</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
            <input
              type="text"
              placeholder="Search traces..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 text-sm border border-[#E6E6EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "success", "error", "slow"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 text-sm rounded-lg capitalize ${
                  filter === f
                    ? "bg-[#111111] text-white"
                    : "bg-white border border-[#E6E6EC] text-[#6B7280] hover:bg-[#FAFAFA]"
                }`}
              >
                {f === "slow" ? "Slow (>3s)" : f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Trace Stream */}
      <div
        ref={streamRef}
        className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden"
      >
        {filteredTraces.length === 0 ? (
          <div className="p-8 text-center text-[#6B7280]">
            {isPaused ? "Stream paused. Click Resume to continue." : "Waiting for traces..."}
          </div>
        ) : (
          <div className="divide-y divide-[#E6E6EC]">
            {filteredTraces.map((trace) => (
              <div key={trace.traceId}>
                <button
                  onClick={() => setExpandedTrace(expandedTrace === trace.traceId ? null : trace.traceId)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#FAFAFA] text-left"
                >
                  {expandedTrace === trace.traceId ? (
                    <ChevronDown className="w-4 h-4 text-[#6B7280]" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                  )}
                  <span className="text-xs text-[#6B7280] w-20">
                    {new Date(trace.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(trace.status)}`}>
                    {trace.status}
                  </span>
                  <span className="font-mono text-xs text-[#6B7280] w-32 truncate">
                    {trace.traceId.slice(0, 20)}
                  </span>
                  <span className="flex-1 text-sm text-[#111111] truncate">
                    {trace.query}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                    {trace.domain}
                  </span>
                  <span className={`text-xs font-mono ${trace.latencyMs > 3000 ? "text-amber-600" : "text-[#6B7280]"}`}>
                    {trace.latencyMs}ms
                  </span>
                </button>

                {expandedTrace === trace.traceId && (
                  <div className="px-4 pb-4 bg-[#FAFAFA]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-[#6B7280]">User: <span className="text-[#111111]">{trace.userId}</span></span>
                        <span className="text-[#6B7280]">Intent: <span className="text-[#111111]">{trace.intent}</span></span>
                      </div>
                      <Link
                        href={`/admin/queries/${trace.traceId}/trace`}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                      >
                        View Full Trace <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>

                    {/* Mini Waterfall */}
                    <div className="space-y-1">
                      {trace.steps.map((step, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-24 text-[#6B7280]">{step.name}</span>
                          <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                            <div
                              className={`h-full ${getStepStatusColor(step.status)}`}
                              style={{ width: `${Math.min((step.durationMs / trace.latencyMs) * 100 * 3, 100)}%` }}
                            />
                          </div>
                          <span className="w-16 text-right text-[#6B7280]">{step.durationMs}ms</span>
                          <span className={`w-12 text-center px-1 py-0.5 rounded text-[10px] ${
                            step.status === "ok" ? "bg-green-100 text-green-700" :
                            step.status === "error" ? "bg-red-100 text-red-700" :
                            "bg-gray-100 text-gray-500"
                          }`}>
                            {step.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function generateQuery(): string {
  const queries = [
    "What are the key financial metrics for Q3?",
    "How do I configure the API rate limits?",
    "Explain the document processing pipeline",
    "What's the pricing for enterprise plans?",
    "Show me the latest user growth trends",
    "How does the RAG system work?",
    "What are the SLA guarantees?",
    "Compare features between plans",
    "Summarize the security compliance docs",
    "How to integrate with Slack?",
    "What's the data retention policy?",
    "Explain the billing model",
  ];
  return queries[Math.floor(Math.random() * queries.length)];
}

export default TraceTailPage;
