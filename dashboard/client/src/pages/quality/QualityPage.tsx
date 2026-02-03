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
  ResponsiveContainer,
} from "recharts";
import { AdminLayout, PageHeader } from "@/components/layout";
import { KpiCard, KpiCardRow } from "@/components/kpi";
import { DataTable, type Column } from "@/components/tables";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import { useQuality } from "@/hooks/useTelemetry";
import { formatNumber, formatDateTime } from "@/utils/format";
import type { TimeRange, QualityCase } from "@/types/telemetry";

export function QualityPage() {
  const [range, setRange] = useState<TimeRange>("7d");

  const { data, isLoading, error, refetch } = useQuality({ range });

  const caseColumns: Column<QualityCase>[] = [
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
      key: "query",
      header: "Query",
      render: (row) => (
        <span className="truncate max-w-xs block" title={row.query}>
          {row.query}
        </span>
      ),
    },
    {
      key: "topScore",
      header: "Top Score",
      render: (row) => (
        <span className="font-medium text-[#525252]">{row.topScore.toFixed(2)}</span>
      ),
    },
    {
      key: "chunks",
      header: "Chunks",
      render: (row) => row.chunks,
    },
    {
      key: "failureType",
      header: "Failure Type",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#f5f5f5] rounded">
          {row.failureType}
        </span>
      ),
    },
    {
      key: "gateAction",
      header: "Gate Action",
      render: (row) => (
        <span className={`px-2 py-1 text-xs rounded ${
          row.gateAction === "block" ? "bg-[#181818] text-white" : "bg-[#e5e5e5] text-[#525252]"
        }`}>
          {row.gateAction}
        </span>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Answer Quality"
        subtitle="Evidence quality and weak evidence analysis"
        range={range}
        onRangeChange={setRange}
      />

      {/* KPIs */}
      <KpiCardRow className="grid-cols-2 md:grid-cols-3">
        <KpiCard
          title="Weak Evidence Cases"
          value={data ? formatNumber(data.kpis.weakEvidenceCases) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Fallback Count"
          value={data ? formatNumber(data.kpis.fallbackCount) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Avg Top Score"
          value={data ? data.kpis.avgTopScore.toFixed(2) : "-"}
          loading={isLoading}
        />
      </KpiCardRow>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <ChartContainer
          title="Score Distribution"
          loading={isLoading}
          empty={!data?.charts.scoreDistribution.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.charts.scoreDistribution} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis
                dataKey="bucket"
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
              <Bar dataKey="count" name="Count" fill={chartColors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Weak Evidence by Domain"
          loading={isLoading}
          empty={!data?.charts.weakEvidenceByDomain.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.charts.weakEvidenceByDomain} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis
                dataKey="domain"
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
              <Bar dataKey="value" name="Count" fill={chartColors.secondary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Avg Score Over Time"
          loading={isLoading}
          empty={!data?.charts.avgScorePerDay.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.charts.avgScorePerDay} margin={chartConfig.margin}>
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
                domain={[0, 1]}
              />
              <Tooltip content={<ChartTooltip formatter={(v) => v.toFixed(2)} />} />
              <Line
                type="monotone"
                dataKey="value"
                name="Avg Score"
                stroke={chartColors.primary}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Quality Cases Table */}
      <div>
        <h2 className="text-sm font-semibold text-[#181818] mb-4">Recent Quality Cases</h2>
        <DataTable
          columns={caseColumns}
          data={data?.cases ?? []}
          loading={isLoading}
          emptyMessage="No quality cases found"
        />
      </div>
    </AdminLayout>
  );
}

export default QualityPage;
