/**
 * Security Page
 * Swiss Brutalist Tech Design
 *
 * Goal: Monitor security events and access patterns
 * Shows error log for security-related events; audit log data is limited.
 *
 * Note: Detailed auth events, rate-limit tracking, and suspicious activity
 * detection are not yet wired to dedicated models — those sections show
 * "Coming soon" until the backend exposes them.
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard } from "@/components/shared";
import { useOverview, useErrors } from "@/hooks/useTelemetry";

export default function Security() {
  const [range] = useState("7d");
  const { data: overview, isLoading } = useOverview(range);
  const { data: errorsData } = useErrors(range, 50);

  const errorItems: any[] = errorsData?.items ?? [];

  const errorColumns = [
    {
      key: "createdAt",
      header: "Time",
      className: "font-mono text-sm text-muted-foreground whitespace-nowrap",
      render: (item: any) => new Date(item.createdAt).toLocaleString(),
    },
    { key: "service", header: "Service" },
    {
      key: "errorType",
      header: "Type",
      render: (item: any) => (
        <StatusBadge variant="error">{item.errorType}</StatusBadge>
      ),
    },
    { key: "errorMessage", header: "Message" },
    {
      key: "severity",
      header: "Severity",
      render: (item: any) => {
        const variant = item.severity === "critical" ? "error" :
          item.severity === "warning" ? "warning" : "neutral";
        return <StatusBadge variant={variant}>{item.severity}</StatusBadge>;
      },
    },
    { key: "requestPath", header: "Path", className: "font-mono text-sm text-muted-foreground" },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Security"
        description="Error monitoring and audit overview"
      />

      <div className="p-8 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard
            label="Total Users"
            value={(overview?.totalUsers ?? 0).toLocaleString()}
          />
          <KPICard
            label="Active Users"
            value={(overview?.activeUsers ?? 0).toLocaleString()}
          />
          <KPICard
            label={`Errors (${range})`}
            value={overview?.errorCount ?? 0}
          />
          <KPICard
            label="Error Rate"
            value={`${overview?.errorRate ?? 0}%`}
          />
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            {/* Error Log */}
            <Section title="Error Log" description={`All errors in the last ${range}`}>
              <DataTable
                columns={errorColumns}
                data={errorItems}
                emptyMessage="No errors"
              />
            </Section>

            {/* Coming Soon sections */}
            <Section title="Auth Events" description="Coming soon">
              <p className="text-sm text-muted-foreground py-4">
                Detailed authentication events (login attempts, token refreshes, failed logins) will be available once the auth telemetry pipeline is wired.
              </p>
            </Section>

            <Section title="Rate Limit Events" description="Coming soon">
              <p className="text-sm text-muted-foreground py-4">
                Rate limit hit tracking will be available once the middleware emits structured events.
              </p>
            </Section>

            <Section title="Suspicious Activity" description="Coming soon">
              <p className="text-sm text-muted-foreground py-4">
                Suspicious login detection and bulk-download monitoring are planned for a future iteration.
              </p>
            </Section>

            <Section title="Audit Log" description="Coming soon">
              <p className="text-sm text-muted-foreground py-4">
                Admin and system action audit trails will be surfaced here once the AdminAuditLog model is fully populated.
              </p>
            </Section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
