// src/routes/profile.routes.ts
//
// Profile controller exports a router factory — just call it and re-export.

import createProfileRouter from "../controllers/profile.controller";

const router = createProfileRouter();

export default router;
