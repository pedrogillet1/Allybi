/**
 * User Detail Page
 * Swiss Brutalist Tech Design
 *
 * Shows detailed user analytics with tabs:
 * - Activity: sessions, conversations, messages
 * - Costs: tokens/cost in range
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { KPICard, StatusBadge, PageHeader, Section, TabNav } from "@/components/shared";
import { useParams } from "wouter";
import { useUserDetail } from "@/hooks/useTelemetry";

const tabs = [
  { id: "activity", label: "Activity" },
  { id: "costs", label: "Costs" },
];

export default function UserDetail() {
  const params = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("activity");
  const [range] = useState("7d");

  const { data: user, isLoading } = useUserDetail(params.id ?? "", range);

  if (isLoading) {
    return (
      <AdminLayout>
        <PageHeader title="User" description="Loading..." backLink="/admin/users" />
        <div className="p-8 text-muted-foreground">Loading...</div>
      </AdminLayout>
    );
  }

  if (!user) {
    return (
      <AdminLayout>
        <PageHeader title="User Not Found" backLink="/admin/users" />
        <div className="p-8 text-muted-foreground">This user could not be found.</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHeader
        title={user.email}
        description={`User ID: ${params.id} • ${user.subscriptionTier} tier`}
        backLink="/admin/users"
      />

      {/* User Summary */}
      <div className="px-8 py-6 border-b border-border bg-muted/30">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 text-sm">
          <div>
            <span className="label-uppercase">Name</span>
            <p className="mt-1">{user.name || "—"}</p>
          </div>
          <div>
            <span className="label-uppercase">Joined</span>
            <p className="mt-1 font-mono">{new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <span className="label-uppercase">Last Active</span>
            <p className="mt-1">{new Date(user.lastActive).toLocaleString()}</p>
          </div>
          <div>
            <span className="label-uppercase">Storage Used</span>
            <p className="mt-1 font-mono">{user.storageUsed}</p>
          </div>
          <div>
            <span className="label-uppercase">Tier</span>
            <p className="mt-1">
              <StatusBadge variant="info">{user.subscriptionTier}</StatusBadge>
            </p>
          </div>
        </div>
      </div>

      <TabNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} className="px-8" />

      <div className="p-8">
        {activeTab === "activity" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard label="Total Sessions" value={user.totalSessions ?? 0} />
              <KPICard label="Conversations" value={user.totalConversations ?? 0} />
              <KPICard label={`Messages (${range})`} value={(user.messagesInRange ?? 0).toLocaleString()} />
              <KPICard label="Documents" value={user.totalDocuments ?? 0} />
            </div>
          </div>
        )}

        {activeTab === "costs" && (
          <Section title={`Token Usage (${range})`}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KPICard label="Tokens" value={(user.tokensInRange ?? 0).toLocaleString()} />
              <KPICard label="Cost" value={`$${(user.costInRange ?? 0).toFixed(2)}`} />
            </div>
          </Section>
        )}
      </div>
    </AdminLayout>
  );
}
