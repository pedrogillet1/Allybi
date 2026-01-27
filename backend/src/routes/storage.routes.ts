// src/routes/storage.routes.ts
//
// Storage controller exports a router factory — just call it and re-export.

import createStorageRouter from "../controllers/storage.controller";

const router = createStorageRouter();

export default router;
