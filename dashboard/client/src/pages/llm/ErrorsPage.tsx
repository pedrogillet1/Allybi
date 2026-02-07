/**
 * LLM Errors Page - LLM Subsection
 * Shows LLM errors, timeouts, rate limits, and retries
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
  Legend,
  ResponsiveContainer,
} from "recharts";
import { AlertTriangle, XCircle, Clock, RefreshCw } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useLLMCost } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#dc2626', '#b91c1c'];

export function ErrorsPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading } = useLLMCost({ range, env });

  // Use real data from extended API
  const errorTypes = data?.extended?.errorTypes ?? [];
  const errorsByProvider = data?.extended?.errorsByProvider ?? [];
  const hourlyErrors = data?.extended?.hourlyErrors ?? [];
  const recentErrors = data?.extended?.recentErrors ?? [];
  const retrySuccessRate = data?.extended?.retrySuccessRate ?? 0;

  const totalErrors = errorTypes.reduce((s, e) => s + e.count, 0);
  const totalCalls = errorsByProvider.reduce((s, p) => s + p.total, 0);
  const overallErrorRate = totalCalls > 0 ? ((totalErrors / totalCalls) * 100).toFixed(2) : data?.summary?.errorRate?.toFixed(2) ?? "0.00";
  const rateLimitCount = errorTypes.find(e => e.type === "Rate Limit")?.count ?? 0;

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">LLM Errors</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Monitor LLM errors, timeouts, and retry success rates
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700 mb-2">
            <XCircle className="w-4 h-4" />
            <span className="text-sm">Total Errors</span>
          </div>
          <div className="text-2xl font-semibold text-red-700">
            {isLoading ? "-" : totalErrors}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Error Rate</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : `${overallErrorRate}%`}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Rate Limits</span>
          </div>
          <div className="text-2xl font-semibold text-amber-600">
            {isLoading ? "-" : rateLimitCount}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm">Retry Success</span>
          </div>
          <div className="text-2xl font-semibold text-green-600">
            {isLoading ? "-" : `${retrySuccessRate}%`}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Error Types */}
        <ChartContainer
          title="Error Types"
          loading={isLoading}
          empty={errorTypes.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={errorTypes}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
                nameKey="type"
                label={({ type, percentage }) => `${type} (${percentage}%)`}
              >
                {errorTypes.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Errors Over Time */}
        <ChartContainer
          title="Errors Over Time (24h)"
          loading={isLoading}
          empty={hourlyErrors.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hourlyErrors} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis dataKey="hour" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              <Line type="monotone" dataKey="errors" name="Total" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="rateLimit" name="Rate Limit" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="timeout" name="Timeout" stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Errors by Provider */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Error Rate by Provider</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Provider</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Total Calls</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Errors</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Error Rate</th>
              </tr>
            </thead>
            <tbody>
              {errorsByProvider.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[#6B7280]">
                    No error data available for this time range
                  </td>
                </tr>
              ) : (
                errorsByProvider.map((provider) => (
                  <tr key={provider.provider} className="border-b border-[#E6E6EC]">
                    <td className="px-4 py-3 font-medium text-[#111111]">{provider.provider}</td>
                    <td className="px-4 py-3 text-right text-[#6B7280]">{provider.total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-red-600">{provider.errors}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={provider.rate < 1 ? "text-green-600" : "text-red-600"}>
                        {provider.rate.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Errors Table */}
      <div>
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Recent Errors</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Provider/Model</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Error</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Message</th>
                <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Retry</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentErrors.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[#6B7280]">
                    No recent errors
                  </td>
                </tr>
              ) : (
                recentErrors.map((error) => (
                  <tr key={error.id} className="border-b border-[#E6E6EC]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#111111]">{error.provider}</div>
                      <div className="text-xs text-[#6B7280]">{error.model}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">
                        {error.errorType}
                      </span>
                      <span className="ml-1 text-xs text-[#6B7280]">{error.errorCode}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#6B7280] max-w-xs truncate">
                      {error.message}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {error.retried ? (
                        error.succeeded ? (
                          <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">Success</span>
                        ) : (
                          <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">Failed</span>
                        )
                      ) : (
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#6B7280]">
                      {new Date(error.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

export default ErrorsPage;
