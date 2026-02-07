/**
 * Live Alerts Page - Live Subsection
 * Real-time alerts with severity levels and acknowledgment
 */

import { useState, useEffect } from "react";
import { Bell, AlertTriangle, AlertCircle, Info, CheckCircle, X, Volume2, VolumeX, Filter } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import type { TimeRange, Environment } from "@/types/admin";

interface Alert {
  id: string;
  timestamp: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  source: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export function LiveAlertsPage() {
  const [range, setRange] = useState<TimeRange>("24h");
  const [env, setEnv] = useState<Environment>("prod");
  const [alerts, setAlerts] = useState<Alert[]>(generateInitialAlerts());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "info" | "unacknowledged">("all");

  // Simulated live alert generation
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < 0.3) {
        const newAlert = generateAlert();
        setAlerts(prev => [newAlert, ...prev].slice(0, 50));

        if (soundEnabled && newAlert.severity === "critical") {
          // Could trigger a sound here
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [soundEnabled]);

  const handleAcknowledge = (alertId: string) => {
    setAlerts(prev => prev.map(alert =>
      alert.id === alertId
        ? { ...alert, acknowledged: true, acknowledgedBy: "admin@koda.ai", acknowledgedAt: new Date().toISOString() }
        : alert
    ));
  };

  const handleDismiss = (alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };

  const filteredAlerts = alerts.filter(alert => {
    if (filter === "unacknowledged") return !alert.acknowledged;
    if (filter !== "all" && alert.severity !== filter) return false;
    return true;
  });

  const getSeverityIcon = (severity: Alert["severity"]) => {
    switch (severity) {
      case "critical": return <AlertCircle className="w-5 h-5 text-red-500" />;
      case "warning": return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case "info": return <Info className="w-5 h-5 text-blue-500" />;
      default: return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  const getSeverityColor = (severity: Alert["severity"]) => {
    switch (severity) {
      case "critical": return "bg-red-50 border-red-200";
      case "warning": return "bg-amber-50 border-amber-200";
      case "info": return "bg-blue-50 border-blue-200";
      default: return "bg-gray-50 border-gray-200";
    }
  };

  // Stats
  const stats = {
    total: alerts.length,
    critical: alerts.filter(a => a.severity === "critical").length,
    warning: alerts.filter(a => a.severity === "warning").length,
    unacknowledged: alerts.filter(a => !a.acknowledged).length,
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-[#111111]">Live Alerts</h1>
            {stats.critical > 0 && (
              <span className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded animate-pulse">
                <AlertCircle className="w-3 h-3" />
                {stats.critical} Critical
              </span>
            )}
          </div>
          <p className="text-sm text-[#6B7280] mt-1">
            Real-time system alerts and notifications
          </p>
        </div>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
            soundEnabled
              ? "bg-blue-50 border-blue-200 text-blue-700"
              : "bg-white border-[#E6E6EC] text-[#6B7280]"
          }`}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          Sound {soundEnabled ? "On" : "Off"}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Bell className="w-4 h-4" />
            <span className="text-sm">Total Alerts</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">{stats.total}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700 mb-2">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">Critical</span>
          </div>
          <div className="text-2xl font-semibold text-red-700">{stats.critical}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-700 mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Warning</span>
          </div>
          <div className="text-2xl font-semibold text-amber-700">{stats.warning}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-blue-700 mb-2">
            <Info className="w-4 h-4" />
            <span className="text-sm">Unacknowledged</span>
          </div>
          <div className="text-2xl font-semibold text-blue-700">{stats.unacknowledged}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        {(["all", "critical", "warning", "info", "unacknowledged"] as const).map((f) => (
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

      {/* Alerts List */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="bg-white border border-[#E6E6EC] rounded-lg p-8 text-center text-[#6B7280]">
            No alerts matching the current filter
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`border rounded-lg p-4 ${getSeverityColor(alert.severity)} ${alert.acknowledged ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                {getSeverityIcon(alert.severity)}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-[#111111]">{alert.title}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#6B7280]">
                        {new Date(alert.timestamp).toLocaleString()}
                      </span>
                      <button
                        onClick={() => handleDismiss(alert.id)}
                        className="text-[#6B7280] hover:text-[#111111]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-[#6B7280] mt-1">{alert.description}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-[#6B7280]">Source: {alert.source}</span>
                    {alert.acknowledged ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="w-3 h-3" />
                        Acknowledged by {alert.acknowledgedBy}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className="px-3 py-1 text-xs bg-white border border-[#E6E6EC] rounded hover:bg-[#FAFAFA]"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </AdminLayout>
  );
}

function generateInitialAlerts(): Alert[] {
  return [
    {
      id: "alert_1",
      timestamp: new Date(Date.now() - 300000).toISOString(),
      severity: "critical",
      title: "LLM API Latency Spike",
      description: "OpenAI API P95 latency exceeded 10s threshold. Currently at 12.5s.",
      source: "llm-monitor",
      acknowledged: false,
    },
    {
      id: "alert_2",
      timestamp: new Date(Date.now() - 600000).toISOString(),
      severity: "warning",
      title: "High Error Rate Detected",
      description: "Error rate increased to 5.2% in the last 5 minutes (threshold: 5%).",
      source: "api-monitor",
      acknowledged: false,
    },
    {
      id: "alert_3",
      timestamp: new Date(Date.now() - 900000).toISOString(),
      severity: "info",
      title: "Scheduled Maintenance Window",
      description: "Database maintenance scheduled for 02:00 UTC. Expected duration: 30 minutes.",
      source: "scheduler",
      acknowledged: true,
      acknowledgedBy: "ops@koda.ai",
      acknowledgedAt: new Date(Date.now() - 800000).toISOString(),
    },
    {
      id: "alert_4",
      timestamp: new Date(Date.now() - 1200000).toISOString(),
      severity: "warning",
      title: "Storage Usage Warning",
      description: "Vector storage at 78% capacity. Consider cleanup or expansion.",
      source: "storage-monitor",
      acknowledged: false,
    },
  ];
}

function generateAlert(): Alert {
  const alerts = [
    { severity: "critical" as const, title: "LLM API Timeout", description: "Claude API request timed out after 30s", source: "llm-monitor" },
    { severity: "critical" as const, title: "Database Connection Failed", description: "Unable to establish connection to primary database", source: "db-monitor" },
    { severity: "warning" as const, title: "Rate Limit Approaching", description: "API rate limit at 85% of quota", source: "api-monitor" },
    { severity: "warning" as const, title: "Queue Backlog Growing", description: "Document processing queue has 150+ pending items", source: "queue-monitor" },
    { severity: "info" as const, title: "New User Signup Spike", description: "50+ new signups in the last hour", source: "user-monitor" },
    { severity: "info" as const, title: "Cache Hit Rate Improved", description: "Query cache hit rate increased to 92%", source: "cache-monitor" },
  ];

  const template = alerts[Math.floor(Math.random() * alerts.length)];

  return {
    id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: new Date().toISOString(),
    severity: template.severity,
    title: template.title,
    description: template.description,
    source: template.source,
    acknowledged: false,
  };
}

export default LiveAlertsPage;
