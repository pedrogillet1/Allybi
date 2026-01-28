/**
 * Reliability Page
 * Swiss Brutalist Tech Design
 *
 * Goal: Monitor system health and performance
 * Shows latency metrics, error rates, and error feed
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard } from "@/components/shared";
import { useOverview, useErrors } from "@/hooks/useTelemetry";

export default function Reliability() {
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
        <StatusBadge variant="warning">{item.errorType}</StatusBadge>
      ),
    },
    {
      key: "errorMessage",
      header: "Error",
      render: (item: any) => (
        <span className="max-w-xs truncate block text-sm">{item.errorMessage}</span>
      ),
    },
    {
      key: "severity",
      header: "Severity",
      render: (item: any) => {
        const variant = item.severity === "critical" ? "error" :
          item.severity === "warning" ? "warning" : "neutral";
        return <StatusBadge variant={variant}>{item.severity}</StatusBadge>;
      },
    },
    {
      key: "resolved",
      header: "Resolved",
      render: (item: any) => (
        <StatusBadge variant={item.resolved ? "success" : "error"}>
          {item.resolved ? "Yes" : "No"}
        </StatusBadge>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Reliability"
        description="System health, latency, and error monitoring"
      />

      <div className="p-8 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard
            label="Avg Response Time"
            value={`${overview?.ttftP50 ?? 0}ms`}
          />
          <KPICard
            label="Avg LLM Latency"
            value={`${overview?.avgLatencyMs ?? 0}ms`}
          />
          <KPICard
            label="Error Rate"
            value={`${overview?.errorRate ?? 0}%`}
          />
          <KPICard
            label={`Error Count (${range})`}
            value={overview?.errorCount ?? 0}
          />
          <KPICard
            label="Total Messages"
            value={(overview?.totalMessages ?? 0).toLocaleString()}
          />
          <KPICard
            label="Active Users"
            value={(overview?.activeUsers ?? 0).toLocaleString()}
          />
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            {/* Error Feed */}
            <Section title="Recent Errors" description={`Errors in the last ${range}`}>
              <DataTable
                columns={errorColumns}
                data={errorItems}
                emptyMessage="No errors"
              />
            </Section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
