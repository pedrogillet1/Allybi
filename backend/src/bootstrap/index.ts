// src/bootstrap/index.ts

/**
 * Bootstrap Index (Koda, ChatGPT-parity)
 * -------------------------------------
 * Single entrypoint to initialize the backend runtime:
 *  - loads env/config
 *  - initializes DI container
 *  - returns the container for app/server to use
 *
 * This file should stay small and deterministic.
 */

import { initializeContainer, getContainer } from "./container";

export async function bootstrap() {
  // 1) Initialize DI container (services + singletons)
  await initializeContainer();
  return getContainer();
}

export { initializeContainer, getContainer } from "./container";
export { createAuthService } from "./authBridge";

export default bootstrap;
