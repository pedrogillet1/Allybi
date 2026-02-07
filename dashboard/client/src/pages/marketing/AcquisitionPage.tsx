/**
 * AcquisitionPage
 * Shows user acquisition metrics by source, campaign trends, and conversion data
 */

import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Target,
  Users,
  TrendingUp,
  Award,
  RefreshCw,
} from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAcquisitionMetrics } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

// Source colors for charts
const SOURCE_COLORS: Record<string, string> = {
  google: "#4285F4",
  facebook: "#1877F2",
  instagram: "#E4405F",
  youtube: "#FF0000",
  tiktok: "#000000",
  twitter: "#1DA1F2",
  linkedin: "#0A66C2",
  organic: "#22C55E",
  direct: "#6B7280",
  reddit: "#FF4500",
  email: "#EA4335",
};

const DEFAULT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

function getSourceColor(source: string, index: number): string {
  return SOURCE_COLORS[source.toLowerCase()] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

export function AcquisitionPage() {
  const [range, setRange] = useState<TimeRange>("30d");
  const [env, setEnv] = useState<Environment>("prod");
  const { data, isLoading, isFetching, refetch } = useAcquisitionMetrics({ range, env });

  // Transform trends data for line chart (group by date, one line per source)
  const chartData = data?.trends
    ? Object.values(
        data.trends.reduce<
          Record<string, { date: string; [source: string]: number | string }>
        >((acc, point) => {
          if (!acc[point.date]) {
            acc[point.date] = { date: point.date };
          }
          acc[point.date][point.source] = point.count;
          return acc;
        }, {})
      ).sort((a, b) => a.date.localeCompare(b.date))
    : [];

  // Get unique sources from trends
  const trendSources = data?.trends
    ? Array.from(new Set(data.trends.map((t) => t.source)))
    : [];

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#111111]">User Acquisition</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Track where your users come from
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && (
            <RefreshCw className="w-4 h-4 text-[#6B7280] animate-spin" />
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-[#E6E6EC] rounded-lg hover:bg-[#FAFAFA] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Users className="w-4 h-4" />
            <span className="text-sm">Total Users</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {data?.totalUsers.toLocaleString() ?? "—"}
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-blue-700 mb-2">
            <Target className="w-4 h-4" />
            <span className="text-sm">Top Source</span>
          </div>
          <div className="text-2xl font-semibold text-blue-700 capitalize">
            {data?.topSource ?? "—"}
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Organic Rate</span>
          </div>
          <div className="text-2xl font-semibold text-green-700">
            {data?.organicRate ?? 0}%
          </div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-purple-700 mb-2">
            <Award className="w-4 h-4" />
            <span className="text-sm">Top Campaigns</span>
          </div>
          <div className="text-2xl font-semibold text-purple-700">
            {data?.topCampaigns.length ?? 0}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Source Distribution Pie Chart */}
        <ChartContainer
          title="Acquisition by Source"
          loading={isLoading}
          empty={!data?.sources || data.sources.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data?.sources || []}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
                nameKey="source"
                label={({ source, percentage }) => `${source} (${percentage}%)`}
              >
                {(data?.sources || []).map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getSourceColor(entry.source, index)}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [
                  value.toLocaleString(),
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Acquisition Trends Line Chart */}
        <ChartContainer
          title="Acquisition Trends"
          loading={isLoading}
          empty={chartData.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis
                dataKey="date"
                tick={chartConfig.axis.tick}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              {trendSources.map((source, index) => (
                <Line
                  key={source}
                  type="monotone"
                  dataKey={source}
                  stroke={getSourceColor(source, index)}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Source Breakdown Table */}
      <div className="bg-white border border-[#E6E6EC] rounded-lg mb-6">
        <div className="px-6 py-4 border-b border-[#E6E6EC]">
          <h2 className="text-lg font-semibold text-[#111111]">Source Breakdown</h2>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-[#6B7280] animate-spin" />
          </div>
        ) : data?.sources && data.sources.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                  <th className="text-left py-3 px-4 font-medium text-[#6B7280]">Source</th>
                  <th className="text-right py-3 px-4 font-medium text-[#6B7280]">Users</th>
                  <th className="text-right py-3 px-4 font-medium text-[#6B7280]">Percentage</th>
                  <th className="text-left py-3 px-4 font-medium text-[#6B7280]">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {data.sources.map((source, index) => (
                  <tr
                    key={source.source}
                    className="border-b border-[#E6E6EC] last:border-b-0 hover:bg-[#FAFAFA]"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getSourceColor(source.source, index) }}
                        />
                        <span className="font-medium text-[#111111] capitalize">
                          {source.source}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#111111]">
                      {source.count.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right text-[#6B7280]">
                      {source.percentage}%
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${source.percentage}%`,
                            backgroundColor: getSourceColor(source.source, index),
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-[#6B7280]">
            No acquisition data available
          </div>
        )}
      </div>

      {/* Top Campaigns Table */}
      <div className="bg-white border border-[#E6E6EC] rounded-lg">
        <div className="px-6 py-4 border-b border-[#E6E6EC]">
          <h2 className="text-lg font-semibold text-[#111111]">Top Campaigns</h2>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-[#6B7280] animate-spin" />
          </div>
        ) : data?.topCampaigns && data.topCampaigns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                  <th className="text-left py-3 px-4 font-medium text-[#6B7280]">Campaign</th>
                  <th className="text-left py-3 px-4 font-medium text-[#6B7280]">Source</th>
                  <th className="text-right py-3 px-4 font-medium text-[#6B7280]">Users</th>
                  <th className="text-right py-3 px-4 font-medium text-[#6B7280]">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {data.topCampaigns.map((campaign, index) => (
                  <tr
                    key={campaign.campaign}
                    className="border-b border-[#E6E6EC] last:border-b-0 hover:bg-[#FAFAFA]"
                  >
                    <td className="py-3 px-4 font-medium text-[#111111]">
                      {campaign.campaign}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="px-2 py-1 text-xs rounded capitalize"
                        style={{
                          backgroundColor: `${getSourceColor(campaign.source, index)}20`,
                          color: getSourceColor(campaign.source, index),
                        }}
                      >
                        {campaign.source}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#111111]">
                      {campaign.users.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right text-[#6B7280]">
                      {campaign.conversionRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-[#6B7280]">
            No campaign data available. Track campaigns using UTM parameters.
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default AcquisitionPage;
