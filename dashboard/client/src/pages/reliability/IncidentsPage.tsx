/**
 * Incidents Page - Reliability Subsection
 * Shows incident log, timeline, correlated traces
 */

import { useState } from "react";
import { AlertTriangle, CheckCircle, Clock, Activity, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useIncidentsAnalytics } from "@/hooks/useAdminApi";
import type { TimeRange, Environment, Incident } from "@/types/admin";

export function IncidentsPage() {
  const [range, setRange] = useState<TimeRange>("30d");
  const [env, setEnv] = useState<Environment>("prod");
  const [expandedIncident, setExpandedIncident] = useState<string | null>(null);

  const { data, isLoading } = useIncidentsAnalytics({ range, env });

  // Extract data from API response with defaults
  const incidents = data?.incidents ?? [];
  const stats = data?.stats ?? { active: 0, thisMonth: 0, mttrMinutes: 0, totalDowntimeMinutes: 0 };
  const dataAvailable = data?.available ?? true;
  const dataMessage = data?.message;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-700 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "medium":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-blue-100 text-blue-700 border-blue-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case "investigating":
        return <Activity className="w-5 h-5 text-amber-500 animate-pulse" />;
      case "resolved":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return null;
    }
  };

  const activeIncidents = incidents.filter(i => i.status === "active" || i.status === "investigating");
  const resolvedIncidents = incidents.filter(i => i.status === "resolved");

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Incidents</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Track and analyze system incidents and outages
        </p>
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
          <p className="text-sm text-gray-500">Loading incidents data...</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className={`rounded-lg p-4 ${stats.active > 0 ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
          <div className="text-sm text-[#6B7280] mb-1">Active</div>
          <div className={`text-2xl font-semibold ${stats.active > 0 ? "text-red-700" : "text-green-700"}`}>
            {stats.active}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">This Period</div>
          <div className="text-2xl font-semibold text-[#111111]">{stats.thisMonth}</div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">MTTR</div>
          <div className="text-2xl font-semibold text-[#111111]">
            {stats.mttrMinutes > 0 ? `${Math.round(stats.mttrMinutes)}m` : "-"}
          </div>
        </div>
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">Total Downtime</div>
          <div className="text-2xl font-semibold text-[#111111]">
            {stats.totalDowntimeMinutes > 0 ? `${Math.round(stats.totalDowntimeMinutes)}m` : "-"}
          </div>
        </div>
      </div>

      {/* Active Incidents */}
      {activeIncidents.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-red-700 mb-4">Active Incidents</h2>
          <div className="space-y-4">
            {activeIncidents.map((incident) => (
              <div key={incident.id} className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  {getStatusIcon(incident.status)}
                  <div className="flex-1">
                    <h3 className="font-medium text-[#111111]">{incident.title}</h3>
                    <p className="text-sm text-[#6B7280]">{incident.description}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded border ${getSeverityColor(incident.severity)}`}>
                    {incident.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incident History */}
      <div>
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Incident History</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          {resolvedIncidents.length === 0 ? (
            <div className="p-6 text-center text-[#6B7280]">No incidents in the selected period</div>
          ) : (
            <div className="divide-y divide-[#E6E6EC]">
              {resolvedIncidents.map((incident) => (
                <div key={incident.id}>
                  <button
                    onClick={() => setExpandedIncident(expandedIncident === incident.id ? null : incident.id)}
                    className="w-full px-4 py-4 flex items-center gap-3 hover:bg-[#FAFAFA]"
                  >
                    {getStatusIcon(incident.status)}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#6B7280]">{incident.id}</span>
                        <span className="font-medium text-[#111111]">{incident.title}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[#6B7280] mt-1">
                        <span>{new Date(incident.startedAt).toLocaleDateString()}</span>
                        <span>Duration: {incident.durationMinutes ?? 0}m</span>
                        <span>Services: {incident.affectedServices.join(", ")}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded border ${getSeverityColor(incident.severity)}`}>
                      {incident.severity}
                    </span>
                    {expandedIncident === incident.id ? (
                      <ChevronDown className="w-4 h-4 text-[#6B7280]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                    )}
                  </button>

                  {expandedIncident === incident.id && (
                    <div className="px-4 pb-4 bg-[#FAFAFA]">
                      <p className="text-sm text-[#6B7280] mb-4">{incident.description}</p>

                      {/* Timeline */}
                      <h4 className="text-sm font-medium text-[#111111] mb-2">Timeline</h4>
                      <div className="space-y-2 mb-4">
                        {incident.timeline.map((event, i) => (
                          <div key={i} className="flex items-start gap-3 text-sm">
                            <span className="font-mono text-xs text-[#6B7280] w-12">{event.time}</span>
                            <span className="text-[#111111]">{event.event}</span>
                            {event.actor && (
                              <span className="text-xs text-[#6B7280]">({event.actor})</span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Correlated Traces */}
                      {incident.correlatedTraces.length > 0 && (
                        <>
                          <h4 className="text-sm font-medium text-[#111111] mb-2">Correlated Traces</h4>
                          <div className="flex flex-wrap gap-2">
                            {incident.correlatedTraces.map((traceId) => (
                              <a
                                key={traceId}
                                href={`/admin/queries/${traceId}/trace`}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-[#E6E6EC] rounded text-blue-600 hover:bg-blue-50"
                              >
                                {traceId}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export default IncidentsPage;
