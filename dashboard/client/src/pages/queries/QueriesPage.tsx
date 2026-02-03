import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Search, Check, X } from "lucide-react";
import { AdminLayout, PageHeader } from "@/components/layout";
import { KpiCard, KpiCardRow } from "@/components/kpi";
import { DataTable, type Column } from "@/components/tables";
import { ChartContainer, ChartTooltip, chartColors, chartConfig } from "@/components/charts";
import { useQueries } from "@/hooks/useTelemetry";
import { formatNumber, formatPercent, formatDateTime } from "@/utils/format";
import type { TimeRange, QueryFeedItem } from "@/types/telemetry";

const domainOptions = [
  { value: "all", label: "All Domains" },
  { value: "finance", label: "Finance" },
  { value: "legal", label: "Legal" },
  { value: "general", label: "General" },
  { value: "other", label: "Other" },
];

export function QueriesPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");

  const { data, isLoading, error, refetch } = useQueries({
    range,
    search: search || undefined,
    domain: domainFilter === "all" ? undefined : domainFilter,
  });

  const queryColumns: Column<QueryFeedItem>[] = [
    {
      key: "ts",
      header: "Time",
      render: (row) => (
        <span className="text-[#737373] text-xs">{formatDateTime(row.ts)}</span>
      ),
    },
    {
      key: "userEmail",
      header: "User",
      render: (row) => row.userEmail || "-",
    },
    {
      key: "query",
      header: "Query",
      render: (row) => (
        <span className="truncate max-w-xs block" title={row.query}>
          {row.query}
        </span>
      ),
    },
    {
      key: "intent",
      header: "Intent",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#f5f5f5] rounded">
          {row.intent}
        </span>
      ),
    },
    {
      key: "domain",
      header: "Domain",
      render: (row) => (
        <span className="px-2 py-1 text-xs bg-[#181818] text-white rounded">
          {row.domain}
        </span>
      ),
    },
    {
      key: "keywords",
      header: "Keywords",
      render: (row) => (
        <div className="flex gap-1 flex-wrap max-w-[150px]">
          {row.keywords.slice(0, 2).map((kw, i) => (
            <span key={i} className="px-1.5 py-0.5 text-xs bg-[#fafafa] rounded">
              {kw}
            </span>
          ))}
          {row.keywords.length > 2 && (
            <span className="text-xs text-[#a3a3a3]">+{row.keywords.length - 2}</span>
          )}
        </div>
      ),
    },
    {
      key: "score",
      header: "Score",
      render: (row) => (
        <span className={row.score < 0.5 ? "text-[#525252] font-medium" : ""}>
          {row.score.toFixed(2)}
        </span>
      ),
    },
    {
      key: "fallbackUsed",
      header: "Fallback",
      render: (row) =>
        row.fallbackUsed ? (
          <Check className="w-4 h-4 text-[#525252]" />
        ) : (
          <X className="w-4 h-4 text-[#d4d4d4]" />
        ),
    },
    {
      key: "docScopeApplied",
      header: "Scoped",
      render: (row) =>
        row.docScopeApplied ? (
          <Check className="w-4 h-4 text-[#525252]" />
        ) : (
          <X className="w-4 h-4 text-[#d4d4d4]" />
        ),
    },
    {
      key: "chunksUsed",
      header: "Chunks",
      render: (row) => row.chunksUsed,
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Queries"
        subtitle="Query analytics and feed"
        range={range}
        onRangeChange={setRange}
      >
        {/* Domain Filter */}
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-[#e5e5e5] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#181818]"
        >
          {domainOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a3a3a3]" />
          <input
            type="text"
            placeholder="Search queries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border border-[#e5e5e5] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#181818] w-48"
          />
        </div>
      </PageHeader>

      {/* KPIs */}
      <KpiCardRow className="grid-cols-2 md:grid-cols-4">
        <KpiCard
          title="Queries"
          value={data ? formatNumber(data.kpis.queries) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Avg Top Score"
          value={data ? data.kpis.avgTopScore.toFixed(2) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Weak Evidence"
          value={data ? formatNumber(data.kpis.weakEvidenceCount) : "-"}
          loading={isLoading}
        />
        <KpiCard
          title="Weak Evidence Rate"
          value={data ? formatPercent(data.kpis.weakEvidenceRate) : "-"}
          loading={isLoading}
        />
      </KpiCardRow>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <ChartContainer
          title="Queries by Domain"
          loading={isLoading}
          empty={!data?.charts.byDomain.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.charts.byDomain} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis
                dataKey="day"
                stroke={chartColors.grid}
                tick={chartConfig.axis.tick}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke={chartColors.grid}
                tick={chartConfig.axis.tick}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend {...chartConfig.legend} />
              <Area type="monotone" dataKey="finance" name="Finance" stackId="1" stroke={chartColors.finance} fill={chartColors.finance} />
              <Area type="monotone" dataKey="legal" name="Legal" stackId="1" stroke={chartColors.legal} fill={chartColors.legal} />
              <Area type="monotone" dataKey="general" name="General" stackId="1" stroke={chartColors.general} fill={chartColors.general} />
              <Area type="monotone" dataKey="other" name="Other" stackId="1" stroke={chartColors.other} fill={chartColors.other} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Fallback Rate by Domain"
          loading={isLoading}
          empty={!data?.charts.fallbackRateByDomain.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.charts.fallbackRateByDomain} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis
                dataKey="domain"
                stroke={chartColors.grid}
                tick={chartConfig.axis.tick}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke={chartColors.grid}
                tick={chartConfig.axis.tick}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              />
              <Tooltip content={<ChartTooltip formatter={(v) => formatPercent(v)} />} />
              <Bar dataKey="value" name="Fallback Rate" fill={chartColors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Avg Score by Domain"
          loading={isLoading}
          empty={!data?.charts.avgScoreByDomain.length}
          error={error?.message}
          onRetry={refetch}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.charts.avgScoreByDomain} margin={chartConfig.margin}>
              <CartesianGrid {...chartConfig.grid} />
              <XAxis
                dataKey="domain"
                stroke={chartColors.grid}
                tick={chartConfig.axis.tick}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke={chartColors.grid}
                tick={chartConfig.axis.tick}
                tickLine={false}
                axisLine={false}
                domain={[0, 1]}
              />
              <Tooltip content={<ChartTooltip formatter={(v) => v.toFixed(2)} />} />
              <Bar dataKey="value" name="Avg Score" fill={chartColors.secondary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Query Feed Table */}
      <div>
        <h2 className="text-sm font-semibold text-[#181818] mb-4">Query Feed</h2>
        <DataTable
          columns={queryColumns}
          data={data?.feed ?? []}
          loading={isLoading}
          emptyMessage="No queries found"
        />
      </div>
    </AdminLayout>
  );
}

export default QueriesPage;
