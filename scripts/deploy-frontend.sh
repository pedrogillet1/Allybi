#!/bin/bash
#
# Frontend Deployment Script
# Usage: ./scripts/deploy-frontend.sh
#
# This script:
# 1. Pulls latest code from main
# 2. Installs dependencies (npm ci for reproducible builds)
# 3. Builds the frontend
# 4. Reloads nginx
# 5. Runs a smoke test
#
# Exit codes:
#   0 - Success
#   1 - Git pull failed
#   2 - npm ci failed
#   3 - Build failed
#   4 - Nginx reload failed
#   5 - Smoke test failed

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
FRONTEND_DIR="${FRONTEND_DIR:-/home/koda/koda-webapp/frontend}"
BACKEND_URL="${BACKEND_URL:-https://getkoda.ai}"
HEALTH_ENDPOINT="${HEALTH_ENDPOINT:-/api/health}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-10}"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Ensure we're in the right directory
cd "$FRONTEND_DIR" || {
    log_error "Failed to cd to $FRONTEND_DIR"
    exit 1
}

log_info "Starting frontend deployment..."
log_info "Working directory: $(pwd)"

# Step 1: Git pull
log_info "Step 1/5: Pulling latest changes from main..."
if ! git pull origin main; then
    log_error "Git pull failed"
    exit 1
fi
log_info "Git pull successful"

# Step 2: npm ci (clean install for reproducible builds)
log_info "Step 2/5: Installing dependencies (npm ci)..."
if ! npm ci --silent; then
    log_error "npm ci failed"
    exit 2
fi
log_info "Dependencies installed"

# Step 3: Build
log_info "Step 3/5: Building frontend..."
if ! npm run build; then
    log_error "Build failed"
    exit 3
fi
log_info "Build successful"

# Step 4: Reload nginx
log_info "Step 4/5: Reloading nginx..."
if ! nginx -s reload; then
    log_error "Nginx reload failed"
    exit 4
fi
log_info "Nginx reloaded"

# Step 5: Smoke test
log_info "Step 5/5: Running smoke test..."
sleep 2  # Give nginx a moment to reload

HEALTH_URL="${BACKEND_URL}${HEALTH_ENDPOINT}"
log_info "Checking health endpoint: $HEALTH_URL"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$SMOKE_TIMEOUT" "$HEALTH_URL" 2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
    log_info "Smoke test passed (HTTP $HTTP_STATUS)"
else
    log_error "Smoke test failed (HTTP $HTTP_STATUS)"
    log_warn "The deployment completed but the health check failed."
    log_warn "Please verify the application manually."
    exit 5
fi

log_info "=========================================="
log_info "Frontend deployment completed successfully!"
log_info "=========================================="

exit 0
