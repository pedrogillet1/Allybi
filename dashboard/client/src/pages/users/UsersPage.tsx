/**
 * Users Page - Koda Admin Dashboard
 * User management with search, table, and detail drawer
 */

import { useState, useMemo } from "react";
import { Search, X, User as UserIcon, Calendar, HardDrive, MessageSquare, ChevronRight, AlertTriangle, Users } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useUsers, useUserDetail } from "@/hooks/useAdminApi";
import type { TimeRange, Environment } from "@/types/admin";

// ============================================================================
// Format Helpers
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
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

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================================
// Skeleton Components
// ============================================================================

function TableSkeleton() {
  return (
    <div className="bg-white border border-[#E6E6EC] rounded-lg animate-pulse">
      <div className="p-4 space-y-3">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-12 bg-[#E6E6EC] rounded" />
        ))}
      </div>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 bg-[#E6E6EC] rounded-full" />
        <div className="space-y-2">
          <div className="h-5 w-32 bg-[#E6E6EC] rounded" />
          <div className="h-4 w-48 bg-[#E6E6EC] rounded" />
        </div>
      </div>
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-[#E6E6EC] rounded" />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// User Detail Drawer
// ============================================================================

interface UserDetailDrawerProps {
  userId: string | null;
  onClose: () => void;
}

function UserDetailDrawer({ userId, onClose }: UserDetailDrawerProps) {
  const { data, isLoading, error } = useUserDetail(userId);

  if (!userId) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white border-l border-[#E6E6EC] z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#E6E6EC] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#111111]">User Details</h2>
          <button onClick={onClose} className="p-1 hover:bg-[#F5F5F5] rounded">
            <X className="w-5 h-5 text-[#6B7280]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading && <DrawerSkeleton />}

          {error && (
            <div className="flex flex-col items-center justify-center py-8">
              <AlertTriangle className="w-8 h-8 text-[#B91C1C] mb-2" />
              <p className="text-sm text-[#6B7280]">{error.message}</p>
            </div>
          )}

          {data && (
            <>
              {/* User Profile */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-[#F5F5F5] rounded-full flex items-center justify-center">
                  <UserIcon className="w-8 h-8 text-[#6B7280]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#111111] font-mono text-sm">
                    {data.user.userId}
                  </h3>
                  {data.user.email && <p className="text-sm text-[#6B7280]">{data.user.email}</p>}
                </div>
              </div>

              {/* User Stats */}
              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-[#6B7280]" />
                  <span className="text-[#6B7280]">First Seen:</span>
                  <span className="text-[#111111]">{formatDate(data.user.firstSeenAt)}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-[#6B7280]" />
                  <span className="text-[#6B7280]">Last Seen:</span>
                  <span className="text-[#111111]">{formatDate(data.user.lastSeenAt)}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <MessageSquare className="w-4 h-4 text-[#6B7280]" />
                  <span className="text-[#6B7280]">Messages:</span>
                  <span className="text-[#111111]">{data.user.messages.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <HardDrive className="w-4 h-4 text-[#6B7280]" />
                  <span className="text-[#6B7280]">Uploads:</span>
                  <span className="text-[#111111]">{data.user.uploads.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Search className="w-4 h-4 text-[#6B7280]" />
                  <span className="text-[#6B7280]">LLM Calls:</span>
                  <span className="text-[#111111]">{data.user.llmCalls.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-4 h-4 flex items-center justify-center text-[#6B7280] text-xs font-bold">T</span>
                  <span className="text-[#6B7280]">Tokens Total:</span>
                  <span className="text-[#111111]">{data.user.tokensTotal.toLocaleString()}</span>
                </div>
              </div>

              {/* Quality Metrics */}
              <div className="mb-8">
                <h4 className="text-sm font-semibold text-[#111111] mb-3">Quality Metrics</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#FAFAFA] rounded-lg">
                    <div className="text-xs text-[#6B7280]">LLM Error Rate</div>
                    <div className={`text-lg font-semibold ${(data.user.llmErrorRate ?? 0) > 5 ? "text-[#B91C1C]" : "text-[#111111]"}`}>
                      {(data.user.llmErrorRate ?? 0).toFixed(2)}%
                    </div>
                  </div>
                  <div className="p-3 bg-[#FAFAFA] rounded-lg">
                    <div className="text-xs text-[#6B7280]">Weak Evidence Rate</div>
                    <div className={`text-lg font-semibold ${(data.user.weakEvidenceRate ?? 0) > 20 ? "text-[#a16207]" : "text-[#111111]"}`}>
                      {(data.user.weakEvidenceRate ?? 0).toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Intents */}
              {data.user.topIntents && data.user.topIntents.length > 0 && (
                <div className="mb-8">
                  <h4 className="text-sm font-semibold text-[#111111] mb-3">Top Intents</h4>
                  <div className="space-y-2">
                    {data.user.topIntents.map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-[#FAFAFA] rounded">
                        <span className="text-sm text-[#111111]">{item.intent}</span>
                        <span className="text-xs text-[#6B7280]">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Domains */}
              {data.user.topDomains && data.user.topDomains.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-[#111111] mb-3">Top Domains</h4>
                  <div className="space-y-2">
                    {data.user.topDomains.map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-[#FAFAFA] rounded">
                        <span className="text-sm text-[#111111]">{item.domain}</span>
                        <span className="text-xs text-[#6B7280]">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Users Page
// ============================================================================

export function UsersPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useUsers({ range, env, search: search || undefined });

  // Calculate active users (users currently live - active in the last 15 minutes)
  const activeUsersCount = useMemo(() => {
    if (!data?.users) return 0;
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    return data.users.filter(u => {
      const lastSeen = new Date(u.lastSeenAt);
      return lastSeen >= fifteenMinutesAgo;
    }).length;
  }, [data?.users]);

  const totalUsers = data?.pagination?.total ?? 0;

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header with KPI Cards */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#111111]">Users</h1>
          <p className="text-sm text-[#6B7280] mt-1">Manage and view user accounts</p>
        </div>

        {/* KPI Cards */}
        <div className="flex gap-4">
          {/* Active Users Card */}
          <div className="bg-white border border-[#E6E6EC] rounded-lg p-4 min-w-[160px]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-[#6B7280]">Active Users</p>
                <p className="text-2xl font-semibold text-[#111111] mt-1">
                  {isLoading ? "-" : activeUsersCount.toLocaleString()}
                </p>
              </div>
              <div className="p-2 bg-[#F5F5F5] rounded-lg">
                <Users className="w-5 h-5 text-[#6B7280]" />
              </div>
            </div>
          </div>

          {/* Total Users Card */}
          <div className="bg-white border border-[#E6E6EC] rounded-lg p-4 min-w-[160px]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-[#6B7280]">Total Users</p>
                <p className="text-2xl font-semibold text-[#111111] mt-1">
                  {isLoading ? "-" : totalUsers.toLocaleString()}
                </p>
              </div>
              <div className="p-2 bg-[#F5F5F5] rounded-lg">
                <UserIcon className="w-5 h-5 text-[#6B7280]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
          <input
            type="text"
            placeholder="Search by email, name, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E6E6EC] rounded-md focus:outline-none focus:ring-1 focus:ring-[#111111] placeholder:text-[#6B7280]"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-[#6B7280]" />
            </button>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center py-16">
          <AlertTriangle className="w-8 h-8 text-[#B91C1C] mb-2" />
          <p className="text-sm text-[#6B7280] mb-4">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-[#111111] text-white text-sm font-medium rounded-md hover:bg-[#333333]"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && <TableSkeleton />}

      {/* Data State */}
      {!isLoading && !error && data && (
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          {data.users.length === 0 ? (
            <div className="p-8 text-center">
              <UserIcon className="w-8 h-8 text-[#E6E6EC] mx-auto mb-2" />
              <p className="text-sm text-[#6B7280]">{search ? "No users match your search" : "No users yet"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">User ID</th>
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">First Seen</th>
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Last Seen</th>
                    <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Messages</th>
                    <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Uploads</th>
                    <th className="text-right px-4 py-3 font-medium text-[#6B7280]">LLM Calls</th>
                    <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Error Rate</th>
                    <th className="text-center px-4 py-3 font-medium text-[#6B7280]"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr
                      key={user.userId}
                      className="border-b border-[#E6E6EC] hover:bg-[#FAFAFA] cursor-pointer"
                      onClick={() => setSelectedUserId(user.userId)}
                    >
                      <td className="px-4 py-3">
                        <div className="text-[#111111] font-medium font-mono text-xs">
                          {user.userId.slice(0, 12)}...
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#6B7280]">{formatDate(user.firstSeenAt)}</td>
                      <td className="px-4 py-3 text-[#6B7280]">{formatDate(user.lastSeenAt)}</td>
                      <td className="px-4 py-3 text-right text-[#111111]">{user.messages.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-[#111111]">{user.uploads.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-[#111111]">{user.llmCalls.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={(user.llmErrorRate ?? 0) > 5 ? "text-[#B91C1C]" : "text-[#111111]"}>
                          {(user.llmErrorRate ?? 0).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ChevronRight className="w-4 h-4 text-[#6B7280]" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Info */}
          {data.pagination.total > 0 && (
            <div className="px-4 py-3 border-t border-[#E6E6EC] text-sm text-[#6B7280]">
              Showing {data.users.length} of {data.pagination.total} users
            </div>
          )}
        </div>
      )}

      {/* User Detail Drawer */}
      <UserDetailDrawer userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
    </AdminLayout>
  );
}

export default UsersPage;
