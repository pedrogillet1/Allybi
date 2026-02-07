/**
 * QueryTracePage
 * Forensic drilldown view for individual query traces
 */

import { useParams, Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { WaterfallTimeline } from "@/components/waterfall";
import { useQueryTrace } from "@/hooks/useAdminApi";
import { formatDateTime } from "@/utils/format";
import {
  ArrowLeft,
  Clock,
  User,
  Globe,
  Target,
  Brain,
  FileText,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Database,
  Code,
  Layers,
  Server,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function formatMs(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatCost(cost: number | null): string {
  if (cost === null) return "-";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function QueryTracePage() {
  const params = useParams<{ traceId: string }>();
  const traceId = params.traceId ?? null;
  const { data: trace, isLoading, error } = useQueryTrace(traceId);

  return (
    <AdminLayout>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#111111]">Query Trace</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          {traceId ? `Trace ID: ${traceId}` : "Query forensics"}
        </p>
      </div>

      {/* Back link */}
      <Link href="/admin/queries" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" />
        Back to Queries
      </Link>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <AlertTriangle className="w-5 h-5 inline-block mr-2" />
          Failed to load trace: {error.message}
        </div>
      )}

      {trace && (
        <div className="space-y-6">
          {/* Header Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Brain className="w-5 h-5 text-gray-400" />
                Query Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* User & Time */}
                <div>
                  <div className="text-sm text-gray-500 mb-1">User</div>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-medium truncate">{trace.userId}</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Timestamp</div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span>{formatDateTime(trace.timestamp)}</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Language</div>
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-gray-400" />
                    <Badge variant="outline">{trace.language.toUpperCase()}</Badge>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Total Latency</div>
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">{formatMs(trace.latencyTotalMs)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Routing Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Target className="w-5 h-5 text-gray-400" />
                Routing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-gray-500 mb-1">Domain</div>
                  <Badge className="bg-blue-100 text-blue-800">{trace.domain}</Badge>
                  {trace.domainConfidence !== null && (
                    <span className="ml-2 text-xs text-gray-400">
                      ({Math.round(trace.domainConfidence * 100)}%)
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Intent</div>
                  <Badge className="bg-purple-100 text-purple-800">{trace.intent}</Badge>
                  <span className="ml-2 text-xs text-gray-400">
                    ({Math.round(trace.intentConfidence * 100)}%)
                  </span>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Operator</div>
                  <Badge className="bg-green-100 text-green-800">{trace.operator}</Badge>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Answer Mode</div>
                  <Badge className="bg-amber-100 text-amber-800">{trace.answerMode || "unknown"}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quality Indicators */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-gray-400" />
                Quality Indicators
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-3 rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-500 mb-1">Answer Score</div>
                  <div className="text-xl font-bold">
                    {trace.answerScore !== null ? `${Math.round(trace.answerScore * 100)}%` : "-"}
                  </div>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-500 mb-1">Evidence</div>
                  <div className="flex items-center justify-center gap-2">
                    {trace.noEvidence ? (
                      <><XCircle className="w-5 h-5 text-red-500" /> <span className="text-red-600">None</span></>
                    ) : trace.weakEvidence ? (
                      <><AlertTriangle className="w-5 h-5 text-amber-500" /> <span className="text-amber-600">Weak</span></>
                    ) : (
                      <><CheckCircle className="w-5 h-5 text-green-500" /> <span className="text-green-600">Strong</span></>
                    )}
                  </div>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-500 mb-1">Fallback</div>
                  <div className="flex items-center justify-center gap-2">
                    {trace.fallbackUsed ? (
                      <><AlertTriangle className="w-5 h-5 text-amber-500" /> <span className="text-amber-600">Yes</span></>
                    ) : (
                      <><CheckCircle className="w-5 h-5 text-green-500" /> <span className="text-green-600">No</span></>
                    )}
                  </div>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-500 mb-1">Citations</div>
                  <div className="text-xl font-bold">{trace.citationCount}</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-500 mb-1">Cost</div>
                  <div className="text-xl font-bold">{formatCost(trace.cost)}</div>
                </div>
              </div>
              {trace.fallbackReason && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="text-sm text-amber-800">
                    <strong>Fallback Reason:</strong> {trace.fallbackReason}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Retrieval Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-400" />
                Retrieval
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-3 rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-500 mb-1">Docs Eligible</div>
                  <div className="text-xl font-bold">{trace.docsEligible}</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-500 mb-1">Docs Searched</div>
                  <div className="text-xl font-bold">{trace.docsSearched}</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-500 mb-1">Chunks Returned</div>
                  <div className="text-xl font-bold">{trace.chunksReturned}</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-500 mb-1">Chunks Used</div>
                  <div className="text-xl font-bold">{trace.chunksUsed}</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-500 mb-1">Top Score</div>
                  <div className="text-xl font-bold">
                    {trace.topScore !== null ? `${Math.round(trace.topScore * 100)}%` : "-"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Waterfall Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-gray-400" />
                Pipeline Waterfall
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WaterfallTimeline spans={trace.spans} />
            </CardContent>
          </Card>

          {/* Banks Used */}
          {trace.banksUsed.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-gray-400" />
                  Data Banks Used ({trace.banksUsed.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {trace.banksUsed.map((bank) => (
                    <div
                      key={bank.id}
                      className="p-3 rounded-lg border border-gray-200 bg-gray-50"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-xs">{bank.bankType}</Badge>
                        <span className="text-xs text-gray-400">{bank.stageUsed}</span>
                      </div>
                      <div className="text-sm font-medium truncate">{bank.bankId}</div>
                      {bank.bankVersion && (
                        <div className="text-xs text-gray-400 truncate mt-1">
                          v: {bank.bankVersion.slice(0, 12)}...
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Keywords & Entities */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Keywords */}
            {trace.keywords.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <Code className="w-5 h-5 text-gray-400" />
                    Extracted Keywords ({trace.keywords.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {trace.keywords.map((kw, i) => (
                      <Tooltip key={i}>
                        <TooltipTrigger>
                          <Badge
                            variant="outline"
                            className="cursor-default"
                          >
                            {kw.keyword}
                            {kw.weight !== null && (
                              <span className="ml-1 text-xs text-gray-400">
                                ({Math.round(kw.weight * 100)}%)
                              </span>
                            )}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          Weight: {kw.weight !== null ? `${(kw.weight * 100).toFixed(1)}%` : "N/A"}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Entities */}
            {trace.entities.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <Target className="w-5 h-5 text-gray-400" />
                    Extracted Entities ({trace.entities.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {trace.entities.map((ent, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded bg-gray-50"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{ent.type}</Badge>
                          <span className="font-medium">{ent.value}</span>
                        </div>
                        {ent.confidence !== null && (
                          <span className="text-xs text-gray-400">
                            {Math.round(ent.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Model Calls */}
          {trace.modelCalls.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Server className="w-5 h-5 text-gray-400" />
                  Model Calls ({trace.modelCalls.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-medium text-gray-500">Provider</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-500">Model</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-500">Stage</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-500">Status</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-500">Tokens</th>
                        <th className="text-right py-2 px-3 font-medium text-gray-500">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trace.modelCalls.map((call, i) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3">
                            <Badge variant="outline">{call.provider}</Badge>
                          </td>
                          <td className="py-2 px-3 font-mono text-xs">{call.model}</td>
                          <td className="py-2 px-3">{call.stage}</td>
                          <td className="py-2 px-3">
                            {call.status === "ok" ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <div className="flex items-center gap-1">
                                <XCircle className="w-4 h-4 text-red-500" />
                                {call.errorCode && (
                                  <span className="text-xs text-red-600">{call.errorCode}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {(call.promptTokens ?? 0) + (call.completionTokens ?? 0)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {formatMs(call.durationMs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </AdminLayout>
  );
}

export default QueryTracePage;
