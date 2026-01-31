/**
 * File Detail Page
 * Swiss Brutalist Tech Design
 * 
 * Shows detailed file information with tabs:
 * - Metadata: file id, mime, size, folder, timestamps
 * - Extraction: method, pages, OCR, tables, text length
 * - Index: chunks, embedding provider, errors
 * - Usage: source references, conversations
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { KPICard, DataTable, StatusBadge, getStatusVariant, PageHeader, Section, TabNav } from "@/components/shared";
import { useParams } from "wouter";
import { FileText } from "lucide-react";

// Mock data - Replace with API calls
const mockFile = {
  id: "f_001",
  filename: "Q4_Financial_Report_2025.pdf",
  type: "pdf",
  mimeType: "application/pdf",
  size: "2.4 MB",
  sizeBytes: 2516582,
  folder: "/Reports/Q4",
  uploadedAt: "2025-01-27 14:32:15",
  updatedAt: "2025-01-27 14:35:42",
  status: "Indexed",
  userId: "u_***42",
  fileHash: "sha256:a3f2b8c9d4e5f6...",
};

const mockExtraction = {
  method: "pdf-parse + Google Vision OCR",
  pagesProcessed: 24,
  totalPages: 24,
  ocrUsed: true,
  ocrConfidence: 0.94,
  tablesExtracted: 8,
  imagesExtracted: 12,
  extractedTextLength: 45678,
  indexingDuration: 12.4,
  hasSignature: false,
  language: "en",
};

const mockIndex = {
  chunksCount: 156,
  embeddingProvider: "OpenAI",
  embeddingModel: "text-embedding-3-small",
  embeddingDimensions: 1536,
  pineconeNamespace: "user_u001_docs",
  embeddingErrors: 0,
  lastIndexedAt: "2025-01-27 14:35:42",
};

const mockUsage = {
  sourceReferences: 45,
  uniqueConversations: 12,
  previewOpens: 89,
  downloads: 23,
};

const mockConversations = [
  { id: "conv_001", title: "Q4 Revenue Analysis", messages: 8, lastActive: "2 hours ago" },
  { id: "conv_002", title: "Financial Summary Request", messages: 5, lastActive: "1 day ago" },
  { id: "conv_003", title: "Budget Comparison", messages: 12, lastActive: "2 days ago" },
  { id: "conv_004", title: "Quarterly Metrics", messages: 3, lastActive: "3 days ago" },
];

const tabs = [
  { id: "metadata", label: "Metadata" },
  { id: "extraction", label: "Extraction" },
  { id: "index", label: "Index" },
  { id: "usage", label: "Usage" },
];

export default function FileDetail() {
  const params = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("metadata");

  const conversationColumns = [
    { key: "title", header: "Conversation" },
    { key: "messages", header: "Messages", className: "font-mono text-right" },
    { key: "lastActive", header: "Last Active", className: "text-muted-foreground" },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title={mockFile.filename}
        description={`File ID: ${params.id}`}
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
              <span className="label-uppercase">Type</span>
              <p className="mt-1">
                <StatusBadge variant="neutral">{mockFile.type.toUpperCase()}</StatusBadge>
              </p>
            </div>
            <div>
              <span className="label-uppercase">Size</span>
              <p className="mt-1 font-mono">{mockFile.size}</p>
            </div>
            <div>
              <span className="label-uppercase">Folder</span>
              <p className="mt-1 font-mono text-sm">{mockFile.folder}</p>
            </div>
            <div>
              <span className="label-uppercase">Status</span>
              <p className="mt-1">
                <StatusBadge variant={getStatusVariant(mockFile.status)}>
                  {mockFile.status}
                </StatusBadge>
              </p>
            </div>
            <div>
              <span className="label-uppercase">Uploaded</span>
              <p className="mt-1 font-mono text-sm">{mockFile.uploadedAt}</p>
            </div>
            <div>
              <span className="label-uppercase">User</span>
              <p className="mt-1 font-mono">{mockFile.userId}</p>
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
                <p className="mt-1 font-mono text-sm">{mockFile.id}</p>
              </div>
              <div>
                <span className="label-uppercase">MIME Type</span>
                <p className="mt-1 font-mono text-sm">{mockFile.mimeType}</p>
              </div>
              <div>
                <span className="label-uppercase">Size (bytes)</span>
                <p className="mt-1 font-mono">{mockFile.sizeBytes.toLocaleString()}</p>
              </div>
              <div>
                <span className="label-uppercase">File Hash</span>
                <p className="mt-1 font-mono text-sm truncate">{mockFile.fileHash}</p>
              </div>
              <div>
                <span className="label-uppercase">Created At</span>
                <p className="mt-1 font-mono text-sm">{mockFile.uploadedAt}</p>
              </div>
              <div>
                <span className="label-uppercase">Updated At</span>
                <p className="mt-1 font-mono text-sm">{mockFile.updatedAt}</p>
              </div>
            </div>
          </Section>
        )}

        {activeTab === "extraction" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard label="Pages Processed" value={`${mockExtraction.pagesProcessed}/${mockExtraction.totalPages}`} />
              <KPICard label="OCR Confidence" value={`${(mockExtraction.ocrConfidence * 100).toFixed(0)}%`} />
              <KPICard label="Tables Extracted" value={mockExtraction.tablesExtracted} />
              <KPICard label="Indexing Duration" value={`${mockExtraction.indexingDuration}s`} />
            </div>

            <Section title="Extraction Details">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div>
                  <span className="label-uppercase">Method</span>
                  <p className="mt-1 text-sm">{mockExtraction.method}</p>
                </div>
                <div>
                  <span className="label-uppercase">OCR Used</span>
                  <p className="mt-1">
                    <StatusBadge variant={mockExtraction.ocrUsed ? "info" : "neutral"}>
                      {mockExtraction.ocrUsed ? "Yes" : "No"}
                    </StatusBadge>
                  </p>
                </div>
                <div>
                  <span className="label-uppercase">Language</span>
                  <p className="mt-1 font-mono">{mockExtraction.language}</p>
                </div>
                <div>
                  <span className="label-uppercase">Text Length</span>
                  <p className="mt-1 font-mono">{mockExtraction.extractedTextLength.toLocaleString()} chars</p>
                </div>
                <div>
                  <span className="label-uppercase">Images Extracted</span>
                  <p className="mt-1 font-mono">{mockExtraction.imagesExtracted}</p>
                </div>
                <div>
                  <span className="label-uppercase">Has Signature</span>
                  <p className="mt-1">
                    <StatusBadge variant={mockExtraction.hasSignature ? "warning" : "neutral"}>
                      {mockExtraction.hasSignature ? "Yes" : "No"}
                    </StatusBadge>
                  </p>
                </div>
              </div>
            </Section>
          </div>
        )}

        {activeTab === "index" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard label="Chunks" value={mockIndex.chunksCount} />
              <KPICard label="Dimensions" value={mockIndex.embeddingDimensions.toLocaleString()} />
              <KPICard label="Errors" value={mockIndex.embeddingErrors} />
            </div>

            <Section title="Index Details">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div>
                  <span className="label-uppercase">Embedding Provider</span>
                  <p className="mt-1">{mockIndex.embeddingProvider}</p>
                </div>
                <div>
                  <span className="label-uppercase">Embedding Model</span>
                  <p className="mt-1 font-mono text-sm">{mockIndex.embeddingModel}</p>
                </div>
                <div>
                  <span className="label-uppercase">Pinecone Namespace</span>
                  <p className="mt-1 font-mono text-sm">{mockIndex.pineconeNamespace}</p>
                </div>
                <div>
                  <span className="label-uppercase">Last Indexed</span>
                  <p className="mt-1 font-mono text-sm">{mockIndex.lastIndexedAt}</p>
                </div>
              </div>
            </Section>
          </div>
        )}

        {activeTab === "usage" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard label="Source References" value={mockUsage.sourceReferences} />
              <KPICard label="Conversations" value={mockUsage.uniqueConversations} />
              <KPICard label="Preview Opens" value={mockUsage.previewOpens} />
              <KPICard label="Downloads" value={mockUsage.downloads} />
            </div>

            <Section title="Referenced in Conversations">
              <DataTable columns={conversationColumns} data={mockConversations} />
            </Section>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
