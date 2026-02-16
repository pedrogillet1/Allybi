import { useState, useMemo } from "react";
import { AdminLayout, PageHeader } from "@/components/layout";
import { KpiCard, KpiCardRow } from "@/components/kpi";
import { DataTable, type Column } from "@/components/tables";
import { useReliability } from "@/hooks/useTelemetry";
import { formatNumber, formatDuration, formatDateTime } from "@/utils/format";
import type { TimeRange } from "@/types/telemetry";

type ActiveTab = "errors" | "ingestion";

interface LLMErrorItem {
  id: string;
  ts: string;
  provider: string;
  model: string;
  errorType: string;
  message: string;
  stage?: string;
}

interface IngestionFailureItem {
  id: string;
  ts: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  error: string;
  stage?: string;
}

export function ReliabilityPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [activeTab, setActiveTab] = useState<ActiveTab>("errors");

  const { data, isLoading } = useReliability({ range });
  const google = data?.google;

  // Extract kpis
  const kpis = data?.kpis as {
    p50LatencyMs?: number | null;
    p95LatencyMs?: number | null;
    errorRate?: number;
    errorCount?: number;
    totalMessages?: number;
    activeUsers?: number;
  } | undefined;

  // Extract data arrays
  const recentErrors = useMemo(() => {
    return (data?.recentErrors as LLMErrorItem[] | undefined) ?? [];
  }, [data?.recentErrors]);

  const recentIngestionFailures = useMemo(() => {
    return (data?.recentIngestionFailures as IngestionFailureItem[] | undefined) ?? [];
  }, [data?.recentIngestionFailures]);

  const errorColumns: Column<LLMErrorItem>[] = [
    {
      key: "ts",
      header: "Time",
      render: (row) => (
        <span className="text-[#737373] text-xs">{formatDateTime(row.ts)}</span>
      ),
    },
    {
      key: "provider",
      header: "Provider",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#181818] text-white rounded">
          {row.provider}
        </span>
      ),
    },
    {
      key: "model",
      header: "Model",
      render: (row) => (
        <span className="font-mono text-xs">{row.model}</span>
      ),
    },
    {
      key: "errorType",
      header: "Type",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#f5f5f5] rounded">
          {row.errorType}
        </span>
      ),
    },
    {
      key: "message",
      header: "Message",
      render: (row) => (
        <span className="truncate max-w-xs block" title={row.message}>
          {row.message}
        </span>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      render: (row) => row.stage || "-",
    },
  ];

  const ingestionColumns: Column<IngestionFailureItem>[] = [
    {
      key: "ts",
      header: "Time",
      render: (row) => (
        <span className="text-[#737373] text-xs">{formatDateTime(row.ts)}</span>
      ),
    },
    {
      key: "fileName",
      header: "File",
      render: (row) => (
        <span className="truncate max-w-xs block" title={row.fileName}>
          {row.fileName}
        </span>
      ),
    },
    {
      key: "mimeType",
      header: "Type",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#f5f5f5] rounded">
          {row.mimeType}
        </span>
      ),
    },
    {
      key: "error",
      header: "Error",
      render: (row) => (
        <span className="truncate max-w-xs block text-red-600" title={row.error}>
          {row.error}
        </span>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      render: (row) => row.stage || "-",
    },
  ];

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "errors", label: `LLM Errors (${recentErrors.length})` },
    { key: "ingestion", label: `Ingestion Failures (${recentIngestionFailures.length})` },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Reliability"
        subtitle="System latency, errors, and job failures"
        range={range}
        onRangeChange={setRange}
      />

      {/* KPIs */}
      <KpiCardRow>
        <KpiCard
          title="P50 Latency"
          value={kpis?.p50LatencyMs != null ? formatDuration(kpis.p50LatencyMs) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="P95 Latency"
          value={kpis?.p95LatencyMs != null ? formatDuration(kpis.p95LatencyMs) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Error Rate"
          value={kpis ? `${((kpis.errorRate ?? 0) * 100).toFixed(2)}%` : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Error Count"
          value={kpis ? formatNumber(kpis.errorCount ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Total Messages"
          value={kpis ? formatNumber(kpis.totalMessages ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Active Users"
          value={kpis ? formatNumber(kpis.activeUsers ?? 0) : "-"}
          loading={isLoading}
        />
      </KpiCardRow>

      <KpiCardRow className="mt-4">
        <KpiCard
          title="Cloud Run Calls"
          value={data ? formatNumber(google?.cloudRun?.calls ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Cloud Run Error Rate"
          value={data ? `${(google?.cloudRun?.errorRate ?? 0).toFixed(2)}%` : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Cloud Run P95"
          value={data ? formatDuration(google?.cloudRun?.p95LatencyMs ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Cloud SQL Connected"
          value={google?.cloudSql?.connected ? "Yes" : "No"}
          loading={isLoading}
        />
      </KpiCardRow>

      {/* Tabs */}
      <div className="mb-4">
        <div className="flex gap-1 bg-[#f5f5f5] p-1 rounded-md w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                activeTab === tab.key
                  ? "bg-[#181818] text-white"
                  : "text-[#525252] hover:text-[#181818]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tables */}
      {activeTab === "errors" && (
        <DataTable
          columns={errorColumns}
          data={recentErrors}
          loading={isLoading}
          emptyMessage="No LLM errors found"
        />
      )}

      {activeTab === "ingestion" && (
        <DataTable
          columns={ingestionColumns}
          data={recentIngestionFailures}
          loading={isLoading}
          emptyMessage="No ingestion failures found"
        />
      )}
    </AdminLayout>
  );
}

export default ReliabilityPage;
