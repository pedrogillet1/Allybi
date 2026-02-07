/**
 * Weak Evidence Page - Quality Subsection
 * Shows queries with weak evidence, analysis and patterns
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
import { AlertTriangle, Search, FileText, Target, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAnswerQuality } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

const COLORS = ['#f59e0b', '#f97316', '#ef4444', '#dc2626', '#b91c1c'];

interface WeakQuery {
  id: string;
  queryText: string;
  domain: string;
  topScore: number;
  chunksUsed: number;
  timestamp: string;
}

export function WeakEvidencePage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data: qualityData, isLoading } = useAnswerQuality({ range, env });

  // Use real data from API
  const weakDetail = qualityData?.weakEvidence;
  const totals = qualityData?.totals;

  // Transform API data to component format
  const weakQueries: WeakQuery[] = weakDetail?.queries ?? [];
  const weakByDomain = weakDetail?.byDomain ?? [];
  const weakReasons = weakDetail?.byReason ?? [];

  // Calculate stats from real data
  const totalWeak = weakDetail?.totalWeak ?? totals?.weakEvidence ?? 0;
  const totalQueries = totals?.total ?? 0;
  const weakRate = totalQueries > 0 ? (totalWeak / totalQueries) * 100 : 0;
  const avgScore = weakDetail?.avgScore ?? 0;
  const topDomain = weakDetail?.topDomain ?? "unknown";

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Weak Evidence Analysis</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Investigate queries with weak retrieval evidence (score 0.35-0.50)
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-700 mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Weak Evidence</span>
          </div>
          <div className="text-2xl font-semibold text-amber-700">
            {isLoading ? "-" : totalWeak}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Target className="w-4 h-4" />
            <span className="text-sm">Weak Rate</span>
          </div>
          <div className="text-2xl font-semibold text-amber-600">
            {isLoading ? "-" : `${weakRate.toFixed(1)}%`}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Search className="w-4 h-4" />
            <span className="text-sm">Avg Score</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : `${Math.round(avgScore * 100)}%`}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <FileText className="w-4 h-4" />
            <span className="text-sm">Top Domain</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : topDomain}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* By Domain */}
        <ChartContainer
          title="Weak Evidence by Domain"
          loading={isLoading}
          empty={weakByDomain.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={weakByDomain}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
                nameKey="domain"
                label={({ domain, percentage }) => `${domain} (${percentage}%)`}
              >
                {weakByDomain.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* By Reason */}
        <ChartContainer
          title="Weak Evidence Reasons"
          loading={isLoading}
          empty={weakReasons.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weakReasons} layout="vertical" margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis type="number" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis type="category" dataKey="reason" stroke={chartColors.grid} tick={chartConfig.axis.tick} width={120} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Queries" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Weak Evidence Queries Table */}
      <div>
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Recent Weak Evidence Queries</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Query</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Domain</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Score</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Chunks</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Time</th>
                <th className="text-center px-4 py-3 font-medium text-[#6B7280]"></th>
              </tr>
            </thead>
            <tbody>
              {weakQueries.map((query) => (
                <tr key={query.id} className="border-b border-[#E6E6EC] hover:bg-[#FAFAFA]">
                  <td className="px-4 py-3 max-w-xs truncate text-[#111111]">
                    {query.queryText}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded">
                      {query.domain}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-medium text-amber-600">
                      {(query.topScore * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[#6B7280]">
                    {query.chunksUsed}
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

      {/* Recommendations */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">Recommendations to Reduce Weak Evidence</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          {topDomain !== "unknown" && (
            <li>• Add more documents for "{topDomain}" domain - highest weak evidence rate</li>
          )}
          {weakReasons.find(r => r.reason.includes("narrow"))?.percentage && (
            <li>• Review scope constraints - {weakReasons.find(r => r.reason.includes("narrow"))?.percentage}% caused by narrow scope</li>
          )}
          {weakReasons.find(r => r.reason.includes("chunks"))?.percentage && (
            <li>• Consider expanding retrieval topK for complex queries</li>
          )}
          <li>• Enable query rewriting for ambiguous questions</li>
        </ul>
      </div>
    </AdminLayout>
  );
}

export default WeakEvidencePage;
