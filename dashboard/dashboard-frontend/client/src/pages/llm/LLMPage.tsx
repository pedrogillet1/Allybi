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
import { AdminLayout, PageHeader } from "@/components/layout";
import { KpiCard, KpiCardRow } from "@/components/kpi";
import { DataTable, type Column } from "@/components/tables";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import { useLLM } from "@/hooks/useTelemetry";
import { formatNumber, formatCurrency, formatDuration, formatDateTime } from "@/utils/format";
import type { TimeRange, LLMCall } from "@/types/telemetry";

export function LLMPage() {
  const [range, setRange] = useState<TimeRange>("7d");

  const { data, isLoading, error, refetch } = useLLM({ range });

  const callColumns: Column<LLMCall>[] = [
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
      key: "type",
      header: "Type",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#f5f5f5] rounded">
          {row.type}
        </span>
      ),
    },
    {
      key: "tokens",
      header: "Tokens",
      render: (row) => formatNumber(row.tokens),
    },
    {
      key: "costUsd",
      header: "Cost",
      render: (row) => (
        <span className="font-medium">${row.costUsd.toFixed(4)}</span>
      ),
    },
    {
      key: "latencyMs",
      header: "Latency",
      render: (row) => formatDuration(row.latencyMs),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className={`px-2 py-1 text-xs rounded ${
          row.status === "success" ? "bg-[#181818] text-white" : "bg-[#f5f5f5] text-[#525252]"
        }`}>
          {row.status}
        </span>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="LLM / Cost"
        subtitle="LLM usage, costs, and performance"
        range={range}
        onRangeChange={setRange}
      />

      {/* KPIs */}
      <KpiCardRow>
        <KpiCard
          title="Total Cost"
          value={data ? formatCurrency(data.kpis.costUsd) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Total Tokens"
          value={data ? formatNumber(data.kpis.totalTokens) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Total Calls"
          value={data ? formatNumber(data.kpis.totalCalls) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Avg Latency"
          value={data ? formatDuration(data.kpis.avgLatencyMs) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Error Rate"
          value={data ? `${(data.kpis.errorRate * 100).toFixed(1)}%` : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Recent Errors"
          value={data ? formatNumber(data.kpis.recentErrors) : "-"}
          loading={isLoading}
        />
      </KpiCardRow>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <ChartContainer
          title="Cost per Day"
          loading={isLoading}
          empty={!data?.charts.costPerDay.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.charts.costPerDay} margin={chartConfig.margin}>
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
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip content={<ChartTooltip formatter={(v) => `$${v.toFixed(2)}`} />} />
              <Line
                type="monotone"
                dataKey="valueUsd"
                name="Cost"
                stroke={chartColors.primary}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Tokens per Day"
          loading={isLoading}
          empty={!data?.charts.tokensPerDay.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.charts.tokensPerDay} margin={chartConfig.margin}>
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
                tickFormatter={(v) => formatNumber(v)}
              />
              <Tooltip content={<ChartTooltip formatter={(v) => formatNumber(v)} />} />
              <Line
                type="monotone"
                dataKey="value"
                name="Tokens"
                stroke={chartColors.secondary}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Cost by Model"
          loading={isLoading}
          empty={!data?.charts.costByModel.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.charts.costByModel} layout="vertical" margin={{ ...chartConfig.margin, left: 80 }}>
              <CartesianGrid {...chartConfig.grid} horizontal={false} />
              <XAxis
                type="number"
                stroke={chartColors.grid}
                tick={chartConfig.axis.tick}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
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
              <Tooltip content={<ChartTooltip formatter={(v) => `$${v.toFixed(2)}`} />} />
              <Bar dataKey="valueUsd" name="Cost" fill={chartColors.primary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* LLM Calls Table */}
      <div>
        <h2 className="text-sm font-semibold text-[#181818] mb-4">Recent LLM Calls</h2>
        <DataTable
          columns={callColumns}
          data={data?.calls ?? []}
          loading={isLoading}
          emptyMessage="No LLM calls found"
        />
      </div>
    </AdminLayout>
  );
}

export default LLMPage;
