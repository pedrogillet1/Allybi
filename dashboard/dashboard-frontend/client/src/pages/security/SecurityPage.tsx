import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AdminLayout, PageHeader } from "@/components/layout";
import { KpiCard, KpiCardRow } from "@/components/kpi";
import { DataTable, type Column } from "@/components/tables";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import { useSecurity } from "@/hooks/useTelemetry";
import { formatNumber, formatDateTime } from "@/utils/format";
import type { TimeRange, AuthEvent, RateLimitEvent, AdminAudit } from "@/types/telemetry";

type ActiveTab = "auth" | "ratelimit" | "audit";

export function SecurityPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [activeTab, setActiveTab] = useState<ActiveTab>("auth");

  const { data, isLoading, error, refetch } = useSecurity({ range });

  const authColumns: Column<AuthEvent>[] = [
    {
      key: "ts",
      header: "Time",
      render: (row) => (
        <span className="text-[#737373] text-xs">{formatDateTime(row.ts)}</span>
      ),
    },
    {
      key: "userEmail",
      header: "User",
      render: (row) => row.userEmail || "-",
    },
    {
      key: "event",
      header: "Event",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#f5f5f5] rounded">
          {row.event}
        </span>
      ),
    },
    {
      key: "ipHash",
      header: "IP Hash",
      render: (row) => (
        <span className="font-mono text-xs">{row.ipHash.slice(0, 12)}...</span>
      ),
    },
    {
      key: "result",
      header: "Result",
      render: (row) => (
        <span className={`px-2 py-1 text-xs rounded ${
          row.result === "success" ? "bg-[#181818] text-white" : "bg-[#e5e5e5] text-[#525252]"
        }`}>
          {row.result}
        </span>
      ),
    },
  ];

  const rateLimitColumns: Column<RateLimitEvent>[] = [
    {
      key: "ts",
      header: "Time",
      render: (row) => (
        <span className="text-[#737373] text-xs">{formatDateTime(row.ts)}</span>
      ),
    },
    {
      key: "route",
      header: "Route",
      render: (row) => (
        <span className="font-mono text-xs">{row.route}</span>
      ),
    },
    {
      key: "ipHash",
      header: "IP Hash",
      render: (row) => (
        <span className="font-mono text-xs">{row.ipHash.slice(0, 12)}...</span>
      ),
    },
    {
      key: "limiterName",
      header: "Limiter",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#f5f5f5] rounded">
          {row.limiterName}
        </span>
      ),
    },
  ];

  const auditColumns: Column<AdminAudit>[] = [
    {
      key: "ts",
      header: "Time",
      render: (row) => (
        <span className="text-[#737373] text-xs">{formatDateTime(row.ts)}</span>
      ),
    },
    {
      key: "admin",
      header: "Admin",
      render: (row) => row.admin,
    },
    {
      key: "action",
      header: "Action",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#181818] text-white rounded">
          {row.action}
        </span>
      ),
    },
    {
      key: "target",
      header: "Target",
      render: (row) => row.target,
    },
  ];

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "auth", label: "Auth Events" },
    { key: "ratelimit", label: "Rate Limits" },
    { key: "audit", label: "Admin Audit" },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Security"
        subtitle="Authentication, rate limiting, and admin audit"
        range={range}
        onRangeChange={setRange}
      />

      {/* KPIs */}
      <KpiCardRow className="grid-cols-2 md:grid-cols-4">
        <KpiCard
          title="Total Users"
          value={data ? formatNumber(data.kpis.totalUsers) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Active Users"
          value={data ? formatNumber(data.kpis.activeUsers) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Auth Failures"
          value={data ? formatNumber(data.kpis.authFailures) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Rate Limit Triggers"
          value={data ? formatNumber(data.kpis.rateLimitTriggers) : "-"}
          loading={isLoading}
        />
      </KpiCardRow>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <ChartContainer
          title="Failed Logins per Day"
          loading={isLoading}
          empty={!data?.charts.failedLoginsPerDay.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.charts.failedLoginsPerDay} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis
                dataKey="day"
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
                name="Failed Logins"
                stroke={chartColors.primary}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Rate Limits per Day"
          loading={isLoading}
          empty={!data?.charts.rateLimitsPerDay.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.charts.rateLimitsPerDay} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis
                dataKey="day"
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
                name="Rate Limits"
                stroke={chartColors.secondary}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Admin Actions per Day"
          loading={isLoading}
          empty={!data?.charts.adminActionsPerDay.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.charts.adminActionsPerDay} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis
                dataKey="day"
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
                name="Admin Actions"
                stroke={chartColors.tertiary}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

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
      {activeTab === "auth" && (
        <DataTable
          columns={authColumns}
          data={data?.authEvents ?? []}
          loading={isLoading}
          emptyMessage="No auth events found"
        />
      )}

      {activeTab === "ratelimit" && (
        <DataTable
          columns={rateLimitColumns}
          data={data?.rateLimitEvents ?? []}
          loading={isLoading}
          emptyMessage="No rate limit events found"
        />
      )}

      {activeTab === "audit" && (
        <DataTable
          columns={auditColumns}
          data={data?.adminAudit ?? []}
          loading={isLoading}
          emptyMessage="No admin audit events found"
        />
      )}
    </AdminLayout>
  );
}

export default SecurityPage;
