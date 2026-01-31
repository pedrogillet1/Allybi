/**
 * Users Page - Koda Admin Dashboard
 * User management with search, table, and detail drawer
 */

import { useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Search, X, User as UserIcon, Mail, Phone, Calendar, HardDrive, MessageSquare, ChevronRight, AlertTriangle } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useUsers, useUserDetail } from "@/hooks/useAdminApi";
import type { TimeRange, Environment, User } from "@/types/admin";

// ============================================================================
// Chart Configuration
// ============================================================================

const chartColors = {
  primary: "#111111",
  grid: "#E6E6EC",
};

const chartConfig = {
  margin: { top: 8, right: 8, left: 0, bottom: 0 },
  grid: { strokeDasharray: "3 3", stroke: chartColors.grid },
  axis: { tick: { fontSize: 11, fill: "#6B7280" } },
};

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

function ChartSkeleton() {
  return (
    <div className="bg-white border border-[#E6E6EC] rounded-lg p-5 animate-pulse">
      <div className="h-4 w-32 bg-[#E6E6EC] rounded mb-4" />
      <div className="h-48 bg-[#E6E6EC] rounded" />
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
                  <h3 className="text-lg font-semibold text-[#111111]">
                    {data.user.name || "Unnamed User"}
                  </h3>
                  <p className="text-sm text-[#6B7280]">{data.user.email}</p>
                </div>
              </div>

              {/* User Info */}
              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-[#6B7280]" />
                  <span className="text-[#6B7280]">Email:</span>
                  <span className="text-[#111111]">{data.user.email}</span>
                </div>
                {data.user.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-[#6B7280]" />
                    <span className="text-[#6B7280]">Phone:</span>
                    <span className="text-[#111111]">{data.user.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-4 h-4 flex items-center justify-center text-[#6B7280] text-xs font-bold">T</span>
                  <span className="text-[#6B7280]">Tier:</span>
                  <span className="px-2 py-0.5 bg-[#F5F5F5] rounded text-xs text-[#111111]">
                    {data.user.tier || "Free"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-[#6B7280]" />
                  <span className="text-[#6B7280]">Joined:</span>
                  <span className="text-[#111111]">{formatDate(data.user.createdAt)}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-[#6B7280]" />
                  <span className="text-[#6B7280]">Last Active:</span>
                  <span className="text-[#111111]">{formatDate(data.user.lastActiveAt)}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <HardDrive className="w-4 h-4 text-[#6B7280]" />
                  <span className="text-[#6B7280]">Storage:</span>
                  <span className="text-[#111111]">{formatBytes(data.user.storageUsedBytes)}</span>
                </div>
              </div>

              {/* Recent Conversations */}
              <div className="mb-8">
                <h4 className="text-sm font-semibold text-[#111111] mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Recent Conversations ({data.recentConversations.length})
                </h4>
                {data.recentConversations.length === 0 ? (
                  <p className="text-sm text-[#6B7280]">No conversations yet</p>
                ) : (
                  <div className="space-y-2">
                    {data.recentConversations.slice(0, 10).map((conv) => (
                      <div key={conv.id} className="p-3 bg-[#FAFAFA] rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-[#111111] truncate flex-1">
                            {conv.title || "Untitled"}
                          </span>
                          <span className="text-xs text-[#6B7280] ml-2">{conv.messagesCount} msgs</span>
                        </div>
                        <div className="text-xs text-[#6B7280] mt-1">
                          Last: {formatDateTime(conv.lastMessageAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Queries */}
              <div className="mb-8">
                <h4 className="text-sm font-semibold text-[#111111] mb-3 flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Recent Queries ({data.recentQueries.length})
                </h4>
                {data.recentQueries.length === 0 ? (
                  <p className="text-sm text-[#6B7280]">No queries yet</p>
                ) : (
                  <div className="space-y-2">
                    {data.recentQueries.slice(0, 10).map((query) => (
                      <div key={query.id} className="p-3 bg-[#FAFAFA] rounded-lg">
                        <div className="text-sm text-[#111111] truncate">{query.query}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-1.5 py-0.5 bg-white border border-[#E6E6EC] rounded text-xs text-[#6B7280]">
                            {query.intent}
                          </span>
                          <span className="text-xs text-[#6B7280]">{query.totalMs}ms</span>
                          {query.hasErrors && (
                            <span className="px-1.5 py-0.5 bg-[#fef2f2] text-[#B91C1C] rounded text-xs">Error</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Token Usage */}
              <div>
                <h4 className="text-sm font-semibold text-[#111111] mb-3">Token Usage Summary</h4>
                {data.tokenUsage.length === 0 ? (
                  <p className="text-sm text-[#6B7280]">No token usage data</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#E6E6EC]">
                          <th className="text-left py-2 font-medium text-[#6B7280]">Provider</th>
                          <th className="text-left py-2 font-medium text-[#6B7280]">Model</th>
                          <th className="text-right py-2 font-medium text-[#6B7280]">Tokens</th>
                          <th className="text-right py-2 font-medium text-[#6B7280]">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.tokenUsage.map((usage, i) => (
                          <tr key={i} className="border-b border-[#E6E6EC]">
                            <td className="py-2 text-[#111111]">{usage.provider}</td>
                            <td className="py-2 text-[#6B7280]">{usage.model}</td>
                            <td className="py-2 text-right text-[#111111]">
                              {(usage.inputTokens + usage.outputTokens).toLocaleString()}
                            </td>
                            <td className="py-2 text-right text-[#111111]">${usage.totalCostUsd.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
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

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Users</h1>
        <p className="text-sm text-[#6B7280] mt-1">Manage and view user accounts</p>
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
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Tier</th>
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Role</th>
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Created</th>
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Last Active</th>
                    <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Storage</th>
                    <th className="text-center px-4 py-3 font-medium text-[#6B7280]"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-[#E6E6EC] hover:bg-[#FAFAFA] cursor-pointer"
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <div className="text-[#111111] font-medium">{user.email}</div>
                          {user.name && <div className="text-xs text-[#6B7280]">{user.name}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-[#F5F5F5] rounded text-xs text-[#111111]">
                          {user.tier || "Free"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#6B7280]">{user.role}</td>
                      <td className="px-4 py-3 text-[#6B7280]">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3 text-[#6B7280]">{formatDate(user.lastActiveAt)}</td>
                      <td className="px-4 py-3 text-right text-[#111111]">{formatBytes(user.storageUsedBytes)}</td>
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
