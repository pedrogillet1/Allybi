/**
 * Overview Page - Koda Admin Dashboard
 * Main dashboard with KPIs from the backend
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useOverview } from "@/hooks/useAdminApi";
import type { TimeRange, Environment } from "@/types/admin";
import {
  UserCheck,
  FileText,
  MessageSquare,
  Search,
  AlertTriangle,
  DollarSign,
  TrendingUp,
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

  const { data, isLoading, error, refetch } = useOverview({ range, env });

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
                <KpiCard label="LLM Calls" value={data.kpis.llmCalls} icon={Search} />
                <KpiCard label="Tokens Used" value={data.kpis.tokensTotal} icon={DollarSign} />
                <KpiCard label="LLM Error Rate" value={data.kpis.llmErrorRate} icon={AlertTriangle} format="percent" />
                <KpiCard label="Weak Evidence Rate" value={data.kpis.weakEvidenceRate} icon={AlertTriangle} format="percent" />
              </>
            ) : null}
          </div>

          {/* Additional KPIs */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {isLoading ? (
              [...Array(4)].map((_, i) => <KpiSkeleton key={i} />)
            ) : data ? (
              <>
                <KpiCard label="No Evidence Rate" value={data.kpis.noEvidenceRate} icon={AlertTriangle} format="percent" />
                <KpiCard label="Ingestion Failures" value={data.kpis.ingestionFailures} icon={AlertTriangle} />
                <KpiCard label="Latency P50" value={`${data.kpis.latencyMsP50}ms`} icon={TrendingUp} />
                <KpiCard label="Latency P95" value={`${data.kpis.latencyMsP95}ms`} icon={TrendingUp} />
              </>
            ) : null}
          </div>

          {/* Time Window Info */}
          {data?.window && (
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-5 mb-6">
              <h3 className="text-sm font-medium text-[#111111] mb-2">Time Window</h3>
              <p className="text-sm text-[#6B7280]">
                From: {new Date(data.window.from).toLocaleString()} — To: {new Date(data.window.to).toLocaleString()}
              </p>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}

export default OverviewPage;
