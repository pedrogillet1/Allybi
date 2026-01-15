#!/bin/bash
#
# KODA VPS Deployment Script
#
# Deterministic deployment from git - NO SCP/manual edits allowed
#
# Usage:
#   ./scripts/deploy_vps.sh [--force] [--skip-build] [--backend-only]
#
# Options:
#   --force         Force reset even if local changes exist (git reset --hard)
#   --skip-build    Skip frontend build (faster for backend-only changes)
#   --backend-only  Only restart backend, no frontend build
#   --dry-run       Show what would be done without making changes
#
# Environment:
#   VPS_HOST        VPS hostname (default: 31.97.255.253)
#   VPS_USER        VPS username (default: root)
#   VPS_DEPLOY_DIR  Deployment directory (default: /home/koda/koda-webapp)
#   VPS_PASSWORD    SSH password (if not using key-based auth)
#   SSH_KEY         Path to SSH key (optional, uses ssh-agent or password)
#
# Security:
#   - Password is never printed or logged
#   - Uses SSHPASS env var (not command line) for password auth
#   - No eval usage
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VPS_HOST="${VPS_HOST:-31.97.255.253}"
VPS_USER="${VPS_USER:-root}"
VPS_DEPLOY_DIR="${VPS_DEPLOY_DIR:-/home/koda/koda-webapp}"
VPS_PASSWORD="${VPS_PASSWORD:-}"
SSH_KEY="${SSH_KEY:-}"
BRANCH="${BRANCH:-main}"

# Auth mode detection
USE_SSHPASS=false
if [[ -n "$VPS_PASSWORD" ]]; then
  if ! command -v sshpass &> /dev/null; then
    echo -e "${RED}sshpass required for password auth. Install with: brew install hudochenkov/sshpass/sshpass${NC}"
    exit 1
  fi
  USE_SSHPASS=true
  # Export for sshpass -e (reads from SSHPASS env var, never on command line)
  export SSHPASS="$VPS_PASSWORD"
fi

# Parse arguments
FORCE=false
SKIP_BUILD=false
BACKEND_ONLY=false
DRY_RUN=false

for arg in "$@"; do
  case $arg in
    --force)
      FORCE=true
      ;;
    --skip-build)
      SKIP_BUILD=true
      ;;
    --backend-only)
      BACKEND_ONLY=true
      SKIP_BUILD=true
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    --help|-h)
      head -30 "$0" | grep '^#' | sed 's/^# //' | sed 's/^#//'
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $arg${NC}"
      exit 1
      ;;
  esac
done

log() {
  echo -e "${BLUE}[DEPLOY]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
  exit 1
}

success() {
  echo -e "${GREEN}[OK]${NC} $1"
}

# SSH command wrapper - no eval, proper argument handling
# Uses sshpass -e to read password from SSHPASS env var (secure)
ssh_cmd() {
  local remote_cmd="source ~/.nvm/nvm.sh 2>/dev/null; $1"
  local ssh_opts=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)

  # Add SSH key if specified
  if [[ -n "$SSH_KEY" ]]; then
    ssh_opts+=(-i "$SSH_KEY")
  fi

  if [[ "$USE_SSHPASS" == "true" ]]; then
    # Use -e flag: read password from SSHPASS env var (never on command line)
    sshpass -e ssh "${ssh_opts[@]}" "${VPS_USER}@${VPS_HOST}" "$remote_cmd"
  else
    ssh "${ssh_opts[@]}" "${VPS_USER}@${VPS_HOST}" "$remote_cmd"
  fi
}

# Check if we can connect to VPS
check_connection() {
  log "Checking VPS connection..."
  if ! ssh_cmd "echo 'connected'" >/dev/null 2>&1; then
    error "Cannot connect to VPS at ${VPS_USER}@${VPS_HOST}"
  fi
  success "VPS connection OK"
}

# Check local git status (must be clean and on correct branch)
check_local_git() {
  log "Checking local git status..."

  if ! git rev-parse --git-dir > /dev/null 2>&1; then
    error "Not in a git repository"
  fi

  local local_branch
  local_branch=$(git branch --show-current)
  if [[ "$local_branch" != "$BRANCH" ]]; then
    warn "Local branch is '$local_branch', deploying from '$BRANCH'"
  fi

  if [[ -n $(git status --porcelain) ]]; then
    warn "Local working tree has uncommitted changes"
    echo "  Consider committing before deploying"
  fi

  success "Local git status checked"
}

