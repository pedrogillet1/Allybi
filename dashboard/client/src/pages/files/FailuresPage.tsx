/**
 * Failures Page - Files Subsection
 * Shows ingestion failures, failure types, retry success rates
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
import { AlertTriangle, RefreshCw, FileX, Clock } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useFileFailures } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

const COLORS = ['#ef4444', '#f59e0b', '#f97316', '#dc2626', '#b91c1c'];

export function FailuresPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading } = useFileFailures({ range, env });

  // Use real data from API
  const failureTypes = data?.failureTypes ?? [];
  const failuresByFileType = data?.failuresByFileType ?? [];
  const retryStats = data?.retryStats ?? { totalRetries: 0, successful: 0, failed: 0, successRate: 0, pendingRetry: 0 };
  const recentFailures = data?.recentFailures ?? [];

  const totalFiles = data?.totalFiles ?? 0;
  const totalFailed = data?.totalFailed ?? 0;
  const failureRate = data?.failureRate ?? 0;

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Ingestion Failures</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Track and analyze document processing failures
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <FileX className="w-4 h-4" />
            <span className="text-sm">Total Failures</span>
          </div>
          <div className="text-2xl font-semibold text-red-600">
            {isLoading ? "-" : totalFailed}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Failure Rate</span>
          </div>
          <div className="text-2xl font-semibold text-amber-600">
            {isLoading ? "-" : `${failureRate}%`}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm">Retry Success</span>
          </div>
          <div className="text-2xl font-semibold text-green-600">
            {isLoading ? "-" : `${retryStats.successRate}%`}
          </div>
          <div className="text-xs text-[#6B7280]">{retryStats.successful} of {retryStats.totalRetries} retries</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Pending Retry</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : retryStats.pendingRetry}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Failure Types */}
        <ChartContainer
          title="Failure Types"
          loading={isLoading}
          empty={failureTypes.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={failureTypes}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
                nameKey="type"
                label={({ type, percentage }) => `${type} (${percentage}%)`}
              >
                {failureTypes.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Failure Rate by File Type */}
        <ChartContainer
          title="Failure Rate by File Type"
          loading={isLoading}
          empty={failuresByFileType.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={failuresByFileType} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="type" stroke="#E6E6EC" tick={chartConfig.axis.tick} />
              <YAxis stroke="#E6E6EC" tick={chartConfig.axis.tick} unit="%" />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="rate" name="Failure Rate" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Recent Failures Table */}
      <div>
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Recent Failures</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                  <th className="text-left px-4 py-3 font-medium text-[#6B7280]">File</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Error</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Stage</th>
                  <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Retries</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Last Attempt</th>
                  <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentFailures.length === 0 && !isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#6B7280]">
                      No recent failures
                    </td>
                  </tr>
                ) : (
                  recentFailures.map((failure) => (
                    <tr key={failure.id} className="border-b border-[#E6E6EC] hover:bg-[#FAFAFA]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#111111] text-xs truncate max-w-xs">
                          {failure.fileName || 'Unknown file'}
                        </div>
                        <div className="text-xs text-[#6B7280]">{failure.fileType}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded font-mono">
                            {failure.errorCode}
                          </span>
                        </div>
                        <div className="text-xs text-[#6B7280] mt-1 max-w-xs truncate">
                          {failure.errorMessage}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded font-mono">
                          {failure.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-medium ${failure.retryCount >= 3 ? "text-red-600" : "text-[#6B7280]"}`}>
                          {failure.retryCount}/3
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#6B7280]">
                        {new Date(failure.lastAttempt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button className="px-3 py-1 text-xs bg-[#111111] text-white rounded hover:bg-[#333333]">
                          Retry
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Insights */}
      {failureTypes.length > 0 && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-medium text-amber-900 mb-2">Insights</h3>
          <ul className="text-sm text-amber-800 space-y-1">
            {failureTypes[0] && (
              <li>• {failureTypes[0].type} accounts for {failureTypes[0].percentage}% of all failures</li>
            )}
            {failuresByFileType[0] && failuresByFileType[0].rate > 10 && (
              <li>• {failuresByFileType[0].type} files have the highest failure rate ({failuresByFileType[0].rate}%)</li>
            )}
            {retryStats.successRate > 50 && (
              <li>• {retryStats.successRate}% of retries succeed - most failures are transient</li>
            )}
            <li>• Review documents with recurring failures for quality issues</li>
          </ul>
        </div>
      )}
    </AdminLayout>
  );
}

export default FailuresPage;
