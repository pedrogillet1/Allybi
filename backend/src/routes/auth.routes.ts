import { Router } from 'express';
import { AuthController, createAuthController } from '../controllers/auth.controller';
import { authLimiter } from '../middleware/rateLimit.middleware';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Lazy controller: resolves AuthService from app.locals on first request
let _ctrl: AuthController | null = null;
function ctrl(req: any): AuthController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.auth;
    if (!svc) {
      throw Object.assign(new Error('AuthService not wired'), { statusCode: 503 });
    }
    _ctrl = createAuthController(svc);
  }
  return _ctrl;
}

// Public auth endpoints
router.post('/register', authLimiter, (req, res) => ctrl(req).register(req, res));
router.post('/login', authLimiter, (req, res) => ctrl(req).login(req, res));
router.post('/refresh', (req, res) => ctrl(req).refresh(req, res));
router.post('/logout', (req, res) => ctrl(req).logout(req, res));

// Protected auth endpoints
router.get('/me', authenticateToken, (req, res) => ctrl(req).me(req, res));

export default router;
