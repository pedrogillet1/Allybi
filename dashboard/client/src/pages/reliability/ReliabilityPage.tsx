import { useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Check, X } from "lucide-react";
import { AdminLayout, PageHeader } from "@/components/layout";
import { KpiCard, KpiCardRow } from "@/components/kpi";
import { DataTable, type Column } from "@/components/tables";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import { useReliability } from "@/hooks/useTelemetry";
import { formatNumber, formatDuration, formatDateTime } from "@/utils/format";
import type { TimeRange, ReliabilityError } from "@/types/telemetry";

export function ReliabilityPage() {
  const [range, setRange] = useState<TimeRange>("7d");

  const { data, isLoading, error, refetch } = useReliability({ range });

  const errorColumns: Column<ReliabilityError>[] = [
    {
      key: "ts",
      header: "Time",
      render: (row) => (
        <span className="text-[#737373] text-xs">{formatDateTime(row.ts)}</span>
      ),
    },
    {
      key: "service",
      header: "Service",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#f5f5f5] rounded">
          {row.service}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => row.type,
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
      key: "severity",
      header: "Severity",
      render: (row) => (
        <span className={`px-2 py-1 text-xs rounded ${
          row.severity === "high" ? "bg-[#181818] text-white" :
          row.severity === "med" ? "bg-[#525252] text-white" :
          "bg-[#e5e5e5] text-[#525252]"
        }`}>
          {row.severity.toUpperCase()}
        </span>
      ),
    },
    {
      key: "resolved",
      header: "Resolved",
      render: (row) =>
        row.resolved ? (
          <Check className="w-4 h-4 text-[#525252]" />
        ) : (
          <X className="w-4 h-4 text-[#a3a3a3]" />
        ),
    },
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
          value={data ? formatDuration(data.kpis.p50LatencyMs) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="P95 Latency"
          value={data ? formatDuration(data.kpis.p95LatencyMs) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Error Rate"
          value={data ? `${(data.kpis.errorRate * 100).toFixed(2)}%` : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Error Count"
          value={data ? formatNumber(data.kpis.errorCount) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Total Messages"
          value={data ? formatNumber(data.kpis.totalMessages) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Active Users"
          value={data ? formatNumber(data.kpis.activeUsers) : "-"}
          loading={isLoading}
        />
      </KpiCardRow>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <ChartContainer
          title="Latency Over Time"
          loading={isLoading}
          empty={!data?.charts.latency.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.charts.latency} margin={chartConfig.margin}>
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
                tickFormatter={(v) => `${v}ms`}
              />
              <Tooltip content={<ChartTooltip formatter={(v) => `${v}ms`} />} />
              <Legend {...chartConfig.legend} />
              <Line
                type="monotone"
                dataKey="p50"
                name="P50"
                stroke={chartColors.primary}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="p95"
                name="P95"
                stroke={chartColors.secondary}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Error Rate Over Time"
          loading={isLoading}
          empty={!data?.charts.errorRate.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.charts.errorRate} margin={chartConfig.margin}>
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
                tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
              />
              <Tooltip content={<ChartTooltip formatter={(v) => `${(v * 100).toFixed(2)}%`} />} />
              <Line
                type="monotone"
                dataKey="value"
                name="Error Rate"
                stroke={chartColors.primary}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Job Failures by Type"
          loading={isLoading}
          empty={!data?.charts.jobFailures.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.charts.jobFailures} layout="vertical" margin={{ ...chartConfig.margin, left: 80 }}>
              <CartesianGrid {...chartConfig.grid} horizontal={false} />
              <XAxis
                type="number"
                stroke={chartColors.grid}
                tick={chartConfig.axis.tick}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                stroke={chartColors.grid}
                tick={chartConfig.axis.tick}
                tickLine={false}
                axisLine={false}
                width={70}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" name="Failures" fill={chartColors.primary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Errors Table */}
      <div>
        <h2 className="text-sm font-semibold text-[#181818] mb-4">Recent Errors</h2>
        <DataTable
          columns={errorColumns}
          data={data?.errors ?? []}
          loading={isLoading}
          emptyMessage="No errors found"
        />
      </div>
    </AdminLayout>
  );
}

export default ReliabilityPage;
