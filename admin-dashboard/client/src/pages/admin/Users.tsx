/**
 * Users Page
 * Swiss Brutalist Tech Design
 *
 * Goal: Understand who is using Koda and how
 * Shows user list with activity metrics
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, PageHeader, Section } from "@/components/shared";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useUsers } from "@/hooks/useTelemetry";

export default function Users() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [range] = useState("7d");

  const { data, isLoading } = useUsers(range, 100);
  const users: any[] = data?.items ?? [];

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const columns = [
    {
      key: "email",
      header: "User",
      render: (item: any) => (
        <div>
          <span className="font-medium">{item.email}</span>
          <span className="block text-xs text-muted-foreground font-mono">{item.id}</span>
        </div>
      ),
    },
    { key: "subscriptionTier", header: "Tier", className: "font-mono text-sm" },
    {
      key: "createdAt",
      header: "Joined",
      className: "font-mono text-sm text-muted-foreground",
      render: (item: any) => new Date(item.createdAt).toLocaleDateString(),
    },
    {
      key: "lastActive",
      header: "Last Active",
      className: "text-muted-foreground",
      render: (item: any) => new Date(item.lastActive).toLocaleString(),
    },
    {
      key: "conversations",
      header: `Conversations (${range})`,
      className: "font-mono text-right",
    },
    {
      key: "documents",
      header: `Documents (${range})`,
      className: "font-mono text-right",
    },
    {
      key: "storageUsed",
      header: "Storage",
      className: "font-mono text-right",
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
        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            <Section>
              <DataTable
                columns={columns}
                data={filteredUsers}
                onRowClick={(user) => setLocation(`/admin/users/${user.id}`)}
                emptyMessage="No users found"
              />
            </Section>

            <div className="mt-4 text-sm text-muted-foreground">
              Showing {filteredUsers.length} of {users.length} users
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
