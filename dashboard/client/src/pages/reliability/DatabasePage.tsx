/**
 * Database Page - Reliability Subsection
 * Shows database health, connection pools, slow queries
 */

import { useState } from "react";
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
import { Database, Clock, AlertTriangle, Activity, HardDrive, Zap } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useDatabaseAnalytics } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

export function DatabasePage() {
  const [range, setRange] = useState<TimeRange>("24h");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading } = useDatabaseAnalytics({ range, env });

  // Extract data from API response with defaults
  const dbStats = data?.stats ?? {
    connections: 0,
    maxConnections: 100,
    activeQueries: 0,
    avgQueryTime: 0,
    p95QueryTime: 0,
    deadlocks: 0,
    cacheHitRate: 0,
    storageUsed: 0,
    storageTotal: 0,
  };

  const connectionOverTime = data?.connectionOverTime ?? [];
  const queryLatency = data?.queryLatency ?? [];
  const slowQueries = data?.slowQueries ?? [];
  const dataAvailable = data?.available ?? true;
  const dataMessage = data?.message;

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Database Health</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Monitor database performance, connections, and slow queries
        </p>
      </div>

      {/* Data availability notice */}
      {!dataAvailable && dataMessage && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">{dataMessage}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Database className="w-4 h-4" />
            <span className="text-xs">Connections</span>
          </div>
          <div className="text-xl font-semibold text-[#111111]">
            {dbStats.connections}/{dbStats.maxConnections}
          </div>
          <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${dbStats.connections / dbStats.maxConnections > 0.8 ? "bg-amber-500" : "bg-green-500"}`}
              style={{ width: `${(dbStats.connections / dbStats.maxConnections) * 100}%` }}
            />
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Activity className="w-4 h-4" />
            <span className="text-xs">Active Queries</span>
          </div>
          <div className="text-xl font-semibold text-[#111111]">{dbStats.activeQueries}</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-xs">Avg Query</span>
          </div>
          <div className="text-xl font-semibold text-[#111111]">{dbStats.avgQueryTime}ms</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs">P95 Query</span>
          </div>
          <div className="text-xl font-semibold text-amber-600">{dbStats.p95QueryTime}ms</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Zap className="w-4 h-4" />
            <span className="text-xs">Cache Hit</span>
          </div>
          <div className="text-xl font-semibold text-green-600">{dbStats.cacheHitRate}%</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <HardDrive className="w-4 h-4" />
            <span className="text-xs">Storage</span>
          </div>
          <div className="text-xl font-semibold text-[#111111]">
            {dbStats.storageUsed}/{dbStats.storageTotal}GB
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Connection Pool */}
        <ChartContainer
          title="Connection Pool (24h)"
          loading={isLoading}
          empty={connectionOverTime.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={connectionOverTime} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="hour" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              <Area type="monotone" dataKey="active" name="Active" stroke="#3b82f6" fill="#3b82f6" stackId="1" />
              <Area type="monotone" dataKey="idle" name="Idle" stroke="#a3a3a3" fill="#a3a3a3" stackId="1" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Query Latency */}
        <ChartContainer
          title="Query Latency (24h)"
          loading={isLoading}
          empty={queryLatency.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={queryLatency} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="hour" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} unit="ms" />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              <Line type="monotone" dataKey="avg" name="Avg" stroke={chartColors.success} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="p95" name="P95" stroke={chartColors.warning} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Slow Queries */}
      <div>
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Slow Queries (Top 10)</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Query</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Table</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Max (ms)</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Avg (ms)</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Calls</th>
              </tr>
            </thead>
            <tbody>
              {slowQueries.map((query, i) => (
                <tr key={i} className="border-b border-[#E6E6EC]">
                  <td className="px-4 py-3 font-mono text-xs text-[#111111] max-w-md truncate">
                    {query.query}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                      {query.table}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={query.duration > 1000 ? "text-red-600 font-medium" : "text-[#6B7280]"}>
                      {query.duration}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[#6B7280]">{query.avgDuration}</td>
                  <td className="px-4 py-3 text-right text-[#6B7280]">{query.calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

export default DatabasePage;
