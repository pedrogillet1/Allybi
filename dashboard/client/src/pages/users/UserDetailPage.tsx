/**
 * User Detail Page - Users Subsection
 * Shows full user profile with sessions, queries, documents, domains, intents
 */

import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  AreaChart,
  Area,
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
import {
  User,
  Calendar,
  MessageSquare,
  FileText,
  Activity,
  Clock,
  AlertTriangle,
  ChevronLeft,
  Mail,
  HardDrive,
  Target,
  Zap,
} from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useUserDetail, useQueries } from "@/hooks/useAdminApi";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import type { TimeRange, Environment } from "@/types/admin";

const COLORS = ['#181818', '#525252', '#737373', '#a3a3a3', '#d4d4d4'];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function UserDetailPage() {
  const params = useParams();
  const userId = params.userId || null;
  const [range, setRange] = useState<TimeRange>("30d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data: userData, isLoading: userLoading, error: userError } = useUserDetail(userId);
  const { data: queriesData, isLoading: queriesLoading } = useQueries({ range, env, userId: userId || undefined, limit: 20 });

  const isLoading = userLoading;
  const user = userData?.user;

  // Use real activity data from API
  const activityData = user?.activityByDay ?? [];

  // Domain distribution
  const domainData = user?.topDomains?.map(d => ({
    name: d.domain,
    value: d.count,
  })) ?? [];

  // Intent distribution
  const intentData = user?.topIntents?.map(i => ({
    name: i.intent,
    value: i.count,
  })) ?? [];

  if (!userId) {
    return (
      <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
        <div className="flex flex-col items-center justify-center py-16">
          <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
          <p className="text-[#6B7280]">No user ID provided</p>
          <Link href="/admin/users" className="mt-4 text-sm text-blue-600 hover:underline">
            ← Back to Users
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Back Link */}
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#111111] mb-4">
        <ChevronLeft className="w-4 h-4" />
        Back to Users
      </Link>

      {/* Error State */}
      {userError && (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-[#E6E6EC] rounded-lg">
          <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
          <p className="text-sm text-[#6B7280]">{userError.message}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-[#E6E6EC] rounded-lg" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-[#E6E6EC] rounded-lg" />
            ))}
          </div>
        </div>
      )}

      {/* User Profile */}
      {!isLoading && !userError && user && (
        <>
          {/* Profile Header */}
          <div className="bg-white border border-[#E6E6EC] rounded-lg p-6 mb-6">
            <div className="flex items-start gap-6">
              <div className="w-20 h-20 bg-[#F5F5F5] rounded-full flex items-center justify-center">
                <User className="w-10 h-10 text-[#6B7280]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-semibold text-[#111111]">
                    {user.firstName && user.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : user.email || "Unknown User"}
                  </h1>
                  <span className={`px-2 py-1 text-xs rounded ${
                    user.subscriptionTier === "premium" ? "bg-amber-100 text-amber-800" :
                    user.subscriptionTier === "pro" ? "bg-blue-100 text-blue-800" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {user.subscriptionTier || "free"}
                  </span>
                  {user.isActive && (
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">Active</span>
                  )}
                  {user.isChurned && (
                    <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">Churned</span>
                  )}
                </div>
                <div className="flex items-center gap-6 text-sm text-[#6B7280]">
                  <div className="flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    {user.email}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Joined {formatDate(user.firstSeenAt)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Last seen {formatDate(user.lastSeenAt)}
                  </div>
                </div>
                <p className="mt-2 font-mono text-xs text-[#6B7280]">ID: {user.userId}</p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#6B7280] mb-1">
                <MessageSquare className="w-4 h-4" />
                <span className="text-xs">Messages</span>
              </div>
              <div className="text-xl font-semibold text-[#111111]">{user.messages.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#6B7280] mb-1">
                <Activity className="w-4 h-4" />
                <span className="text-xs">Sessions</span>
              </div>
              <div className="text-xl font-semibold text-[#111111]">{user.sessionsCount ?? user.totalSessions}</div>
            </div>
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#6B7280] mb-1">
                <FileText className="w-4 h-4" />
                <span className="text-xs">Uploads</span>
              </div>
              <div className="text-xl font-semibold text-[#111111]">{user.uploads}</div>
            </div>
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#6B7280] mb-1">
                <HardDrive className="w-4 h-4" />
                <span className="text-xs">Storage</span>
              </div>
              <div className="text-xl font-semibold text-[#111111]">{formatBytes(user.storageUsedBytes)}</div>
            </div>
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#6B7280] mb-1">
                <Zap className="w-4 h-4" />
                <span className="text-xs">LLM Calls</span>
              </div>
              <div className="text-xl font-semibold text-[#111111]">{user.llmCalls.toLocaleString()}</div>
            </div>
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#6B7280] mb-1">
                <Target className="w-4 h-4" />
                <span className="text-xs">Tokens</span>
              </div>
              <div className="text-xl font-semibold text-[#111111]">{user.tokensTotal.toLocaleString()}</div>
            </div>
          </div>

          {/* Quality Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <h3 className="text-sm font-medium text-[#6B7280] mb-3">Quality Metrics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-[#6B7280]">LLM Error Rate</div>
                  <div className={`text-lg font-semibold ${user.llmErrorRate > 5 ? "text-red-600" : "text-[#111111]"}`}>
                    {user.llmErrorRate.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#6B7280]">Weak Evidence Rate</div>
                  <div className={`text-lg font-semibold ${user.weakEvidenceRate > 20 ? "text-amber-600" : "text-[#111111]"}`}>
                    {user.weakEvidenceRate.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <h3 className="text-sm font-medium text-[#6B7280] mb-3">Engagement</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-[#6B7280]">Days Since Signup</div>
                  <div className="text-lg font-semibold text-[#111111]">{user.daysSinceSignup}</div>
                </div>
                <div>
                  <div className="text-xs text-[#6B7280]">Conversations</div>
                  <div className="text-lg font-semibold text-[#111111]">{user.conversationsCount ?? user.totalConversations}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Activity Chart */}
            <ChartContainer
              title="Activity (Last 30 Days)"
              loading={false}
              empty={activityData.length === 0}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData} margin={chartConfig.margin}>
                  <CartesianGrid {...chartConfig.grid} />
                  <XAxis dataKey="day" stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} />
                  <YAxis stroke={chartColors.grid} tick={chartConfig.axis.tick} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="queries" name="Queries" stroke={chartColors.primary} fill={chartColors.primary} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>

            {/* Domains Used */}
            <ChartContainer
              title="Domains Used"
              loading={false}
              empty={domainData.length === 0}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={domainData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name }) => name}
                  >
                    {domainData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>

            {/* Intents Used */}
            <ChartContainer
              title="Top Intents"
              loading={false}
              empty={intentData.length === 0}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={intentData.slice(0, 5)} layout="vertical" margin={chartConfig.margin}>
                  <CartesianGrid {...chartConfig.grid} />
                  <XAxis type="number" stroke={chartColors.grid} tick={chartConfig.axis.tick} />
                  <YAxis type="category" dataKey="name" stroke={chartColors.grid} tick={chartConfig.axis.tick} width={80} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Count" fill={chartColors.primary} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>

          {/* Recent Queries */}
          <div>
            <h2 className="text-lg font-semibold text-[#111111] mb-4">Recent Queries</h2>
            <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
              {queriesLoading && (
                <div className="p-6 animate-pulse space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-12 bg-[#E6E6EC] rounded" />
                  ))}
                </div>
              )}
              {!queriesLoading && (!queriesData?.queries || queriesData.queries.length === 0) && (
                <div className="p-6 text-center text-[#6B7280]">No queries found</div>
              )}
              {!queriesLoading && queriesData?.queries && queriesData.queries.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                      <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Domain</th>
                      <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Intent</th>
                      <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Operator</th>
                      <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Evidence</th>
                      <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queriesData.queries.slice(0, 10).map((query, idx) => (
                      <tr key={idx} className="border-b border-[#E6E6EC] hover:bg-[#FAFAFA]">
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                            {query.domain}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#6B7280]">{query.intent}</td>
                        <td className="px-4 py-3 text-[#6B7280]">{query.operator}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${
                            (query.evidenceStrength ?? 0) >= 0.5 ? "text-green-600" :
                            (query.evidenceStrength ?? 0) >= 0.35 ? "text-amber-600" :
                            "text-red-600"
                          }`}>
                            {((query.evidenceStrength ?? 0) * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#6B7280]">
                          {new Date(query.at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}

export default UserDetailPage;
