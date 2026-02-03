/**
 * Users Page
 * Swiss Brutalist Tech Design
 * 
 * Goal: Understand who is using Koda and how
 * Shows user list with activity metrics
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section } from "@/components/shared";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

// Mock data - Replace with API calls
const mockUsers = [
  {
    id: "u_001",
    email: "j***@company.com",
    locale: "en-US",
    device: "Desktop",
    firstUse: "2025-01-15",
    lastActive: "2 min ago",
    messages7d: 156,
    uploads7d: 12,
    weakEvidenceRate: 3.2,
    avgLatency: 245,
    status: "Active",
  },
  {
    id: "u_002",
    email: "m***@startup.io",
    locale: "en-GB",
    device: "Mobile",
    firstUse: "2025-01-20",
    lastActive: "15 min ago",
    messages7d: 89,
    uploads7d: 5,
    weakEvidenceRate: 5.1,
    avgLatency: 312,
    status: "Active",
  },
  {
    id: "u_003",
    email: "s***@enterprise.com",
    locale: "de-DE",
    device: "Desktop",
    firstUse: "2024-12-01",
    lastActive: "1 hour ago",
    messages7d: 234,
    uploads7d: 28,
    weakEvidenceRate: 2.8,
    avgLatency: 198,
    status: "Active",
  },
  {
    id: "u_004",
    email: "a***@agency.co",
    locale: "fr-FR",
    device: "Desktop",
    firstUse: "2025-01-10",
    lastActive: "3 hours ago",
    messages7d: 45,
    uploads7d: 3,
    weakEvidenceRate: 8.4,
    avgLatency: 456,
    status: "Active",
  },
  {
    id: "u_005",
    email: "t***@tech.dev",
    locale: "en-US",
    device: "Mobile",
    firstUse: "2025-01-22",
    lastActive: "1 day ago",
    messages7d: 12,
    uploads7d: 1,
    weakEvidenceRate: 0,
    avgLatency: 267,
    status: "Inactive",
  },
  {
    id: "u_006",
    email: "r***@research.edu",
    locale: "en-US",
    device: "Desktop",
    firstUse: "2024-11-15",
    lastActive: "5 min ago",
    messages7d: 312,
    uploads7d: 45,
    weakEvidenceRate: 4.1,
    avgLatency: 223,
    status: "Active",
  },
  {
    id: "u_007",
    email: "k***@consulting.biz",
    locale: "es-ES",
    device: "Desktop",
    firstUse: "2025-01-05",
    lastActive: "30 min ago",
    messages7d: 178,
    uploads7d: 22,
    weakEvidenceRate: 3.9,
    avgLatency: 289,
    status: "Active",
  },
  {
    id: "u_008",
    email: "l***@legal.law",
    locale: "en-US",
    device: "Desktop",
    firstUse: "2024-12-20",
    lastActive: "2 hours ago",
    messages7d: 98,
    uploads7d: 15,
    weakEvidenceRate: 2.3,
    avgLatency: 201,
    status: "Active",
  },
];

export default function Users() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = mockUsers.filter(
    (user) =>
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const columns = [
    {
      key: "email",
      header: "User",
      render: (item: typeof mockUsers[0]) => (
        <div>
          <span className="font-medium">{item.email}</span>
          <span className="block text-xs text-muted-foreground font-mono">{item.id}</span>
        </div>
      ),
    },
    { key: "locale", header: "Locale", className: "font-mono text-sm" },
    {
      key: "device",
      header: "Device",
      render: (item: typeof mockUsers[0]) => (
        <StatusBadge variant={item.device === "Desktop" ? "neutral" : "info"}>
          {item.device}
        </StatusBadge>
      ),
    },
    { key: "firstUse", header: "First Use", className: "font-mono text-sm text-muted-foreground" },
    { key: "lastActive", header: "Last Active", className: "text-muted-foreground" },
    {
      key: "messages7d",
      header: "Messages (7d)",
      className: "font-mono text-right",
      render: (item: typeof mockUsers[0]) => item.messages7d.toLocaleString(),
    },
    {
      key: "uploads7d",
      header: "Uploads (7d)",
      className: "font-mono text-right",
      render: (item: typeof mockUsers[0]) => item.uploads7d.toLocaleString(),
    },
    {
      key: "weakEvidenceRate",
      header: "Weak Evidence",
      className: "font-mono text-right",
      render: (item: typeof mockUsers[0]) => (
        <span className={item.weakEvidenceRate > 5 ? "text-[oklch(0.45_0.15_25)]" : ""}>
          {item.weakEvidenceRate.toFixed(1)}%
        </span>
      ),
    },
    {
      key: "avgLatency",
      header: "Avg Latency",
      className: "font-mono text-right",
      render: (item: typeof mockUsers[0]) => `${item.avgLatency}ms`,
    },
    {
      key: "status",
      header: "Status",
      render: (item: typeof mockUsers[0]) => (
        <StatusBadge variant={item.status === "Active" ? "success" : "neutral"}>
          {item.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Users"
        description="Understand who is using Koda and how"
        actions={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
        }
      />

      <div className="p-8">
        <Section>
          <DataTable
            columns={columns}
            data={filteredUsers}
            onRowClick={(user) => setLocation(`/admin/users/${user.id}`)}
            emptyMessage="No users found"
          />
        </Section>

        <div className="mt-4 text-sm text-muted-foreground">
          Showing {filteredUsers.length} of {mockUsers.length} users
        </div>
      </div>
    </AdminLayout>
  );
}
