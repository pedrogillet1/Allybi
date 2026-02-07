/**
 * Sessions Page - Users Subsection
 * Shows user sessions with real data from the security API
 */

import { useState } from "react";
import { Globe, Clock, Shield, AlertTriangle, Info } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useSecurity } from "@/hooks/useAdminApi";
import type { TimeRange, Environment } from "@/types/admin";

interface Session {
  id: string;
  userId: string | null;
  action: string;
  ipAddress: string | null;
  timestamp: string;
  resource: string | null;
  status: string;
  isSuspicious: boolean;
}

export function SessionsPage() {
  const [range, setRange] = useState<TimeRange>("24h");
  const [env, setEnv] = useState<Environment>("prod");
  const [filter, setFilter] = useState<"all" | "suspicious">("all");

  const { data, isLoading, error } = useSecurity({ range, env });

  // Transform security events to sessions using real data only
  const sessions: Session[] = (data?.events ?? []).map((event, i) => ({
    id: `session-${i}`,
    userId: event.userId,
    action: event.action,
    ipAddress: event.ipAddress,
    timestamp: event.at,
    resource: event.resource,
    status: event.status,
    isSuspicious: event.action.toLowerCase().includes('fail') ||
                  event.action.toLowerCase().includes('denied') ||
                  event.action.toLowerCase().includes('block'),
  }));

  const filteredSessions = sessions.filter(s => {
    if (filter === "suspicious") return s.isSuspicious;
    return true;
  });

  // Real counters from API
  const counters = data?.counters ?? { privacyBlocks: 0, redactions: 0, failedAuth: 0, accessDenied: 0 };
  const totalSuspicious = counters.failedAuth + counters.accessDenied + counters.privacyBlocks;

  const formatTimestamp = (ts: string) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  const formatAction = (action: string) => {
    // Make action more readable
    return action
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim();
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#111111]">Security Events</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Monitor authentication and access events
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">Total Events</div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : sessions.length}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">Failed Auth</div>
          <div className="text-2xl font-semibold text-amber-600">
            {isLoading ? "-" : counters.failedAuth}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">Access Denied</div>
          <div className="text-2xl font-semibold text-red-600">
            {isLoading ? "-" : counters.accessDenied}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">Privacy Blocks</div>
          <div className="text-2xl font-semibold text-[#111111]">
            {isLoading ? "-" : counters.privacyBlocks}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {(["all", "suspicious"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm rounded-lg ${
              filter === f
                ? "bg-[#111111] text-white"
                : "bg-white border border-[#E6E6EC] text-[#6B7280] hover:bg-[#FAFAFA]"
            }`}
          >
            {f === "all" ? "All Events" : "Suspicious Only"}
          </button>
        ))}
      </div>

      {/* Sessions Table */}
      <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
        {error && (
          <div className="p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-[#6B7280]">{error.message}</p>
          </div>
        )}

        {isLoading && (
          <div className="p-6 animate-pulse space-y-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-12 bg-[#E6E6EC] rounded" />
            ))}
          </div>
        )}

        {!isLoading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                  <th className="text-left px-4 py-3 font-medium text-[#6B7280]">User ID</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6B7280]">IP Address</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Resource</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Time</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => (
                  <tr
                    key={session.id}
                    className={`border-b border-[#E6E6EC] hover:bg-[#FAFAFA] ${
                      session.isSuspicious ? "bg-red-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-[#111111]">
                        {session.userId ? (
                          session.userId.length > 12
                            ? `${session.userId.slice(0, 12)}...`
                            : session.userId
                        ) : (
                          <span className="text-[#6B7280]">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[#111111] ${
                        session.isSuspicious ? "text-red-700" : ""
                      }`}>
                        {session.isSuspicious && <AlertTriangle className="w-3 h-3" />}
                        {formatAction(session.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#6B7280]">
                      {session.ipAddress || "-"}
                    </td>
                    <td className="px-4 py-3 text-[#6B7280] text-xs">
                      {session.resource || "-"}
                    </td>
                    <td className="px-4 py-3 text-[#6B7280] text-xs">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimestamp(session.timestamp)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded ${
                        session.status === "success" || session.status === "ok"
                          ? "bg-green-100 text-green-700"
                          : session.status === "fail" || session.status === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-700"
                      }`}>
                        {session.status || "unknown"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !error && filteredSessions.length === 0 && (
          <div className="p-6 text-center text-[#6B7280]">
            <Shield className="w-8 h-8 mx-auto mb-2 text-green-500" />
            <p>No security events found for the selected filter</p>
          </div>
        )}
      </div>

      {/* Info about session tracking */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">About Session Data</h3>
            <p className="text-sm text-blue-800 mt-1">
              This page shows security audit events from the system.
              Detailed session tracking (device type, browser, location) is not currently enabled.
              Contact the team to enable enhanced session monitoring if needed.
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export default SessionsPage;
