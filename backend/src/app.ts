// PERFORMANCE: Setup logging first (overrides console based on LOG_LEVEL)
import './utils/setupLogging';

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import passport from './config/passport';
import { config } from './config/env';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
// import documentSearchRoutes from './routes/documentSearch.routes';
import folderRoutes from './routes/folder.routes';
import tagRoutes from './routes/tag.routes';
import userRoutes from './routes/user.routes';
import chatRoutes from './routes/chat.routes';
// import sessionRoutes from './routes/session.routes';
import notificationRoutes from './routes/notification.routes';
import ragRoutes from './routes/rag.routes';
// import securityRoutes from './routes/security.routes';
import rbacRoutes from './routes/rbac.routes';
import healthRoutes from './routes/health.routes';
// import recoveryVerificationRoutes from './routes/recoveryVerification.routes'; // Disabled - service deleted
import batchRoutes from './routes/batch.routes';
import searchRoutes from './routes/search.routes';
import memoryRoutes from './routes/memory.routes';
import devRoutes from './routes/dev.routes';
import presentationRoutes from './routes/presentation.routes';
import presignedUrlRoutes from './routes/presigned-url.routes';
import multipartUploadRoutes from './routes/multipart-upload.routes';
import storageRoutes from './routes/storage.routes';
// import agentRoutes from './routes/agent.routes'; // Removed - V3 cleanup
// import creativityRoutes from './routes/creativity.routes'; // Removed - V3 cleanup
import profileRoutes from './routes/profile.routes';
import historyRoutes from './routes/history.routes';
// import analyticsRoutes from './routes/analytics.routes'; // Disabled - service deleted
import analyticsPublicRoutes from './routes/analytics-public.routes';
// import { explanationController } from './controllers/explanation.controller'; // Removed - V3 cleanup
import { profileController } from './controllers/profile.controller';
// TODO: Temporarily disabled routes with deleted service dependencies
// import dataProtectionRoutes from './routes/dataProtection.routes';
// import documentGenerationRoutes from './routes/documentGeneration.routes';
// import documentEditingRoutes from './routes/documentEditing.routes';
// import chatDocumentAnalysisRoutes from './routes/chatDocumentAnalysis.routes';
// import chatDocumentRoutes from './routes/chatDocument.routes';
import { apiLimiter } from './middleware/rateLimit.middleware';
import { errorHandler } from './middleware/error.middleware';
import { auditLog } from './middleware/auditLog.middleware';
import { initSentry, sentryErrorHandler } from './config/sentry.config';
import containerGuard from './middleware/containerGuard.middleware';

/**
 * ALTERNATE ENTRYPOINT WARNING:
 * 
 * If importing app.ts directly (e.g., in tests) without going through server.ts,
 * the service container will NOT be initialized. The containerGuard middleware
 * will return 503 for any /api/* requests until initialized.
 * 
 * For tests, use:
 *   import { ensureContainerInitialized } from './middleware/containerGuard.middleware';
 *   beforeAll(async () => await ensureContainerInitialized());
 * 
 * For production, always start via server.ts which calls initializeContainer().
 */

const app: Application = express();

// Initialize Sentry (MUST be first, before other middleware)
initSentry(app);

// Trust proxy - needed for reverse proxies
app.set('trust proxy', 1);

