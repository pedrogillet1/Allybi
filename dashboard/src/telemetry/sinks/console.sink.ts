// Dev-only telemetry sink.
// - Prints compact JSON lines for easy grepping
// - Never throws
// - Do not enable in production unless explicitly desired

import type { TelemetryEvent, TelemetrySink } from "../telemetry.types";

export class ConsoleTelemetrySink implements TelemetrySink {
  readonly name = "console";

  emit(event: TelemetryEvent): void {
    try {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(event));
    } catch {
      // swallow
    }
  }

  // Optional flush hook
  async flush(): Promise<void> {
    return;
  }
}
