#!/bin/bash
#
# KODA Local Development Setup
#
# Initializes the local development environment with:
#   - Docker containers (Postgres, MinIO, Redis)
#   - Environment files
#   - Database migrations
#
# Usage:
#   ./scripts/setup-local.sh
#
# Prerequisites:
#   - Docker and docker-compose installed
#   - Node.js 18+ installed
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[SETUP]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "========================================"
echo "KODA Local Development Setup"
echo "========================================"
echo ""

# Check Docker
log "Checking Docker..."
if ! command -v docker &> /dev/null; then
  error "Docker is not installed. Please install Docker first."
fi
if ! docker info &> /dev/null; then
  error "Docker daemon is not running. Please start Docker."
fi
success "Docker is available"

# Check Docker Compose
log "Checking Docker Compose..."
if ! docker compose version &> /dev/null && ! docker-compose version &> /dev/null; then
  error "Docker Compose is not installed. Please install Docker Compose."
fi
success "Docker Compose is available"

# Start Docker containers
log "Starting Docker containers..."
cd "$ROOT_DIR"
if docker compose -f docker-compose.local.yml version &> /dev/null; then
  docker compose -f docker-compose.local.yml up -d
else
  docker-compose -f docker-compose.local.yml up -d
fi
success "Docker containers started"

# Wait for services to be healthy
log "Waiting for services to be healthy..."
sleep 5

# Check PostgreSQL
log "Checking PostgreSQL connection..."
for i in {1..30}; do
  if docker exec koda-postgres pg_isready -U koda -d koda_db &> /dev/null; then
    success "PostgreSQL is ready"
    break
  fi
  if [ $i -eq 30 ]; then
    error "PostgreSQL failed to start"
  fi
  sleep 1
done

# Check MinIO
log "Checking MinIO connection..."
for i in {1..30}; do
  if curl -s http://localhost:9000/minio/health/live &> /dev/null; then
    success "MinIO is ready"
    break
  fi
  if [ $i -eq 30 ]; then
    error "MinIO failed to start"
  fi
  sleep 1
done

# Setup backend environment
log "Setting up backend environment..."
cd "$ROOT_DIR/backend"

if [ ! -f .env ]; then
  cp .env.example.local .env
  success "Created backend/.env from .env.example.local"
else
  warn "backend/.env already exists, not overwriting"
fi

# Install backend dependencies
log "Installing backend dependencies..."
npm ci --prefer-offline 2>/dev/null || npm install
success "Backend dependencies installed"

# Sync database schema and generate Prisma client
# NOTE: For initial setup (fresh database), use --accept-data-loss
# For existing databases, we try safe mode first
log "Syncing database schema..."
if [ "${FORCE_SCHEMA:-}" = "true" ]; then
  warn "FORCE_SCHEMA=true - using --accept-data-loss (data may be lost)"
  npx prisma db push --accept-data-loss
else
  # Try safe mode first, fall back to force if it fails (likely fresh database)
  if ! npx prisma db push 2>/dev/null; then
    warn "Safe schema sync failed (likely fresh database), using --accept-data-loss"
    npx prisma db push --accept-data-loss
  fi
fi
npx prisma generate
success "Database schema synced and Prisma client generated"

# Setup frontend environment
log "Setting up frontend environment..."
cd "$ROOT_DIR/frontend"

if [ ! -f .env ]; then
  cp .env.example.local .env
  success "Created frontend/.env from .env.example.local"
else
  warn "frontend/.env already exists, not overwriting"
fi

# Install frontend dependencies
log "Installing frontend dependencies..."
npm ci --prefer-offline 2>/dev/null || npm install
success "Frontend dependencies installed"

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Services running:"
echo "  - PostgreSQL: localhost:5432"
echo "  - MinIO API:  localhost:9000"
echo "  - MinIO UI:   localhost:9001 (minioadmin:minioadmin123)"
echo "  - Redis:      localhost:6379"
echo ""
echo "To start the application:"
echo "  Backend:  cd backend && npm run dev"
echo "  Backend (with schema sync): cd backend && npm run dev:sync"
echo "  Frontend: cd frontend && npm start"
echo ""
echo "To run upload tests:"
echo "  cd backend"
echo "  TOKEN=\$(node scripts/generate-test-token.js)"
echo "  node scripts/upload-test-runner.js --all \"\$TOKEN\""
echo ""
echo "To stop Docker containers:"
echo "  docker compose -f docker-compose.local.yml down"
echo ""
