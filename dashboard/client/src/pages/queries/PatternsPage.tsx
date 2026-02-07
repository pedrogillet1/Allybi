/**
 * PatternsPage
 * Shows keyword trends, entity distribution, and question patterns
 */

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Sparkles, Tag, PieChart as PieChartIcon } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePatterns } from "@/hooks/useAdminApi";
import { chartColors } from "@/components/charts";
import type { TimeRange } from "@/types/admin";

const COLORS = [
  chartColors.primary,
  chartColors.secondary,
  chartColors.tertiary,
  chartColors.quaternary,
  "#f59e0b", "#10b981", "#6366f1", "#ec4899", "#8b5cf6", "#14b8a6"
];

function TrendIndicator({ trend }: { trend: number }) {
  if (trend > 5) {
    return (
      <span className="flex items-center gap-1 text-green-600 text-xs">
        <TrendingUp className="w-3 h-3" />
        +{trend}%
      </span>
    );
  }
  if (trend < -5) {
    return (
      <span className="flex items-center gap-1 text-red-600 text-xs">
        <TrendingDown className="w-3 h-3" />
        {trend}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-gray-400 text-xs">
      <Minus className="w-3 h-3" />
      {trend}%
    </span>
  );
}

export function PatternsPage() {
  const [range] = useState<TimeRange>("7d");
  const { data, isLoading, error } = usePatterns({ range });

  return (
    <AdminLayout>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Query Patterns</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Keyword trends, entities, and question analysis
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Failed to load patterns: {error.message}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Top Keywords */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Tag className="w-5 h-5 text-gray-400" />
                Top Keywords ({data.topKeywords.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.topKeywords.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No keywords extracted yet. Enable keyword extraction in the pipeline.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Keywords list */}
                  <div className="space-y-2">
                    {data.topKeywords.slice(0, 10).map((kw, i) => (
                      <div
                        key={kw.keyword}
                        className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-400 w-5">{i + 1}</span>
                          <span className="font-medium">{kw.keyword}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-gray-600">{kw.count} queries</span>
                          <TrendIndicator trend={kw.trend} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Keywords chart */}
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.topKeywords.slice(0, 10)}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="keyword" type="category" width={70} />
                        <Tooltip />
                        <Bar dataKey="count" fill={chartColors.primary} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Distribution Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Domain Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <PieChartIcon className="w-5 h-5 text-gray-400" />
                  Domain Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.domainDistribution.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No domain data</p>
                ) : (
                  <div className="flex items-center gap-8">
                    <div className="w-48 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.domainDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={70}
                            dataKey="count"
                            nameKey="domain"
                          >
                            {data.domainDistribution.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2">
                      {data.domainDistribution.slice(0, 6).map((d, i) => (
                        <div key={d.domain} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: COLORS[i % COLORS.length] }}
                            />
                            <span className="text-sm">{d.domain}</span>
                          </div>
                          <span className="text-sm text-gray-500">{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Intent Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-gray-400" />
                  Intent Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.intentDistribution.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No intent data</p>
                ) : (
                  <div className="flex items-center gap-8">
                    <div className="w-48 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.intentDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={70}
                            dataKey="count"
                            nameKey="intent"
                          >
                            {data.intentDistribution.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-2">
                      {data.intentDistribution.slice(0, 6).map((d, i) => (
                        <div key={d.intent} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: COLORS[i % COLORS.length] }}
                            />
                            <span className="text-sm">{d.intent}</span>
                          </div>
                          <span className="text-sm text-gray-500">{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Entities */}
          {data.topEntities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Tag className="w-5 h-5 text-gray-400" />
                  Extracted Entities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.topEntities.map((entity) => (
                    <div
                      key={entity.type}
                      className="p-4 rounded-lg border border-gray-200 bg-gray-50"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <Badge variant="outline">{entity.type}</Badge>
                        <span className="text-xs text-gray-400">{entity.count} mentions</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {entity.values.slice(0, 5).map((v) => (
                          <Badge key={v} className="text-xs bg-white">{v}</Badge>
                        ))}
                        {entity.values.length > 5 && (
                          <span className="text-xs text-gray-400">+{entity.values.length - 5} more</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Question Clusters */}
          {data.questionClusters.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Question Clusters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.questionClusters.map((cluster, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                    >
                      <span className="font-medium">{cluster.pattern}</span>
                      <span className="text-sm text-gray-500">{cluster.count} queries</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Weak Evidence Clusters */}
          {data.weakEvidenceClusters.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-amber-700">Weak Evidence Patterns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.weakEvidenceClusters.map((cluster, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200"
                    >
                      <span className="font-medium">{cluster.pattern}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600">{cluster.count} queries</span>
                        <span className="text-sm text-amber-700">
                          Avg score: {Math.round(cluster.avgScore * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

export default PatternsPage;