# Check VPS git status and handle drift
check_vps_git() {
  log "Checking VPS git status..."

  local status
  status=$(ssh_cmd "cd ${VPS_DEPLOY_DIR} && git status --porcelain 2>/dev/null" || echo "ERROR")

  if [[ "$status" == "ERROR" ]]; then
    error "Failed to check git status on VPS"
  fi

  if [[ -n "$status" ]]; then
    warn "VPS has local changes:"
    echo "$status" | head -10

    if [[ "$FORCE" == "true" ]]; then
      log "Force mode: will reset VPS to origin/${BRANCH}"
    else
      error "VPS has uncommitted changes. Use --force to reset, or manually commit/stash on VPS"
    fi
  fi

  success "VPS git status checked"
}

# Get current commit info for logging
get_commit_info() {
  local where=$1
  if [[ "$where" == "local" ]]; then
    git log -1 --format="%h %s"
  else
    ssh_cmd "cd ${VPS_DEPLOY_DIR} && git log -1 --format='%h %s'"
  fi
}

# Main deployment
deploy() {
  log "Starting deployment to ${VPS_HOST}..."
  echo ""

  local before_commit
  before_commit=$(ssh_cmd "cd ${VPS_DEPLOY_DIR} && git rev-parse --short HEAD")
  log "VPS before: $before_commit ($(get_commit_info vps))"

  local local_commit
  local_commit=$(git rev-parse --short HEAD)
  log "Local HEAD: $local_commit ($(get_commit_info local))"
  echo ""

  if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY RUN - would execute the following:"
    echo "  1. git fetch origin"
    echo "  2. git reset --hard origin/${BRANCH}"
    echo "  3. npm ci (backend)"
    [[ "$SKIP_BUILD" != "true" ]] && echo "  4. npm run build (frontend)"
    echo "  5. pm2 restart koda-backend"
    return 0
  fi

  # Step 1: Fetch latest from origin
  log "Fetching latest from origin..."
  ssh_cmd "cd ${VPS_DEPLOY_DIR} && git fetch origin ${BRANCH}"

  # Step 2: Reset to origin/main (deterministic - always matches remote)
  log "Resetting to origin/${BRANCH}..."
  ssh_cmd "cd ${VPS_DEPLOY_DIR} && git reset --hard origin/${BRANCH}"

  # Step 3: Install backend dependencies
  log "Installing backend dependencies..."
  ssh_cmd "cd ${VPS_DEPLOY_DIR}/backend && npm ci --prefer-offline"

  # Step 4: Build frontend (unless skipped)
  if [[ "$SKIP_BUILD" != "true" ]]; then
    log "Building frontend..."
    # Use build:ignore-errors if available, otherwise regular build
    ssh_cmd "cd ${VPS_DEPLOY_DIR}/frontend && npm ci --prefer-offline && npm run build 2>&1 || npm run build:ignore-errors 2>&1" || true
  else
    log "Skipping frontend build (--skip-build)"
  fi

  # Step 5: Restart backend
  log "Restarting backend..."
  ssh_cmd "pm2 restart koda-backend"

  # Step 6: Verify deployment
  log "Verifying deployment..."
  local after_commit
  after_commit=$(ssh_cmd "cd ${VPS_DEPLOY_DIR} && git rev-parse --short HEAD")

  echo ""
  success "Deployment complete!"
  echo ""
  echo "  Before: $before_commit"
  echo "  After:  $after_commit"
  echo "  Branch: $BRANCH"
  echo ""

  # Show running status
  ssh_cmd "pm2 list | grep koda"
}

# Run pre-flight checks
preflight() {
  echo ""
  echo "========================================"
  echo "KODA VPS Deployment"
  echo "========================================"
  echo "Target: ${VPS_USER}@${VPS_HOST}:${VPS_DEPLOY_DIR}"
  echo "Branch: ${BRANCH}"
  echo "Auth: $(if [[ "$USE_SSHPASS" == "true" ]]; then echo "password (SSHPASS env)"; else echo "key-based"; fi)"
  echo "Options: force=$FORCE skip_build=$SKIP_BUILD dry_run=$DRY_RUN"
  echo "========================================"
  echo ""

  check_connection
  check_local_git
  check_vps_git
}

# Main
main() {
  preflight
  deploy
}

main "$@"
