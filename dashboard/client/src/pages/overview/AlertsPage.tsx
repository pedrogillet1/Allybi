/**
 * Alerts & SLO Page - Overview Subsection
 * Shows SLO targets, active alerts based on real data
 */

import { useState, useMemo } from "react";
import { Bell, AlertTriangle, CheckCircle, Clock, XCircle, Info } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useOverview, useFiles } from "@/hooks/useAdminApi";
import type { TimeRange, Environment } from "@/types/admin";

interface SLOTarget {
  name: string;
  target: number;
  current: number;
  unit: string;
  status: "healthy" | "warning" | "critical";
  tracked: boolean;
}

interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  timestamp: string;
  acknowledged: boolean;
}

export function AlertsPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading } = useOverview({ range, env });
  const { data: filesData } = useFiles({ range, env });

  // SLO Targets with current values from API
  const latencyP95 = data?.kpis?.latencyMsP95 ?? 0;
  const llmErrorRate = data?.kpis?.llmErrorRate ?? 0;
  const weakEvidenceRate = data?.kpis?.weakEvidenceRate ?? 0;

  // Calculate ingestion success rate from real data
  const totalFiles = filesData?.counts?.total ?? 0;
  const failedFiles = filesData?.counts?.failed ?? 0;
  const ingestionSuccessRate = totalFiles > 0
    ? Math.round(((totalFiles - failedFiles) / totalFiles) * 1000) / 10
    : null;

  const sloTargets: SLOTarget[] = useMemo(() => [
    {
      name: "API Latency P95",
      target: 2000,
      current: latencyP95,
      unit: "ms",
      status: latencyP95 === 0 ? "healthy" : latencyP95 < 1500 ? "healthy" : latencyP95 < 2000 ? "warning" : "critical",
      tracked: latencyP95 > 0,
    },
    {
      name: "LLM Error Rate",
      target: 1,
      current: llmErrorRate,
      unit: "%",
      status: llmErrorRate < 0.5 ? "healthy" : llmErrorRate < 1 ? "warning" : "critical",
      tracked: data?.kpis?.llmCalls ? data.kpis.llmCalls > 0 : false,
    },
    {
      name: "Weak Evidence Rate",
      target: 15,
      current: weakEvidenceRate,
      unit: "%",
      status: weakEvidenceRate < 10 ? "healthy" : weakEvidenceRate < 15 ? "warning" : "critical",
      tracked: true, // Always tracked
    },
    {
      name: "Ingestion Success Rate",
      target: 95,
      current: ingestionSuccessRate ?? 0,
      unit: "%",
      status: ingestionSuccessRate === null ? "healthy" :
        ingestionSuccessRate >= 95 ? "healthy" :
        ingestionSuccessRate >= 90 ? "warning" : "critical",
      tracked: totalFiles > 0,
    },
  ], [latencyP95, llmErrorRate, weakEvidenceRate, ingestionSuccessRate, totalFiles, data?.kpis?.llmCalls]);

  // Generate alerts dynamically based on SLO breaches
  const activeAlerts: Alert[] = useMemo(() => {
    const alerts: Alert[] = [];
    const now = new Date();

    // Check each SLO for breaches
    if (latencyP95 > 0 && latencyP95 >= 2000) {
      alerts.push({
        id: "alert_latency",
        severity: "critical",
        title: "High API Latency",
        description: `P95 latency (${latencyP95.toFixed(0)}ms) exceeds target of 2000ms`,
        timestamp: now.toISOString(),
        acknowledged: false,
      });
    } else if (latencyP95 > 0 && latencyP95 >= 1500) {
      alerts.push({
        id: "alert_latency_warning",
        severity: "warning",
        title: "Elevated API Latency",
        description: `P95 latency (${latencyP95.toFixed(0)}ms) approaching target of 2000ms`,
        timestamp: now.toISOString(),
        acknowledged: false,
      });
    }

    if (llmErrorRate >= 1) {
      alerts.push({
        id: "alert_llm_error",
        severity: "critical",
        title: "High LLM Error Rate",
        description: `LLM error rate (${llmErrorRate.toFixed(1)}%) exceeds target of 1%`,
        timestamp: now.toISOString(),
        acknowledged: false,
      });
    } else if (llmErrorRate >= 0.5) {
      alerts.push({
        id: "alert_llm_error_warning",
        severity: "warning",
        title: "Elevated LLM Error Rate",
        description: `LLM error rate (${llmErrorRate.toFixed(1)}%) approaching target of 1%`,
        timestamp: now.toISOString(),
        acknowledged: false,
      });
    }

    if (weakEvidenceRate >= 15) {
      alerts.push({
        id: "alert_weak_evidence",
        severity: "warning",
        title: "High Weak Evidence Rate",
        description: `Weak evidence rate (${weakEvidenceRate.toFixed(1)}%) exceeds target of 15%`,
        timestamp: now.toISOString(),
        acknowledged: false,
      });
    }

    if (ingestionSuccessRate !== null && ingestionSuccessRate < 90) {
      alerts.push({
        id: "alert_ingestion",
        severity: "critical",
        title: "Low Ingestion Success Rate",
        description: `Ingestion success rate (${ingestionSuccessRate.toFixed(1)}%) below target of 95%`,
        timestamp: now.toISOString(),
        acknowledged: false,
      });
    } else if (ingestionSuccessRate !== null && ingestionSuccessRate < 95) {
      alerts.push({
        id: "alert_ingestion_warning",
        severity: "warning",
        title: "Reduced Ingestion Success Rate",
        description: `Ingestion success rate (${ingestionSuccessRate.toFixed(1)}%) below target of 95%`,
        timestamp: now.toISOString(),
        acknowledged: false,
      });
    }

    return alerts;
  }, [latencyP95, llmErrorRate, weakEvidenceRate, ingestionSuccessRate]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy": return "bg-green-100 text-green-700";
      case "warning": return "bg-amber-100 text-amber-700";
      case "critical": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical": return <XCircle className="w-5 h-5 text-red-500" />;
      case "warning": return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case "info": return <Bell className="w-5 h-5 text-blue-500" />;
      default: return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  const getSeverityBg = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-50 border-red-200";
      case "warning": return "bg-amber-50 border-amber-200";
      case "info": return "bg-blue-50 border-blue-200";
      default: return "bg-gray-50 border-gray-200";
    }
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Alerts & SLO</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Monitor service level objectives and active alerts
        </p>
      </div>

      {/* SLO Targets */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-[#111111] mb-4">SLO Targets</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {sloTargets.map((slo) => (
            <div key={slo.name} className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-[#111111]">{slo.name}</span>
                {slo.tracked ? (
                  <span className={`px-2 py-1 text-xs rounded ${getStatusColor(slo.status)}`}>
                    {slo.status}
                  </span>
                ) : (
                  <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-500">
                    no data
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between mb-2">
                <span className="text-2xl font-semibold text-[#111111]">
                  {isLoading ? "-" : slo.tracked ? `${slo.current.toFixed(slo.unit === "%" ? 1 : 0)}${slo.unit}` : "N/A"}
                </span>
                <span className="text-sm text-[#6B7280]">
                  Target: {slo.target}{slo.unit}
                </span>
              </div>
              {slo.tracked && (
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      slo.status === "healthy" ? "bg-green-500" :
                      slo.status === "warning" ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{
                      width: `${Math.min(
                        slo.name.includes("Success") || slo.name.includes("Rate")
                          ? (slo.current / slo.target) * 100
                          : Math.max(0, 100 - (slo.current / slo.target) * 100),
                        100
                      )}%`
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Active Alerts */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#111111]">Active Alerts</h2>
          <span className="text-sm text-[#6B7280]">{activeAlerts.length} active</span>
        </div>
        {activeAlerts.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-green-700">All systems operating normally</p>
            <p className="text-xs text-green-600 mt-1">No SLO targets currently breached</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className={`border rounded-lg p-4 ${getSeverityBg(alert.severity)}`}>
                <div className="flex items-start gap-3">
                  {getSeverityIcon(alert.severity)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-[#111111]">{alert.title}</h3>
                      <span className="text-xs text-[#6B7280]">
                        <Clock className="w-3 h-3 inline mr-1" />
                        Now
                      </span>
                    </div>
                    <p className="text-sm text-[#6B7280] mt-1">{alert.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info about alert history */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">About Alerts</h3>
            <p className="text-sm text-blue-800 mt-1">
              Alerts are generated in real-time based on SLO target breaches.
              Historical alert tracking is not yet implemented - alerts shown here reflect the current state of system metrics.
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default AlertsPage;
