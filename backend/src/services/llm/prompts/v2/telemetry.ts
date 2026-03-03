import { logger } from "../../../../utils/logger";
import type {
  PromptBuildFailureEvent,
  PromptBuildStartEvent,
  PromptBuildSuccessEvent,
  PromptMetricSink,
  PromptRegistryTelemetry,
} from "./types";

export const NOOP_PROMPT_METRIC_SINK: PromptMetricSink = {
  increment() {},
  timing() {},
};

export const NOOP_PROMPT_REGISTRY_TELEMETRY: PromptRegistryTelemetry = {
  recordBuildStart() {},
  recordBuildSuccess() {},
  recordBuildFailure() {},
};

export function createDefaultPromptRegistryTelemetry(
  metricSink: PromptMetricSink = NOOP_PROMPT_METRIC_SINK,
): PromptRegistryTelemetry {
  return {
    recordBuildStart(event: PromptBuildStartEvent): void {
      const tags = {
        kind: event.kind,
        env: event.env,
        answerMode: event.answerMode || "",
        outcome: "started",
      };
      metricSink.increment("prompt_registry_build_total", tags);
      logger.debug("[PromptRegistry] build_started", {
        event: "prompt_registry.build_started",
        metric: "prompt_registry_build_total",
        tags,
      });
    },

    recordBuildSuccess(event: PromptBuildSuccessEvent): void {
      const tags = {
        kind: event.kind,
        env: event.env,
        answerMode: event.answerMode || "",
        outcome: "success",
      };
      metricSink.increment("prompt_registry_build_total", tags);
      metricSink.timing("prompt_registry_build_duration_ms", event.durationMs, tags);
      logger.debug("[PromptRegistry] build_succeeded", {
        event: "prompt_registry.build_succeeded",
        metric: "prompt_registry_build_total",
        metricDuration: "prompt_registry_build_duration_ms",
        tags,
        values: {
          durationMs: event.durationMs,
          selectedTemplateCount: event.selectedTemplateCount,
          messageCount: event.messageCount,
        },
      });
    },

    recordBuildFailure(event: PromptBuildFailureEvent): void {
      const tags = {
        kind: event.kind,
        env: event.env,
        answerMode: event.answerMode || "",
        outcome: "failure",
        errorCode: event.errorCode,
        errorName: event.errorName,
      };
      metricSink.increment("prompt_registry_error_total", tags);
      metricSink.timing("prompt_registry_build_duration_ms", event.durationMs, tags);
      logger.error("[PromptRegistry] build_failed", {
        event: "prompt_registry.build_failed",
        metric: "prompt_registry_error_total",
        metricDuration: "prompt_registry_build_duration_ms",
        tags,
        values: {
          durationMs: event.durationMs,
        },
        message: event.message,
      });
    },
  };
}
