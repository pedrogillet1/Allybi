/**
 * SocialPresencePage
 * Shows social media follower counts, trends, and historical data
 */

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Instagram,
  Youtube,
  Linkedin,
  Twitter,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
} from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useSocialMetrics, useSocialStatus } from "@/hooks/useAdminApi";
import { adminApi } from "@/api/admin";
import { chartColors } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

// TikTok icon component
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
    </svg>
  );
}

// Facebook icon component
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

// Platform icons and colors
const PLATFORM_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string }
> = {
  instagram: { icon: Instagram, color: "#E4405F", label: "Instagram" },
  facebook: { icon: FacebookIcon, color: "#1877F2", label: "Facebook" },
  youtube: { icon: Youtube, color: "#FF0000", label: "YouTube" },
  linkedin: { icon: Linkedin, color: "#0A66C2", label: "LinkedIn" },
  twitter: { icon: Twitter, color: "#1DA1F2", label: "X (Twitter)" },
  tiktok: { icon: TikTokIcon, color: "#000000", label: "TikTok" },
};

function TrendIndicator({ trend }: { trend: number }) {
  if (trend > 0) {
    return (
      <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
        <TrendingUp className="w-4 h-4" />
        +{trend.toFixed(1)}%
      </span>
    );
  }
  if (trend < 0) {
    return (
      <span className="flex items-center gap-1 text-red-600 text-sm font-medium">
        <TrendingDown className="w-4 h-4" />
        {trend.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-gray-400 text-sm">
      <Minus className="w-4 h-4" />
      0%
    </span>
  );
}

function formatFollowers(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

export function SocialPresencePage() {
  const [range, setRange] = useState<TimeRange>("30d");
  const [env, setEnv] = useState<Environment>("prod");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = useSocialMetrics();
  const { data: status } = useSocialStatus();

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await adminApi.refreshSocialMetrics();
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Format last refresh time
  const formatLastRefresh = (isoString: string | null) => {
    if (!isoString) return "Never";
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  // Transform history data for chart (group by date, one line per platform)
  const chartData = data?.history
    ? Object.values(
        data.history.reduce<
          Record<string, { date: string; [platform: string]: number | string }>
        >((acc, point) => {
          if (!acc[point.date]) {
            acc[point.date] = { date: point.date };
          }
          acc[point.date][point.platform] = point.followers;
          return acc;
        }, {})
      ).sort((a, b) => a.date.localeCompare(b.date))
    : [];

  // Get unique platforms from history using Array.from instead of spread
  const platforms = data?.history
    ? Array.from(new Set(data.history.map((h) => h.platform)))
    : [];

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#111111]">Social Presence</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Track follower counts across social platforms
          </p>
          {status?.lastRefresh && (
            <p className="text-xs text-[#9CA3AF] mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last refresh: {formatLastRefresh(status.lastRefresh)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !isRefreshing && (
            <RefreshCw className="w-4 h-4 text-[#6B7280] animate-spin" />
          )}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing || isFetching}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-[#E6E6EC] rounded-lg hover:bg-[#FAFAFA] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Platform Configuration Status */}
      {status && (
        <div className="bg-white border border-[#E6E6EC] rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-[#111111] flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Platform Configuration
            </h2>
            <span className="text-xs text-[#6B7280]">
              {status.configuredPlatforms.length} of {status.allPlatforms.length} configured
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            {status.allPlatforms.map((platform) => {
              const isConfigured = status.configuredPlatforms.includes(platform);
              const config = PLATFORM_CONFIG[platform] || {
                icon: RefreshCw,
                color: "#666",
                label: platform,
              };
              const Icon = config.icon;

              return (
                <div
                  key={platform}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                    isConfigured
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-gray-50 text-gray-400 border border-gray-200"
                  }`}
                  title={isConfigured ? "Configured" : "Configure in .env"}
                >
                  <Icon className="w-4 h-4" />
                  <span>{config.label}</span>
                  {isConfigured ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                </div>
              );
            })}
          </div>
          {status.configuredPlatforms.length === 0 && (
            <p className="text-xs text-[#9CA3AF] mt-3">
              Configure API credentials in your .env file to enable social tracking:
              INSTAGRAM_ACCESS_TOKEN, YOUTUBE_API_KEY, etc.
            </p>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Failed to load social metrics: {error.message}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Current Followers Grid */}
          {data.current.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {data.current.map((presence) => {
                const config = PLATFORM_CONFIG[presence.platform] || {
                  icon: RefreshCw,
                  color: chartColors.primary,
                  label: presence.platform,
                };
                const Icon = config.icon;

                return (
                  <div key={presence.platform} className="bg-white border border-[#E6E6EC] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: `${config.color}15` }}
                      >
                        <Icon className={`w-6 h-6 text-[${config.color}]`} />
                      </div>
                      <TrendIndicator trend={presence.trend} />
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold text-[#111111]">
                        {formatFollowers(presence.followers)}
                      </div>
                      <div className="text-sm text-[#6B7280]">
                        {config.label} followers
                      </div>
                      <div className="text-xs text-[#9CA3AF]">
                        Updated {new Date(presence.lastUpdated).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white border border-[#E6E6EC] rounded-lg py-12 text-center">
              <RefreshCw className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-[#111111] mb-2">
                No social data yet
              </h3>
              <p className="text-[#6B7280] max-w-md mx-auto">
                Social media follower counts will appear here once the scheduled
                job starts collecting data. Configure API credentials in your
                environment settings.
              </p>
            </div>
          )}

          {/* Historical Chart */}
          {chartData.length > 0 && (
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-6">
              <h2 className="text-lg font-semibold text-[#111111] mb-4">Follower Growth (Last 30 Days)</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6E6EC" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      tickFormatter={(value) => formatFollowers(value)}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatFollowers(value),
                        PLATFORM_CONFIG[name]?.label || name,
                      ]}
                      labelFormatter={(label) =>
                        new Date(label).toLocaleDateString()
                      }
                    />
                    <Legend
                      formatter={(value) =>
                        PLATFORM_CONFIG[value]?.label || value
                      }
                    />
                    {platforms.map((platform) => (
                      <Line
                        key={platform}
                        type="monotone"
                        dataKey={platform}
                        stroke={PLATFORM_CONFIG[platform]?.color || "#666"}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Platform Details Table */}
          {data.current.length > 0 && (
            <div className="bg-white border border-[#E6E6EC] rounded-lg">
              <div className="px-6 py-4 border-b border-[#E6E6EC]">
                <h2 className="text-lg font-semibold text-[#111111]">Platform Details</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                      <th className="text-left py-3 px-4 font-medium text-[#6B7280]">
                        Platform
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-[#6B7280]">
                        Followers
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-[#6B7280]">
                        7-Day Trend
                      </th>
                      <th className="text-right py-3 px-4 font-medium text-[#6B7280]">
                        Last Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.current.map((presence) => {
                      const config = PLATFORM_CONFIG[presence.platform] || {
                        icon: RefreshCw,
                        color: chartColors.primary,
                        label: presence.platform,
                      };
                      const Icon = config.icon;

                      return (
                        <tr
                          key={presence.platform}
                          className="border-b border-[#E6E6EC] last:border-b-0 hover:bg-[#FAFAFA]"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <Icon className="w-5 h-5 text-[#6B7280]" />
                              <span className="font-medium text-[#111111]">{config.label}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-[#111111]">
                            {presence.followers.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <TrendIndicator trend={presence.trend} />
                          </td>
                          <td className="py-3 px-4 text-right text-[#6B7280]">
                            {new Date(presence.lastUpdated).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

export default SocialPresencePage;
