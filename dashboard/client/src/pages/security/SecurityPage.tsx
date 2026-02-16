import { useState, useMemo } from "react";
import { AdminLayout, PageHeader } from "@/components/layout";
import { KpiCard, KpiCardRow } from "@/components/kpi";
import { DataTable, type Column } from "@/components/tables";
import { useSecurity } from "@/hooks/useTelemetry";
import { formatNumber, formatDateTime } from "@/utils/format";
import type { TimeRange } from "@/types/telemetry";

type ActiveTab = "events" | "audit";

interface SecurityEventItem {
  at: string;
  userId: string | null;
  action: string;
  resource: string | null;
  status: string;
  ipAddress: string | null;
  details: string | null;
}

interface AuditItem {
  ts: string;
  admin: string;
  action: string;
  target: string;
}

export function SecurityPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [activeTab, setActiveTab] = useState<ActiveTab>("events");

  const { data, isLoading } = useSecurity({ range });
  const google = data?.google;

  // Extract counters from backend
  const counters = data?.counters as {
    privacyBlocks?: number;
    redactions?: number;
    failedAuth?: number;
    accessDenied?: number;
  } | undefined;

  // Extract KPIs (may be provided separately or derived from counters)
  const kpis = data?.kpis as {
    totalUsers?: number;
    activeUsers?: number;
    authFailures?: number;
    rateLimitTriggers?: number;
  } | undefined;

  // Auth events from backend (may be in authEvents array or items)
  const securityEvents = useMemo(() => {
    // Backend returns authEvents array
    const events = data?.authEvents as SecurityEventItem[] | undefined;
    return events ?? [];
  }, [data?.authEvents]);

  // Admin audit events
  const auditEvents = useMemo(() => {
    const audit = data?.adminAudit as AuditItem[] | undefined;
    return audit ?? [];
  }, [data?.adminAudit]);

  const eventColumns: Column<SecurityEventItem>[] = [
    {
      key: "at",
      header: "Time",
      render: (row) => (
        <span className="text-[#737373] text-xs">{formatDateTime(row.at)}</span>
      ),
    },
    {
      key: "userId",
      header: "User ID",
      render: (row) => (
        <span className="font-mono text-xs truncate max-w-[120px] block" title={row.userId || undefined}>
          {row.userId?.slice(0, 12) || "-"}...
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#f5f5f5] rounded">
          {row.action}
        </span>
      ),
    },
    {
      key: "resource",
      header: "Resource",
      render: (row) => (
        <span className="truncate max-w-xs block" title={row.resource || undefined}>
          {row.resource || "-"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className={`px-2 py-1 text-xs rounded ${
          row.status === "success" ? "bg-[#181818] text-white" : "bg-[#e5e5e5] text-[#525252]"
        }`}>
          {row.status}
        </span>
      ),
    },
    {
      key: "ipAddress",
      header: "IP",
      render: (row) => (
        <span className="font-mono text-xs">{row.ipAddress?.slice(0, 12) || "-"}...</span>
      ),
    },
  ];

  const auditColumns: Column<AuditItem>[] = [
    {
      key: "ts",
      header: "Time",
      render: (row) => (
        <span className="text-[#737373] text-xs">{formatDateTime(row.ts)}</span>
      ),
    },
    {
      key: "admin",
      header: "Admin",
      render: (row) => row.admin || "-",
    },
    {
      key: "action",
      header: "Action",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#181818] text-white rounded">
          {row.action}
        </span>
      ),
    },
    {
      key: "target",
      header: "Target",
      render: (row) => row.target || "-",
    },
  ];

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "events", label: `Security Events (${securityEvents.length})` },
    { key: "audit", label: `Admin Audit (${auditEvents.length})` },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Security"
        subtitle="Security events, access control, and admin audit"
        range={range}
        onRangeChange={setRange}
      />

      {/* KPIs */}
      <KpiCardRow className="grid-cols-2 md:grid-cols-5">
        <KpiCard
          title="Failed Auth"
          value={counters ? formatNumber(counters.failedAuth ?? kpis?.authFailures ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Access Denied"
          value={counters ? formatNumber(counters.accessDenied ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Privacy Blocks"
          value={counters ? formatNumber(counters.privacyBlocks ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Redactions"
          value={counters ? formatNumber(counters.redactions ?? 0) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Cloud SQL Connected"
          value={google?.cloudSql?.connected ? "Yes" : "No"}
          loading={isLoading}
        />
      </KpiCardRow>

      {/* Tabs */}
      <div className="mb-4">
        <div className="flex gap-1 bg-[#f5f5f5] p-1 rounded-md w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                activeTab === tab.key
                  ? "bg-[#181818] text-white"
                  : "text-[#525252] hover:text-[#181818]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tables */}
      {activeTab === "events" && (
        <DataTable
          columns={eventColumns}
          data={securityEvents}
          loading={isLoading}
          emptyMessage="No security events found"
        />
      )}

      {activeTab === "audit" && (
        <DataTable
          columns={auditColumns}
          data={auditEvents}
          loading={isLoading}
          emptyMessage="No admin audit events found"
        />
      )}
    </AdminLayout>
  );
}

export default SecurityPage;
