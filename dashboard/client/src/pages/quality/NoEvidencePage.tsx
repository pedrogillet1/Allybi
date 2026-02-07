/**
 * No Evidence Page - Quality Subsection
 * Shows queries with no evidence (zero docs or very low scores)
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
import { XCircle, Search, FileText, AlertTriangle, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAnswerQuality } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

const COLORS = ['#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'];

interface NoEvidenceQuery {
  id: string;
  queryText: string;
  domain: string;
  reason: string;
  timestamp: string;
}

export function NoEvidencePage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data: qualityData, isLoading } = useAnswerQuality({ range, env });

  // Use real data from API
  const noEvidenceDetail = qualityData?.noEvidence;
  const totals = qualityData?.totals;

  // Transform API data to component format
  const noEvidenceQueries: NoEvidenceQuery[] = noEvidenceDetail?.queries ?? [];
  const noEvidenceReasons = noEvidenceDetail?.byReason ?? [];
  const noEvidenceByDomain = noEvidenceDetail?.byDomain ?? [];
  const queryPatterns = noEvidenceDetail?.patterns ?? [];

  // Calculate stats from real data
  const totalNoEvidence = noEvidenceDetail?.totalNoEvidence ?? totals?.fallbacks ?? 0;
  const totalQueries = totals?.total ?? 0;
  const noEvidenceRate = totalQueries > 0 ? (totalNoEvidence / totalQueries) * 100 : 0;
  const topReason = noEvidenceDetail?.topReason ?? "unknown";
  const affectedUsers = noEvidenceDetail?.affectedUsers ?? 0;

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">No Evidence Analysis</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Investigate queries with no retrieval results (score &lt;0.35 or zero docs)
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700 mb-2">
            <XCircle className="w-4 h-4" />
            <span className="text-sm">No Evidence</span>
          </div>
          <div className="text-2xl font-semibold text-red-700">
            {isLoading ? "-" : totalNoEvidence}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">No Evidence Rate</span>
          </div>
          <div className="text-2xl font-semibold text-red-600">
            {isLoading ? "-" : `${noEvidenceRate.toFixed(1)}%`}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Search className="w-4 h-4" />
            <span className="text-sm">Top Reason</span>
          </div>
          <div className="text-lg font-semibold text-[#111111]">
            {isLoading ? "-" : topReason}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <FileText className="w-4 h-4" />
            <span className="text-sm">Affected Users</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : affectedUsers.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* By Reason */}
        <ChartContainer
          title="No Evidence Reasons"
          loading={isLoading}
          empty={noEvidenceReasons.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={noEvidenceReasons}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
                nameKey="reason"
                label={({ percentage }) => `${percentage}%`}
              >
                {noEvidenceReasons.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* By Domain */}
        <ChartContainer
          title="No Evidence by Domain"
          loading={isLoading}
          empty={noEvidenceByDomain.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={noEvidenceByDomain} layout="vertical" margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis type="number" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis type="category" dataKey="domain" stroke={chartColors.grid} tick={chartConfig.axis.tick} width={80} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Queries" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Common Query Patterns */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Common Query Patterns (Gap Detection)</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Pattern</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Count</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Action</th>
              </tr>
            </thead>
            <tbody>
              {queryPatterns.map((pattern) => (
                <tr key={pattern.pattern} className="border-b border-[#E6E6EC]">
                  <td className="px-4 py-3 text-[#111111]">{pattern.pattern}</td>
                  <td className="px-4 py-3 text-right text-[#6B7280]">{pattern.count}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-blue-600">View queries →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* No Evidence Queries Table */}
      <div>
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Recent No Evidence Queries</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Query</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Domain</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Time</th>
                <th className="text-center px-4 py-3 font-medium text-[#6B7280]"></th>
              </tr>
            </thead>
            <tbody>
              {noEvidenceQueries.map((query) => (
                <tr key={query.id} className="border-b border-[#E6E6EC] hover:bg-[#FAFAFA]">
                  <td className="px-4 py-3 max-w-xs truncate text-[#111111]">
                    {query.queryText}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">
                      {query.domain}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#6B7280]">
                    {query.reason}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#6B7280]">
                    {new Date(query.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link href={`/admin/queries/${query.id}/trace`}>
                      <ChevronRight className="w-4 h-4 text-[#6B7280] hover:text-[#111111]" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights */}
      <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="font-medium text-red-900 mb-2">Key Insights</h3>
        <ul className="text-sm text-red-800 space-y-1">
          {noEvidenceByDomain.find(d => d.domain === "unknown")?.percentage && (
            <li>• {noEvidenceByDomain.find(d => d.domain === "unknown")?.percentage}% of no-evidence queries are from unknown domain - routing issue</li>
          )}
          {queryPatterns.length > 0 && (
            <li>• Top pattern: {queryPatterns[0]?.pattern} ({queryPatterns[0]?.count} queries)</li>
          )}
          {noEvidenceReasons.find(r => r.reason.includes("Scope"))?.percentage && (
            <li>• Scope constraints cause {noEvidenceReasons.find(r => r.reason.includes("Scope"))?.percentage}% of failures - review filter logic</li>
          )}
          {noEvidenceReasons.find(r => r.reason.includes("Language"))?.percentage && (
            <li>• Language mismatch detected in {noEvidenceReasons.find(r => r.reason.includes("Language"))?.percentage}% - enable multilingual support</li>
          )}
        </ul>
      </div>
    </AdminLayout>
  );
}

export default NoEvidencePage;
