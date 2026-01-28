/**
 * LLM / Cost Page
 * Swiss Brutalist Tech Design
 *
 * Goal: Understand LLM usage, costs, and performance
 * Shows provider/model switcher, per-provider stats, model usage, and errors
 */

import { useState, useMemo } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { DataTable, StatusBadge, PageHeader, Section, KPICard, TabNav } from "@/components/shared";
import { useLLM, useLLMProviders, useErrors } from "@/hooks/useTelemetry";

export default function LLMCost() {
  const [range] = useState("7d");
  const [activeProvider, setActiveProvider] = useState("all");
  const [activeModel, setActiveModel] = useState<string | undefined>(undefined);

  const { data: providersData, isLoading: providersLoading } = useLLMProviders(range);
  const providers: any[] = providersData?.items ?? [];

  // Determine filter params from selection
  const providerFilter = activeProvider === "all" ? undefined : activeProvider;
  const modelFilter = activeModel;

  const { data: llmData, isLoading: llmLoading } = useLLM(range, 100, providerFilter, modelFilter);
  const { data: errorsData } = useErrors(range, 20);

  const llmItems: any[] = llmData?.items ?? [];
  const summary = llmData?.summary ?? { totalTokens: 0, totalCost: 0, avgLatencyMs: 0, totalCalls: 0 };
  const errorItems: any[] = errorsData?.items ?? [];

  // Build provider tabs
  const providerTabs = useMemo(() => {
    const tabs = [{ id: "all", label: "All Providers" }];
    for (const p of providers) {
      tabs.push({ id: p.provider, label: p.provider });
    }
    return tabs;
  }, [providers]);

  // Models for currently selected provider
  const currentModels = useMemo(() => {
    if (activeProvider === "all") {
      return providers.flatMap((p: any) => p.models ?? []);
    }
    const p = providers.find((p: any) => p.provider === activeProvider);
    return p?.models ?? [];
  }, [activeProvider, providers]);

  // Model sub-tabs
  const modelTabs = useMemo(() => {
    const tabs = [{ id: "__all__", label: "All Models" }];
    for (const m of currentModels) {
      if (!tabs.find((t) => t.id === m.model)) {
        tabs.push({ id: m.model, label: m.model });
      }
    }
    return tabs;
  }, [currentModels]);

  // Error rate
  const failedCount = llmItems.filter((i) => !i.success).length;
  const errorRate = llmItems.length > 0 ? (failedCount / llmItems.length) * 100 : 0;

  const modelColumns = [
    { key: "provider", header: "Provider" },
    { key: "model", header: "Model", className: "font-mono" },
    {
      key: "totalTokens",
      header: "Tokens",
      className: "font-mono text-right",
      render: (item: any) => (item.totalTokens ?? 0).toLocaleString(),
    },
    {
      key: "totalCost",
      header: "Cost",
      className: "font-mono text-right",
      render: (item: any) => `$${(item.totalCost ?? 0).toFixed(4)}`,
    },
    {
      key: "requestType",
      header: "Type",
      render: (item: any) => (
        <StatusBadge variant="neutral">{item.requestType}</StatusBadge>
      ),
    },
    {
      key: "latencyMs",
      header: "Latency",
      className: "font-mono text-right",
      render: (item: any) => item.latencyMs != null ? `${item.latencyMs}ms` : "\u2014",
    },
    {
      key: "success",
      header: "Status",
      render: (item: any) => (
        <StatusBadge variant={item.success ? "success" : "error"}>
          {item.success ? "OK" : "Error"}
        </StatusBadge>
      ),
    },
    {
      key: "createdAt",
      header: "Time",
      className: "font-mono text-sm text-muted-foreground",
      render: (item: any) => new Date(item.createdAt).toLocaleString(),
    },
  ];

  const errorColumns = [
    {
      key: "createdAt",
      header: "Time",
      className: "font-mono text-sm text-muted-foreground whitespace-nowrap",
      render: (item: any) => new Date(item.createdAt).toLocaleString(),
    },
    { key: "service", header: "Service" },
    { key: "errorType", header: "Type", className: "font-mono" },
    {
      key: "errorMessage",
      header: "Error",
      render: (item: any) => (
        <StatusBadge variant="error">{item.errorMessage}</StatusBadge>
      ),
    },
    { key: "severity", header: "Severity" },
  ];

  const isLoading = providersLoading || llmLoading;

  return (
    <AdminLayout>
      <PageHeader
        title="LLM / Cost"
        description="LLM usage, costs, and performance metrics"
      />

      <div className="p-8 space-y-6">
        {/* Provider Cards */}
        {providers.length > 0 && (
          <Section title="API Providers" description={`Active in the last ${range}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {providers.map((p: any) => (
                <button
                  key={p.provider}
                  onClick={() => {
                    setActiveProvider(p.provider);
                    setActiveModel(undefined);
                  }}
                  className={`text-left border p-4 transition-colors ${
                    activeProvider === p.provider
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-foreground/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium text-sm uppercase tracking-wider">{p.provider}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {p.models.length} model{p.models.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="block text-muted-foreground uppercase tracking-wider">Cost</span>
                      <span className="font-mono font-medium">${p.totalCost.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground uppercase tracking-wider">Tokens</span>
                      <span className="font-mono font-medium">{p.totalTokens.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground uppercase tracking-wider">Calls</span>
                      <span className="font-mono font-medium">{p.totalCalls.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground font-mono">
                    {p.models.map((m: any) => m.model).join(", ")}
                  </div>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Provider Tabs */}
        {providerTabs.length > 1 && (
          <TabNav
            tabs={providerTabs}
            activeTab={activeProvider}
            onTabChange={(id) => {
              setActiveProvider(id);
              setActiveModel(undefined);
            }}
          />
        )}

        {/* Model Sub-tabs */}
        {modelTabs.length > 2 && (
          <div className="flex gap-2 flex-wrap">
            {modelTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveModel(t.id === "__all__" ? undefined : t.id)}
                className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
                  (activeModel ?? "__all__") === t.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/40"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard
            label={`Cost (${range})`}
            value={`$${summary.totalCost.toFixed(2)}`}
          />
          <KPICard
            label="Total Tokens"
            value={summary.totalTokens.toLocaleString()}
          />
          <KPICard
            label="Total Calls"
            value={summary.totalCalls.toLocaleString()}
          />
          <KPICard
            label="Avg Latency"
            value={`${summary.avgLatencyMs}ms`}
          />
          <KPICard
            label="Error Rate"
            value={`${errorRate.toFixed(1)}%`}
          />
          <KPICard
            label="Recent Errors"
            value={errorItems.length}
          />
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            {/* Call Log */}
            <Section
              title="LLM Calls"
              description={
                activeProvider !== "all"
                  ? `Filtered: ${activeProvider}${activeModel ? ` / ${activeModel}` : ""}`
                  : "Recent token usage by model"
              }
            >
              <DataTable
                columns={modelColumns}
                data={llmItems}
                emptyMessage="No LLM usage data"
              />
              <div className="mt-4 pt-4 border-t border-border flex justify-between text-sm">
                <span className="font-medium">
                  Summary ({range})
                  {activeProvider !== "all" && (
                    <span className="text-muted-foreground font-normal ml-2">
                      {activeProvider}{activeModel ? ` / ${activeModel}` : ""}
                    </span>
                  )}
                </span>
                <span className="font-mono">
                  {summary.totalTokens.toLocaleString()} tokens |{" "}
                  ${summary.totalCost.toFixed(2)} |{" "}
                  {summary.totalCalls.toLocaleString()} calls
                </span>
              </div>
            </Section>

            {/* Error Log */}
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
