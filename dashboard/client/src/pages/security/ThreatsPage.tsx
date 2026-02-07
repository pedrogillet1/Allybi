/**
 * Threats Page - Security Subsection
 * Shows threat signals, brute force patterns, unusual geo login
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
import { AlertTriangle, Shield, Globe, Lock, Activity, MapPin } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useThreats } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e'];

export function ThreatsPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data, isLoading } = useThreats({ range, env });

  // Extract data from API response with defaults
  const threatStats = data?.stats ?? {
    total: 0,
    blocked: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  const threatsByType = data?.byType ?? [];
  const threatsByCountry = data?.byCountry ?? [];
  const recentThreats = data?.threats ?? [];
  const dataAvailable = data?.available ?? true;
  const dataMessage = data?.message;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-700";
      case "high":
        return "bg-orange-100 text-orange-700";
      case "medium":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-blue-100 text-blue-700";
    }
  };

  const getThreatTypeIcon = (type: string) => {
    switch (type) {
      case "brute_force":
        return <Lock className="w-4 h-4" />;
      case "unusual_geo":
        return <Globe className="w-4 h-4" />;
      case "high_volume":
        return <Activity className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Threat Detection</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Monitor security threats, attack patterns, and suspicious activity
        </p>
      </div>

      {/* Data availability notice */}
      {!dataAvailable && dataMessage && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">{dataMessage}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
          <div className="text-sm text-[#6B7280] mb-1">Total Threats</div>
          <div className="text-2xl font-semibold text-[#111111]">{threatStats.total}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm text-green-700 mb-1">Blocked</div>
          <div className="text-2xl font-semibold text-green-700">{threatStats.blocked}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm text-red-700 mb-1">Critical</div>
          <div className="text-2xl font-semibold text-red-700">{threatStats.critical}</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="text-sm text-orange-700 mb-1">High</div>
          <div className="text-2xl font-semibold text-orange-700">{threatStats.high}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-sm text-amber-700 mb-1">Medium</div>
          <div className="text-2xl font-semibold text-amber-700">{threatStats.medium}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm text-blue-700 mb-1">Low</div>
          <div className="text-2xl font-semibold text-blue-700">{threatStats.low}</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Threats by Type */}
        <ChartContainer
          title="Threats by Type"
          loading={isLoading}
          empty={threatsByType.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={threatsByType}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
                nameKey="type"
                label={({ type, percentage }) => `${type} (${percentage}%)`}
              >
                {threatsByType.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Threats by Country */}
        <ChartContainer
          title="Threats by Origin Country"
          loading={isLoading}
          empty={threatsByCountry.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={threatsByCountry} layout="vertical" margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis type="number" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
              <YAxis type="category" dataKey="country" stroke={chartColors.grid} tick={chartConfig.axis.tick} width={80} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Threats" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Recent Threats Table */}
      <div>
        <h2 className="text-lg font-semibold text-[#111111] mb-4">Recent Threats</h2>
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Type</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Severity</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Description</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Origin</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">IP</th>
                <th className="text-center px-4 py-3 font-medium text-[#6B7280]">Blocked</th>
                <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentThreats.map((threat) => (
                <tr key={threat.id} className={`border-b border-[#E6E6EC] ${threat.severity === "critical" ? "bg-red-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[#6B7280]">{getThreatTypeIcon(threat.type)}</span>
                      <span className="text-[#111111] capitalize">{threat.type.replace("_", " ")}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded ${getSeverityColor(threat.severity)}`}>
                      {threat.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#6B7280] max-w-xs truncate">
                    {threat.description}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#6B7280]" />
                      <span className="text-[#111111]">{threat.country}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#6B7280]">
                    {threat.ip}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {threat.blocked ? (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">Yes</span>
                    ) : (
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#6B7280]">
                    {new Date(threat.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

export default ThreatsPage;
