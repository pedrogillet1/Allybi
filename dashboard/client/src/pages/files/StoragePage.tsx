/**
 * Storage Page - Files Subsection
 * Shows storage usage by user, growth trends, cost estimates
 */

import { useState } from "react";
import {
  AreaChart,
  Area,
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
import { HardDrive, TrendingUp, DollarSign, Users, Database, Cloud } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useFiles, useStorageAnalytics } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

const COLORS = ['#181818', '#525252', '#737373', '#a3a3a3', '#d4d4d4'];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function StoragePage() {
  const [range, setRange] = useState<TimeRange>("30d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data: filesData, isLoading: filesLoading } = useFiles({ range, env });
  const { data: storageData, isLoading: storageLoading } = useStorageAnalytics({ range, env });

  const isLoading = filesLoading || storageLoading;

  // Use real data from API
  const storageByType = storageData?.byType ?? [];
  const topUsersByStorage = storageData?.topUsers ?? [];
  const storageGrowth = storageData?.growthOverTime ?? [];

  // Calculate totals from real data
  const totalStorageBytes = storageData?.totalBytes ?? 0;
  const totalStorageGB = totalStorageBytes / (1024 * 1024 * 1024);
  const totalFiles = storageData?.totalFiles ?? filesData?.counts?.total ?? 0;
  const growthBytes30d = storageData?.growthBytes30d ?? 0;
  const growthPct30d = storageData?.growthPct30d ?? 0;

  // Cost breakdown (estimated)
  const s3CostPerGB = 0.023;
  const estimatedMonthlyCost = totalStorageGB * s3CostPerGB;

  const costBreakdown = [
    { name: "S3 Storage", cost: estimatedMonthlyCost * 0.6 },
    { name: "Vector DB", cost: estimatedMonthlyCost * 0.25 },
    { name: "Backups", cost: estimatedMonthlyCost * 0.1 },
    { name: "Transfer", cost: estimatedMonthlyCost * 0.05 },
  ];

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Storage Analytics</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Monitor storage usage, growth trends, and cost estimates
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <HardDrive className="w-4 h-4" />
            <span className="text-sm">Total Storage</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : formatBytes(totalStorageBytes)}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Growth (30d)</span>
          </div>
          <div className="text-2xl font-semibold text-green-600">
            {isLoading ? "-" : `+${formatBytes(growthBytes30d)}`}
          </div>
          <div className="text-xs text-[#6B7280]">+{growthPct30d}%</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Database className="w-4 h-4" />
            <span className="text-sm">Total Files</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : totalFiles.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Est. Monthly Cost</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            ${isLoading ? "-" : estimatedMonthlyCost.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Storage by File Type */}
        <ChartContainer
          title="Storage by File Type"
          loading={isLoading}
          empty={storageByType.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={storageByType}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="bytes"
                nameKey="type"
                label={({ type, percentage }) => `${type} (${percentage}%)`}
              >
                {storageByType.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatBytes(value)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Storage Growth */}
        <ChartContainer
          title="Storage Growth (Last 30 Days)"
          loading={isLoading}
          empty={storageGrowth.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={storageGrowth} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="day" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis
                stroke={chartColors.grid}
                tick={chartConfig.axis.tick}
                tickFormatter={(v) => `${(v / 1024 / 1024 / 1024).toFixed(0)}GB`}
              />
              <Tooltip
                formatter={(value: number) => formatBytes(value)}
                content={<ChartTooltip />}
              />
              <Area type="monotone" dataKey="total" name="Total Storage" stroke={chartColors.primary} fill={chartColors.primary} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Top Users and Cost Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Users by Storage */}
        <div>
          <h2 className="text-lg font-semibold text-[#111111] mb-4">Top Users by Storage</h2>
          <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                  <th className="text-left px-4 py-3 font-medium text-[#6B7280]">User</th>
                  <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Storage</th>
                  <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Files</th>
                </tr>
              </thead>
              <tbody>
                {topUsersByStorage.slice(0, 8).map((user) => (
                  <tr key={user.userId} className="border-b border-[#E6E6EC]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#111111] text-xs truncate max-w-xs">
                        {user.email || user.userId.slice(0, 12) + "..."}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[#111111]">
                      {formatBytes(user.storage)}
                    </td>
                    <td className="px-4 py-3 text-right text-[#6B7280]">
                      {user.files}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div>
          <h2 className="text-lg font-semibold text-[#111111] mb-4">Cost Breakdown (Est.)</h2>
          <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
            <div className="space-y-4">
              {costBreakdown.map((item) => (
                <div key={item.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-[#6B7280]">{item.name}</span>
                    <span className="text-sm font-medium text-[#111111]">
                      ${item.cost.toFixed(2)}/mo
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#181818]"
                      style={{ width: `${(item.cost / estimatedMonthlyCost) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-4 border-t border-[#E6E6EC]">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#111111]">Total</span>
                  <span className="font-semibold text-[#111111]">
                    ${costBreakdown.reduce((s, c) => s + c.cost, 0).toFixed(2)}/mo
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Storage Recommendations */}
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">Recommendations</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Consider enabling lifecycle policies for old files</li>
              {topUsersByStorage.length >= 3 && (
                <li>
                  • Top 3 users account for{" "}
                  {totalStorageBytes > 0
                    ? Math.round(
                        (topUsersByStorage.slice(0, 3).reduce((s, u) => s + u.storage, 0) /
                          totalStorageBytes) *
                          100
                      )
                    : 0}
                  % of storage - review quotas
                </li>
              )}
              <li>• Enable compression for text-based documents</li>
            </ul>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default StoragePage;
