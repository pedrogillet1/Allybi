#!/usr/bin/env npx ts-node
/**
 * Unprotected Route Scanner
 *
 * Scans route files to ensure admin routes have proper authentication middleware.
 * Fails CI if any admin route is missing authentication.
 *
 * Usage: npx ts-node scripts/security/scan-unprotected-routes.ts
 * Exit codes: 0 = pass, 1 = violations found
 */

import * as fs from 'fs';
import * as path from 'path';

interface RouteViolation {
  file: string;
  line: number;
  code: string;
  issue: string;
}

// Route files that MUST have authentication
const PROTECTED_ROUTE_FILES = [
  'adminTelemetry.routes.ts',
  'adminAnalytics.routes.ts',
  'adminAuth.routes.ts',
];

// Required middleware for admin routes
const REQUIRED_ADMIN_MIDDLEWARE = [
  'authenticateAdmin',
  'requireAdmin',
];

// Routes that should be public (exceptions)
const PUBLIC_ROUTES = [
  '/login',
  '/logout',
  '/refresh',
  '/health',
  '/ready',
  '/version',
];

// Admin route files that are exempt from global auth (auth endpoints themselves)
const AUTH_ROUTE_FILES = [
  'adminAuth.routes.ts',
];

function scanRouteFile(filePath: string): RouteViolation[] {
  const violations: RouteViolation[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const fileName = path.basename(filePath);

  // Check if this is an admin route file
  const isAdminFile = fileName.includes('admin') || fileName.includes('Admin');

  // Auth route files are exempt from global auth requirement (they ARE the auth endpoints)
  const isAuthFile = AUTH_ROUTE_FILES.includes(fileName);

  // Check for router.use(authenticateAdmin) or similar
  const hasGlobalAuth = REQUIRED_ADMIN_MIDDLEWARE.some(mw =>
    content.includes(`router.use(${mw})`) || content.includes(`router.use(${mw},`)
  );

  // If admin file without global auth (and not an auth file), check each route
  if (isAdminFile && !hasGlobalAuth && !isAuthFile) {
    violations.push({
      file: filePath,
      line: 1,
      code: 'Missing router.use(authenticateAdmin)',
      issue: 'Admin route file must have global authentication middleware',
    });
  }

  // Check individual routes in admin files (skip auth files - they're all public)
  if (isAdminFile && !isAuthFile) {
    lines.forEach((line, index) => {
      const routeMatch = line.match(/router\.(get|post|patch|put|delete)\s*\(\s*["'`]([^"'`]+)/);

      if (routeMatch) {
        const [, method, route] = routeMatch;

        // Skip public routes
        if (PUBLIC_ROUTES.some(pub => route.includes(pub))) {
          return;
        }

        // Check if this specific route has auth middleware
        const hasRouteAuth = REQUIRED_ADMIN_MIDDLEWARE.some(mw => line.includes(mw));

        // If no global auth and no route-level auth, it's a violation
        if (!hasGlobalAuth && !hasRouteAuth) {
          violations.push({
            file: filePath,
            line: index + 1,
            code: line.trim().substring(0, 100),
            issue: `Route ${method.toUpperCase()} ${route} missing authentication middleware`,
          });
        }
      }
    });
  }

  return violations;
}

function scanDirectory(dir: string): RouteViolation[] {
  const violations: RouteViolation[] = [];
  const fullPath = path.join(process.cwd(), dir);

  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  Directory not found: ${dir}`);
    return violations;
  }

  const files = fs.readdirSync(fullPath, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(fullPath, file.name);

    if (file.isDirectory()) {
      violations.push(...scanDirectory(path.join(dir, file.name)));
    } else if (file.name.endsWith('.routes.ts')) {
      violations.push(...scanRouteFile(filePath));
    }
  }

  return violations;
}

function main() {
  console.log('🔍 Scanning for unprotected admin routes...\n');

  const violations = scanDirectory('src/routes');

  if (violations.length === 0) {
    console.log('✅ All admin routes are properly protected!\n');
    process.exit(0);
  }

  console.log(`❌ Found ${violations.length} unprotected route violations:\n`);

  for (const v of violations) {
    console.log(`📄 ${v.file}:${v.line}`);
    console.log(`   Issue: ${v.issue}`);
    console.log(`   Code: ${v.code}\n`);
  }

  console.log('💡 To fix: Add authenticateAdmin middleware to admin routes.\n');
  process.exit(1);
}

main();
