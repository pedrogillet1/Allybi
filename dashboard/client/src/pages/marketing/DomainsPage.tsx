/**
 * Domains Analytics Page - Marketing Subsection
 * Shows domain distribution, trends, and performance by domain
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
import { Layers, TrendingUp, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useDomains } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

const DOMAIN_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function DomainsPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading, isFetching } = useDomains({ range, env });

  // Transform data for charts
  const domainDistribution = data?.domains
    ? data.domains.map((d, i, arr) => {
        const total = arr.reduce((sum, item) => sum + item.count, 0);
        return {
          domain: d.domain,
          count: d.count,
          pct: total > 0 ? Math.round((d.count / total) * 100) : 0,
          weakRate: d.weakRate,
        };
      })
    : [];

  // Domain performance (derived from same data)
  // Note: weakRate from backend is already a percentage (e.g., 20 = 20%)
  const domainPerformance = data?.domains
    ? data.domains.map(d => ({
        domain: d.domain,
        count: d.count,
        weakEvidence: Math.round(d.weakRate),
        tokens: d.tokens,
        health: d.weakRate < 10 ? "Good" : d.weakRate < 20 ? "Fair" : "Poor",
      }))
    : [];

  // Stats (note: weakRate from backend is already a percentage, not a decimal)
  const stats = {
    totalDomains: domainDistribution.length,
    topDomain: domainDistribution[0]?.domain || "—",
    avgWeakRate: data?.domains?.length
      ? Math.round(
          data.domains.reduce((sum, d) => sum + d.weakRate, 0) / data.domains.length
        )
      : 0,
    totalQueries: data?.domains?.reduce((sum, d) => sum + d.count, 0) || 0,
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#111111]">Domain Analytics</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Analyze query distribution and performance across domains
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
            <Layers className="w-4 h-4" />
            <span className="text-sm">Active Domains</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">{stats.totalDomains}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-blue-700 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Top Domain</span>
          </div>
          <div className="text-2xl font-semibold text-blue-700 capitalize">{stats.topDomain}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700 mb-2">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">Total Queries</span>
          </div>
          <div className="text-2xl font-semibold text-green-700">{stats.totalQueries.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Avg Weak Evidence</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">{stats.avgWeakRate}%</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Domain Distribution */}
        <ChartContainer
          title="Domain Distribution"
          loading={isLoading}
          empty={domainDistribution.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={domainDistribution}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
                nameKey="domain"
                label={({ domain, pct }) => `${domain} (${pct}%)`}
              >
                {domainDistribution.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={DOMAIN_COLORS[index % DOMAIN_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Domain Query Volume */}
        <ChartContainer
          title="Query Volume by Domain"
          loading={isLoading}
          empty={domainDistribution.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={domainDistribution} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="domain" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Queries" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                {domainDistribution.map((_, index) => (
                  <Cell key={`bar-${index}`} fill={DOMAIN_COLORS[index % DOMAIN_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Domain Performance Table */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Domain Performance</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-[#6B7280] animate-spin" />
            </div>
          ) : domainPerformance.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                  <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Domain</th>
                  <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Queries</th>
                  <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Weak Evidence %</th>
                  <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Tokens</th>
                  <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Health</th>
                </tr>
              </thead>
              <tbody>
                {domainPerformance.map((domain, i) => (
                  <tr key={i} className="border-b border-[#E6E6EC]">
                    <td className="px-4 py-3 font-medium text-[#111111] capitalize">{domain.domain}</td>
                    <td className="px-4 py-3 text-right font-mono">{domain.count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={domain.weakEvidence <= 10 ? "text-green-600" : domain.weakEvidence <= 20 ? "text-amber-600" : "text-red-600"}>
                        {domain.weakEvidence}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[#6B7280] font-mono">{domain.tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 text-xs rounded ${
                        domain.health === "Good"
                          ? "bg-green-100 text-green-700"
                          : domain.health === "Fair"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {domain.health}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-12 text-center text-[#6B7280]">
              No domain data available
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export default DomainsPage;
