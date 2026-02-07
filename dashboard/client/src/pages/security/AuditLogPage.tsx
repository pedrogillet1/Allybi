/**
 * Audit Log Page - Security Subsection
 * Shows admin actions, config changes, key usage events
 */

import { useState } from "react";
import { FileText, Settings, Key, User, Shield, Clock, Filter } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAuditLogs } from "@/hooks/useAdminApi";
import type { TimeRange, Environment } from "@/types/admin";

export function AuditLogPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");
  const [filter, setFilter] = useState<"all" | "admin" | "config" | "security">("all");

  const { data, isLoading } = useAuditLogs({ range, env, filter: filter === "all" ? undefined : filter });

  // Extract data from API response with defaults
  const auditEvents = data?.events ?? [];
  const stats = data?.stats ?? { total: 0, adminActions: 0, configChanges: 0, securityEvents: 0 };
  const dataAvailable = data?.available ?? true;
  const dataMessage = data?.message;

  // Filter is now done server-side, but keep client-side for additional filtering if needed
  const filteredEvents = auditEvents;

  const getActionIcon = (action: string) => {
    if (action.includes("user")) return <User className="w-4 h-4" />;
    if (action.includes("config")) return <Settings className="w-4 h-4" />;
    if (action.includes("key")) return <Key className="w-4 h-4" />;
    if (action.includes("security")) return <Shield className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const getActorTypeColor = (type: string) => {
    switch (type) {
      case "admin":
        return "bg-purple-100 text-purple-700";
      case "system":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Audit Log</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Track admin actions, configuration changes, and security events
        </p>
      </div>

      {/* Data availability notice */}
      {!dataAvailable && dataMessage && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">{dataMessage}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[#6B7280] mb-2">
            <FileText className="w-4 h-4" />
            <span className="text-sm">Total Events</span>
          </div>
          <div className="text-2xl font-semibold text-[#111111]">{stats.total}</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-purple-700 mb-2">
            <User className="w-4 h-4" />
            <span className="text-sm">Admin Actions</span>
          </div>
          <div className="text-2xl font-semibold text-purple-700">{stats.adminActions}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-blue-700 mb-2">
            <Settings className="w-4 h-4" />
            <span className="text-sm">Config Changes</span>
          </div>
          <div className="text-2xl font-semibold text-blue-700">{stats.configChanges}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-700 mb-2">
            <Key className="w-4 h-4" />
            <span className="text-sm">Security Events</span>
          </div>
          <div className="text-2xl font-semibold text-amber-700">{stats.securityEvents}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {(["all", "admin", "config", "security"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm rounded-lg ${
              filter === f
                ? "bg-[#111111] text-white"
                : "bg-white border border-[#E6E6EC] text-[#6B7280] hover:bg-[#FAFAFA]"
            }`}
          >
            {f === "all" ? "All Events" : f === "admin" ? "Admin" : f === "config" ? "Config" : "Security"}
          </button>
        ))}
      </div>

      {/* Audit Log Table */}
      <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-6 animate-pulse space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 bg-[#E6E6EC] rounded" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Time</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Actor</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Action</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Resource</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Details</th>
                <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Result</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event) => (
                <tr key={event.id} className="border-b border-[#E6E6EC] hover:bg-[#FAFAFA]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-xs text-[#6B7280]">
                      <Clock className="w-3 h-3" />
                      {new Date(event.timestamp).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs rounded ${getActorTypeColor(event.actorType)}`}>
                        {event.actorType}
                      </span>
                      <span className="text-[#111111]">{event.actor}</span>
                    </div>
                    {event.ip && (
                      <div className="text-xs text-[#6B7280] mt-1">IP: {event.ip}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[#6B7280]">{getActionIcon(event.action)}</span>
                      <span className="font-mono text-xs text-[#111111]">{event.action}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[#111111]">{event.resource}</span>
                    {event.resourceId && (
                      <span className="text-xs text-[#6B7280] ml-1">({event.resourceId})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#6B7280] max-w-xs truncate">
                    {event.details}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 text-xs rounded ${
                      event.result === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {event.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}

export default AuditLogPage;
