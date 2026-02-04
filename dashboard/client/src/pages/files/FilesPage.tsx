/**
 * Files Page - Koda Admin Dashboard
 * Document management with upload health, filters, and detail drawer
 */

import { useState } from "react";
import { Search, X, FileText, AlertTriangle, CheckCircle, Clock, ChevronRight } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useFiles, useFileDetail } from "@/hooks/useAdminApi";
import type { TimeRange, Environment, FileRecord } from "@/types/admin";
import { cn } from "@/lib/utils";

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
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
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
      <div className="space-y-2">
        <div className="h-5 w-48 bg-[#E6E6EC] rounded" />
        <div className="h-4 w-32 bg-[#E6E6EC] rounded" />
      </div>
      <div className="space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-8 bg-[#E6E6EC] rounded" />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
    ready: { bg: "bg-[#f0fdf4]", text: "text-[#15803d]", icon: CheckCircle },
    completed: { bg: "bg-[#f0fdf4]", text: "text-[#15803d]", icon: CheckCircle },
    processing: { bg: "bg-[#fefce8]", text: "text-[#a16207]", icon: Clock },
    enriching: { bg: "bg-[#fefce8]", text: "text-[#a16207]", icon: Clock },
    failed: { bg: "bg-[#fef2f2]", text: "text-[#B91C1C]", icon: AlertTriangle },
    pending: { bg: "bg-[#F5F5F5]", text: "text-[#6B7280]", icon: Clock },
    uploaded: { bg: "bg-[#F5F5F5]", text: "text-[#6B7280]", icon: Clock },
  };

  const { bg, text, icon: Icon } = config[status] || config.pending;

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs", bg, text)}>
      <Icon className="w-3 h-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ============================================================================
// File Detail Drawer
// ============================================================================

interface FileDetailDrawerProps {
  fileId: string | null;
  onClose: () => void;
}

