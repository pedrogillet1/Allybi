/**
 * LLM Providers Page - LLM Subsection
 * Shows provider-level metrics, cost, and performance
 */

import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Server, DollarSign, Clock, Zap } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useLLMCost } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

// Provider brand colors
const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10a37f",
  google: "#4285f4",
  anthropic: "#d97706",
};

export function ProvidersPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading } = useLLMCost({ range, env });

  // Use real data from extended API
  const providers = data?.extended?.providers ?? [];
  const costByProviderPerDay = data?.charts?.costByProviderPerDay ?? [];

  // Build latency comparison data from providers
  const latencyData = providers.map(p => ({
    provider: p.provider,
    p50: p.latencyP50,
    p95: p.latencyP95,
  }));

  const totalCalls = providers.reduce((s, p) => s + p.calls, 0) || data?.summary?.calls || 0;
  const totalCost = providers.reduce((s, p) => s + p.cost, 0) || data?.summary?.totalCost || 0;
  const avgLatency = providers.length > 0
    ? Math.round(providers.reduce((s, p) => s + p.latencyP50, 0) / providers.length)
    : data?.summary?.latencyMsP50 ?? 0;

  // Get unique provider names for chart lines
  const providerNames = providers.map(p => p.provider);

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">LLM Providers</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Compare provider performance, cost, and reliability
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Server className="w-4 h-4" />
            <span className="text-sm">Providers</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">{providers.length}</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Zap className="w-4 h-4" />
            <span className="text-sm">Total Calls</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : totalCalls.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Total Cost</span>
          </div>
          <div className="text-2xl font-semibold text-green-600">
            ${isLoading ? "-" : totalCost.toFixed(2)}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Avg Latency P50</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : `${avgLatency}ms`}
          </div>
        </div>
      </div>

      {/* Provider Cards */}
      {providers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {providers.map((provider) => (
            <div key={provider.provider} className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-[#111111]">{provider.provider}</h3>
                <span className={`px-2 py-1 text-xs rounded ${
                  provider.errorRate < 1 ? "bg-green-100 text-green-700" :
                  provider.errorRate < 2 ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {provider.errorRate}% errors
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6B7280]">Calls</span>
                  <span className="font-medium text-[#111111]">{provider.calls.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6B7280]">Tokens</span>
                  <span className="font-medium text-[#111111]">{(provider.tokens / 1000000).toFixed(2)}M</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6B7280]">Cost</span>
                  <span className="font-medium text-green-600">${provider.cost.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6B7280]">Latency P50/P95</span>
                  <span className="font-medium text-[#111111]">{provider.latencyP50}ms / {provider.latencyP95}ms</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6B7280]">TTFT P50</span>
                  <span className="font-medium text-[#111111]">{provider.ttftP50}ms</span>
                </div>
                <div className="pt-2 border-t border-[#E6E6EC]">
                  <div className="text-xs text-[#6B7280] mb-1">Models</div>
                  <div className="flex flex-wrap gap-1">
                    {provider.models.map(model => (
                      <span key={model} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                        {model}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state for provider cards */}
      {providers.length === 0 && !isLoading && (
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-8 text-center mb-6">
          <p className="text-[#6B7280]">No provider data available for this time range</p>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Over Time */}
        <ChartContainer
          title="Daily Cost by Provider"
          loading={isLoading}
          empty={costByProviderPerDay.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={costByProviderPerDay} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="day" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} tickFormatter={(v) => `$${v}`} />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              {providerNames.map((name) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={PROVIDER_COLORS[name.toLowerCase()] || chartColors.primary}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Latency Comparison */}
        <ChartContainer
          title="Latency Comparison"
          subtitle="P50 and P95 (ms)"
          loading={isLoading}
          empty={latencyData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={latencyData} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="provider" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              <Bar dataKey="p50" name="P50" fill={chartColors.primary} />
              <Bar dataKey="p95" name="P95" fill={chartColors.secondary} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </AdminLayout>
  );
}

export default ProvidersPage;
