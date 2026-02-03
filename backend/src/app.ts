// src/app.ts
// PERFORMANCE: Setup logging first (overrides console based on LOG_LEVEL)
import './utils/setupLogging';

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import passport from './config/passport';
import { config } from './config/env';
import { initSentry, sentryErrorHandler } from './config/sentry.config';

import containerGuard from './middleware/containerGuard.middleware';
import { apiLimiter } from './middleware/rateLimit.middleware';
import { auditLog } from './middleware/auditLog.middleware';
import { errorHandler } from './middleware/error.middleware';
import { secureLogsMiddleware } from './middleware/secureLogs.middleware';

// Routes (target 9 + health)
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import chatRoutes from './routes/chat.routes';
import historyRoutes from './routes/history.routes';
import documentRoutes from './routes/document.routes';
import folderRoutes from './routes/folder.routes';
import userRoutes from './routes/user.routes';
import ragRoutes from './routes/rag.routes';
import profileRoutes from './routes/profile.routes';
import storageRoutes from './routes/storage.routes';
import batchRoutes from './routes/batch.routes';
import presignedUrlsRoutes from './routes/presignedUrls.routes';
import multipartUploadRoutes from './routes/multipartUpload.routes';
import adminTelemetryRoutes from './routes/adminTelemetry.routes';
import adminAnalyticsRoutes from './routes/adminAnalytics.routes';
import adminAuthRoutes from './routes/adminAuth.routes';
import recoveryVerificationRoutes from './routes/recoveryVerification.routes';
import { adminRouter } from './admin';

const app: Application = express();

// Sentry MUST be first (before other middleware)
initSentry(app);

// Trust proxy (reverse proxies/load balancers)
app.set('trust proxy', 1);

/** -----------------------------
 * CORS (must come first)
 * ----------------------------- */
const allowedOrigins = [
  'https://getkoda.ai',
  'https://www.getkoda.ai',
  'https://getkodabackend.com',
  'https://www.getkodabackend.com',
  'https://admin.getkodabackend.com',
  // OAuth provider origins (Apple sends POST with Origin header)
  'https://appleid.apple.com',
  'https://accounts.google.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:5173',
  config.FRONTEND_URL,
].filter(Boolean) as string[];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow same-origin / server-to-server (no Origin header)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      // Echo origin for proper ACAO behavior with credentials
      return callback(null, origin);
    }

    console.error(`CORS BLOCKED - Origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'X-Upload-Session-Id',
    'x-upload-session-id',
    'X-Request-Id',
    'x-request-id',
    'X-KODA-ADMIN-KEY',
  ],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Set-Cookie'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

app.use(cors(corsOptions));

/** -----------------------------
 * Cookie parser (needed for Safari auth cookie fallback)
 * ----------------------------- */
app.use(cookieParser());

/** -----------------------------
 * Security headers
 * ----------------------------- */
if (process.env.NODE_ENV === 'production') {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
}

app.use((req: Request, res: Response, next: NextFunction) => {
  // Skip preflight
  if (req.method === 'OPTIONS') return next();

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    res.setHeader('Expect-CT', 'max-age=86400, enforce');
  } else {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }

  next();
});

/** -----------------------------
 * Secure logging (redact sensitive fields)
 * ----------------------------- */
app.use(secureLogsMiddleware);

/** -----------------------------
 * Audit logging (after CORS)
 * ----------------------------- */
app.use(auditLog);

/** -----------------------------
 * Rate limiting
 * ----------------------------- */
app.use('/api/', apiLimiter);

/** -----------------------------
 * Body parsing
 * ----------------------------- */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/** -----------------------------
 * Auth
 * ----------------------------- */
app.use(passport.initialize());

/** -----------------------------
 * Container guard for /api/*
 * ----------------------------- */
app.use('/api/', containerGuard);

/** -----------------------------
 * Health checks (root + /api)
 * ----------------------------- */
app.use('/', healthRoutes);
app.use('/api', healthRoutes);

/** -----------------------------
 * API routes (target 9)
 * ----------------------------- */
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);

app.use('/api/chat', chatRoutes);
app.use('/api/history', historyRoutes);

app.use('/api/documents', documentRoutes);
app.use('/api/folders', folderRoutes);

app.use('/api/rag', ragRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/batch', batchRoutes);
app.use('/api/presigned-urls', presignedUrlsRoutes);
app.use('/api/multipart-upload', multipartUploadRoutes);
app.use('/api/auth/admin', adminAuthRoutes);
app.use('/api/admin/telemetry', adminTelemetryRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use('/api/recovery-verification', recoveryVerificationRoutes);

// Admin Dashboard API (mounted at /api/admin AND /api/dashboard for compatibility)
app.use('/api/admin', adminRouter);
app.use('/api/dashboard', adminRouter); // Alias for dashboard frontend compatibility

/** -----------------------------
 * 404
 * ----------------------------- */
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

/** -----------------------------
 * Error handling
 * ----------------------------- */
// Sentry error handler MUST come before other error handlers
app.use(sentryErrorHandler());
app.use(errorHandler);

export default app;
