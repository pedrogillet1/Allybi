/**
 * File Detail Page - Files Subsection
 * Shows document processing waterfall, chunks, queries using this doc
 */

import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Layers,
  ChevronLeft,
  AlertTriangle,
  Zap,
  Eye,
} from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useFileDetail } from "@/hooks/useAdminApi";
import type { TimeRange, Environment, PipelineStep } from "@/types/admin";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function FileDetailPage() {
  const params = useParams();
  const fileId = params.fileId || null;
  const [range, setRange] = useState<TimeRange>("30d");
  const [env, setEnv] = useState<Environment>("prod");

  const { data: fileData, isLoading, error: fileError } = useFileDetail(fileId);

  if (!fileId) {
    return (
      <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
        <div className="flex flex-col items-center justify-center py-16">
          <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
          <p className="text-[#6B7280]">No file ID provided</p>
          <Link href="/admin/files" className="mt-4 text-sm text-blue-600 hover:underline">
            ← Back to Files
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const getStatusIcon = (status: PipelineStep["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "skipped":
        return <Clock className="w-5 h-5 text-gray-400" />;
      default:
        return <Clock className="w-5 h-5 text-amber-500" />;
    }
  };

  // Use real data from API
  const pipelineSteps = fileData?.pipelineSteps ?? [];
  const relatedQueries = fileData?.relatedQueries ?? [];
  const totalDuration = fileData?.totalProcessingMs ?? pipelineSteps.reduce((s, step) => s + (step.durationMs ?? 0), 0);

  const file = {
    fileName: fileData?.fileName ?? 'Unknown file',
    mimeType: fileData?.mimeType ?? 'unknown',
    sizeBytes: fileData?.sizeBytes ?? 0,
    pageCount: fileData?.pageCount ?? 0,
    chunkCount: fileData?.chunkCount ?? fileData?.stats?.totalChunks ?? 0,
    status: fileData?.status ?? 'unknown',
    ocrUsed: fileData?.ocrUsed ?? false,
    ocrPages: fileData?.ocrPages ?? 0,
  };

  return (
    <AdminLayout range={range} onRangeChange={setRange} env={env} onEnvChange={setEnv}>
      {/* Back Link */}
      <Link href="/admin/files" className="inline-flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#111111] mb-4">
        <ChevronLeft className="w-4 h-4" />
        Back to Files
      </Link>

      {/* Error State */}
      {fileError && (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-[#E6E6EC] rounded-lg">
          <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
          <p className="text-sm text-[#6B7280]">{fileError.message}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-[#E6E6EC] rounded-lg" />
          <div className="h-64 bg-[#E6E6EC] rounded-lg" />
        </div>
      )}

      {/* File Header */}
      {!isLoading && fileData && (
        <>
          <div className="bg-white border border-[#E6E6EC] rounded-lg p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#F5F5F5] rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-[#6B7280]" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-semibold text-[#111111] mb-1">
                  {file.fileName}
                </h1>
                <div className="flex items-center gap-4 text-sm text-[#6B7280]">
                  <span>{file.mimeType}</span>
                  <span>•</span>
                  <span>{formatBytes(file.sizeBytes)}</span>
                  {file.pageCount > 0 && (
                    <>
                      <span>•</span>
                      <span>{file.pageCount} pages</span>
                    </>
                  )}
                  <span>•</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    file.status === "ready" || file.status === "available" || file.status === "indexed" ? "bg-green-100 text-green-700" :
                    file.status === "failed" ? "bg-red-100 text-red-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {file.status}
                  </span>
                </div>
                <p className="mt-2 font-mono text-xs text-[#6B7280]">ID: {fileId}</p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#6B7280] mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs">Total Processing</span>
              </div>
              <div className="text-xl font-semibold text-[#111111]">{formatDuration(totalDuration)}</div>
            </div>
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#6B7280] mb-1">
                <Layers className="w-4 h-4" />
                <span className="text-xs">Chunks</span>
              </div>
              <div className="text-xl font-semibold text-[#111111]">{file.chunkCount}</div>
            </div>
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#6B7280] mb-1">
                <Zap className="w-4 h-4" />
                <span className="text-xs">Embeddings</span>
              </div>
              <div className="text-xl font-semibold text-[#111111]">{file.chunkCount}</div>
            </div>
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[#6B7280] mb-1">
                <Eye className="w-4 h-4" />
                <span className="text-xs">OCR Used</span>
              </div>
              <div className="text-xl font-semibold text-[#111111]">{file.ocrUsed ? "Yes" : "No"}</div>
              {file.ocrUsed && file.ocrPages > 0 && (
                <div className="text-xs text-[#6B7280]">{file.ocrPages} pages</div>
              )}
            </div>
          </div>

          {/* Processing Pipeline Waterfall */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-[#111111] mb-4">Processing Pipeline</h2>
            <div className="bg-white border border-[#E6E6EC] rounded-lg p-6">
              {pipelineSteps.length === 0 ? (
                <p className="text-center text-[#6B7280] py-4">No pipeline data available</p>
              ) : (
                <div className="space-y-4">
                  {pipelineSteps.map((step) => (
                    <div key={step.name} className="flex items-center gap-4">
                      {/* Status Icon */}
                      {getStatusIcon(step.status)}

                      {/* Step Info */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[#111111] font-mono text-sm">{step.name}</span>
                          <span className="text-sm text-[#6B7280]">
                            {formatDuration(step.durationMs)}
                          </span>
                        </div>

                        {/* Duration Bar */}
                        {totalDuration > 0 && (
                          <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                step.status === "completed" ? "bg-green-500" :
                                step.status === "failed" ? "bg-red-500" :
                                "bg-gray-300"
                              }`}
                              style={{ width: `${Math.max(1, ((step.durationMs ?? 0) / totalDuration) * 100)}%` }}
                            />
                          </div>
                        )}

                        {/* Metadata */}
                        {step.metadata && Object.keys(step.metadata).length > 0 && (
                          <div className="mt-1 text-xs text-[#6B7280]">
                            {Object.entries(step.metadata).map(([key, value]) => (
                              <span key={key} className="mr-3">
                                {key}: {String(value)}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Error */}
                        {step.error && (
                          <div className="mt-1 text-xs text-red-600">{step.error}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Queries Using This Document */}
          <div>
            <h2 className="text-lg font-semibold text-[#111111] mb-4">Queries Using This Document</h2>
            <div className="bg-white border border-[#E6E6EC] rounded-lg overflow-hidden">
              {relatedQueries.length === 0 ? (
                <div className="p-6 text-center text-[#6B7280]">
                  No queries have used this document yet
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#FAFAFA] border-b border-[#E6E6EC]">
                      <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Query</th>
                      <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Domain</th>
                      <th className="text-right px-4 py-3 font-medium text-[#6B7280]">Score</th>
                      <th className="text-left px-4 py-3 font-medium text-[#6B7280]">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedQueries.map((query) => (
                      <tr key={query.id} className="border-b border-[#E6E6EC] hover:bg-[#FAFAFA]">
                        <td className="px-4 py-3 max-w-xs truncate text-[#111111]">
                          {query.queryText}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                            {query.domain}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${
                            query.topScore >= 0.5 ? "text-green-600" :
                            query.topScore >= 0.35 ? "text-amber-600" :
                            "text-red-600"
                          }`}>
                            {(query.topScore * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#6B7280]">
                          {new Date(query.timestamp).toLocaleString()}
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

export default FileDetailPage;
