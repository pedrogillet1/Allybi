/**
 * Routing Analytics Page - Queries Subsection
 * Shows domain/intent/operator distribution, routing decisions
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
  Legend,
  ResponsiveContainer,
} from "recharts";
import { GitBranch, Target, Activity, AlertTriangle } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useRoutingAnalytics } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

const COLORS = ['#181818', '#525252', '#737373', '#a3a3a3', '#d4d4d4', '#e5e5e5'];

export function RoutingPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading } = useRoutingAnalytics({ range, env });

  // Use real data from API
  const domainData = data?.domainDistribution ?? [];
  const intentData = data?.intentDistribution ?? [];
  const operatorData = data?.operatorDistribution ?? [];
  const confidenceData = data?.confidenceDistribution ?? [];

  const routingStats = data?.stats ?? {
    totalRouted: 0,
    explicitDomain: 0,
    inferredDomain: 0,
    unknownDomain: 0,
    explicitIntent: 0,
    inferredIntent: 0,
    fallbackRate: 0,
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Routing Analytics</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Analyze query routing decisions across domains, intents, and operators
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <GitBranch className="w-4 h-4" />
            <span className="text-sm">Total Routed</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : routingStats.totalRouted.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Target className="w-4 h-4" />
            <span className="text-sm">Explicit Domain</span>
          </div>
          <div className="text-2xl font-semibold text-green-600">
            {isLoading ? "-" : `${((routingStats.explicitDomain / routingStats.totalRouted) * 100).toFixed(1)}%`}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Activity className="w-4 h-4" />
            <span className="text-sm">Unknown Domain</span>
          </div>
          <div className="text-2xl font-semibold text-amber-600">
            {isLoading ? "-" : `${((routingStats.unknownDomain / routingStats.totalRouted) * 100).toFixed(1)}%`}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Fallback Rate</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : `${routingStats.fallbackRate}%`}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Domain Distribution */}
        <ChartContainer
          title="Domain Distribution"
          loading={isLoading}
          empty={domainData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={domainData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                label={({ name, percentage }) => `${name} (${percentage}%)`}
              >
                {domainData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Intent Distribution */}
        <ChartContainer
          title="Intent Distribution"
          loading={isLoading}
          empty={intentData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={intentData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                label={({ name, percentage }) => `${name} (${percentage}%)`}
              >
                {intentData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Operator Distribution */}
        <ChartContainer
          title="Operator Distribution"
          loading={isLoading}
          empty={operatorData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={operatorData} layout="vertical" margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis type="number" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis type="category" dataKey="name" stroke={chartColors.grid} tick={chartConfig.axis.tick} width={80} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Count" fill={chartColors.primary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Confidence Distribution */}
        <ChartContainer
          title="Routing Confidence"
          loading={isLoading}
          empty={confidenceData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={confidenceData} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="range" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Queries" fill={chartColors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Routing Breakdown Table */}
      <div>
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Routing Breakdown</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Metric</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Count</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Percentage</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#E6E6EC]">
                <td className="px-4 py-3 font-medium text-[#111111]">Explicit Domain Selection</td>
                <td className="px-4 py-3 text-right text-[#6B7280]">{routingStats.explicitDomain}</td>
                <td className="px-4 py-3 text-right text-green-600">{((routingStats.explicitDomain / routingStats.totalRouted) * 100).toFixed(1)}%</td>
              </tr>
              <tr className="border-b border-[#E6E6EC]">
                <td className="px-4 py-3 font-medium text-[#111111]">Inferred Domain</td>
                <td className="px-4 py-3 text-right text-[#6B7280]">{routingStats.inferredDomain}</td>
                <td className="px-4 py-3 text-right text-[#6B7280]">{((routingStats.inferredDomain / routingStats.totalRouted) * 100).toFixed(1)}%</td>
              </tr>
              <tr className="border-b border-[#E6E6EC]">
                <td className="px-4 py-3 font-medium text-[#111111]">Unknown Domain (fallback)</td>
                <td className="px-4 py-3 text-right text-[#6B7280]">{routingStats.unknownDomain}</td>
                <td className="px-4 py-3 text-right text-amber-600">{((routingStats.unknownDomain / routingStats.totalRouted) * 100).toFixed(1)}%</td>
              </tr>
              <tr className="border-b border-[#E6E6EC]">
                <td className="px-4 py-3 font-medium text-[#111111]">Explicit Intent</td>
                <td className="px-4 py-3 text-right text-[#6B7280]">{routingStats.explicitIntent}</td>
                <td className="px-4 py-3 text-right text-green-600">{((routingStats.explicitIntent / routingStats.totalRouted) * 100).toFixed(1)}%</td>
              </tr>
              <tr className="border-b border-[#E6E6EC]">
                <td className="px-4 py-3 font-medium text-[#111111]">Inferred Intent</td>
                <td className="px-4 py-3 text-right text-[#6B7280]">{routingStats.inferredIntent}</td>
                <td className="px-4 py-3 text-right text-[#6B7280]">{((routingStats.inferredIntent / routingStats.totalRouted) * 100).toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

export default RoutingPage;
