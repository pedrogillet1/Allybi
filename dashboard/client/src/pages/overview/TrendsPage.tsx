/**
 * Trends Page - Overview Subsection
 * Shows DAU/WAU/MAU trends, query volume, latency, weak evidence, ingestion failures, cost
 */

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Activity, AlertTriangle, DollarSign, Clock } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useOverview, useLLMCost } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

export function TrendsPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading, error } = useOverview({ range, env });
  const { data: llmData } = useLLMCost({ range, env });

  // Transform API chart data for display
  const chartData = useMemo(() => {
    const formatDay = (day: string) => {
      const date = new Date(day);
      return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    };

    // DAU trend from API
    const activeUsersPerDay = (data?.charts?.dauTrend ?? []).map(d => ({
      day: formatDay(d.day),
      dau: d.value,
    }));

    // Messages/Queries trend from API
    const queriesPerDay = (data?.charts?.messagesTrend ?? []).map(d => ({
      day: formatDay(d.day),
      count: d.value,
    }));

    // Latency trend from API
    const latencyPerDay = (data?.charts?.latencyTrend ?? []).map(d => ({
      day: formatDay(d.day),
      p50: d.p50,
      p95: d.p95,
    }));

    // Quality trend (weak evidence) from API
    const qualityPerDay = (data?.charts?.weakEvidenceTrend ?? []).map(d => ({
      day: formatDay(d.day),
      weakRate: d.value,
    }));

    // LLM errors trend from API
    const errorsPerDay = (data?.charts?.llmErrorsTrend ?? []).map(d => ({
      day: formatDay(d.day),
      failures: d.value,
    }));

    // Uploads trend from API
    const uploadsPerDay = (data?.charts?.uploadsTrend ?? []).map(d => ({
      day: formatDay(d.day),
      uploads: d.value,
    }));

    return { activeUsersPerDay, queriesPerDay, latencyPerDay, qualityPerDay, errorsPerDay, uploadsPerDay };
  }, [data?.charts]);

  // Calculate trend direction
  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (current < previous) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Activity className="w-4 h-4 text-gray-400" />;
  };

  const getTrendClass = (current: number, previous: number, inverse = false) => {
    const isUp = current > previous;
    if (inverse) return isUp ? "text-red-500" : "text-green-500";
    return isUp ? "text-green-500" : "text-red-500";
  };

  // KPI stats from API
  const kpis = {
    dau: data?.kpis?.dau ?? 0,
    queries: data?.kpis?.messages ?? 0,
    latencyP95: data?.kpis?.latencyMsP95 ?? 0,
    totalCost: llmData?.summary?.tokensTotal
      ? (llmData.summary.tokensTotal / 1000000) * 2.5 // rough estimate
      : 0,
  };

  // Calculate trend percentages from chart data
  const calcTrend = (arr: Array<{ day: string; [key: string]: string | number }>, key: string): number => {
    if (arr.length < 2) return 0;
    const recent = arr.slice(-3);
    const earlier = arr.slice(0, 3);
    const recentAvg = recent.reduce((sum, d) => sum + (Number(d[key]) || 0), 0) / recent.length;
    const earlierAvg = earlier.reduce((sum, d) => sum + (Number(d[key]) || 0), 0) / earlier.length;
    if (earlierAvg === 0) return 0;
    return Math.round(((recentAvg - earlierAvg) / earlierAvg) * 1000) / 10;
  };

  const dauTrend = calcTrend(chartData.activeUsersPerDay, "dau");
  const queryTrend = calcTrend(chartData.queriesPerDay, "count");
  const latencyTrend = calcTrend(chartData.latencyPerDay, "p95");

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Trends</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Track key metrics over time to identify patterns and anomalies
        </p>
      </div>

      {/* Trend Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* DAU Trend */}
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#6B7280]">Active Users (Last 24h)</span>
            {dauTrend !== 0 ? getTrendIcon(dauTrend, 0) : <Activity className="w-4 h-4 text-gray-400" />}
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : kpis.dau.toLocaleString()}
          </div>
          <div className={`text-xs ${getTrendClass(dauTrend, 0)}`}>
            {dauTrend > 0 ? "+" : ""}{dauTrend}% vs earlier period
          </div>
        </div>

        {/* Query Volume Trend */}
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#6B7280]">Query Volume</span>
            <Activity className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : kpis.queries.toLocaleString()}
          </div>
          <div className={`text-xs ${getTrendClass(queryTrend, 0)}`}>
            {queryTrend > 0 ? "+" : ""}{queryTrend}% vs earlier period
          </div>
        </div>

        {/* Latency P95 Trend */}
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#6B7280]">Latency P95</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : kpis.latencyP95 > 0 ? `${kpis.latencyP95.toFixed(0)}ms` : "N/A"}
          </div>
          <div className={`text-xs ${getTrendClass(latencyTrend, 0, true)}`}>
            {latencyTrend > 0 ? "+" : ""}{latencyTrend}% vs earlier period
          </div>
        </div>

        {/* LLM Tokens */}
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#6B7280]">Total Tokens</span>
            <DollarSign className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : (data?.kpis?.tokensTotal ?? 0).toLocaleString()}
          </div>
          <div className="text-xs text-[#6B7280]">
            {(data?.kpis?.llmCalls ?? 0).toLocaleString()} LLM calls
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* User Activity Trend */}
        <ChartContainer
          title="User Activity Trend"
          subtitle="Daily active users over time"
          loading={isLoading}
          empty={chartData.activeUsersPerDay.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData.activeUsersPerDay} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="day" stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              <Area type="monotone" dataKey="dau" name="DAU" stroke={chartColors.primary} fill={chartColors.primary} fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Query Volume Trend */}
        <ChartContainer
          title="Query Volume Trend"
          subtitle="Messages per day"
          loading={isLoading}
          empty={chartData.queriesPerDay.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData.queriesPerDay} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="day" stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="count" name="Messages" stroke={chartColors.primary} fill={chartColors.primary} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Latency Trend */}
        <ChartContainer
          title="Latency Trend"
          subtitle="P50 / P95 latency (ms)"
          loading={isLoading}
          empty={chartData.latencyPerDay.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.latencyPerDay} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="day" stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              <Line type="monotone" dataKey="p50" name="P50" stroke={chartColors.success} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="p95" name="P95" stroke={chartColors.warning} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Quality Trend */}
        <ChartContainer
          title="Answer Quality Trend"
          subtitle="Weak evidence rate (%)"
          loading={isLoading}
          empty={chartData.qualityPerDay.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.qualityPerDay} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="day" stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} unit="%" />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              <Line type="monotone" dataKey="weakRate" name="Weak Evidence %" stroke={chartColors.warning} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Uploads Trend */}
        <ChartContainer
          title="Uploads Trend"
          subtitle="Documents uploaded per day"
          loading={isLoading}
          empty={chartData.uploadsPerDay.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData.uploadsPerDay} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="day" stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="uploads" name="Uploads" stroke={chartColors.secondary} fill={chartColors.secondary} fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* LLM Errors Trend */}
        <ChartContainer
          title="LLM Errors"
          subtitle="Failed LLM calls per day"
          loading={isLoading}
          empty={chartData.errorsPerDay.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData.errorsPerDay} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="day" stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="failures" name="Errors" stroke={chartColors.error} fill={chartColors.error} fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-[#E6E6EC] rounded-lg">
          <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
          <p className="text-sm text-[#6B7280]">{error.message}</p>
        </div>
      )}
    </AdminLayout>
  );
}

export default TrendsPage;
