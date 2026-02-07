/**
 * Jobs Page - Reliability Subsection
 * Shows queue status, job durations, stuck jobs, retry counts
 */

import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Layers, Clock, AlertTriangle, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useJobsAnalytics } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

export function JobsPage() {
  const [range, setRange] = useState<TimeRange>("24h");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading } = useJobsAnalytics({ range, env });

  // Extract data from API response with defaults
  const queueStats = data?.stats ?? {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    stuck: 0,
    avgDuration: 0,
    p95Duration: 0,
  };

  const queueOverTime = data?.queueOverTime ?? [];
  const durationDistribution = data?.durationDistribution ?? [];
  const recentJobs = data?.recentJobs ?? [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "stuck":
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case "processing":
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Queue & Jobs</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Monitor job queues, processing times, and stuck jobs
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-sm text-amber-700 mb-1">Pending</div>
          <div className="text-2xl font-semibold text-amber-700">{queueStats.pending}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-700 mb-1">Processing</div>
          <div className="text-2xl font-semibold text-blue-700">{queueStats.processing}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm text-green-700 mb-1">Completed</div>
          <div className="text-2xl font-semibold text-green-700">{queueStats.completed}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm text-red-700 mb-1">Failed</div>
          <div className="text-2xl font-semibold text-red-700">{queueStats.failed}</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="text-sm text-orange-700 mb-1">Stuck</div>
          <div className="text-2xl font-semibold text-orange-700">{queueStats.stuck}</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">Avg Duration</div>
          <div className="text-2xl font-semibold text-[#111111]">{queueStats.avgDuration}s</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">P95 Duration</div>
          <div className="text-2xl font-semibold text-[#111111]">{queueStats.p95Duration}s</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Queue Depth */}
        <ChartContainer
          title="Queue Depth (24h)"
          loading={isLoading}
          empty={queueOverTime.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={queueOverTime} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="hour" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              <Area type="monotone" dataKey="pending" name="Pending" stroke="#f59e0b" fill="#f59e0b" stackId="1" />
              <Area type="monotone" dataKey="processing" name="Processing" stroke="#3b82f6" fill="#3b82f6" stackId="1" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Duration Distribution */}
        <ChartContainer
          title="Job Duration Distribution"
          loading={isLoading}
          empty={durationDistribution.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={durationDistribution} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="range" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Jobs" fill={chartColors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Jobs Table */}
      <div>
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Recent Jobs</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Job ID</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Type</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Duration</th>
                <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Retries</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Created</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Error</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((job) => (
                <tr key={job.id} className={`border-b border-[#E6E6EC] ${job.status === "stuck" ? "bg-amber-50" : job.status === "failed" ? "bg-red-50" : ""}`}>
                  <td className="px-4 py-3">{getStatusIcon(job.status)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#111111]">{job.id}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                      {job.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[#6B7280]">
                    {job.duration !== undefined ? `${(job.duration / 1000).toFixed(1)}s` : "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={job.retries > 0 ? "text-amber-600" : "text-[#6B7280]"}>
                      {job.retries}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#6B7280]">
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate">
                    {job.error || "-"}
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

export default JobsPage;
