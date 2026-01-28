/**
 * File Detail Page
 * Swiss Brutalist Tech Design
 *
 * Shows detailed file information with tabs:
 * - Metadata: file id, mime, size, folder, timestamps
 * - Extraction: method, pages, OCR, tables, text length
 * - Index: chunks, embedding info
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { KPICard, StatusBadge, getStatusVariant, PageHeader, Section, TabNav } from "@/components/shared";
import { useParams } from "wouter";
import { FileText } from "lucide-react";
import { useFileDetail } from "@/hooks/useTelemetry";

/** Extract short encrypted key from filenameEncrypted JSON */
function getEncryptedKey(filenameEncrypted: string | null, truncate = true): string {
  if (!filenameEncrypted) return "—";
  try {
    const parsed = JSON.parse(filenameEncrypted);
    const ct = parsed.ctB64 ?? "";
    if (!truncate) return ct;
    return ct.length > 20 ? ct.slice(0, 20) + "..." : ct;
  } catch {
    if (!truncate) return filenameEncrypted;
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

const tabs = [
  { id: "metadata", label: "Metadata" },
  { id: "extraction", label: "Extraction" },
  { id: "index", label: "Index" },
];

export default function FileDetail() {
  const params = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("metadata");

  const { data: file, isLoading } = useFileDetail(params.id ?? "");

  if (isLoading) {
    return (
      <AdminLayout>
        <PageHeader title="File" description="Loading..." backLink="/admin/files" />
        <div className="p-8 text-muted-foreground">Loading...</div>
      </AdminLayout>
    );
  }

  if (!file) {
    return (
      <AdminLayout>
        <PageHeader title="File Not Found" backLink="/admin/files" />
        <div className="p-8 text-muted-foreground">This file could not be found.</div>
      </AdminLayout>
    );
  }

  const meta = file.metadata;
  const pm = file.processingMetrics;

  return (
    <AdminLayout>
      <PageHeader
        title={`File ID: ${params.id}`}
        backLink="/admin/files"
      />

      {/* File Summary */}
      <div className="px-8 py-6 border-b border-border bg-muted/30">
        <div className="flex items-start gap-6">
          <div className="w-12 h-12 bg-foreground flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-background" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 text-sm flex-1">
            <div>
              <span className="label-uppercase">Format</span>
              <p className="mt-1">
                <StatusBadge variant="neutral">{mimeToFormat(file.mimeType)}</StatusBadge>
              </p>
            </div>
            <div>
              <span className="label-uppercase">Size</span>
              <p className="mt-1 font-mono">{file.size}</p>
            </div>
            <div>
              <span className="label-uppercase">Language</span>
              <p className="mt-1 font-mono">{file.language}</p>
            </div>
            <div>
              <span className="label-uppercase">Status</span>
              <p className="mt-1">
                <StatusBadge variant={getStatusVariant(file.status)}>
                  {file.status}
                </StatusBadge>
              </p>
            </div>
            <div>
              <span className="label-uppercase">Uploaded</span>
              <p className="mt-1 font-mono text-sm">{new Date(file.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <span className="label-uppercase">User</span>
              <p className="mt-1 font-mono text-xs">{file.userId}</p>
            </div>
          </div>
        </div>
      </div>

      <TabNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} className="px-8" />

      <div className="p-8">
        {activeTab === "metadata" && (
          <Section title="File Metadata">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div>
                <span className="label-uppercase">File ID</span>
                <p className="mt-1 font-mono text-sm">{file.id}</p>
              </div>
              <div>
                <span className="label-uppercase">Format</span>
                <p className="mt-1 font-mono text-sm uppercase">{mimeToFormat(file.mimeType)}</p>
              </div>
              <div>
                <span className="label-uppercase">Size (bytes)</span>
                <p className="mt-1 font-mono">{file.sizeBytes?.toLocaleString()}</p>
              </div>
              <div>
                <span className="label-uppercase">Encrypted Key</span>
                <p className="mt-1 font-mono text-sm">{getEncryptedKey(file.filenameEncrypted, false)}</p>
              </div>
              <div>
                <span className="label-uppercase">Created At</span>
                <p className="mt-1 font-mono text-sm">{new Date(file.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <span className="label-uppercase">Updated At</span>
                <p className="mt-1 font-mono text-sm">{new Date(file.updatedAt).toLocaleString()}</p>
              </div>
            </div>
          </Section>
        )}

        {activeTab === "extraction" && (
          <div className="space-y-6">
            {pm ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KPICard label="Pages" value={meta?.pageCount ?? "—"} />
                  <KPICard label="OCR Confidence" value={meta?.ocrConfidence != null ? `${(meta.ocrConfidence * 100).toFixed(0)}%` : "—"} />
                  <KPICard label="Text Length" value={(pm.textLength ?? 0).toLocaleString()} />
                  <KPICard label="Processing Duration" value={pm.processingDuration != null ? `${pm.processingDuration}ms` : "—"} />
                </div>
                <Section title="Extraction Details">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div>
                      <span className="label-uppercase">Method</span>
                      <p className="mt-1 text-sm">{pm.textExtractionMethod ?? "—"}</p>
                    </div>
                    <div>
                      <span className="label-uppercase">OCR Used</span>
                      <p className="mt-1">
                        <StatusBadge variant={pm.ocrUsed ? "info" : "neutral"}>
                          {pm.ocrUsed ? "Yes" : "No"}
                        </StatusBadge>
                      </p>
                    </div>
                    <div>
                      <span className="label-uppercase">Has Tables</span>
                      <p className="mt-1">
                        <StatusBadge variant={meta?.hasTables ? "info" : "neutral"}>
                          {meta?.hasTables ? "Yes" : "No"}
                        </StatusBadge>
                      </p>
                    </div>
                    <div>
                      <span className="label-uppercase">Has Images</span>
                      <p className="mt-1">
                        <StatusBadge variant={meta?.hasImages ? "info" : "neutral"}>
                          {meta?.hasImages ? "Yes" : "No"}
                        </StatusBadge>
                      </p>
                    </div>
                    <div>
                      <span className="label-uppercase">Times Queried</span>
                      <p className="mt-1 font-mono">{pm.timesQueried ?? 0}</p>
                    </div>
                  </div>
                </Section>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No extraction data available.</p>
            )}
          </div>
        )}

        {activeTab === "index" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard label="Chunks" value={file.chunksCount ?? 0} />
              <KPICard label="Embeddings" value={pm?.embeddingsCreated ?? 0} />
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
