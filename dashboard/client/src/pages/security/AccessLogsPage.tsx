/**
 * Access Logs Page - Security Subsection
 * Shows access denied by route, admin route hits, rate limiting triggers
 */

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Shield, XCircle, AlertTriangle, Lock, Activity } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAccessLogs } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

export function AccessLogsPage() {
  const [range, setRange] = useState<TimeRange>("24h");
  const [env, setEnv] = useState<Environment>("prod");
  const [filter, setFilter] = useState<"all" | "denied" | "admin" | "ratelimit">("all");

  const { data, isLoading } = useAccessLogs({ range, env });

  // Extract data from API response with defaults
  const accessStats = data?.stats ?? {
    totalRequests: 0,
    deniedRequests: 0,
    adminAccess: 0,
    rateLimited: 0,
  };

  const deniedByRoute = data?.deniedByRoute ?? [];
  const recentLogs = data?.logs ?? [];
  const dataAvailable = data?.available ?? true;
  const dataMessage = data?.message;

  const filteredLogs = recentLogs.filter(log => {
    if (filter === "denied") return log.statusCode === 403;
    if (filter === "admin") return log.route.includes("/admin");
    if (filter === "ratelimit") return log.statusCode === 429;
    return true;
  });

  const getStatusColor = (code: number) => {
    if (code >= 200 && code < 300) return "bg-green-100 text-green-700";
    if (code === 429) return "bg-amber-100 text-amber-700";
    if (code >= 400) return "bg-red-100 text-red-700";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Access Logs</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Monitor access denied events, admin actions, and rate limiting
        </p>
      </div>

      {/* Data availability notice */}
      {!dataAvailable && dataMessage && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">{dataMessage}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Activity className="w-4 h-4" />
            <span className="text-sm">Total Requests</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {accessStats.totalRequests.toLocaleString()}
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700 mb-2">
            <XCircle className="w-4 h-4" />
            <span className="text-sm">Access Denied</span>
          </div>
          <div className="text-2xl font-semibold text-red-700">
            {accessStats.deniedRequests}
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-blue-700 mb-2">
            <Shield className="w-4 h-4" />
            <span className="text-sm">Admin Access</span>
          </div>
          <div className="text-2xl font-semibold text-blue-700">
            {accessStats.adminAccess}
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-700 mb-2">
            <Lock className="w-4 h-4" />
            <span className="text-sm">Rate Limited</span>
          </div>
          <div className="text-2xl font-semibold text-amber-700">
            {accessStats.rateLimited}
          </div>
        </div>
      </div>

      {/* Denied by Route Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartContainer
          title="Access Denied by Route"
          loading={isLoading}
          empty={deniedByRoute.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deniedByRoute} layout="vertical" margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis type="number" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis type="category" dataKey="route" stroke={chartColors.grid} tick={chartConfig.axis.tick} width={120} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Denied" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <h3 className="font-medium text-[#111111] mb-4">Access Summary</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#6B7280]">Success Rate</span>
              <span className="font-medium text-green-600">
                {((1 - accessStats.deniedRequests / accessStats.totalRequests) * 100).toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#6B7280]">Admin Traffic</span>
              <span className="font-medium text-[#111111]">
                {((accessStats.adminAccess / accessStats.totalRequests) * 100).toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#6B7280]">Rate Limit Rate</span>
              <span className="font-medium text-amber-600">
                {((accessStats.rateLimited / accessStats.totalRequests) * 100).toFixed(3)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {(["all", "denied", "admin", "ratelimit"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm rounded-lg ${
              filter === f
                ? "bg-[#111111] text-white"
                : "bg-white border border-[#E6E6EC] text-[#6B7280] hover:bg-[#FAFAFA]"
            }`}
          >
            {f === "all" ? "All" : f === "denied" ? "Denied" : f === "admin" ? "Admin" : "Rate Limited"}
          </button>
        ))}
      </div>

      {/* Access Logs Table */}
      <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Time</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">User</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Route</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Method</th>
              <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Status</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Reason</th>
              <th className="text-left px-4 py-3 font-medium text-[#6B7280]">IP</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id} className="border-b border-[#E6E6EC]">
                <td className="px-4 py-3 text-xs text-[#6B7280]">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#111111]">
                  {log.userId}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#6B7280]">
                  {log.route}
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                    {log.method}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 text-xs rounded ${getStatusColor(log.statusCode)}`}>
                    {log.statusCode}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[#6B7280]">
                  {log.reason}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[#6B7280]">
                  {log.ip}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

export default AccessLogsPage;
