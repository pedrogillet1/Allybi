/**
 * Live Page - Real-time event feed
 * Swiss Brutalist Tech Design - White/Black Minimalist
 */

import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { StatusBadge, PageHeader, Section, KPICard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Activity, Users, MessageSquare, FileText, AlertTriangle, Zap, Pause, Play, Filter } from "lucide-react";

// Mock data types
type EventType = "query" | "upload" | "error" | "user_login" | "ingestion" | "llm_call";

interface LiveEvent {
  id: string;
  type: EventType;
  timestamp: string;
  message: string;
  details: Record<string, string | number>;
  severity: "info" | "warning" | "error";
}

// Generate mock events
const generateMockEvent = (id: number): LiveEvent => {
  const types: EventType[] = ["query", "upload", "error", "user_login", "ingestion", "llm_call"];
  const type = types[Math.floor(Math.random() * types.length)];
  
  const now = new Date();
  now.setSeconds(now.getSeconds() - id * 2);
  
  const events: Record<EventType, { message: string; details: Record<string, string | number>; severity: "info" | "warning" | "error" }> = {
    query: {
      message: "Query processed",
      details: { user: "u_***42", domain: "finance", tokens: 1234, latency: "1.2s" },
      severity: "info",
    },
    upload: {
      message: "File uploaded",
      details: { user: "u_***17", filename: "report.pdf", size: "2.4MB" },
      severity: "info",
    },
    error: {
      message: "LLM rate limit exceeded",
      details: { provider: "openai", retry_in: "30s" },
      severity: "error",
    },
    user_login: {
      message: "User logged in",
      details: { user: "u_***89", method: "oauth" },
      severity: "info",
    },
    ingestion: {
      message: "Document ingested",
      details: { file: "contract.pdf", chunks: 24, vectors: 24 },
      severity: "info",
    },
    llm_call: {
      message: "LLM call completed",
      details: { provider: "gemini", model: "gemini-2.0-flash", tokens: 856, cost: "$0.0012" },
      severity: "info",
    },
  };
  
  // Randomly add some warnings/errors
  if (Math.random() < 0.1) {
    return {
      id: `evt-${id}`,
      type: "error",
      timestamp: now.toISOString(),
      message: "Weak evidence detected",
      details: { query_id: `q_${id}`, evidence_score: 0.42 },
      severity: "warning",
    };
  }
  
  const eventData = events[type];
  return {
    id: `evt-${id}`,
    type,
    timestamp: now.toISOString(),
    ...eventData,
  };
};

const initialEvents = Array.from({ length: 50 }, (_, i) => generateMockEvent(i));

export default function Live() {
  const [events, setEvents] = useState<LiveEvent[]>(initialEvents);
  const [isPaused, setIsPaused] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  
  // Simulated live updates
  useEffect(() => {
    if (isPaused) return;
    
    const interval = setInterval(() => {
      const newEvent = generateMockEvent(0);
      newEvent.id = `evt-${Date.now()}`;
      newEvent.timestamp = new Date().toISOString();
      setEvents(prev => [newEvent, ...prev.slice(0, 99)]);
    }, 3000);
    
    return () => clearInterval(interval);
  }, [isPaused]);
  
  const filteredEvents = events.filter(e => {
    const matchesType = typeFilter === "all" || e.type === typeFilter;
    const matchesSeverity = severityFilter === "all" || e.severity === severityFilter;
    return matchesType && matchesSeverity;
  });
  
  // Stats
  const stats = {
    totalEvents: events.length,
    queries: events.filter(e => e.type === "query").length,
    errors: events.filter(e => e.severity === "error").length,
    warnings: events.filter(e => e.severity === "warning").length,
  };
  
  const getEventIcon = (type: EventType) => {
    switch (type) {
      case "query": return <MessageSquare className="w-4 h-4" />;
      case "upload": return <FileText className="w-4 h-4" />;
      case "error": return <AlertTriangle className="w-4 h-4" />;
      case "user_login": return <Users className="w-4 h-4" />;
      case "ingestion": return <Zap className="w-4 h-4" />;
      case "llm_call": return <Activity className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "error": return "border-l-red-500";
      case "warning": return "border-l-yellow-500";
      default: return "border-l-green-500";
    }
  };
  
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Live Feed"
        description="Real-time event stream"
        actions={
          <div className="flex items-center gap-3">
            <Button 
              variant={isPaused ? "default" : "outline"} 
              size="sm" 
              className="gap-2"
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {isPaused ? "Resume" : "Pause"}
            </Button>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-green-500 animate-pulse'}`} />
              <span className="text-sm text-muted-foreground">{isPaused ? "Paused" : "Live"}</span>
            </div>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard 
            label="Events (last 5m)" 
            value={stats.totalEvents}
            icon={<Activity className="w-4 h-4" />}
          />
          <KPICard 
            label="Queries" 
            value={stats.queries}
            icon={<MessageSquare className="w-4 h-4" />}
          />
          <KPICard 
            label="Errors" 
            value={stats.errors}
            icon={<AlertTriangle className="w-4 h-4" />}
          />
          <KPICard 
            label="Warnings" 
            value={stats.warnings}
            icon={<AlertTriangle className="w-4 h-4" />}
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 p-4 bg-muted/50 border border-border">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 px-3 text-sm border border-border bg-background"
          >
            <option value="all">All Types</option>
            <option value="query">Queries</option>
            <option value="upload">Uploads</option>
            <option value="ingestion">Ingestion</option>
            <option value="llm_call">LLM Calls</option>
            <option value="user_login">Logins</option>
            <option value="error">Errors</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-9 px-3 text-sm border border-border bg-background"
          >
            <option value="all">All Severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
          <span className="text-sm text-muted-foreground ml-auto">
            Showing {filteredEvents.length} events
          </span>
        </div>

        {/* Event Feed */}
        <Section title="Event Stream">
          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {filteredEvents.map((event) => (
              <div 
                key={event.id} 
                className={`flex items-start gap-4 p-3 bg-background border border-border border-l-4 ${getSeverityColor(event.severity)} hover:bg-muted/30 transition-colors`}
              >
                <div className="text-muted-foreground mt-0.5">
                  {getEventIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{event.message}</span>
                    <StatusBadge 
                      variant={event.severity === "error" ? "error" : event.severity === "warning" ? "warning" : "neutral"}
                    >
                      {event.type}
                    </StatusBadge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {Object.entries(event.details).map(([key, value]) => (
                      <span key={key} className="font-mono">
                        {key}: <span className="text-foreground">{value}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                  {formatTime(event.timestamp)}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Quick Stats by Type */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { type: "query", label: "Queries", icon: MessageSquare },
            { type: "upload", label: "Uploads", icon: FileText },
            { type: "ingestion", label: "Ingestion", icon: Zap },
            { type: "llm_call", label: "LLM Calls", icon: Activity },
            { type: "user_login", label: "Logins", icon: Users },
            { type: "error", label: "Errors", icon: AlertTriangle },
          ].map(({ type, label, icon: Icon }) => (
            <div key={type} className="p-4 bg-muted/50 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase">{label}</span>
              </div>
              <p className="text-2xl font-mono">
                {events.filter(e => e.type === type).length}
              </p>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
