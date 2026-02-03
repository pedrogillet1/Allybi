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
import { useQuality } from "@/hooks/useTelemetry";
import { formatNumber, formatDateTime } from "@/utils/format";
import type { TimeRange } from "@/types/telemetry";

interface BreakdownItem {
  key: string;
  count: number;
  avgScore?: number;
  weakCount?: number;
}

interface FeedItem {
  id: string;
  ts: string;
  query: string;
  domain?: string;
  intent?: string;
  topScore: number;
  hadFallback: boolean;
  userEmail?: string;
}

export function QualityPage() {
  const [range, setRange] = useState<TimeRange>("7d");

  const { data, isLoading, error, refetch } = useQuality({ range });

  // Extract totals from backend
  const totals = data?.totals as { total?: number; weakEvidence?: number; fallbacks?: number; avgScore?: number } | undefined;

  // Transform breakdown data for charts
  const domainChartData = useMemo(() => {
    const breakdown = data?.breakdown as { byDomain?: BreakdownItem[]; byIntent?: BreakdownItem[]; byOperator?: BreakdownItem[] } | undefined;
    if (!breakdown?.byDomain) return [];
    return breakdown.byDomain.map((item) => ({
      label: item.key,
      count: item.count,
      avgScore: item.avgScore ?? 0,
    }));
  }, [data?.breakdown]);

  const intentChartData = useMemo(() => {
    const breakdown = data?.breakdown as { byDomain?: BreakdownItem[]; byIntent?: BreakdownItem[]; byOperator?: BreakdownItem[] } | undefined;
    if (!breakdown?.byIntent) return [];
    return breakdown.byIntent.map((item) => ({
      label: item.key,
      count: item.count,
    }));
  }, [data?.breakdown]);

  const operatorChartData = useMemo(() => {
    const breakdown = data?.breakdown as { byDomain?: BreakdownItem[]; byIntent?: BreakdownItem[]; byOperator?: BreakdownItem[] } | undefined;
    if (!breakdown?.byOperator) return [];
    return breakdown.byOperator.map((item) => ({
      label: item.key,
      count: item.count,
    }));
  }, [data?.breakdown]);

  // Feed items for the table
  const feedItems = useMemo(() => {
    const feed = data?.feed as FeedItem[] | undefined;
    return feed ?? [];
  }, [data?.feed]);

  const feedColumns: Column<FeedItem>[] = [
    {
      key: "ts",
      header: "Time",
      render: (row) => (
        <span className="text-[#737373] text-xs">{formatDateTime(row.ts)}</span>
      ),
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
      key: "domain",
      header: "Domain",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#f5f5f5] rounded">
          {row.domain || "-"}
        </span>
      ),
    },
    {
      key: "intent",
      header: "Intent",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#e5e5e5] rounded">
          {row.intent || "-"}
        </span>
      ),
    },
    {
      key: "topScore",
      header: "Top Score",
      render: (row) => (
        <span className="font-medium text-[#525252]">{(row.topScore ?? 0).toFixed(2)}</span>
      ),
    },
    {
      key: "hadFallback",
      header: "Fallback",
      render: (row) => (
        <span className={`px-2 py-1 text-xs rounded ${
          row.hadFallback ? "bg-[#181818] text-white" : "bg-[#e5e5e5] text-[#525252]"
        }`}>
          {row.hadFallback ? "Yes" : "No"}
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
      <KpiCardRow className="grid-cols-2 md:grid-cols-4">
        <KpiCard
          title="Total Queries"
          value={totals ? formatNumber(totals.total ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Weak Evidence"
          value={totals ? formatNumber(totals.weakEvidence ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Fallbacks"
          value={totals ? formatNumber(totals.fallbacks ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Avg Score"
          value={totals ? (totals.avgScore ?? 0).toFixed(2) : "-"}
          loading={isLoading}
        />
      </KpiCardRow>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <ChartContainer
          title="Queries by Domain"
          loading={isLoading}
          empty={!domainChartData.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={domainChartData} margin={chartConfig.margin}>
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
              <Bar dataKey="count" name="Count" fill={chartColors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Queries by Intent"
          loading={isLoading}
          empty={!intentChartData.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={intentChartData} margin={chartConfig.margin}>
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
              <Bar dataKey="count" name="Count" fill={chartColors.secondary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Queries by Operator"
          loading={isLoading}
          empty={!operatorChartData.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={operatorChartData} margin={chartConfig.margin}>
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
              <Bar dataKey="count" name="Count" fill={chartColors.tertiary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Quality Feed Table */}
      <div>
        <h2 className="text-sm font-semibold text-[#181818] mb-4">Recent Query Telemetry</h2>
        <DataTable
          columns={feedColumns}
          data={feedItems}
          loading={isLoading}
          emptyMessage="No query telemetry found"
        />
      </div>
    </AdminLayout>
  );
}

export default QualityPage;
