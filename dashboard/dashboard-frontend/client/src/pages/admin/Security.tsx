/**
 * Security Page
 * Swiss Brutalist Tech Design
 * 
 * Goal: Monitor security events and access patterns
 * Shows auth events, rate limiting, suspicious activity, and audit logs
 */

import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard } from "@/components/shared";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Mock data - Replace with API calls
const mockStats = {
  loginAttemptsToday: 1234,
  failedLogins: 23,
  rateLimitHits: 156,
  suspiciousEvents: 3,
  activeSessionsNow: 89,
  uniqueIPsToday: 456,
};

const mockAuthEvents = [
  {
    id: "ae_001",
    timestamp: "2025-01-27 14:32:15",
    userId: "u_***42",
    event: "login_success",
    ip: "192.168.1.***",
    userAgent: "Chrome/120 (Windows)",
    location: "New York, US",
  },
  {
    id: "ae_002",
    timestamp: "2025-01-27 14:28:45",
    userId: "u_***17",
    event: "login_success",
    ip: "10.0.0.***",
    userAgent: "Safari/17 (macOS)",
    location: "London, UK",
  },
  {
    id: "ae_003",
    timestamp: "2025-01-27 14:25:12",
    userId: "u_***89",
    event: "login_failed",
    ip: "172.16.0.***",
    userAgent: "Firefox/121 (Linux)",
    location: "Berlin, DE",
  },
  {
    id: "ae_004",
    timestamp: "2025-01-27 14:20:33",
    userId: "u_***33",
    event: "token_refresh",
    ip: "192.168.2.***",
    userAgent: "Chrome/120 (Windows)",
    location: "Paris, FR",
  },
  {
    id: "ae_005",
    timestamp: "2025-01-27 14:15:08",
    userId: "u_***56",
    event: "logout",
    ip: "10.1.1.***",
    userAgent: "Edge/120 (Windows)",
    location: "Tokyo, JP",
  },
];

const mockRateLimitEvents = [
  {
    id: "rl_001",
    timestamp: "2025-01-27 14:30:00",
    userId: "u_***78",
    endpoint: "/api/query",
    limit: "100/min",
    current: 156,
    action: "throttled",
  },
  {
    id: "rl_002",
    timestamp: "2025-01-27 14:25:00",
    userId: "u_***12",
    endpoint: "/api/upload",
    limit: "10/min",
    current: 15,
    action: "throttled",
  },
  {
    id: "rl_003",
    timestamp: "2025-01-27 14:20:00",
    userId: "u_***99",
    endpoint: "/api/query",
    limit: "100/min",
    current: 112,
    action: "throttled",
  },
];

const mockSuspiciousEvents = [
  {
    id: "se_001",
    timestamp: "2025-01-27 12:45:00",
    userId: "u_***45",
    type: "multiple_failed_logins",
    details: "5 failed login attempts in 2 minutes",
    severity: "Medium",
    action: "Account locked temporarily",
  },
  {
    id: "se_002",
    timestamp: "2025-01-27 10:30:00",
    userId: "u_***67",
    type: "unusual_location",
    details: "Login from new country (Russia)",
    severity: "High",
    action: "Verification email sent",
  },
  {
    id: "se_003",
    timestamp: "2025-01-26 22:15:00",
    userId: "u_***23",
    type: "bulk_download",
    details: "Downloaded 50 files in 5 minutes",
    severity: "Low",
    action: "Logged for review",
  },
];

const mockAuditLog = [
  {
    id: "al_001",
    timestamp: "2025-01-27 14:32:15",
    actor: "admin@koda.ai",
    action: "user.update",
    target: "u_***42",
    details: "Updated subscription tier to Pro",
    ip: "10.0.0.***",
  },
  {
    id: "al_002",
    timestamp: "2025-01-27 13:45:00",
    actor: "system",
    action: "file.delete",
    target: "f_***89",
    details: "Auto-deleted expired file",
    ip: "internal",
  },
  {
    id: "al_003",
    timestamp: "2025-01-27 12:30:00",
    actor: "admin@koda.ai",
    action: "config.update",
    target: "rate_limits",
    details: "Increased query limit to 150/min",
    ip: "10.0.0.***",
  },
];

const mockLoginsByHour = [
  { hour: "00", success: 45, failed: 2 },
  { hour: "04", success: 23, failed: 1 },
  { hour: "08", success: 156, failed: 8 },
  { hour: "12", success: 234, failed: 12 },
  { hour: "16", success: 198, failed: 6 },
  { hour: "20", success: 145, failed: 4 },
];

