/**
 * Overview Page - Koda Admin Dashboard
 * Main dashboard with KPIs, charts, top issues, and recent queries
 */

import { useState } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useOverview } from "@/hooks/useAdminApi";
import type { TimeRange, Environment, RecentQuery, TopIssue } from "@/types/admin";
import {
  Users,
  UserCheck,
  FileText,
  MessageSquare,
  Search,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Chart Configuration
// ============================================================================

const chartColors = {
  primary: "#111111",
  secondary: "#6B7280",
  error: "#B91C1C",
  grid: "#E6E6EC",
};

const chartConfig = {
  margin: { top: 8, right: 8, left: 0, bottom: 0 },
  grid: { strokeDasharray: "3 3", stroke: chartColors.grid },
  axis: { tick: { fontSize: 11, fill: "#6B7280" } },
};

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

function ChartSkeleton() {
  return (
    <div className="bg-white border border-[#E6E6EC] rounded-lg p-5 animate-pulse">
      <div className="h-4 w-32 bg-[#E6E6EC] rounded mb-4" />
      <div className="h-48 bg-[#E6E6EC] rounded" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="bg-white border border-[#E6E6EC] rounded-lg animate-pulse">
      <div className="p-4 border-b border-[#E6E6EC]">
        <div className="h-5 w-40 bg-[#E6E6EC] rounded" />
      </div>
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-[#E6E6EC] rounded" />
        ))}
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
  const formatValue = (val: string | number) => {
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
// Chart Card Component
// ============================================================================

interface ChartCardProps {
  title: string;
  data: { timestamp: string; value: number }[];
  color?: string;
  format?: "number" | "currency";
  loading?: boolean;
}

function ChartCard({ title, data, color = chartColors.primary, format = "number", loading }: ChartCardProps) {
  const formatValue = (val: number) => {
    if (format === "currency") return `$${val.toFixed(2)}`;
    return val.toLocaleString();
  };

  if (loading) return <ChartSkeleton />;

  if (!data || data.length === 0) {
    return (
      <div className="bg-white border border-[#E6E6EC] rounded-lg p-5">
        <h3 className="text-sm font-medium text-[#111111] mb-4">{title}</h3>
        <div className="h-48 flex items-center justify-center text-sm text-[#6B7280]">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E6E6EC] rounded-lg p-5">
      <h3 className="text-sm font-medium text-[#111111] mb-4">{title}</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={chartConfig.margin}>
            <CartesianGrid {...chartConfig.grid} />
            <XAxis
              dataKey="timestamp"
              tick={chartConfig.axis.tick}
              tickLine={false}
              axisLine={{ stroke: chartColors.grid }}
              tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            />
            <YAxis
              tick={chartConfig.axis.tick}
              tickLine={false}
              axisLine={{ stroke: chartColors.grid }}
              tickFormatter={formatValue}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111111",
                border: "none",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "12px",
              }}
              labelFormatter={(val) => new Date(val).toLocaleString()}
              formatter={(val: number) => [formatValue(val), title]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============================================================================
// Top Issues Panel
// ============================================================================

interface TopIssuesPanelProps {
  title: string;
  issues: TopIssue[];
  loading?: boolean;
}

function TopIssuesPanel({ title, issues, loading }: TopIssuesPanelProps) {
  if (loading) {
    return (
      <div className="bg-white border border-[#E6E6EC] rounded-lg p-5 animate-pulse">
        <div className="h-4 w-32 bg-[#E6E6EC] rounded mb-4" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-6 bg-[#E6E6EC] rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!issues || issues.length === 0) {
    return (
      <div className="bg-white border border-[#E6E6EC] rounded-lg p-5">
        <h3 className="text-sm font-medium text-[#111111] mb-4">{title}</h3>
        <p className="text-sm text-[#6B7280]">No issues detected</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E6E6EC] rounded-lg p-5">
      <h3 className="text-sm font-medium text-[#111111] mb-4">{title}</h3>
      <div className="space-y-3">
        {issues.slice(0, 5).map((issue, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-sm text-[#111111] truncate flex-1 mr-2">{issue.category}</span>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-sm font-medium text-[#111111]">{issue.count}</span>
              <span className="text-xs text-[#6B7280] w-12 text-right">({issue.percentage.toFixed(1)}%)</span>
              {issue.trend === "up" && <TrendingUp className="w-3 h-3 text-[#B91C1C]" />}
              {issue.trend === "down" && <TrendingDown className="w-3 h-3 text-[#22c55e]" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Recent Queries Table
// ============================================================================

interface RecentQueriesTableProps {
  queries: RecentQuery[];
  loading?: boolean;
}

function RecentQueriesTable({ queries, loading }: RecentQueriesTableProps) {
  if (loading) return <TableSkeleton />;

  if (!queries || queries.length === 0) {
    return (
      <div className="bg-white border border-[#E6E6EC] rounded-lg">
        <div className="p-4 border-b border-[#E6E6EC]">
          <h3 className="text-sm font-medium text-[#111111]">Recent Queries</h3>
        </div>
        <div className="p-8 text-center">
          <Search className="w-8 h-8 text-[#E6E6EC] mx-auto mb-2" />
          <p className="text-sm text-[#6B7280]">No queries yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
      <div className="p-4 border-b border-[#E6E6EC]">
        <h3 className="text-sm font-medium text-[#111111]">Recent Queries (Last 50)</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Timestamp</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">User</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Intent</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Domain</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Mode</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Retrieval</th>
              <th className="text-right px-4 py-3 font-medium text-[#6B7280]">TTFT</th>
              <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Total</th>
              <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Status</th>
            </tr>
          </thead>
          <tbody>
            {queries.map((query) => (
              <tr key={query.id} className="border-b border-[#E6E6EC] hover:bg-[#FAFAFA]">
                <td className="px-4 py-3 text-[#6B7280]">
                  {new Date(query.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-[#111111]">
                  {query.userEmail || query.userId.slice(0, 8)}
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 bg-[#F5F5F5] rounded text-xs text-[#111111]">
                    {query.intent}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#111111]">{query.domain}</td>
                <td className="px-4 py-3 text-[#6B7280]">{query.answerMode}</td>
                <td className="px-4 py-3 text-[#6B7280]">{query.retrievalMethod}</td>
                <td className="px-4 py-3 text-right text-[#111111]">{query.ttftMs}ms</td>
                <td className="px-4 py-3 text-right text-[#111111]">{query.totalMs}ms</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {query.hasErrors && (
                      <span className="px-2 py-0.5 bg-[#fef2f2] text-[#B91C1C] rounded text-xs">Error</span>
                    )}
                    {query.hadFallback && (
                      <span className="px-2 py-0.5 bg-[#fefce8] text-[#a16207] rounded text-xs">Fallback</span>
                    )}
                    {!query.hasErrors && !query.hadFallback && (
                      <span className="px-2 py-0.5 bg-[#f0fdf4] text-[#15803d] rounded text-xs">OK</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                <KpiCard label="Total Users" value={data.kpis.totalUsers} icon={Users} />
                <KpiCard label="Active Users" value={data.kpis.activeUsers} icon={UserCheck} />
                <KpiCard label="Documents" value={data.kpis.documents} icon={FileText} />
                <KpiCard label="Conversations" value={data.kpis.conversations} icon={MessageSquare} />
                <KpiCard label="Messages" value={data.kpis.messages} icon={MessageSquare} />
                <KpiCard label="RAG Queries" value={data.kpis.ragQueries} icon={Search} />
                <KpiCard label="Error Rate" value={data.kpis.errorRate} icon={AlertTriangle} format="percent" />
                <KpiCard label="Total Cost" value={data.kpis.costUsd} icon={DollarSign} format="currency" />
              </>
            ) : null}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <ChartCard
              title="Messages Over Time"
              data={data?.charts.messagesOverTime || []}
              loading={isLoading}
            />
            <ChartCard
              title="RAG Queries Over Time"
              data={data?.charts.ragQueriesOverTime || []}
              loading={isLoading}
            />
            <ChartCard
              title="Error Count Over Time"
              data={data?.charts.errorCountOverTime || []}
              color={chartColors.error}
              loading={isLoading}
            />
            <ChartCard
              title="Cost Over Time"
              data={data?.charts.costOverTime || []}
              format="currency"
              loading={isLoading}
            />
          </div>

          {/* Top Issues */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <TopIssuesPanel
              title="Top Failure Categories"
              issues={data?.topIssues.failureCategories || []}
              loading={isLoading}
            />
            <TopIssuesPanel
              title="Top Fallback Scenarios"
              issues={data?.topIssues.fallbackScenarios || []}
              loading={isLoading}
            />
            <TopIssuesPanel
              title="Language Mismatches"
              issues={data?.topIssues.languageMismatches || []}
              loading={isLoading}
            />
          </div>

          {/* Recent Queries Table */}
          <RecentQueriesTable
            queries={data?.recentQueries || []}
            loading={isLoading}
          />
        </>
      )}
    </AdminLayout>
  );
}

export default OverviewPage;
