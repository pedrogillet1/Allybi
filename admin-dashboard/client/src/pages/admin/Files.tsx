/**
 * Files Page
 * Swiss Brutalist Tech Design
 *
 * Goal: Understand the documents users rely on and where extraction/indexing fails
 * Shows file inventory with status and metrics
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, getStatusVariant, PageHeader, Section } from "@/components/shared";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useFiles } from "@/hooks/useTelemetry";

/** Extract short encrypted key from filenameEncrypted JSON */
function getEncryptedKey(filenameEncrypted: string | null): string {
  if (!filenameEncrypted) return "—";
  try {
    const parsed = JSON.parse(filenameEncrypted);
    // Return truncated ciphertext base64
    const ct = parsed.ctB64 ?? "";
    return ct.length > 20 ? ct.slice(0, 20) + "..." : ct;
  } catch {
    // Not JSON, return truncated raw string
    return filenameEncrypted.length > 24 ? filenameEncrypted.slice(0, 24) + "..." : filenameEncrypted;
  }
}

/** Convert MIME type to short format name */
function mimeToFormat(mimeType: string | null): string {
  if (!mimeType) return "—";
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "text/plain": "txt",
    "text/csv": "csv",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/json": "json",
    "text/html": "html",
    "text/markdown": "md",
  };
  return map[mimeType] ?? mimeType.split("/").pop()?.split(".").pop() ?? mimeType;
}

export default function Files() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [range] = useState("30d");

  const { data, isLoading } = useFiles(range, 100);
  const files: any[] = data?.items ?? [];

  const filteredFiles = files.filter((file) => {
    // Search by encrypted key or format
    const encKey = getEncryptedKey(file.filenameEncrypted);
    const format = mimeToFormat(file.mimeType);
    const matchesSearch =
      encKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
      format.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || (file.status ?? "").toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      key: "filename",
      header: "Encrypted Key",
      render: (item: any) => (
        <span className="font-mono text-sm">{getEncryptedKey(item.filenameEncrypted)}</span>
      ),
    },
    { key: "size", header: "Size", className: "font-mono" },
    {
      key: "format",
      header: "Format",
      render: (item: any) => (
        <span className="font-mono text-sm uppercase">{mimeToFormat(item.mimeType)}</span>
      ),
    },
    {
      key: "createdAt",
      header: "Uploaded",
      className: "font-mono text-sm text-muted-foreground",
      render: (item: any) => new Date(item.createdAt).toLocaleString(),
    },
    {
      key: "chunksCount",
      header: "Chunks",
      className: "font-mono text-right",
    },
    {
      key: "embeddingsGenerated",
      header: "Status",
      render: (item: any) => (
        <StatusBadge variant={item.embeddingsGenerated ? "success" : "warning"}>
          {String(item.embeddingsGenerated)}
        </StatusBadge>
      ),
    },
    { key: "userId", header: "User", className: "font-mono text-muted-foreground text-xs" },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Files"
        description="Document inventory and extraction status"
        actions={
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 text-sm border border-border bg-background"
            >
              <option value="all">All Status</option>
              <option value="uploaded">Uploaded</option>
              <option value="available">Available</option>
              <option value="enriching">Enriching</option>
              <option value="ready">Ready</option>
              <option value="failed">Failed</option>
            </select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            <Section>
              <DataTable
                columns={columns}
                data={filteredFiles}
                onRowClick={(file) => setLocation(`/admin/files/${file.id}`)}
                emptyMessage="No files found"
              />
            </Section>

            <div className="text-sm text-muted-foreground">
              Showing {filteredFiles.length} of {files.length} files
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
