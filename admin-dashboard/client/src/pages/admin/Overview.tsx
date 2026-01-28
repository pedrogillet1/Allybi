/**
 * Overview Page (AdminDashboard)
 * Swiss Brutalist Tech Design
 *
 * Goal: Answer in 10 seconds:
 * - "Is Koda healthy today?"
 * - "Are users active?"
 * - "Is cost stable?"
 * - "Is answer quality stable?"
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { KPICard, DataTable, StatusBadge, PageHeader, MiniChart, Section } from "@/components/shared";
import { useLocation } from "wouter";
import { useOverview, useTimeseries, useErrors, useLLMProviders } from "@/hooks/useTelemetry";

export default function Overview() {
  const [, setLocation] = useLocation();
  const [range] = useState("7d");

  const { data: overview, isLoading } = useOverview(range);
  const { data: dauTs } = useTimeseries("dau", range);
  const { data: tokensTs } = useTimeseries("tokens", range);
  const { data: weakTs } = useTimeseries("weakEvidence", range);
  const { data: errorsData } = useErrors(range, 20);
  const { data: providersData } = useLLMProviders(range);
  const providers: any[] = providersData?.items ?? [];

  const dauTrend = dauTs?.points?.map((p: any) => ({ value: p.value })) ?? [];
  const tokensTrend = tokensTs?.points?.map((p: any) => ({ value: p.value })) ?? [];
  const weakTrend = weakTs?.points?.map((p: any) => ({ value: p.value })) ?? [];
  const errorItems: any[] = errorsData?.items ?? [];

  const errorColumns = [
    { key: "service", header: "Service" },
    { key: "errorType", header: "Type", className: "font-mono" },
    { key: "errorMessage", header: "Error", render: (item: any) => (
      <StatusBadge variant="error">{item.errorMessage}</StatusBadge>
    )},
    { key: "severity", header: "Severity", className: "text-muted-foreground" },
    { key: "createdAt", header: "Time", className: "text-muted-foreground", render: (item: any) => new Date(item.createdAt).toLocaleString() },
  ];

  if (isLoading) {
    return (
      <AdminLayout>
        <PageHeader title="Overview" description="System health and usage snapshot" />
        <div className="p-8 text-muted-foreground">Loading...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Overview"
        description="System health and usage snapshot"
      />

      <div className="p-8 space-y-8">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard
            label="Active Users"
            value={(overview?.activeUsers ?? 0).toLocaleString()}
          />
          <KPICard
            label="Messages"
            value={(overview?.totalMessages ?? 0).toLocaleString()}
          />
          <KPICard
            label="Documents"
            value={overview?.totalDocuments ?? 0}
          />
          <KPICard
            label="LLM Cost"
            value={`$${(overview?.totalCost ?? 0).toFixed(2)}`}
          />
          <KPICard
            label="Weak Evidence Rate"
            value={`${overview?.weakEvidenceRate ?? 0}%`}
          />
          <KPICard
            label="TTFT (avg)"
            value={`${overview?.ttftP50 ?? 0}ms`}
          />
        </div>

        {/* Trend Charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Section title={`DAU (${range})`}>
            {dauTrend.length > 0 ? (
              <MiniChart data={dauTrend} type="area" height={80} showTooltip />
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </Section>
          <Section title={`LLM Tokens/Day (${range})`}>
            {tokensTrend.length > 0 ? (
              <MiniChart data={tokensTrend} type="bar" height={80} showTooltip />
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </Section>
          <Section title={`Weak Evidence Rate (${range})`}>
            {weakTrend.length > 0 ? (
              <MiniChart data={weakTrend} type="line" color="oklch(0.45 0.15 25)" height={80} showTooltip />
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </Section>
        </div>

        {/* Active API Providers */}
        {providers.length > 0 && (
          <Section title="Active API Providers" description={`LLM APIs used in the last ${range}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {providers.map((p: any) => (
                <div
                  key={p.provider}
                  className="border border-border p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium text-sm uppercase tracking-wider">{p.provider}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {p.totalCalls.toLocaleString()} calls
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="block text-muted-foreground uppercase tracking-wider">Cost</span>
                      <span className="font-mono font-medium">${p.totalCost.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground uppercase tracking-wider">Avg Latency</span>
                      <span className="font-mono font-medium">{p.avgLatencyMs}ms</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(p.models ?? []).map((m: any) => (
                      <span key={m.model} className="text-xs bg-muted px-2 py-0.5 font-mono">{m.model}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Recent Errors */}
        <Section title="Recent Errors" description={`Last ${range}`}>
          <DataTable
            columns={errorColumns}
            data={errorItems}
            onRowClick={() => setLocation("/admin/llm")}
            emptyMessage="No errors"
          />
        </Section>
      </div>
    </AdminLayout>
  );
}
