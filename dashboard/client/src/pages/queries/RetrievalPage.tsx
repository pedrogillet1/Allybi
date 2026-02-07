/**
 * Retrieval Analytics Page - Queries Subsection
 * Shows retrieval performance, score distributions, bank usage
 */

import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Search, Database, Target, Layers, TrendingUp, AlertTriangle } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useRetrievalAnalytics } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

export function RetrievalPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading } = useRetrievalAnalytics({ range, env });

  // Use real data from API
  const scoreDistribution = data?.scoreDistribution ?? [];
  const scoreByDomain = data?.scoreByDomain ?? [];
  const chunksUsage = data?.chunksUsage ?? [];
  const dataBanks = data?.dataBanks ?? [];
  const scoreOverTime = data?.scoreOverTime ?? [];

  const retrievalStats = data?.stats ?? {
    totalRetrievals: 0,
    avgTopScore: 0,
    avgChunksReturned: 0,
    avgChunksUsed: 0,
    noMatchRate: 0,
    lowScoreRate: 0,
    banksUsed: 0,
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Retrieval Analytics</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Analyze retrieval performance, score distributions, and databank usage
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Search className="w-4 h-4" />
            <span className="text-xs">Total</span>
          </div>
          <div className="text-xl font-semibold text-[#111111]">
            {isLoading ? "-" : retrievalStats.totalRetrievals.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Target className="w-4 h-4" />
            <span className="text-xs">Avg Score</span>
          </div>
          <div className="text-xl font-semibold text-green-600">
            {isLoading ? "-" : `${(retrievalStats.avgTopScore * 100).toFixed(0)}%`}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Layers className="w-4 h-4" />
            <span className="text-xs">Avg Chunks</span>
          </div>
          <div className="text-xl font-semibold text-[#111111]">
            {isLoading ? "-" : retrievalStats.avgChunksUsed.toFixed(1)}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Database className="w-4 h-4" />
            <span className="text-xs">Banks Used</span>
          </div>
          <div className="text-xl font-semibold text-[#111111]">
            {isLoading ? "-" : dataBanks.length}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs">No Match</span>
          </div>
          <div className="text-xl font-semibold text-red-600">
            {isLoading ? "-" : `${retrievalStats.noMatchRate}%`}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs">Low Score</span>
          </div>
          <div className="text-xl font-semibold text-amber-600">
            {isLoading ? "-" : `${retrievalStats.lowScoreRate}%`}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Score Distribution */}
        <ChartContainer
          title="Score Distribution"
          loading={isLoading}
          empty={scoreDistribution.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scoreDistribution} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="range" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Queries" fill={chartColors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Score Over Time */}
        <ChartContainer
          title="Retrieval Score Trend"
          subtitle="Avg / P50 (Median) / P95 (Top 5% Best) document match scores"
          loading={isLoading}
          empty={scoreOverTime.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={scoreOverTime} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="day" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} domain={[0.5, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              <Line type="monotone" dataKey="avgScore" name="Average" stroke={chartColors.primary} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="p50Score" name="P50 (Median)" stroke={chartColors.secondary} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="p95Score" name="P95 (Top 5%)" stroke={chartColors.success} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Score by Domain */}
        <ChartContainer
          title="Average Score by Domain"
          loading={isLoading}
          empty={scoreByDomain.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scoreByDomain} layout="vertical" margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis type="number" stroke={chartColors.grid} tick={chartConfig.axis.tick} domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
              <YAxis type="category" dataKey="domain" stroke={chartColors.grid} tick={chartConfig.axis.tick} width={80} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="avgScore" name="Avg Score" fill={chartColors.primary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Chunks Usage */}
        <ChartContainer
          title="Chunks Used per Query"
          loading={isLoading}
          empty={chunksUsage.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chunksUsage} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="range" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Queries" fill={chartColors.secondary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Databanks Table */}
      <div>
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Most Used Databanks</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Bank ID</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Type</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Queries</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Avg Score</th>
              </tr>
            </thead>
            <tbody>
              {dataBanks.map((bank) => (
                <tr key={bank.bankId} className="border-b border-[#E6E6EC]">
                  <td className="px-4 py-3 font-mono text-xs text-[#111111]">{bank.bankId}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded ${
                      bank.type === "user_docs" ? "bg-blue-100 text-blue-700" :
                      bank.type === "domain" ? "bg-green-100 text-green-700" :
                      bank.type === "policy" ? "bg-amber-100 text-amber-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {bank.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[#6B7280]">{bank.queries.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${
                      bank.avgScore >= 0.8 ? "text-green-600" :
                      bank.avgScore >= 0.6 ? "text-[#111111]" :
                      "text-amber-600"
                    }`}>
                      {(bank.avgScore * 100).toFixed(0)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

export default RetrievalPage;
