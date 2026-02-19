/**
 * Overview Page - Koda Admin Dashboard
 * Main dashboard with KPIs from the backend
 */

import { useMemo, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useOverview, useOverviewTimeseries } from "@/hooks/useAdminApi";
import type { TimeRange, Environment, OverviewTimeseriesMetric } from "@/types/admin";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  UserCheck,
  FileText,
  MessageSquare,
  Search,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Database,
  Server,
  Cpu,
  ScanSearch,
  MousePointerClick,
} from "lucide-react";

// ============================================================================
// Skeleton Components
// ============================================================================

function KpiSkeleton() {
  return (
    <div className="bg-white border border-[#E6E6EC] rounded-lg p-5 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-20 bg-[#E6E6EC] rounded" />
          <div className="h-8 w-24 bg-[#E6E6EC] rounded" />
        </div>
        <div className="w-10 h-10 bg-[#E6E6EC] rounded-lg" />
      </div>
    </div>
  );
}

// ============================================================================
// KPI Card Component
// ============================================================================

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  format?: "number" | "currency" | "percent";
}

function KpiCard({ label, value, icon: Icon, format = "number" }: KpiCardProps) {
  const formatValue = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return "-";
    if (typeof val === "string") return val;
    if (format === "currency") return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (format === "percent") return `${val.toFixed(2)}%`;
    return val.toLocaleString();
  };

  return (
    <div className="bg-white border border-[#E6E6EC] rounded-lg p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[#6B7280] font-medium">{label}</p>
          <p className="text-2xl font-semibold text-[#111111] mt-1">{formatValue(value)}</p>
        </div>
        <div className="w-10 h-10 bg-[#F5F5F5] rounded-lg flex items-center justify-center">
          <Icon className="w-5 h-5 text-[#111111]" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Error State
// ============================================================================

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 bg-[#fef2f2] rounded-full flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-[#B91C1C]" />
      </div>
      <h3 className="text-lg font-medium text-[#111111] mb-2">Failed to load data</h3>
      <p className="text-sm text-[#6B7280] text-center max-w-md mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-[#111111] text-white text-sm font-medium rounded-md hover:bg-[#333333]"
      >
        Try Again
      </button>
    </div>
  );
}

// ============================================================================
// Overview Page
// ============================================================================

