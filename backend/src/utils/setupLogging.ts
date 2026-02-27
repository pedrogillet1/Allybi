/**
 * Setup logging — imported as a side-effect in app.ts so it runs before
 * any other module.  Overrides the global `console` methods with the
 * performance-aware versions from logger.ts when running in production.
 *
 * Also imports reflect-metadata polyfill required by tsyringe DI container.
 */

import "reflect-metadata";
import { performanceConsole } from "./logger";

if (process.env.NODE_ENV === "production") {
  // Replace global console with pino-backed implementation that respects LOG_LEVEL
  Object.assign(console, performanceConsole);
}
