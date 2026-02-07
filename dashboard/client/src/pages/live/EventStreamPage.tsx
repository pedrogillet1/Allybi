/**
 * Event Stream Page - Live Subsection
 * Real-time event stream with filtering and search
 */

import { useState, useEffect, useRef } from "react";
import { Radio, Search, Filter, Pause, Play, Trash2, Download } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import type { TimeRange, Environment } from "@/types/admin";

interface LiveEvent {
  id: string;
  timestamp: string;
  type: "query" | "document" | "user" | "system" | "error";
  action: string;
  userId?: string;
  details: string;
  metadata?: Record<string, unknown>;
}

export function EventStreamPage() {
  const [range, setRange] = useState<TimeRange>("24h");
  const [env, setEnv] = useState<Environment>("prod");
  const [isPaused, setIsPaused] = useState(false);
  const [filter, setFilter] = useState<"all" | "query" | "document" | "user" | "system" | "error">("all");
  const [search, setSearch] = useState("");
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const streamRef = useRef<HTMLDivElement>(null);

  // Simulated live event generation
  useEffect(() => {
    if (isPaused) return;

    const eventTypes: LiveEvent["type"][] = ["query", "document", "user", "system", "error"];
    const actions = {
      query: ["chat.message", "query.complete", "retrieval.complete", "llm.response"],
      document: ["upload.start", "upload.complete", "process.start", "process.complete", "embed.complete"],
      user: ["session.start", "session.end", "login", "logout"],
      system: ["health.check", "cache.clear", "config.reload"],
      error: ["llm.timeout", "retrieval.fail", "validation.error", "rate.limit"],
    };

    const interval = setInterval(() => {
      const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const action = actions[type][Math.floor(Math.random() * actions[type].length)];

      const newEvent: LiveEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        type,
        action,
        userId: type !== "system" ? `user_${Math.floor(Math.random() * 1000)}` : undefined,
        details: generateEventDetails(type, action),
        metadata: { latencyMs: Math.floor(Math.random() * 500) + 10 },
      };

      setEvents(prev => [newEvent, ...prev].slice(0, 200));
    }, 1000 + Math.random() * 2000);

    return () => clearInterval(interval);
  }, [isPaused]);

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (!isPaused && streamRef.current) {
      streamRef.current.scrollTop = 0;
    }
  }, [events, isPaused]);

  const filteredEvents = events.filter(event => {
    if (filter !== "all" && event.type !== filter) return false;
    if (search && !event.action.includes(search) && !event.details.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getTypeColor = (type: LiveEvent["type"]) => {
    switch (type) {
      case "query": return "bg-blue-100 text-blue-700";
      case "document": return "bg-purple-100 text-purple-700";
      case "user": return "bg-green-100 text-green-700";
      case "system": return "bg-gray-100 text-gray-700";
      case "error": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const handleClear = () => setEvents([]);
  const handleExport = () => {
    const data = JSON.stringify(filteredEvents, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `events-${new Date().toISOString()}.json`;
    a.click();
  };

  // Event counts
  const counts = {
    total: events.length,
    queries: events.filter(e => e.type === "query").length,
    documents: events.filter(e => e.type === "document").length,
    errors: events.filter(e => e.type === "error").length,
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-[#111111]">Live Event Stream</h1>
            <span className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${isPaused ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
              <Radio className={`w-3 h-3 ${!isPaused && "animate-pulse"}`} />
              {isPaused ? "Paused" : "Live"}
            </span>
          </div>
          <p className="text-sm text-[#6B7280] mt-1">
            Real-time stream of system events and activities
          </p>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">Total Events</div>
          <div className="text-2xl font-semibold text-[#111111]">{counts.total}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-700 mb-1">Queries</div>
          <div className="text-2xl font-semibold text-blue-700">{counts.queries}</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="text-sm text-purple-700 mb-1">Documents</div>
          <div className="text-2xl font-semibold text-purple-700">{counts.documents}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm text-red-700 mb-1">Errors</div>
          <div className="text-2xl font-semibold text-red-700">{counts.errors}</div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
            <input
              type="text"
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 text-sm border border-[#E6E6EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "query", "document", "user", "system", "error"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 text-sm rounded-lg capitalize ${
                  filter === f
                    ? "bg-[#111111] text-white"
                    : "bg-white border border-[#E6E6EC] text-[#6B7280] hover:bg-[#FAFAFA]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="flex items-center gap-1 px-3 py-2 text-sm text-[#6B7280] hover:text-[#111111]"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-3 py-2 text-sm text-[#6B7280] hover:text-[#111111]"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Event Stream */}
      <div
        ref={streamRef}
        className="bg-[#111111] rounded-lg p-4 h-[500px] overflow-y-auto font-mono text-sm"
      >
        {filteredEvents.length === 0 ? (
          <div className="text-[#6B7280] text-center py-8">
            {isPaused ? "Stream paused. Click Resume to continue." : "Waiting for events..."}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                className={`flex items-start gap-3 py-1 px-2 rounded hover:bg-white/5 ${
                  event.type === "error" ? "bg-red-500/10" : ""
                }`}
              >
                <span className="text-[#6B7280] text-xs whitespace-nowrap">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span className={`px-1.5 py-0.5 text-xs rounded ${getTypeColor(event.type)}`}>
                  {event.type}
                </span>
                <span className="text-green-400">{event.action}</span>
                {event.userId && (
                  <span className="text-blue-400">{event.userId}</span>
                )}
                <span className="text-gray-400 truncate flex-1">{event.details}</span>
                {event.metadata?.latencyMs !== undefined && (
                  <span className="text-[#6B7280] text-xs">{String(event.metadata.latencyMs)}ms</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function generateEventDetails(type: LiveEvent["type"], action: string): string {
  const details: Record<string, string[]> = {
    "chat.message": ["User asked about pricing", "Query about features", "Support question"],
    "query.complete": ["Retrieved 5 chunks, score 0.87", "Retrieved 3 chunks, score 0.92", "No evidence found"],
    "retrieval.complete": ["Found 12 relevant documents", "Searched 1,234 vectors", "TopK=5 returned"],
    "llm.response": ["GPT-4 response generated", "Claude response complete", "Streaming finished"],
    "upload.start": ["PDF upload initiated (2.3MB)", "DOCX upload started", "Image batch upload"],
    "upload.complete": ["File stored successfully", "Upload validated", "Checksum verified"],
    "process.start": ["OCR extraction started", "Text parsing initiated", "Chunking in progress"],
    "process.complete": ["Generated 45 chunks", "Extracted 12 pages", "Processing complete"],
    "embed.complete": ["512 embeddings created", "Vectors upserted", "Index updated"],
    "session.start": ["New session from US", "Mobile session started", "Desktop login"],
    "session.end": ["Session expired", "User logged out", "Timeout"],
    "login": ["Successful login", "OAuth login", "SSO authentication"],
    "logout": ["User initiated logout", "Session terminated", "Token revoked"],
    "health.check": ["All services healthy", "DB connection OK", "Cache responsive"],
    "cache.clear": ["Query cache cleared", "Embedding cache purged", "Full cache reset"],
    "config.reload": ["Settings reloaded", "Feature flags updated", "Config refreshed"],
    "llm.timeout": ["OpenAI request timeout after 30s", "Claude timeout", "Retry initiated"],
    "retrieval.fail": ["Vector search failed", "Index unavailable", "Connection refused"],
    "validation.error": ["Invalid input format", "Schema validation failed", "Missing required field"],
    "rate.limit": ["User rate limited", "API quota exceeded", "Throttled request"],
  };

  const options = details[action] || ["Event occurred"];
  return options[Math.floor(Math.random() * options.length)];
}

export default EventStreamPage;
