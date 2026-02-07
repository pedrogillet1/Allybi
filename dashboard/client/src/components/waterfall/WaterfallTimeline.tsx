/**
 * WaterfallTimeline Component
 * Displays pipeline execution as a visual waterfall chart
 */

import { cn } from "@/lib/utils";
import type { TraceSpan } from "@/types/admin";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle,
  XCircle,
  SkipForward,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface WaterfallTimelineProps {
  spans: TraceSpan[];
  className?: string;
}

// Color coding for step status
const statusColors = {
  ok: {
    bg: "bg-emerald-100",
    border: "border-emerald-300",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
    icon: CheckCircle,
  },
  error: {
    bg: "bg-red-100",
    border: "border-red-300",
    bar: "bg-red-500",
    text: "text-red-700",
    icon: XCircle,
  },
  skipped: {
    bg: "bg-gray-100",
    border: "border-gray-300",
    bar: "bg-gray-400",
    text: "text-gray-600",
    icon: SkipForward,
  },
};

// Step name to human-readable label
const stepLabels: Record<string, string> = {
  DOC_INDEX_LOAD: "Load Document Index",
  QUERY_NORMALIZE: "Normalize Query",
  INTENT_RESOLVE: "Resolve Intent",
  CONVERSATION_CHECK: "Check Conversation",
  DOC_AVAILABILITY: "Check Doc Availability",
  QUERY_REWRITE: "Rewrite Query",
  SCOPE_RESOLVE: "Resolve Scope",
  CANDIDATE_FILTER: "Filter Candidates",
  RETRIEVAL: "Retrieve Evidence",
  RANKING: "Rank Results",
  ANSWER_MODE_ROUTE: "Route Answer Mode",
  ANSWER_GENERATE: "Generate Answer",
  RENDER_POLICY: "Apply Render Policy",
  GROUNDING_CHECK: "Check Grounding",
  SOURCE_FILTER: "Filter Sources",
  QUALITY_GATES: "Quality Gates",
  FINALIZE: "Finalize",
  STATE_UPDATE: "Update State",
  TELEMETRY_EMIT: "Emit Telemetry",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getStepLabel(stepName: string): string {
  return stepLabels[stepName] || stepName.replace(/_/g, " ");
}

export function WaterfallTimeline({ spans, className }: WaterfallTimelineProps) {
  if (!spans || spans.length === 0) {
    return (
      <div className={cn("text-center py-8 text-gray-500", className)}>
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No trace spans recorded</p>
        <p className="text-sm mt-1">Pipeline instrumentation may not be enabled</p>
      </div>
    );
  }

  // Calculate total duration and relative widths
  const totalDuration = spans.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
  const maxDuration = Math.max(...spans.map((s) => s.durationMs ?? 0));

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
        <span>{spans.length} pipeline steps</span>
        <span>Total: {formatDuration(totalDuration)}</span>
      </div>

      {/* Waterfall bars */}
      <div className="space-y-1">
        {spans.map((span, index) => {
          const status = span.status as keyof typeof statusColors;
          const colors = statusColors[status] || statusColors.ok;
          const Icon = colors.icon;
          const widthPct = maxDuration > 0 ? ((span.durationMs ?? 0) / maxDuration) * 100 : 0;

          return (
            <Tooltip key={span.id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-md transition-colors hover:bg-gray-50 cursor-pointer",
                    colors.bg,
                    colors.border,
                    "border"
                  )}
                >
                  {/* Step number */}
                  <span className="text-xs text-gray-400 w-6 text-right">
                    {index + 1}
                  </span>

                  {/* Status icon */}
                  <Icon className={cn("w-4 h-4 flex-shrink-0", colors.text)} />

                  {/* Step name */}
                  <span className="text-sm font-medium w-40 truncate">
                    {getStepLabel(span.stepName)}
                  </span>

                  {/* Duration bar */}
                  <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden relative">
                    <div
                      className={cn("h-full rounded transition-all", colors.bar)}
                      style={{ width: `${Math.max(widthPct, 2)}%` }}
                    />
                    {/* Duration label */}
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
                      {formatDuration(span.durationMs)}
                    </span>
                  </div>

                  {/* Error indicator */}
                  {span.errorCode && (
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-sm">
                <div className="space-y-2">
                  <div className="font-medium">{getStepLabel(span.stepName)}</div>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-400">Status:</span>
                      <span className={colors.text}>{span.status}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-400">Duration:</span>
                      <span>{formatDuration(span.durationMs)}</span>
                    </div>
                    {span.errorCode && (
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-400">Error:</span>
                        <span className="text-red-600">{span.errorCode}</span>
                      </div>
                    )}
                    {span.metadata && Object.keys(span.metadata).length > 0 && (
                      <div className="pt-2 border-t border-gray-200 mt-2">
                        <div className="text-gray-400 mb-1">Metadata:</div>
                        <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-32">
                          {JSON.stringify(span.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="text-gray-600">
              {spans.filter((s) => s.status === "ok").length} OK
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-gray-600">
              {spans.filter((s) => s.status === "error").length} Errors
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <SkipForward className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">
              {spans.filter((s) => s.status === "skipped").length} Skipped
            </span>
          </div>
        </div>
        <div className="text-gray-600">
          Total: <span className="font-medium">{formatDuration(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
}

export default WaterfallTimeline;
