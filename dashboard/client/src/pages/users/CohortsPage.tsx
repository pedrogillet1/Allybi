/**
 * Cohorts Page - Users Subsection
 * Shows retention cohorts from real user data
 */

import { useState } from "react";
import { Users, TrendingUp, Activity, Target, Info, AlertTriangle } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useCohorts } from "@/hooks/useAdminApi";
import type { TimeRange, Environment } from "@/types/admin";

export function CohortsPage() {
  const [range, setRange] = useState<TimeRange>("90d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading, error } = useCohorts({ range, env });

  const cohorts = data?.cohorts ?? [];
  const summary = data?.summary ?? {
    totalCohorts: 0,
    totalUsers: 0,
    avgWeek1Retention: 0,
    avgWeek4Retention: 0,
    hasEnoughData: false,
  };

  const getRetentionColor = (value: number) => {
    if (value < 0) return "bg-gray-100"; // Future week, not yet measurable
    if (value >= 60) return "bg-green-500";
    if (value >= 40) return "bg-green-400";
    if (value >= 30) return "bg-yellow-400";
    if (value >= 20) return "bg-orange-400";
    return "bg-red-400";
  };

  const getRetentionTextColor = (value: number) => {
    if (value < 0) return "text-gray-400";
    if (value >= 40) return "text-white";
    return "text-gray-900";
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Cohorts & Retention</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Track user retention over time by signup cohort
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <p className="text-sm text-red-700">{error.message}</p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Users className="w-4 h-4" />
            <span className="text-sm">Total Signups</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : summary.totalUsers.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Target className="w-4 h-4" />
            <span className="text-sm">Avg Week 1 Retention</span>
          </div>
          <div className="text-2xl font-semibold text-green-600">
            {isLoading ? "-" : summary.avgWeek1Retention > 0 ? `${summary.avgWeek1Retention}%` : "N/A"}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Avg Week 4 Retention</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : summary.avgWeek4Retention > 0 ? `${summary.avgWeek4Retention}%` : "N/A"}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <Activity className="w-4 h-4" />
            <span className="text-sm">Cohorts Tracked</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : summary.totalCohorts}
          </div>
        </div>
      </div>

      {/* Insufficient Data Warning */}
      {!isLoading && !summary.hasEnoughData && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-500 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-900">Insufficient Data for Cohort Analysis</h3>
              <p className="text-sm text-amber-800 mt-1">
                Cohort analysis requires at least 2 weeks of user signups and 5+ users.
                Continue growing your user base to unlock retention insights.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="mb-8 bg-white border border-[#E6E6EC] rounded-lg p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      )}

      {/* Cohort Table */}
      {!isLoading && cohorts.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-[#111111] mb-4">Retention by Cohort</h2>
          <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Cohort</th>
                    <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Users</th>
                    <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Week 0</th>
                    <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Week 1</th>
                    <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Week 2</th>
                    <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Week 3</th>
                    <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Week 4</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((cohort) => (
                    <tr key={cohort.cohort} className="border-b border-[#E6E6EC]">
                      <td className="px-4 py-3 font-medium text-[#111111]">{cohort.cohort}</td>
                      <td className="px-4 py-3 text-right text-[#6B7280]">{cohort.users}</td>
                      {[cohort.week0, cohort.week1, cohort.week2, cohort.week3, cohort.week4].map((value, i) => (
                        <td key={i} className="px-4 py-2 text-center">
                          {value >= 0 ? (
                            <span
                              className={`inline-block w-12 py-1 rounded text-xs font-medium ${getRetentionColor(value)} ${getRetentionTextColor(value)}`}
                            >
                              {value}%
                            </span>
                          ) : (
                            <span className="text-[#E6E6EC]">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* No Data State */}
      {!isLoading && cohorts.length === 0 && (
        <div className="mb-8 bg-white border border-[#E6E6EC] rounded-lg p-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-[#111111] mb-2">No Cohort Data Available</h3>
            <p className="text-sm text-[#6B7280] max-w-md">
              Cohort data will appear here once you have users who have signed up within the selected time range.
              Try selecting a longer time range (90d) or wait for more users to sign up.
            </p>
          </div>
        </div>
      )}

      {/* How Retention is Calculated */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">How Retention is Calculated</h3>
            <p className="text-sm text-blue-800 mt-1">
              Users are grouped by their signup week. Retention percentage shows what portion
              of that cohort was active (had at least one conversation) in subsequent weeks.
              A "-" indicates the week hasn't occurred yet for that cohort.
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default CohortsPage;