// CORS configuration - MUST BE FIRST to handle preflight OPTIONS requests properly
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) => {
    // Allow configured frontend URL and production domains
    const allowedOrigins = [
      'https://getkoda.ai',
      'http://localhost:3000', // Development frontend
      'http://localhost:3001', // Alternative development frontend port
      config.FRONTEND_URL
    ];

    if (!origin) {
      // No origin (same-origin requests)
      callback(null, true);
    } else if (allowedOrigins.includes(origin)) {
      // Return the actual origin to set proper Access-Control-Allow-Origin header
      callback(null, origin);
    } else {
      console.error(`❌ CORS BLOCKED - Origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow credentials (cookies, authorization headers)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Set-Cookie'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400 // Cache preflight requests for 24 hours
};

// Apply CORS before any other middleware that sets headers
app.use(cors(corsOptions));

// Security middleware
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));

  // Enhanced security headers for production
  app.use((req, res, next) => {
    // Skip CORS preflight requests
    if (req.method === 'OPTIONS') {
      return next();
    }

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // XSS Protection (legacy browsers)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // HSTS with preload (force HTTPS for 2 years)
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

    // Referrer policy (privacy)
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy (restrict browser features)
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // Expect-CT (Certificate Transparency)
    res.setHeader('Expect-CT', 'max-age=86400, enforce');

    next();
  });
} else {
  // Development mode - Apply security headers with CORS flexibility
  app.use((req, res, next) => {
    // Skip CORS preflight requests
    if (req.method === 'OPTIONS') {
      return next();
    }

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Allow same-origin for dev tools

    // XSS Protection (legacy browsers)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer policy (privacy)
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy (restrict browser features)
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    next();
  });
}

// Security audit logging (after CORS, skips OPTIONS requests internally)
app.use(auditLog);

// General API rate limiter
app.use('/api/', apiLimiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Passport
app.use(passport.initialize());

// Container guard: Returns 503 if service container not initialized
// Skips health check routes so they can report container status
app.use('/api/', containerGuard);

// Health check routes (both root and /api)
app.use('/', healthRoutes); // Adds /health, /health/stuck-documents, /health/document-stats
app.use('/api', healthRoutes); // Also available at /api/health/*

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
// TODO: Temporarily disabled routes with deleted service dependencies
// app.use('/api/documents', documentGenerationRoutes); // Advanced: documents generation and comparison
// app.use('/api/documents', documentEditingRoutes); // Advanced: AI-powered document editing
// app.use('/api/documents', documentSearchRoutes); // Entity search routes
app.use('/api/folders', folderRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/history', historyRoutes); // Chat history UX: search, pin, smart filtering
// app.use('/api/sessions', sessionRoutes); // Session-based multi-document analysis (temporarily disabled - missing file)
// TODO: Temporarily disabled route with deleted service dependencies
// app.use('/api/chat', chatDocumentAnalysisRoutes); // Advanced: Chat-based document analysis (temporary documents)
// app.use('/api/chat-documents', chatDocumentRoutes); // Chat document generation and export (PDF/DOCX/MD)
app.use('/api/notifications', notificationRoutes);
app.use('/api/rag', ragRoutes); // RAG query endpoints with streaming support
// app.use('/api/security', securityRoutes); // Security monitoring endpoints (temporarily disabled - missing service)
app.use('/api/rbac', rbacRoutes); // RBAC and access control endpoints
// app.use('/api/recovery-verification', recoveryVerificationRoutes); // Disabled - service deleted
app.use('/api/batch', batchRoutes); // Batch API endpoints for optimized data loading (3 requests → 1)
app.use('/api/search', searchRoutes); // Semantic search endpoints using vector embeddings
app.use('/api/memories', memoryRoutes); // Cross-session memory management endpoints
app.use('/api/presigned-urls', presignedUrlRoutes); // Presigned URL generation for direct-to-S3 uploads
app.use('/api/multipart-upload', multipartUploadRoutes); // S3 multipart upload for large files (>20MB)
app.use('/api/storage', storageRoutes); // Storage usage and limits (5GB beta)
app.use('/api/presentations', presentationRoutes); // Manus-style presentation generation
// app.use('/api/agent', agentRoutes); // Removed - V3 cleanup
// app.use('/api/creativity', creativityRoutes); // Removed - V3 cleanup
app.use('/api/profile', profileRoutes); // User profile and knowledge gathering
// app.use('/api/admin/analytics', analyticsRoutes); // Disabled - service deleted
app.use('/api/analytics', analyticsPublicRoutes); // Public analytics (feedback, tracking)

// Additional profile endpoints with userId parameter (for admin/testing purposes)
app.get('/api/profiles/:userId', profileController.getProfileByParam.bind(profileController));
app.put('/api/profiles/:userId', profileController.updateProfileByParam.bind(profileController));

// Explanation Pipeline removed - V3 cleanup
// app.post('/api/explain', explanationController.generate.bind(explanationController));
// app.post('/api/explain/full', explanationController.generateFull.bind(explanationController));

// DEV ONLY: Development endpoints
if (config.NODE_ENV === 'development') {
  app.use('/api/dev', devRoutes);
}
// TODO: Temporarily disabled route with deleted service dependencies
// app.use('/api/data-protection', dataProtectionRoutes); // Data protection and privacy endpoints

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Sentry error handler (MUST be before other error handlers)
app.use(sentryErrorHandler());

// Global error handler
app.use(errorHandler);

export default app;

