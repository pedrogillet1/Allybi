import type { Router } from "express";
import healthRoutes from "./health.routes";
import authRoutes from "./auth.routes";
import chatRoutes from "./chat.routes";
import historyRoutes from "./history.routes";
import documentRoutes from "./documents.routes";
import folderRoutes from "./folders.routes";
import userRoutes from "./users.routes";
import ragRoutes from "./rag.routes";
import profileRoutes from "./profile.routes";
import storageRoutes from "./storage.routes";
import batchRoutes from "./batch.routes";
import presignedUrlsRoutes from "./presigned-urls.routes";
import multipartUploadRoutes from "./multipart-upload.routes";
import adminTelemetryRoutes from "./admin-telemetry.routes";
import adminAnalyticsRoutes from "./admin-analytics.routes";
import adminAuthRoutes from "./admin-auth.routes";
import recoveryVerificationRoutes from "./recovery-verification.routes";
import integrationsRoutes from "./integrations.routes";
import editorSessionRoutes from "./editor-session.routes";
import editingRoutes from "./editing.routes";
import telemetryRoutes from "./telemetry.routes";
import searchRoutes from "./search.routes";
import adminRoutes from "./admin.routes";

export type HttpRouteMount = {
  basePath: string;
  router: Router;
};

export { healthRoutes };

export const apiRouteMounts: HttpRouteMount[] = [
  { basePath: "/api/auth", router: authRoutes },
  { basePath: "/api/users", router: userRoutes },
  { basePath: "/api/profile", router: profileRoutes },
  { basePath: "/api/chat", router: chatRoutes },
  { basePath: "/api/history", router: historyRoutes },
  { basePath: "/api/documents", router: documentRoutes },
  { basePath: "/api/folders", router: folderRoutes },
  { basePath: "/api/rag", router: ragRoutes },
  { basePath: "/api/storage", router: storageRoutes },
  { basePath: "/api/batch", router: batchRoutes },
  { basePath: "/api/presigned-urls", router: presignedUrlsRoutes },
  { basePath: "/api/multipart-upload", router: multipartUploadRoutes },
  { basePath: "/api/auth/admin", router: adminAuthRoutes },
  { basePath: "/api/admin/telemetry", router: adminTelemetryRoutes },
  { basePath: "/api/admin/analytics", router: adminAnalyticsRoutes },
  {
    basePath: "/api/recovery-verification",
    router: recoveryVerificationRoutes,
  },
  { basePath: "/api/integrations", router: integrationsRoutes },
  { basePath: "/api/editor-session", router: editorSessionRoutes },
  { basePath: "/api/editing", router: editingRoutes },
  { basePath: "/api/telemetry", router: telemetryRoutes },
  { basePath: "/api/search", router: searchRoutes },
  { basePath: "/api/admin", router: adminRoutes },
  { basePath: "/api/dashboard", router: adminRoutes },
];