export default function Security() {
  const authColumns = [
    { key: "timestamp", header: "Time", className: "font-mono text-sm text-muted-foreground whitespace-nowrap" },
    { key: "userId", header: "User", className: "font-mono" },
    {
      key: "event",
      header: "Event",
      render: (item: typeof mockAuthEvents[0]) => {
        const variant = item.event.includes("success") ? "success" :
          item.event.includes("failed") ? "error" : "neutral";
        return <StatusBadge variant={variant}>{item.event}</StatusBadge>;
      },
    },
    { key: "ip", header: "IP", className: "font-mono text-sm" },
    { key: "location", header: "Location" },
    {
      key: "userAgent",
      header: "User Agent",
      render: (item: typeof mockAuthEvents[0]) => (
        <span className="text-sm text-muted-foreground max-w-32 truncate block">
          {item.userAgent}
        </span>
      ),
    },
  ];

  const rateLimitColumns = [
    { key: "timestamp", header: "Time", className: "font-mono text-sm text-muted-foreground whitespace-nowrap" },
    { key: "userId", header: "User", className: "font-mono" },
    { key: "endpoint", header: "Endpoint", className: "font-mono text-sm" },
    { key: "limit", header: "Limit", className: "font-mono" },
    {
      key: "current",
      header: "Current",
      className: "font-mono text-right",
      render: (item: typeof mockRateLimitEvents[0]) => (
        <span className="text-[oklch(0.45_0.15_25)]">{item.current}</span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (item: typeof mockRateLimitEvents[0]) => (
        <StatusBadge variant="warning">{item.action}</StatusBadge>
      ),
    },
  ];

  const suspiciousColumns = [
    { key: "timestamp", header: "Time", className: "font-mono text-sm text-muted-foreground whitespace-nowrap" },
    { key: "userId", header: "User", className: "font-mono" },
    {
      key: "type",
      header: "Type",
      render: (item: typeof mockSuspiciousEvents[0]) => (
        <StatusBadge variant="error">{item.type}</StatusBadge>
      ),
    },
    { key: "details", header: "Details" },
    {
      key: "severity",
      header: "Severity",
      render: (item: typeof mockSuspiciousEvents[0]) => {
        const variant = item.severity === "High" ? "error" :
          item.severity === "Medium" ? "warning" : "neutral";
        return <StatusBadge variant={variant}>{item.severity}</StatusBadge>;
      },
    },
    { key: "action", header: "Action Taken", className: "text-sm" },
  ];

  const auditColumns = [
    { key: "timestamp", header: "Time", className: "font-mono text-sm text-muted-foreground whitespace-nowrap" },
    { key: "actor", header: "Actor", className: "font-mono text-sm" },
    {
      key: "action",
      header: "Action",
      render: (item: typeof mockAuditLog[0]) => (
        <StatusBadge variant="neutral">{item.action}</StatusBadge>
      ),
    },
    { key: "target", header: "Target", className: "font-mono text-sm" },
    { key: "details", header: "Details" },
    { key: "ip", header: "IP", className: "font-mono text-sm text-muted-foreground" },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Security"
        description="Authentication, rate limiting, and audit logs"
      />

      <div className="p-8 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard
            label="Login Attempts Today"
            value={mockStats.loginAttemptsToday.toLocaleString()}
          />
          <KPICard
            label="Failed Logins"
            value={mockStats.failedLogins}
          />
          <KPICard
            label="Rate Limit Hits"
            value={mockStats.rateLimitHits}
          />
          <KPICard
            label="Suspicious Events"
            value={mockStats.suspiciousEvents}
          />
          <KPICard
            label="Active Sessions"
            value={mockStats.activeSessionsNow}
          />
          <KPICard
            label="Unique IPs Today"
            value={mockStats.uniqueIPsToday}
          />
        </div>

        {/* Login Chart */}
        <Section title="Logins by Hour (24h)">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockLoginsByHour}>
                <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid #e5e5e5",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="success" fill="#0a0a0a" name="Success" />
                <Bar dataKey="failed" fill="#a0a0a0" name="Failed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* Auth Events */}
        <Section title="Recent Auth Events" description="Last 100 authentication events">
          <DataTable
            columns={authColumns}
            data={mockAuthEvents}
            emptyMessage="No auth events"
          />
        </Section>

        {/* Rate Limit Events */}
        <Section title="Rate Limit Events" description="Throttled requests">
          <DataTable
            columns={rateLimitColumns}
            data={mockRateLimitEvents}
            emptyMessage="No rate limit events"
          />
        </Section>

        {/* Suspicious Events */}
        <Section title="Suspicious Activity" description="Flagged security events">
          <DataTable
            columns={suspiciousColumns}
            data={mockSuspiciousEvents}
            emptyMessage="No suspicious events"
          />
        </Section>

        {/* Audit Log */}
        <Section title="Audit Log" description="Admin and system actions">
          <DataTable
            columns={auditColumns}
            data={mockAuditLog}
            emptyMessage="No audit entries"
          />
        </Section>
      </div>
    </AdminLayout>
  );
}
