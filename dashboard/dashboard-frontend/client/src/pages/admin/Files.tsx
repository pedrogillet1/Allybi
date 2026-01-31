/**
 * Files Page
 * Swiss Brutalist Tech Design
 * 
 * Goal: Understand the documents users rely on and where extraction/indexing fails
 * Shows file inventory with status and metrics
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, getStatusVariant, PageHeader, Section, KPICard } from "@/components/shared";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Search, FileText, Image, FileSpreadsheet, FileType, Film, File } from "lucide-react";

// Mock data - Replace with API calls
const mockStats = {
  totalFiles: 12456,
  indexed: 11892,
  processing: 234,
  failed: 330,
  totalSize: "2.4 TB",
};

const mockFiles = [
  {
    id: "f_001",
    filename: "Q4_Financial_Report_2025.pdf",
    type: "pdf",
    size: "2.4 MB",
    uploadedAt: "2025-01-27 14:32",
    folder: "/Reports/Q4",
    previewOpens: 45,
    downloads: 12,
    status: "Indexed",
    userId: "u_***42",
  },
  {
    id: "f_002",
    filename: "Contract_Amendment_v3.docx",
    type: "docx",
    size: "156 KB",
    uploadedAt: "2025-01-27 12:15",
    folder: "/Legal/Contracts",
    previewOpens: 23,
    downloads: 5,
    status: "Indexed",
    userId: "u_***17",
  },
  {
    id: "f_003",
    filename: "Sales_Data_2024.xlsx",
    type: "xlsx",
    size: "890 KB",
    uploadedAt: "2025-01-27 10:45",
    folder: "/Data",
    previewOpens: 67,
    downloads: 28,
    status: "Indexed",
    userId: "u_***89",
  },
  {
    id: "f_004",
    filename: "Product_Launch_Deck.pptx",
    type: "pptx",
    size: "5.2 MB",
    uploadedAt: "2025-01-27 09:20",
    folder: "/Marketing",
    previewOpens: 12,
    downloads: 3,
    status: "Processing",
    userId: "u_***33",
  },
  {
    id: "f_005",
    filename: "scan_receipt_001.pdf",
    type: "pdf",
    size: "1.1 MB",
    uploadedAt: "2025-01-27 08:55",
    folder: "/Expenses",
    previewOpens: 2,
    downloads: 0,
    status: "Failed",
    userId: "u_***56",
  },
  {
    id: "f_006",
    filename: "Architecture_Diagram.png",
    type: "image",
    size: "456 KB",
    uploadedAt: "2025-01-26 16:30",
    folder: "/Technical",
    previewOpens: 89,
    downloads: 15,
    status: "Indexed",
    userId: "u_***78",
  },
  {
    id: "f_007",
    filename: "Meeting_Recording.mp4",
    type: "video",
    size: "125 MB",
    uploadedAt: "2025-01-26 14:00",
    folder: "/Meetings",
    previewOpens: 34,
    downloads: 8,
    status: "Indexed",
    userId: "u_***12",
  },
  {
    id: "f_008",
    filename: "API_Documentation.md",
    type: "text",
    size: "45 KB",
    uploadedAt: "2025-01-26 11:20",
    folder: "/Technical/Docs",
    previewOpens: 156,
    downloads: 42,
    status: "Indexed",
    userId: "u_***99",
  },
  {
    id: "f_009",
    filename: "encrypted_data.pdf",
    type: "pdf",
    size: "3.2 MB",
    uploadedAt: "2025-01-26 09:15",
    folder: "/Secure",
    previewOpens: 0,
    downloads: 0,
    status: "Failed",
    userId: "u_***45",
  },
  {
    id: "f_010",
    filename: "Budget_Template.xlsx",
    type: "xlsx",
    size: "234 KB",
    uploadedAt: "2025-01-25 17:45",
    folder: "/Finance",
    previewOpens: 78,
    downloads: 31,
    status: "Indexed",
    userId: "u_***67",
  },
];

const getFileIcon = (type: string) => {
  switch (type) {
    case "pdf":
    case "docx":
      return FileText;
    case "xlsx":
      return FileSpreadsheet;
    case "pptx":
      return FileType;
    case "image":
      return Image;
    case "video":
      return Film;
    default:
      return File;
  }
};

export default function Files() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredFiles = mockFiles.filter((file) => {
    const matchesSearch = file.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.folder.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || file.status.toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns = [
    {
      key: "filename",
      header: "File",
      render: (item: typeof mockFiles[0]) => {
        const Icon = getFileIcon(item.type);
        return (
          <div className="flex items-center gap-3">
            <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <span className="font-medium block truncate max-w-xs">{item.filename}</span>
              <span className="text-xs text-muted-foreground">{item.folder}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: "type",
      header: "Type",
      render: (item: typeof mockFiles[0]) => (
        <StatusBadge variant="neutral">{item.type.toUpperCase()}</StatusBadge>
      ),
    },
    { key: "size", header: "Size", className: "font-mono" },
    { key: "uploadedAt", header: "Uploaded", className: "font-mono text-sm text-muted-foreground" },
    { key: "previewOpens", header: "Previews", className: "font-mono text-right" },
    { key: "downloads", header: "Downloads", className: "font-mono text-right" },
    {
      key: "status",
      header: "Status",
      render: (item: typeof mockFiles[0]) => (
        <StatusBadge variant={getStatusVariant(item.status)}>
          {item.status}
        </StatusBadge>
      ),
    },
    { key: "userId", header: "User", className: "font-mono text-muted-foreground" },
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
              <option value="indexed">Indexed</option>
              <option value="processing">Processing</option>
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
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <KPICard label="Total Files" value={mockStats.totalFiles.toLocaleString()} />
          <KPICard label="Indexed" value={mockStats.indexed.toLocaleString()} />
          <KPICard label="Processing" value={mockStats.processing} />
          <KPICard label="Failed" value={mockStats.failed} />
          <KPICard label="Total Size" value={mockStats.totalSize} />
        </div>

        {/* File Table */}
        <Section>
          <DataTable
            columns={columns}
            data={filteredFiles}
            onRowClick={(file) => setLocation(`/admin/files/${file.id}`)}
            emptyMessage="No files found"
          />
        </Section>

        <div className="text-sm text-muted-foreground">
          Showing {filteredFiles.length} of {mockFiles.length} files
        </div>
      </div>
    </AdminLayout>
  );
}