function FileDetailDrawer({ fileId, onClose }: FileDetailDrawerProps) {
  const { data, isLoading, error } = useFileDetail(fileId);

  if (!fileId) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[520px] bg-white border-l border-[#E6E6EC] z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#E6E6EC] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#111111]">Document Details</h2>
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
              {/* Stats Summary */}
              <div className="space-y-4 mb-8">
                <h4 className="text-sm font-semibold text-[#111111]">Processing Statistics</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[#6B7280]">Total Events</span>
                    <p className="text-[#111111] mt-1">{data.stats.totalEvents}</p>
                  </div>
                  <div>
                    <span className="text-[#6B7280]">Success Count</span>
                    <p className="text-[#15803d] mt-1">{data.stats.successCount}</p>
                  </div>
                  <div>
                    <span className="text-[#6B7280]">Fail Count</span>
                    <p className="text-[#B91C1C] mt-1">{data.stats.failCount}</p>
                  </div>
                  <div>
                    <span className="text-[#6B7280]">Avg Duration</span>
                    <p className="text-[#111111] mt-1">{data.stats.avgDurationMs}ms</p>
                  </div>
                  <div>
                    <span className="text-[#6B7280]">Total Chunks</span>
                    <p className="text-[#111111] mt-1">{data.stats.totalChunks}</p>
                  </div>
                </div>
              </div>

              {/* Processing Events */}
              {data.events.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-[#111111]">Processing Events</h4>
                  <div className="space-y-2">
                    {data.events.map((event, i) => (
                      <div key={i} className="p-3 bg-[#FAFAFA] rounded-lg">
                        <div className="flex items-center justify-between">
                          <StatusBadge status={event.status} />
                          <span className="text-xs text-[#6B7280]">{formatDate(event.at)}</span>
                        </div>
                        {event.errorCode && (
                          <p className="text-xs text-[#B91C1C] mt-1">Error: {event.errorCode}</p>
                        )}
                        {event.durationMs && (
                          <p className="text-xs text-[#6B7280] mt-1">Duration: {event.durationMs}ms</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.events.length === 0 && (
                <p className="text-sm text-[#6B7280]">No processing events recorded</p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Files Page
// ============================================================================

const statusOptions = [
  { value: "all", label: "All Status" },
  { value: "uploaded", label: "Uploaded" },
  { value: "enriching", label: "Enriching" },
  { value: "ready", label: "Ready" },
  { value: "failed", label: "Failed" },
];

const typeOptions = [
  { value: "all", label: "All Types" },
  { value: "application/pdf", label: "PDF" },
  { value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "DOCX" },
  { value: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PPTX" },
  { value: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "XLSX" },
];

export function FilesPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [env, setEnv] = useState<Environment>("prod");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useFiles({
    range,
    env,
    status: statusFilter === "all" ? undefined : statusFilter as "uploaded" | "enriching" | "ready" | "failed" | undefined,
    mimeType: typeFilter === "all" ? undefined : typeFilter,
  });

  // Filter files client-side by search term
  const filteredFiles = data?.files.filter(f =>
    !search || (f.filename?.toLowerCase().includes(search.toLowerCase()) ?? false)
  ) ?? [];

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Files</h1>
        <p className="text-sm text-[#6B7280] mt-1">Document uploads and processing status</p>
      </div>

      {/* Summary Stats */}
      {!isLoading && data && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-[#E6E6EC] rounded-lg p-5">
            <p className="text-sm text-[#6B7280]">Total Files</p>
            <p className="text-2xl font-semibold text-[#111111] mt-1">{(data.counts?.total ?? data.pagination.total).toLocaleString()}</p>
          </div>
          <div className="bg-white border border-[#E6E6EC] rounded-lg p-5">
            <p className="text-sm text-[#6B7280]">Ready</p>
            <p className="text-2xl font-semibold text-[#15803d] mt-1">
              {(data.counts?.ready ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white border border-[#E6E6EC] rounded-lg p-5">
            <p className="text-sm text-[#6B7280]">Processing</p>
            <p className="text-2xl font-semibold text-[#a16207] mt-1">
              {(data.counts?.processing ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white border border-[#E6E6EC] rounded-lg p-5">
            <p className="text-sm text-[#6B7280]">Failed</p>
            <p className="text-2xl font-semibold text-[#B91C1C] mt-1">
              {(data.counts?.failed ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
          <input
            type="text"
            placeholder="Search by filename..."
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

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-[#E6E6EC] rounded-md focus:outline-none focus:ring-1 focus:ring-[#111111]"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-[#E6E6EC] rounded-md focus:outline-none focus:ring-1 focus:ring-[#111111]"
        >
          {typeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center py-16">
          <AlertTriangle className="w-8 h-8 text-[#B91C1C] mb-2" />
          <p className="text-sm text-[#6B7280] mb-4">{error.message}</p>
          <button onClick={() => refetch()} className="px-4 py-2 bg-[#111111] text-white text-sm font-medium rounded-md hover:bg-[#333333]">
            Try Again
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && <TableSkeleton />}

      {/* Data State */}
      {!isLoading && !error && data && (
        <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
          {filteredFiles.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-8 h-8 text-[#E6E6EC] mx-auto mb-2" />
              <p className="text-sm text-[#6B7280]">{search ? "No files match your search" : "No files yet"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Document ID</th>
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Type</th>
                    <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Size</th>
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Extraction</th>
                    <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Uploaded</th>
                    <th className="text-center px-4 py-3 font-medium text-[#6B7280]"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((doc: FileRecord) => (
                    <tr
                      key={doc.documentId}
                      className="border-b border-[#E6E6EC] hover:bg-[#FAFAFA] cursor-pointer"
                      onClick={() => setSelectedFileId(doc.documentId)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[#6B7280] flex-shrink-0" />
                          <span className="text-[#111111] font-mono text-xs">{doc.documentId.slice(0, 12)}...</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={doc.statusFail ? "failed" : doc.statusOk ? "ready" : "pending"} />
                      </td>
                      <td className="px-4 py-3 text-[#6B7280]">{doc.mimeType.split("/").pop()?.toUpperCase() || doc.mimeType}</td>
                      <td className="px-4 py-3 text-right text-[#111111]">{formatBytes(doc.sizeBytes)}</td>
                      <td className="px-4 py-3 text-[#6B7280]">{doc.extractionMethod || "-"}</td>
                      <td className="px-4 py-3 text-[#6B7280]">{formatDate(doc.uploadedAt)}</td>
                      <td className="px-4 py-3 text-center"><ChevronRight className="w-4 h-4 text-[#6B7280]" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Info */}
          {data.pagination.total > 0 && (
            <div className="px-4 py-3 border-t border-[#E6E6EC] text-sm text-[#6B7280]">
              Showing {filteredFiles.length} of {data.pagination.total} files
            </div>
          )}
        </div>
      )}

      {/* File Detail Drawer */}
      <FileDetailDrawer fileId={selectedFileId} onClose={() => setSelectedFileId(null)} />
    </AdminLayout>
  );
}

export default FilesPage;
