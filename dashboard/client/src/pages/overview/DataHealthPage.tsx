/**
 * Data Health Page - Overview Subsection
 * Shows telemetry coverage and data quality status
 */

import { useState } from "react";
import { Database, Info, BarChart3 } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import type { TimeRange, Environment } from "@/types/admin";

export function DataHealthPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Data Health</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Monitor telemetry coverage and data quality across the system
        </p>
      </div>

      {/* Not Implemented Message */}
      <div className="bg-white border border-[#E6E6EC] rounded-lg p-8">
        <div className="flex flex-col items-center text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <Database className="w-8 h-8 text-blue-500" />
          </div>

          <h2 className="text-lg font-semibold text-[#111111] mb-2">
            Data Health Monitoring Not Yet Implemented
          </h2>

          <p className="text-sm text-[#6B7280] mb-6">
            Field-level coverage tracking requires additional instrumentation in the telemetry pipeline.
            Once implemented, this page will show:
          </p>

          <ul className="text-sm text-left text-[#6B7280] space-y-2 mb-6">
            <li className="flex items-start gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <span>Field coverage percentages for query telemetry (domain, intent, evidence strength)</span>
            </li>
            <li className="flex items-start gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <span>LLM call field completeness (provider, model, tokens, latency)</span>
            </li>
            <li className="flex items-start gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <span>Pipeline event tracking (step name, duration, error codes)</span>
            </li>
            <li className="flex items-start gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <span>Document metadata completeness (mime type, chunks, embeddings)</span>
            </li>
          </ul>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="text-left">
                <p className="text-sm text-blue-800">
                  <strong>To enable data health monitoring:</strong> Create a backend endpoint that queries
                  actual field coverage from the QueryTelemetry and ModelCall tables, then wire up
                  a new <code className="bg-blue-100 px-1 rounded">useDataHealth()</code> hook.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* What's Available Now */}
      <div className="mt-6 bg-white border border-[#E6E6EC] rounded-lg p-6">
        <h3 className="text-md font-semibold text-[#111111] mb-4">Available Metrics</h3>
        <p className="text-sm text-[#6B7280] mb-4">
          While detailed field coverage is not yet available, you can monitor overall data health through:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/overview"
            className="block p-4 border border-[#E6E6EC] rounded-lg hover:bg-[#FAFAFA] transition-colors"
          >
            <div className="text-sm font-medium text-[#111111]">Overview Dashboard</div>
            <div className="text-xs text-[#6B7280] mt-1">KPIs, error rates, latency metrics</div>
          </a>
          <a
            href="/reliability"
            className="block p-4 border border-[#E6E6EC] rounded-lg hover:bg-[#FAFAFA] transition-colors"
          >
            <div className="text-sm font-medium text-[#111111]">Reliability</div>
            <div className="text-xs text-[#6B7280] mt-1">LLM errors, ingestion failures</div>
          </a>
          <a
            href="/files"
            className="block p-4 border border-[#E6E6EC] rounded-lg hover:bg-[#FAFAFA] transition-colors"
          >
            <div className="text-sm font-medium text-[#111111]">Files</div>
            <div className="text-xs text-[#6B7280] mt-1">Document processing status</div>
          </a>
        </div>
      </div>
    </AdminLayout>
  );
}

export default DataHealthPage;
