import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth.middleware";

const router = Router();

// Stub: return empty results until full semantic search implementation
// The frontend useSemanticSearch hook handles empty results gracefully
router.post("/semantic", authMiddleware, async (_req, res) => {
  res.json({ results: [], total: 0, query: _req.body?.query || "" });
});

export default router;
