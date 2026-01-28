/**
 * Queries Page
 * Swiss Brutalist Tech Design
 *
 * Goal: Understand what users are asking, which domains are dominant
 * Shows query feed and domain analytics
 */

import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useQueries } from "@/hooks/useTelemetry";

export default function Queries() {
  const [searchQuery, setSearchQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [range] = useState("7d");

  const domainParam = domainFilter === "all" ? undefined : domainFilter;
  const { data, isLoading } = useQueries(range, 100, domainParam);
  const queries: any[] = data?.items ?? [];

  const filteredQueries = queries.filter((q) =>
    q.query.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Compute simple stats from loaded data
  const totalQueries = queries.length;
  const avgScore = totalQueries > 0
    ? queries.reduce((sum, q) => sum + (q.topScore ?? 0), 0) / totalQueries
    : 0;
  const weakCount = queries.filter((q) => !q.adequate).length;
  const weakRate = totalQueries > 0 ? (weakCount / totalQueries) * 100 : 0;

  const columns = [
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
      key: "intent",
      header: "Intent",
      render: (item: any) => (
        <StatusBadge variant="neutral">{item.intent}</StatusBadge>
      ),
    },
    {
      key: "domain",
      header: "Domain",
      render: (item: any) => (
        <StatusBadge variant="neutral">{item.domain}</StatusBadge>
      ),
    },
    {
      key: "keywords",
      header: "Keywords",
      render: (item: any) => (
        <div className="flex gap-1 flex-wrap max-w-32">
          {(item.keywords ?? []).slice(0, 2).map((kw: string) => (
            <span key={kw} className="text-xs bg-muted px-1.5 py-0.5">{kw}</span>
          ))}
          {(item.keywords ?? []).length > 2 && (
            <span className="text-xs text-muted-foreground">+{item.keywords.length - 2}</span>
          )}
        </div>
      ),
    },
    {
      key: "adequate",
      header: "Result",
      render: (item: any) => {
        const variant = item.hadFallback ? "error" : item.adequate ? "success" : "warning";
        const label = item.hadFallback ? "fallback" : item.adequate ? "answered" : "weak";
        return <StatusBadge variant={variant}>{label}</StatusBadge>;
      },
    },
    {
      key: "topScore",
      header: "Score",
      className: "font-mono text-right",
      render: (item: any) => (
        <span className={item.topScore < 0.5 ? "text-[oklch(0.45_0.15_25)]" : ""}>
          {(item.topScore ?? 0).toFixed(2)}
        </span>
      ),
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Queries"
        description="Query analytics, domains, and keywords"
        actions={
          <div className="flex items-center gap-3">
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="h-9 px-3 text-sm border border-border bg-background"
            >
              <option value="all">All Domains</option>
              <option value="finance">Finance</option>
              <option value="legal">Legal</option>
              <option value="general">General</option>
              <option value="technical">Technical</option>
              <option value="medical">Medical</option>
            </select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search queries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard label={`Queries (${range})`} value={totalQueries.toLocaleString()} />
          <KPICard label="Avg Top Score" value={avgScore.toFixed(2)} />
          <KPICard label="Weak Evidence" value={weakCount} />
          <KPICard label="Weak Evidence Rate" value={`${weakRate.toFixed(1)}%`} />
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            <Section title="Query Feed" description="Recent queries with analytics">
              <DataTable
                columns={columns}
                data={filteredQueries}
                emptyMessage="No queries found"
              />
            </Section>

            <div className="text-sm text-muted-foreground">
              Showing {filteredQueries.length} of {queries.length} queries
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
