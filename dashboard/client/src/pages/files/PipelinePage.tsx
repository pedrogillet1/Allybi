/**
 * Pipeline Page - Files Subsection
 * Shows processing time distribution, OCR (Optical Character Recognition) utilization,
 * embedding (vector conversion) throughput, queue depth
 */

import { useState } from "react";
import {
  AreaChart,
  Area,
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
import { Clock, Cpu, Layers, Zap } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePipelineStats, useWaterfallStats } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function PipelinePage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data: pipelineData, isLoading: pipelineLoading } = usePipelineStats({ range, env });
  const { data: waterfallData, isLoading: waterfallLoading } = useWaterfallStats({ range, env });

  const isLoading = pipelineLoading || waterfallLoading;

  // Use real data from API
  const processingByType = pipelineData?.processingByType ?? [];
  const queueDepth = pipelineData?.queueDepth ?? [];
  const throughput = pipelineData?.throughput ?? [];
  const pipelineStages = waterfallData?.steps ?? [];

  // Summary stats
  const avgProcessingTimeMs = pipelineData?.avgProcessingTimeMs ?? 0;
  const ocrUtilization = pipelineData?.ocrUtilization ?? 0;
  const ocrDocCount = pipelineData?.ocrDocCount ?? 0;
  const totalDocs = pipelineData?.totalDocs ?? 0;
  const embeddingsPerHour = pipelineData?.embeddingsPerHour ?? 0;
  const queuePending = pipelineData?.queuePending ?? 0;

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Processing Pipeline</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Monitor document processing performance: upload → extract → OCR (scan text) → chunk → embed (vectorize)
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Avg Processing Time</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : formatDuration(avgProcessingTimeMs)}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Cpu className="w-4 h-4" />
            <span className="text-sm">OCR Utilization</span>
          </div>
          <p className="text-[10px] text-[#9CA3AF] -mt-1 mb-1">Optical Character Recognition for scans</p>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : `${ocrUtilization}%`}
          </div>
          <div className="text-xs text-[#6B7280]">{ocrDocCount} of {totalDocs} docs</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Zap className="w-4 h-4" />
            <span className="text-sm">Embeddings/Hour</span>
          </div>
          <p className="text-[10px] text-[#9CA3AF] -mt-1 mb-1">Text→vector conversions for AI search</p>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : embeddingsPerHour.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Layers className="w-4 h-4" />
            <span className="text-sm">Queue Depth</span>
          </div>
          <div className={`text-2xl font-semibold ${queuePending > 50 ? "text-amber-600" : "text-[#111111]"}`}>
            {isLoading ? "-" : queuePending}
          </div>
          <div className="text-xs text-[#6B7280]">pending jobs</div>
        </div>
      </div>

      {/* Pipeline Stages Table */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Pipeline Stages</h2>
        <p className="text-xs text-[#6B7280] mb-2">P50 = Median (50th percentile), P95 = Slowest 5% (95th percentile)</p>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Stage</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Avg (ms)</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">P50 (Median)</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">P95 (Slowest)</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Error Rate</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Calls</th>
              </tr>
            </thead>
            <tbody>
              {pipelineStages.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#6B7280]">
                    No pipeline stage data available
                  </td>
                </tr>
              ) : (
                pipelineStages.map((stage) => (
                  <tr key={stage.stepName} className="border-b border-[#E6E6EC]">
                    <td className="px-4 py-3 font-medium text-[#111111] font-mono text-xs">
                      {stage.stepName}
                    </td>
                    <td className="px-4 py-3 text-right text-[#6B7280]">
                      {stage.avgDurationMs.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-[#6B7280]">
                      {stage.p50DurationMs.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={stage.p95DurationMs > 5000 ? "text-amber-600" : "text-[#6B7280]"}>
                        {stage.p95DurationMs.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={stage.errorRate > 0.01 ? "text-red-600" : "text-[#6B7280]"}>
                        {(stage.errorRate * 100).toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[#6B7280]">
                      {stage.callCount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Processing Time by File Type */}
        <ChartContainer
          title="Processing Time by File Type"
          subtitle="P50 (Median) and P95 (Slowest 5%) processing times in milliseconds"
          loading={isLoading}
          empty={processingByType.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={processingByType} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="type" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              <Bar dataKey="p50" name="P50 (Median)" fill={chartColors.primary} />
              <Bar dataKey="p95" name="P95 (Slowest 5%)" fill={chartColors.secondary} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Queue Depth Over Time */}
        <ChartContainer
          title="Queue Depth (Last 24 Hours)"
          loading={isLoading}
          empty={queueDepth.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={queueDepth} margin={chartConfig.margin}>
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

        {/* Throughput Over Time */}
        <ChartContainer
          title="Daily Throughput"
          loading={isLoading}
          empty={throughput.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={throughput} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="day" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              <Line type="monotone" dataKey="documents" name="Documents" stroke={chartColors.primary} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="chunks" name="Chunks" stroke={chartColors.secondary} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Embedding Performance */}
        <ChartContainer
          title="Embedding Generation"
          loading={isLoading}
          empty={throughput.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={throughput} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="day" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="embeddings" name="Embeddings" stroke={chartColors.primary} fill={chartColors.primary} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </AdminLayout>
  );
}

export default PipelinePage;
