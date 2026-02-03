/**
 * Reliability Page
 * Swiss Brutalist Tech Design
 * 
 * Goal: Monitor system health and performance
 * Shows latency metrics, error rates, uptime, and service status
 */

import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, getStatusVariant, PageHeader, Section, KPICard } from "@/components/shared";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

// Mock data - Replace with API calls
const mockStats = {
  uptime: 99.95,
  ttftP50: 245,
  ttftP95: 890,
  ttftP99: 1450,
  errorRate: 0.12,
  requestsPerMin: 156,
};

const mockLatencyTrend = [
  { time: "00:00", p50: 220, p95: 850, p99: 1400 },
  { time: "04:00", p50: 210, p95: 820, p99: 1350 },
  { time: "08:00", p50: 280, p95: 920, p99: 1550 },
  { time: "12:00", p50: 310, p95: 980, p99: 1620 },
  { time: "16:00", p50: 265, p95: 890, p99: 1480 },
  { time: "20:00", p50: 245, p95: 870, p99: 1420 },
  { time: "Now", p50: 245, p95: 890, p99: 1450 },
];

const mockErrorTrend = [
  { time: "00:00", rate: 0.08 },
  { time: "04:00", rate: 0.05 },
  { time: "08:00", rate: 0.15 },
  { time: "12:00", rate: 0.22 },
  { time: "16:00", rate: 0.18 },
  { time: "20:00", rate: 0.10 },
  { time: "Now", rate: 0.12 },
];

const mockServices = [
  { id: "s_001", name: "API Gateway", status: "Healthy", latency: 12, uptime: 99.99, lastCheck: "30s ago" },
  { id: "s_002", name: "RAG Pipeline", status: "Healthy", latency: 245, uptime: 99.95, lastCheck: "30s ago" },
  { id: "s_003", name: "Vector Database (Pinecone)", status: "Healthy", latency: 45, uptime: 99.98, lastCheck: "30s ago" },
  { id: "s_004", name: "PostgreSQL", status: "Healthy", latency: 8, uptime: 99.99, lastCheck: "30s ago" },
  { id: "s_005", name: "Redis Cache", status: "Healthy", latency: 2, uptime: 99.99, lastCheck: "30s ago" },
  { id: "s_006", name: "OpenAI API", status: "Healthy", latency: 312, uptime: 99.92, lastCheck: "30s ago" },
  { id: "s_007", name: "Gemini API", status: "Healthy", latency: 198, uptime: 99.94, lastCheck: "30s ago" },
  { id: "s_008", name: "File Storage (S3)", status: "Healthy", latency: 35, uptime: 99.99, lastCheck: "30s ago" },
  { id: "s_009", name: "BullMQ Workers", status: "Degraded", latency: 156, uptime: 99.85, lastCheck: "30s ago" },
];

const mockIncidents = [
  {
    id: "i_001",
    timestamp: "2025-01-27 08:15:00",
    service: "OpenAI API",
    type: "Rate Limit",
    duration: "5 min",
    impact: "Medium",
    resolved: true,
  },
  {
    id: "i_002",
    timestamp: "2025-01-26 14:30:00",
    service: "BullMQ Workers",
    type: "Queue Backlog",
    duration: "12 min",
    impact: "Low",
    resolved: true,
  },
  {
    id: "i_003",
    timestamp: "2025-01-25 22:45:00",
    service: "Pinecone",
    type: "Timeout",
    duration: "3 min",
    impact: "High",
    resolved: true,
  },
];

export default function Reliability() {
  const serviceColumns = [
    { key: "name", header: "Service" },
    {
      key: "status",
      header: "Status",
      render: (item: typeof mockServices[0]) => (
        <StatusBadge variant={getStatusVariant(item.status)}>
          {item.status}
        </StatusBadge>
      ),
    },
    {
      key: "latency",
      header: "Latency",
      className: "font-mono text-right",
      render: (item: typeof mockServices[0]) => `${item.latency}ms`,
    },
    {
      key: "uptime",
      header: "Uptime (30d)",
      className: "font-mono text-right",
      render: (item: typeof mockServices[0]) => `${item.uptime}%`,
    },
    { key: "lastCheck", header: "Last Check", className: "text-muted-foreground" },
  ];

  const incidentColumns = [
    { key: "timestamp", header: "Time", className: "font-mono text-sm text-muted-foreground whitespace-nowrap" },
    { key: "service", header: "Service" },
    {
      key: "type",
      header: "Type",
      render: (item: typeof mockIncidents[0]) => (
        <StatusBadge variant="warning">{item.type}</StatusBadge>
      ),
    },
    { key: "duration", header: "Duration", className: "font-mono" },
    {
      key: "impact",
      header: "Impact",
      render: (item: typeof mockIncidents[0]) => {
        const variant = item.impact === "High" ? "error" : item.impact === "Medium" ? "warning" : "neutral";
        return <StatusBadge variant={variant}>{item.impact}</StatusBadge>;
      },
    },
    {
      key: "resolved",
      header: "Status",
      render: (item: typeof mockIncidents[0]) => (
        <StatusBadge variant={item.resolved ? "success" : "error"}>
          {item.resolved ? "Resolved" : "Active"}
        </StatusBadge>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Reliability"
        description="System health, latency, and uptime monitoring"
      />

      <div className="p-8 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard
            label="Uptime (30d)"
            value={`${mockStats.uptime}%`}
          />
          <KPICard
            label="TTFT p50"
            value={`${mockStats.ttftP50}ms`}
          />
          <KPICard
            label="TTFT p95"
            value={`${mockStats.ttftP95}ms`}
          />
          <KPICard
            label="TTFT p99"
            value={`${mockStats.ttftP99}ms`}
          />
          <KPICard
            label="Error Rate"
            value={`${mockStats.errorRate}%`}
          />
          <KPICard
            label="Requests/min"
            value={mockStats.requestsPerMin}
          />
        </div>

        {/* Latency and Error Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Latency Percentiles (24h)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockLatencyTrend}>
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e5e5e5",
                      fontSize: "12px",
                    }}
                    formatter={(value: number, name: string) => [`${value}ms`, name.toUpperCase()]}
                  />
                  <Line type="monotone" dataKey="p50" stroke="#0a0a0a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="p95" stroke="#606060" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="p99" stroke="#a0a0a0" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-[#0a0a0a]" />
                <span>p50</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-[#606060]" />
                <span>p95</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-[#a0a0a0]" />
                <span>p99</span>
              </div>
            </div>
          </Section>

          <Section title="Error Rate (24h)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockErrorTrend}>
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 0.5]} />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e5e5e5",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [`${value}%`, "Error Rate"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="oklch(0.45 0.15 25)"
                    fill="oklch(0.45 0.15 25)"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>

        {/* Service Status */}
        <Section title="Service Status" description="Real-time health of all services">
          <DataTable
            columns={serviceColumns}
            data={mockServices}
            emptyMessage="No services"
          />
        </Section>

        {/* Recent Incidents */}
        <Section title="Recent Incidents" description="Last 7 days">
          <DataTable
            columns={incidentColumns}
            data={mockIncidents}
            emptyMessage="No incidents"
          />
        </Section>
      </div>
    </AdminLayout>
  );
}
