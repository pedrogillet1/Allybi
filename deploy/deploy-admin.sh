#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-admin.sh — Build and deploy the Koda admin dashboard to VPS
#
# Usage:
#   ./deploy/deploy-admin.sh                 # uses defaults
#   VPS_HOST=root@1.2.3.4 ./deploy/deploy-admin.sh
#
# Prerequisites on VPS:
#   - Nginx installed with lua module (nginx-extras or ngx_http_lua_module)
#   - /etc/nginx/.htpasswd_koda_admin exists  (htpasswd -c ... admin_user)
#   - /etc/nginx/koda_admin_key.txt           (echo -n 'KEY' > ...)
#   - Certbot certs for getkodabackend.com
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ADMIN_DIR="$PROJECT_ROOT/admin-dashboard"
BUILD_OUTPUT="$ADMIN_DIR/dist/public"

VPS_HOST="${VPS_HOST:-root@getkodabackend.com}"
VPS_WEB_ROOT="${VPS_WEB_ROOT:-/var/www/getkodabackend.com}"
NGINX_CONF_DIR="${NGINX_CONF_DIR:-/etc/nginx/sites-enabled}"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Step 1: Build ────────────────────────────────────────────────────────────
info "Building admin dashboard..."
cd "$ADMIN_DIR"

if [ ! -d node_modules ]; then
    info "Installing dependencies..."
    npm ci
fi

npm run build || error "Build failed"
[ -d "$BUILD_OUTPUT" ] || error "Build output not found at $BUILD_OUTPUT"
info "Build complete: $BUILD_OUTPUT"

# ── Step 2: Upload to VPS ────────────────────────────────────────────────────
info "Uploading to $VPS_HOST:$VPS_WEB_ROOT ..."
ssh "$VPS_HOST" "mkdir -p $VPS_WEB_ROOT"
rsync -az --delete "$BUILD_OUTPUT/" "$VPS_HOST:$VPS_WEB_ROOT/"
info "Upload complete."

# ── Step 3: Upload Nginx configs ─────────────────────────────────────────────
info "Uploading Nginx configs..."
scp "$SCRIPT_DIR/nginx/getkoda.ai.conf"           "$VPS_HOST:$NGINX_CONF_DIR/getkoda.ai.conf"
scp "$SCRIPT_DIR/nginx/getkodabackend.com.conf"   "$VPS_HOST:$NGINX_CONF_DIR/getkodabackend.com.conf"
info "Nginx configs uploaded."

# ── Step 4: Set permissions ──────────────────────────────────────────────────
info "Setting file permissions..."
ssh "$VPS_HOST" "chown -R www-data:www-data $VPS_WEB_ROOT && chmod -R 755 $VPS_WEB_ROOT"

# ── Step 5: Test & reload Nginx ──────────────────────────────────────────────
info "Testing Nginx configuration..."
ssh "$VPS_HOST" "nginx -t" || error "Nginx config test failed"

info "Reloading Nginx..."
ssh "$VPS_HOST" "systemctl reload nginx"

info "Deploy complete."
