/**
 * GapsPage
 * Shows content gaps, missing features, and improvement opportunities
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
} from "recharts";
import { AlertCircle, AlertTriangle, TrendingUp, Zap, Link2, Target } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useGaps } from "@/hooks/useAdminApi";
import { chartColors } from "@/components/charts";
import type { TimeRange } from "@/types/admin";

const severityColors = {
  low: "bg-gray-100 text-gray-700 border-gray-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  high: "bg-red-100 text-red-700 border-red-200",
};

export function GapsPage() {
  const [range] = useState<TimeRange>("7d");
  const { data, isLoading, error } = useGaps({ range });

  return (
    <AdminLayout>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Gaps & Opportunities</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Identify content gaps and improvement areas
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Failed to load gaps analysis: {error.message}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Opportunity Score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Target className="w-5 h-5 text-gray-400" />
                Opportunity Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-8">
                <div className="text-center">
                  <div className="text-5xl font-bold text-blue-600">{data.opportunityScore}</div>
                  <div className="text-sm text-gray-500 mt-1">/ 100</div>
                </div>
                <div className="flex-1">
                  <Progress value={data.opportunityScore} className="h-4" />
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>Low opportunity</span>
                    <span>High opportunity</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">
                    {data.opportunityScore < 30 ? (
                      <span className="text-green-600">System is well-tuned</span>
                    ) : data.opportunityScore < 60 ? (
                      <span className="text-amber-600">Some gaps to address</span>
                    ) : (
                      <span className="text-red-600">Significant improvements possible</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gap Categories */}
          {data.topGapCategories.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-gray-400" />
                  Gap Categories
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.topGapCategories.map((cat, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-lg border ${severityColors[cat.severity]}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{cat.category}</span>
                        <Badge variant="outline" className={severityColors[cat.severity]}>
                          {cat.severity}
                        </Badge>
                      </div>
                      <div className="text-2xl font-bold">{cat.count}</div>
                      <div className="text-xs mt-1 opacity-75">affected queries</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fallback Reasons */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Fallback Reasons
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.fallbackReasons.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No fallbacks recorded in this period
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* List */}
                  <div className="space-y-3">
                    {data.fallbackReasons.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200"
                      >
                        <span className="text-sm">{r.reason}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium">{r.count}</span>
                          <span className="text-xs text-gray-500">{r.pct}%</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Chart */}
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.fallbackReasons}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="reason" type="category" width={90} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill={chartColors.warning} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weak Evidence Queries */}
          {data.weakEvidenceQueries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-gray-400" />
                  Weak Evidence Patterns
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.weakEvidenceQueries.map((q, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{q.domain}</Badge>
                        <span className="font-medium">{q.pattern}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600">{q.count} queries</span>
                        <span className="text-sm text-amber-600">
                          Avg score: {Math.round(q.avgScore * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* No Evidence Queries */}
          {data.noEvidenceQueries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-red-700">
                  <AlertCircle className="w-5 h-5" />
                  No Evidence Patterns
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.noEvidenceQueries.map((q, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{q.pattern}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600">{q.count} queries</span>
                        <span className="text-sm text-red-600">{q.reason}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Missing Connectors */}
          {data.missingConnectors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Link2 className="w-5 h-5 text-gray-400" />
                  Integration Opportunities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-4">
                  Users are asking about these integrations that aren't currently available:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {data.missingConnectors.map((c, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg border border-blue-200 bg-blue-50"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium capitalize">{c.keyword}</span>
                        <Badge variant="outline" className="text-xs">{c.count}</Badge>
                      </div>
                      <div className="text-xs text-gray-500">{c.category}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {data.weakEvidenceQueries.length === 0 &&
           data.noEvidenceQueries.length === 0 &&
           data.fallbackReasons.length === 0 && (
            <div className="text-center py-12">
              <Zap className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No significant gaps detected</h3>
              <p className="text-gray-500 mt-1">
                Your system is performing well with minimal gaps in coverage.
              </p>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

export default GapsPage;
