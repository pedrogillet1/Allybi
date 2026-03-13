import express from "express";
import http from "http";
import type { Server } from "http";

export function createBackgroundRuntimeServer(role: string): Server {
  const app = express();

  app.get("/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      status: "alive",
      role,
      ts: new Date().toISOString(),
    });
  });

  app.get("/ready", (_req, res) => {
    res.status(200).json({
      ok: true,
      status: "ready",
      role,
      ts: new Date().toISOString(),
    });
  });

  app.get("/version", (_req, res) => {
    res.status(200).json({
      ok: true,
      name: "koda-background-runtime",
      role,
      version: process.env.APP_VERSION || "dev",
      commit: process.env.GIT_COMMIT || null,
      ts: new Date().toISOString(),
    });
  });

  return http.createServer(app);
}
