/**
 * Test Suite Page - Quality Subsection
 * Shows golden queries, regression tracking, quality deltas
 */

import { useState } from "react";
import { CheckCircle, XCircle, Clock, AlertTriangle, Play, Plus, TrendingUp, TrendingDown } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useTestSuite } from "@/hooks/useAdminApi";
import type { TimeRange, Environment } from "@/types/admin";

export function TestSuitePage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");
  const [isRunning, setIsRunning] = useState(false);

  const { data, isLoading } = useTestSuite();

  // Extract data from API response with defaults
  const testCases = data?.testCases ?? [];
  const testRuns = data?.recentRuns ?? [];
  const stats = data?.stats ?? { totalTests: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 };
  const dataAvailable = data?.available ?? false;
  const dataMessage = data?.message;

  const passedCount = stats.passed;
  const failedCount = stats.failed;
  const skippedCount = stats.skipped;
  const passRate = stats.passRate.toFixed(1);

  const handleRunTests = () => {
    setIsRunning(true);
    setTimeout(() => setIsRunning(false), 3000);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "passed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "skipped":
        return <Clock className="w-5 h-5 text-gray-400" />;
      default:
        return null;
    }
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#111111]">Test Suite</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Golden queries and regression tracking for answer quality
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-2 px-3 py-2 text-sm border border-[#E6E6EC] rounded-lg hover:bg-[#FAFAFA]"
          >
            <Plus className="w-4 h-4" />
            Add Test
          </button>
          <button
            onClick={handleRunTests}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#111111] text-white rounded-lg hover:bg-[#333333] disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {isRunning ? "Running..." : "Run All Tests"}
          </button>
        </div>
      </div>

      {/* Data availability notice */}
      {!dataAvailable && dataMessage && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">{dataMessage}</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg animate-pulse">
          <p className="text-sm text-gray-500">Loading test suite data...</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">Total Tests</div>
          <div className="text-2xl font-semibold text-[#111111]">{stats.totalTests}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm text-green-700 mb-1">Passed</div>
          <div className="text-2xl font-semibold text-green-700">{passedCount}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm text-red-700 mb-1">Failed</div>
          <div className="text-2xl font-semibold text-red-700">{failedCount}</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Skipped</div>
          <div className="text-2xl font-semibold text-gray-600">{skippedCount}</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">Pass Rate</div>
          <div className={`text-2xl font-semibold ${parseFloat(passRate) >= 80 ? "text-green-600" : "text-amber-600"}`}>
            {passRate}%
          </div>
        </div>
      </div>

      {/* Test Cases Table */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Test Cases</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Status</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Name</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Expected</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Actual</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Min Score</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Actual Score</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Delta</th>
              </tr>
            </thead>
            <tbody>
              {testCases.map((test) => (
                <tr key={test.id} className={`border-b border-[#E6E6EC] ${test.status === "failed" ? "bg-red-50" : ""}`}>
                  <td className="px-4 py-3">{getStatusIcon(test.status)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#111111]">{test.name}</div>
                    <div className="text-xs text-[#6B7280] truncate max-w-xs">{test.query}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded mr-1">
                      {test.expectedDomain}
                    </span>
                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                      {test.expectedIntent}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {test.actualDomain && (
                      <span className={`px-2 py-1 text-xs rounded ${
                        test.actualDomain === test.expectedDomain ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {test.actualDomain}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-[#6B7280]">
                    {(test.minScore * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    {test.actualScore !== undefined && (
                      <span className={`font-medium ${
                        test.actualScore >= test.minScore ? "text-green-600" : "text-red-600"
                      }`}>
                        {(test.actualScore * 100).toFixed(0)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {test.regressionDelta !== undefined && (
                      <span className={`flex items-center justify-end gap-1 ${
                        test.regressionDelta >= 0 ? "text-green-600" : "text-red-600"
                      }`}>
                        {test.regressionDelta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {test.regressionDelta > 0 ? "+" : ""}{test.regressionDelta}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Runs */}
      <div>
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Recent Test Runs</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Version</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Timestamp</th>
                <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Passed</th>
                <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Failed</th>
                <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Skipped</th>
                <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Duration</th>
              </tr>
            </thead>
            <tbody>
              {testRuns.map((run) => (
                <tr key={run.id} className="border-b border-[#E6E6EC]">
                  <td className="px-4 py-3 font-mono text-xs text-[#111111]">{run.version}</td>
                  <td className="px-4 py-3 text-[#6B7280]">{new Date(run.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center text-green-600">{run.passed}</td>
                  <td className="px-4 py-3 text-center text-red-600">{run.failed}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{run.skipped}</td>
                  <td className="px-4 py-3 text-right text-[#6B7280]">{run.duration}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

export default TestSuitePage;
