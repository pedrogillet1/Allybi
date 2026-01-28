/**
 * Answer Quality Page
 * Swiss Brutalist Tech Design
 *
 * Goal: Measure how well Koda is answering
 * Shows evidence strength, weak evidence cases, fallback rates
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard } from "@/components/shared";
import { useQuality } from "@/hooks/useTelemetry";

export default function AnswerQuality() {
  const [range] = useState("7d");
  const { data, isLoading } = useQuality(range, 100);
  const items: any[] = data?.items ?? [];

  // Compute stats from loaded data
  const totalWeak = items.length;
  const fallbackCount = items.filter((i) => i.hadFallback).length;
  const avgTopScore = totalWeak > 0
    ? items.reduce((sum, i) => sum + (i.topScore ?? 0), 0) / totalWeak
    : 0;

  const weakEvidenceColumns = [
    {
      key: "timestamp",
      header: "Time",
      className: "font-mono text-sm text-muted-foreground whitespace-nowrap",
      render: (item: any) => new Date(item.timestamp).toLocaleString(),
    },
    { key: "userId", header: "User", className: "font-mono text-muted-foreground text-xs" },
    {
      key: "query",
      header: "Query",
      render: (item: any) => (
        <span className="max-w-xs truncate block">{item.query}</span>
      ),
    },
    {
      key: "topScore",
      header: "Top Score",
      className: "font-mono text-right",
      render: (item: any) => (
        <span className="text-[oklch(0.45_0.15_25)]">{(item.topScore ?? 0).toFixed(2)}</span>
      ),
    },
    { key: "chunks", header: "Chunks", className: "font-mono text-right" },
    {
      key: "failureCategory",
      header: "Failure",
      render: (item: any) => item.failureCategory ? (
        <StatusBadge variant="error">{item.failureCategory}</StatusBadge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    },
    {
      key: "evidenceAction",
      header: "Gate Action",
      render: (item: any) => item.evidenceAction ? (
        <StatusBadge variant="warning">{item.evidenceAction}</StatusBadge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    },
    {
      key: "hadFallback",
      header: "Fallback",
      render: (item: any) => (
        <StatusBadge variant={item.hadFallback ? "error" : "neutral"}>
          {item.hadFallback ? "Yes" : "No"}
        </StatusBadge>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Answer Quality"
        description="Measure how well Koda is answering user queries"
      />

      <div className="p-8 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard label={`Weak Evidence Cases (${range})`} value={totalWeak} />
          <KPICard label="Fallback Count" value={fallbackCount} />
          <KPICard label="Avg Top Score" value={avgTopScore.toFixed(2)} />
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <Section
            title="Weak Evidence Cases"
            description="Queries with inadequate evidence, fallback, or poor quality"
          >
            <DataTable
              columns={weakEvidenceColumns}
              data={items}
              emptyMessage="No weak evidence cases"
            />
          </Section>
        )}
      </div>
    </AdminLayout>
  );
}
