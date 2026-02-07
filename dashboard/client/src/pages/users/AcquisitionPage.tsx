/**
 * Acquisition Page - Users Subsection
 * Acquisition tracking is not enabled - shows informational message
 */

import { useState } from "react";
import { Globe, BarChart3, Info, ExternalLink } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import type { TimeRange, Environment } from "@/types/admin";

export function AcquisitionPage() {
  const [range, setRange] = useState<TimeRange>("30d");
  const [env, setEnv] = useState<Environment>("prod");

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Acquisition</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Track where users are coming from and how they convert
        </p>
      </div>

      {/* Not Enabled Message */}
      <div className="bg-white border border-[#E6E6EC] rounded-lg p-8">
        <div className="flex flex-col items-center text-center max-w-lg mx-auto">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <Globe className="w-8 h-8 text-blue-500" />
          </div>

          <h2 className="text-lg font-semibold text-[#111111] mb-2">
            Acquisition Tracking Not Enabled
          </h2>

          <p className="text-sm text-[#6B7280] mb-6">
            To track traffic sources, UTM campaigns, and conversion funnels, acquisition
            tracking needs to be enabled in the user signup flow.
          </p>

          <div className="w-full text-left space-y-4 mb-6">
            <h3 className="text-sm font-medium text-[#111111]">When enabled, this page will show:</h3>
            <ul className="text-sm text-[#6B7280] space-y-2">
              <li className="flex items-start gap-2">
                <BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span><strong>Traffic Sources</strong> - Where users come from (organic, paid, referral, social)</span>
              </li>
              <li className="flex items-start gap-2">
                <BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span><strong>UTM Campaign Performance</strong> - Which marketing campaigns drive signups</span>
              </li>
              <li className="flex items-start gap-2">
                <BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span><strong>Referrer Domains</strong> - Top websites sending traffic</span>
              </li>
              <li className="flex items-start gap-2">
                <BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span><strong>Landing Pages</strong> - Which pages convert best</span>
              </li>
              <li className="flex items-start gap-2">
                <BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span><strong>Conversion Funnel</strong> - Visit → Signup → Activation → Retention</span>
              </li>
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="text-left">
                <p className="text-sm text-blue-800">
                  <strong>To enable acquisition tracking:</strong>
                </p>
                <ol className="text-sm text-blue-800 mt-2 space-y-1 list-decimal list-inside">
                  <li>Capture UTM parameters on landing pages</li>
                  <li>Store referrer and landing page in session</li>
                  <li>Save acquisition data with user signup</li>
                  <li>Create backend endpoint to aggregate metrics</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alternative Metrics */}
      <div className="mt-6 bg-white border border-[#E6E6EC] rounded-lg p-6">
        <h3 className="text-md font-semibold text-[#111111] mb-4">Available User Metrics</h3>
        <p className="text-sm text-[#6B7280] mb-4">
          While acquisition tracking is not enabled, you can still monitor user growth through:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/users"
            className="block p-4 border border-[#E6E6EC] rounded-lg hover:bg-[#FAFAFA] transition-colors"
          >
            <div className="text-sm font-medium text-[#111111]">Users Overview</div>
            <div className="text-xs text-[#6B7280] mt-1">Total users, growth trends, activity</div>
          </a>
          <a
            href="/users/cohorts"
            className="block p-4 border border-[#E6E6EC] rounded-lg hover:bg-[#FAFAFA] transition-colors"
          >
            <div className="text-sm font-medium text-[#111111]">Cohorts & Retention</div>
            <div className="text-xs text-[#6B7280] mt-1">User retention by signup week</div>
          </a>
          <a
            href="/overview"
            className="block p-4 border border-[#E6E6EC] rounded-lg hover:bg-[#FAFAFA] transition-colors"
          >
            <div className="text-sm font-medium text-[#111111]">Overview Dashboard</div>
            <div className="text-xs text-[#6B7280] mt-1">DAU, WAU, MAU, user growth rate</div>
          </a>
        </div>
      </div>
    </AdminLayout>
  );
}

export default AcquisitionPage;
