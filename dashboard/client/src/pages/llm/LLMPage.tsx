import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
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
import { useLLM } from "@/hooks/useTelemetry";
import { formatNumber, formatCurrency, formatDuration } from "@/utils/format";
import type { TimeRange } from "@/types/telemetry";

interface ModelSummary {
  model: string;
  calls: number;
  tokens: number;
}

interface ProviderSummary {
  provider: string;
  calls: number;
  tokens: number;
}

interface StageSummary {
  stage: string;
  calls: number;
  tokens: number;
  latencyMs: number;
}

export function LLMPage() {
  const [range, setRange] = useState<TimeRange>("7d");

  const { data, isLoading, error, refetch } = useLLM({ range });

  // Transform backend summary data for charts
  const modelChartData = useMemo(() => {
    const byModel = data?.summary?.byModel as ModelSummary[] | undefined;
    const costByModel = data?.charts?.costByModel as { label: string; valueUsd: number; tokens: number }[] | undefined;
    if (!byModel) return [];

    // Create a map of costs from costByModel
    const costMap = new Map(costByModel?.map(c => [c.label, c.valueUsd]) ?? []);

    return byModel.map((item) => ({
      label: item.model,
      tokens: item.tokens,
      calls: item.calls,
      costUsd: costMap.get(item.model) ?? 0,
    }));
  }, [data?.summary?.byModel, data?.charts?.costByModel]);

  const providerChartData = useMemo(() => {
    const byProvider = data?.summary?.byProvider as ProviderSummary[] | undefined;
    if (!byProvider) return [];
    return byProvider.map((item) => ({
      label: item.provider,
      tokens: item.tokens,
      calls: item.calls,
    }));
  }, [data?.summary?.byProvider]);

  const stageChartData = useMemo(() => {
    const byStage = data?.summary?.byStage as StageSummary[] | undefined;
    if (!byStage) return [];
    return byStage.map((item) => ({
      label: item.stage,
      tokens: item.tokens,
      calls: item.calls,
      latencyMs: item.latencyMs,
    }));
  }, [data?.summary?.byStage]);

  // Table columns for model breakdown
  const modelColumns: Column<{ label: string; tokens: number; calls: number; costUsd: number }>[] = [
    {
      key: "label",
      header: "Model",
      render: (row) => (
        <span className="font-mono text-xs">{row.label}</span>
      ),
    },
    {
      key: "calls",
      header: "Calls",
      render: (row) => formatNumber(row.calls),
    },
    {
      key: "tokens",
      header: "Tokens",
      render: (row) => formatNumber(row.tokens),
    },
    {
      key: "costUsd",
      header: "Cost",
      render: (row) => formatCurrency(row.costUsd),
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
          value={data ? formatCurrency(data.kpis?.costUsd ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Total Tokens"
          value={data ? formatNumber(data.kpis?.totalTokens ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Total Calls"
          value={data ? formatNumber(data.kpis?.totalCalls ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Avg Latency"
          value={data ? formatDuration(data.kpis?.avgLatencyMs ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Error Rate"
          value={data ? `${((data.kpis?.errorRate ?? 0) * 100).toFixed(1)}%` : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Recent Errors"
          value={data ? formatNumber(data.kpis?.recentErrors ?? 0) : "-"}
          loading={isLoading}
        />
      </KpiCardRow>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <ChartContainer
          title="Calls by Model"
          loading={isLoading}
          empty={!modelChartData.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={modelChartData} layout="vertical" margin={{ ...chartConfig.margin, left: 120 }}>
              <CartesianGrid {...chartConfig.grid} horizontal={false} />
              <XAxis
                type="number"
                stroke={chartColors.grid}
                tick={chartConfig.axis.tick}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatNumber(v)}
              />
              <YAxis
                type="category"
                dataKey="label"
                stroke={chartColors.grid}
                tick={chartConfig.axis.tick}
                tickLine={false}
                axisLine={false}
                width={110}
              />
              <Tooltip content={<ChartTooltip formatter={(v) => formatNumber(v)} />} />
              <Bar dataKey="calls" name="Calls" fill={chartColors.primary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Calls by Provider"
          loading={isLoading}
          empty={!providerChartData.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={providerChartData} margin={chartConfig.margin}>
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
              <Bar dataKey="calls" name="Calls" fill={chartColors.secondary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Calls by Stage"
          loading={isLoading}
          empty={!stageChartData.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stageChartData} margin={chartConfig.margin}>
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
                tickFormatter={(v) => formatNumber(v)}
              />
              <Tooltip content={<ChartTooltip formatter={(v) => formatNumber(v)} />} />
              <Bar dataKey="calls" name="Calls" fill={chartColors.tertiary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Model Breakdown Table */}
      <div>
        <h2 className="text-sm font-semibold text-[#181818] mb-4">Model Breakdown</h2>
        <DataTable
          columns={modelColumns}
          data={modelChartData}
          loading={isLoading}
          emptyMessage="No LLM usage data found"
        />
      </div>
    </AdminLayout>
  );
}

export default LLMPage;
