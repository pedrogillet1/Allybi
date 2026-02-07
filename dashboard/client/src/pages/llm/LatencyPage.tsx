/**
 * LLM Latency Page - LLM Subsection
 * Shows TTFT, total latency, and performance breakdown
 */

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
import { Clock, Zap, TrendingUp, AlertTriangle } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useLLMCost } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

export function LatencyPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading } = useLLMCost({ range, env });

  // Use real data from extended API
  const latencyByModel = data?.extended?.latencyByModel ?? [];
  const latencyDistribution = data?.extended?.latencyDistribution ?? [];
  const hourlyLatency = data?.extended?.hourlyLatency ?? [];
  const slowRequestRate = data?.extended?.slowRequestRate ?? 0;

  // Calculate weighted averages from real data
  const totalCalls = latencyByModel.reduce((s, m) => s + m.calls, 0);
  const avgTtft = totalCalls > 0
    ? Math.round(latencyByModel.reduce((s, m) => s + m.ttft * m.calls, 0) / totalCalls)
    : data?.summary?.ttftMsP50 ?? 0;
  const avgTotal = totalCalls > 0
    ? Math.round(latencyByModel.reduce((s, m) => s + m.total * m.calls, 0) / totalCalls)
    : data?.summary?.latencyMsP50 ?? 0;
  const p95 = totalCalls > 0
    ? Math.round(latencyByModel.reduce((s, m) => s + m.p95 * m.calls, 0) / totalCalls)
    : data?.summary?.latencyMsP95 ?? 0;

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">LLM Latency (AI Response Times)</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Monitor TTFT (Time To First Token - when AI starts responding) and total latency by model
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Zap className="w-4 h-4" />
            <span className="text-sm">Avg TTFT (Time To First Token)</span>
          </div>
          <p className="text-[10px] text-[#9CA3AF] -mt-1 mb-1">When AI starts responding</p>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : `${avgTtft}ms`}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Avg Total Latency</span>
          </div>
          <p className="text-[10px] text-[#9CA3AF] -mt-1 mb-1">Complete response time</p>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : `${avgTotal}ms`}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">P95 Latency (Slowest 5%)</span>
          </div>
          <p className="text-[10px] text-[#9CA3AF] -mt-1 mb-1">95th percentile response</p>
          <div className="text-2xl font-semibold text-amber-600">
            {isLoading ? "-" : `${p95}ms`}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Slow Response Rate (&gt;5s)</span>
          </div>
          <p className="text-[10px] text-[#9CA3AF] -mt-1 mb-1">% of requests over 5 seconds</p>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : `${slowRequestRate}%`}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Latency Over Time */}
        <ChartContainer
          title="Latency Over Time (24h)"
          subtitle="Response time metrics throughout the day"
          loading={isLoading}
          empty={hourlyLatency.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hourlyLatency} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="hour" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} tickFormatter={(v) => `${v}ms`} />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              <Line type="monotone" dataKey="ttft" name="TTFT (First Token)" stroke={chartColors.success} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="total" name="Total Response" stroke={chartColors.primary} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="p95" name="P95 (Slowest 5%)" stroke={chartColors.warning} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Latency Distribution */}
        <ChartContainer
          title="Latency Distribution"
          loading={isLoading}
          empty={latencyDistribution.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={latencyDistribution} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="range" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Calls" fill={chartColors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Latency by Model Table */}
      <div>
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Latency by Model (AI Model Response Times)</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Model</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Calls</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">TTFT (First Token)</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Total</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">P50 (Median)</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">P95 (Slowest 5%)</th>
              </tr>
            </thead>
            <tbody>
              {latencyByModel.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#6B7280]">
                    No latency data available for this time range
                  </td>
                </tr>
              ) : (
                latencyByModel.map((model) => (
                  <tr key={`${model.provider}-${model.model}`} className="border-b border-[#E6E6EC]">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-[#111111]">{model.model}</span>
                      <span className="ml-2 text-xs text-[#6B7280]">({model.provider})</span>
                    </td>
                    <td className="px-4 py-3 text-right text-[#6B7280]">{model.calls.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={model.ttft < 500 ? "text-green-600" : model.ttft < 1000 ? "text-[#111111]" : "text-amber-600"}>
                        {model.ttft}ms
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[#111111]">{model.total}ms</td>
                    <td className="px-4 py-3 text-right text-[#6B7280]">{model.p50}ms</td>
                    <td className="px-4 py-3 text-right">
                      <span className={model.p95 < 3000 ? "text-[#6B7280]" : "text-amber-600"}>
                        {model.p95}ms
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

export default LatencyPage;
