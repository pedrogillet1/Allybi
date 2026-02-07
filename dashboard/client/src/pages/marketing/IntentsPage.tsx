/**
 * Intents Analytics Page - Marketing Subsection
 * Shows intent distribution, patterns, and user behavior insights
 */

import { useState } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Target, MessageSquare, TrendingUp, Zap, RefreshCw } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useIntents } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

const INTENT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

export function IntentsPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading, isFetching } = useIntents({ range, env });

  // Transform data for charts
  const intentDistribution = data?.intents
    ? data.intents.map((d, i, arr) => {
        const total = arr.reduce((sum, item) => sum + item.count, 0);
        return {
          intent: d.intent,
          count: d.count,
          pct: total > 0 ? Math.round((d.count / total) * 100) : 0,
          weakRate: d.weakRate,
        };
      })
    : [];

  // Intent performance (derived from same data)
  // Note: weakRate from backend is already a percentage (e.g., 20 = 20%)
  const intentPerformance = data?.intents
    ? data.intents.map(d => ({
        intent: d.intent,
        count: d.count,
        weakEvidence: Math.round(d.weakRate),
        tokens: d.tokens,
        health: d.weakRate < 10 ? "Good" : d.weakRate < 20 ? "Fair" : "Poor",
      }))
    : [];

  // Stats (note: weakRate from backend is already a percentage, not a decimal)
  const stats = {
    totalIntents: intentDistribution.length,
    topIntent: intentDistribution[0]?.intent || "—",
    avgWeakRate: data?.intents?.length
      ? Math.round(
          data.intents.reduce((sum, d) => sum + d.weakRate, 0) / data.intents.length
        )
      : 0,
    totalQueries: data?.intents?.reduce((sum, d) => sum + d.count, 0) || 0,
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#111111]">Intent Analytics</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Understand user intents and query patterns
          </p>
        </div>
        {isFetching && (
          <RefreshCw className="w-4 h-4 text-[#6B7280] animate-spin" />
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Target className="w-4 h-4" />
            <span className="text-sm">Intent Types</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">{stats.totalIntents}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-blue-700 mb-2">
            <MessageSquare className="w-4 h-4" />
            <span className="text-sm">Top Intent</span>
          </div>
          <div className="text-2xl font-semibold text-blue-700 capitalize">{stats.topIntent}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Total Queries</span>
          </div>
          <div className="text-2xl font-semibold text-green-700">{stats.totalQueries.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Zap className="w-4 h-4" />
            <span className="text-sm">Avg Weak Evidence</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">{stats.avgWeakRate}%</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Intent Distribution */}
        <ChartContainer
          title="Intent Distribution"
          loading={isLoading}
          empty={intentDistribution.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={intentDistribution}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
                nameKey="intent"
                label={({ intent, pct }) => `${intent} (${pct}%)`}
              >
                {intentDistribution.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={INTENT_COLORS[index % INTENT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Intent Query Volume */}
        <ChartContainer
          title="Query Volume by Intent"
          loading={isLoading}
          empty={intentDistribution.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={intentDistribution} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="intent" stroke="#e5e7eb" tick={chartConfig.axis.tick} />
              <YAxis stroke="#e5e7eb" tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Queries" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                {intentDistribution.map((_, index) => (
                  <Cell key={`bar-${index}`} fill={INTENT_COLORS[index % INTENT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Intent Performance Table */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Intent Performance</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-[#6B7280] animate-spin" />
            </div>
          ) : intentPerformance.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                  <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Intent</th>
                  <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Queries</th>
                  <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Weak Evidence %</th>
                  <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Tokens</th>
                  <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Health</th>
                </tr>
              </thead>
              <tbody>
                {intentPerformance.map((item, i) => (
                  <tr key={i} className="border-b border-[#E6E6EC]">
                    <td className="px-4 py-3 font-medium text-[#111111] capitalize">{item.intent}</td>
                    <td className="px-4 py-3 text-right font-mono">{item.count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={item.weakEvidence <= 10 ? "text-green-600" : item.weakEvidence <= 20 ? "text-amber-600" : "text-red-600"}>
                        {item.weakEvidence}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[#6B7280] font-mono">{item.tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 text-xs rounded ${
                        item.health === "Good"
                          ? "bg-green-100 text-green-700"
                          : item.health === "Fair"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {item.health}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-12 text-center text-[#6B7280]">
              No intent data available
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export default IntentsPage;
