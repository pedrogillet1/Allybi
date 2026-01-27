// src/bootstrap/index.ts

/**
 * Bootstrap Index (Koda, ChatGPT-parity)
 * -------------------------------------
 * Single entrypoint to initialize the backend runtime:
 *  - loads env/config
 *  - initializes DI container
 *  - wires auth bridge
 *  - returns the container for app/server to use
 *
 * This file should stay small and deterministic.
 */

import { createContainer } from "./container";
import { setupAuthBridge } from "./authBridge";

export async function bootstrap() {
  // 1) Create DI container (services + singletons)
  const container = await createContainer();

  // 2) Wire auth bridge (passport/session -> req.user / identity)
  setupAuthBridge(container);

  return container;
}

export default bootstrap;