export function OverviewPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");
  const [allybiMetric, setAllybiMetric] = useState<OverviewTimeseriesMetric>("allybi_visits");

  const { data, isLoading, error, refetch } = useOverview({ range, env });
  const {
    data: allybiTimeseries,
    isLoading: isTimeseriesLoading,
    error: timeseriesError,
    refetch: refetchTimeseries,
  } = useOverviewTimeseries({ range, env, metric: allybiMetric });
  const google = data?.google;

  const allybiSeriesData = useMemo(() => {
    const points = Array.isArray(allybiTimeseries?.points) ? allybiTimeseries.points : [];
    return points
      .map((point) => {
        const rawTime = point.t || point.timestamp || "";
        const dt = rawTime ? new Date(rawTime) : null;
        let label = "-";
        if (dt && !Number.isNaN(dt.getTime())) {
          label = range === "24h"
            ? dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : dt.toLocaleDateString([], { month: "short", day: "numeric" });
        }
        return {
          label,
          value: Number(point.value || 0),
          ts: rawTime,
        };
      })
      .filter((point) => point.ts);
  }, [allybiTimeseries?.points, range]);

  const formatBytes = (bytes: number | null | undefined) => {
    if (bytes == null || bytes <= 0) return "-";
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <AdminLayout
      range={range}
      onRangeChange={setRange}
      env={env}
      onEnvChange={setEnv}
    >
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Overview</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          System-wide metrics and recent activity
        </p>
      </div>

      {/* Error State */}
      {error && <ErrorState message={error.message} onRetry={refetch} />}

      {/* Loading or Data State */}
      {!error && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {isLoading ? (
              [...Array(8)].map((_, i) => <KpiSkeleton key={i} />)
            ) : data ? (
              <>
                <KpiCard label="Daily Active Users" value={data.kpis.dau} icon={UserCheck} />
                <KpiCard label="Messages" value={data.kpis.messages} icon={MessageSquare} />
                <KpiCard label="Conversations" value={data.kpis.conversationsCreated} icon={MessageSquare} />
                <KpiCard label="Uploads" value={data.kpis.uploads} icon={FileText} />
                <KpiCard label="Allybi Visits" value={data.kpis.allybiVisits} icon={MousePointerClick} />
                <KpiCard label="Allybi Clicks" value={data.kpis.allybiClicks} icon={MousePointerClick} />
                <KpiCard label="Allybi CTR" value={data.kpis.allybiClickThroughRate} icon={TrendingUp} format="percent" />
                <KpiCard label="LLM Calls" value={data.kpis.llmCalls} icon={Search} />
              </>
            ) : null}
          </div>

          {/* Additional KPIs */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {isLoading ? (
              [...Array(4)].map((_, i) => <KpiSkeleton key={i} />)
            ) : data ? (
              <>
                <KpiCard label="Tokens Used" value={data.kpis.tokensTotal} icon={DollarSign} />
                <KpiCard label="LLM Error Rate" value={data.kpis.llmErrorRate} icon={AlertTriangle} format="percent" />
                <KpiCard label="Weak Evidence Rate" value={data.kpis.weakEvidenceRate} icon={AlertTriangle} format="percent" />
                <KpiCard label="No Evidence Rate" value={data.kpis.noEvidenceRate} icon={AlertTriangle} format="percent" />
              </>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {isLoading ? (
              [...Array(3)].map((_, i) => <KpiSkeleton key={i} />)
            ) : data ? (
              <>
                <KpiCard label="Ingestion Failures" value={data.kpis.ingestionFailures} icon={AlertTriangle} />
                <KpiCard label="Latency P50" value={`${data.kpis.latencyMsP50}ms`} icon={TrendingUp} />
                <KpiCard label="Latency P95" value={`${data.kpis.latencyMsP95}ms`} icon={TrendingUp} />
              </>
            ) : null}
          </div>

          {/* Allybi Interaction Trend */}
          <ChartContainer
            title="Allybi Interaction Trend"
            subtitle="Track visits and click activity over time."
            className="mb-6"
            height={340}
            loading={isTimeseriesLoading}
            empty={!allybiSeriesData.length}
            error={timeseriesError?.message || null}
            onRetry={refetchTimeseries}
          >
            <div className="h-full flex flex-col">
              <div className="mb-4 flex items-center gap-2">
                {[
                  { key: "allybi_visits", label: "Visits" },
                  { key: "allybi_clicks", label: "Clicks" },
                ].map((opt) => {
                  const active = allybiMetric === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setAllybiMetric(opt.key as OverviewTimeseriesMetric)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md border transition-colors ${
                        active
                          ? "bg-[#181818] text-white border-[#181818]"
                          : "bg-white text-[#525252] border-[#e5e5e5] hover:border-[#181818]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={allybiSeriesData} margin={chartConfig.margin}>
                    <CartesianGrid {...chartConfig.grid} />
                    <XAxis
                      dataKey="label"
                      stroke={chartColors.grid}
                      tick={chartConfig.axis.tick}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke={chartColors.grid}
                      tick={chartConfig.axis.tick}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name={allybiMetric === "allybi_clicks" ? "Clicks" : "Visits"}
                      stroke={chartColors.primary}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </ChartContainer>

          {/* Time Window Info */}
          {data?.window && (
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-5 mb-6">
              <h3 className="text-sm font-medium text-[#111111] mb-2">Time Window</h3>
              <p className="text-sm text-[#6B7280]">
                From: {new Date(data.window.from).toLocaleString()} — To: {new Date(data.window.to).toLocaleString()}
              </p>
            </div>
          )}

          {/* Google Cloud Metrics */}
          {google && (
            <>
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-[#111111]">Google Cloud Metrics</h3>
                <p className="text-xs text-[#6B7280]">Cloud SQL, Cloud Run, Gemini API, OCR</p>
              </div>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <KpiCard label="Cloud SQL Connected" value={google.cloudSql?.connected ? "Yes" : "No"} icon={Database} />
                <KpiCard label="Cloud SQL Latency" value={google.cloudSql?.latencyMs != null ? `${google.cloudSql.latencyMs}ms` : "-"} icon={Database} />
                <KpiCard label="Cloud SQL Connections" value={google.cloudSql?.activeConnections ?? 0} icon={Database} />
                <KpiCard label="Cloud SQL Size" value={formatBytes(google.cloudSql?.databaseSizeBytes)} icon={Database} />
                <KpiCard label="Cloud Run Calls" value={google.cloudRun?.calls ?? 0} icon={Server} />
                <KpiCard label="Cloud Run Error Rate" value={google.cloudRun?.errorRate ?? 0} icon={Server} format="percent" />
                <KpiCard label="Gemini Calls" value={google.gemini?.calls ?? 0} icon={Cpu} />
                <KpiCard label="Gemini Tokens" value={google.gemini?.tokens ?? 0} icon={Cpu} />
                <KpiCard label="Gemini Cost" value={google.gemini?.estimatedCostUsd ?? 0} icon={DollarSign} format="currency" />
                <KpiCard label="OCR Docs Processed" value={google.ocr?.docsProcessed ?? 0} icon={ScanSearch} />
                <KpiCard label="OCR Coverage" value={google.ocr?.ocrCoverageRate ?? 0} icon={ScanSearch} format="percent" />
                <KpiCard label="OCR Confidence" value={google.ocr?.avgConfidence ?? 0} icon={ScanSearch} format="percent" />
              </div>
            </>
          )}
        </>
      )}
    </AdminLayout>
  );
}

export default OverviewPage;
