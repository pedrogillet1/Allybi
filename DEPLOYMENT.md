# KODA VPS Deployment Guide

This document describes the deterministic deployment workflow for KODA.

## Golden Rule

**NEVER use SCP, manual file edits, or any other method to modify files on the VPS.**

All changes must flow through git:
1. Make changes locally
2. Commit and push to `origin/main`
3. Run `./scripts/deploy_vps.sh`

This ensures the VPS always matches the git repository exactly.

## Quick Start

```bash
# Standard deployment (from repo root)
./scripts/deploy_vps.sh

# Backend-only changes (faster, skips frontend build)
./scripts/deploy_vps.sh --backend-only

# Force deployment if VPS has local changes
./scripts/deploy_vps.sh --force

# Preview what would happen
./scripts/deploy_vps.sh --dry-run
```

## Prerequisites

1. **SSH access** to VPS configured (key-based or password)
2. **Local repo** is up to date with `origin/main`
3. **Changes committed and pushed** before deployment

## Deployment Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT WORKFLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  LOCAL                           VPS                         │
│  ─────                           ───                         │
│                                                              │
│  1. Make changes                                             │
│  2. git commit                                               │
│  3. git push origin main                                     │
│          │                                                   │
│          │                                                   │
│          ▼                                                   │
│  4. ./scripts/deploy_vps.sh ───────► git fetch origin        │
│                                      git reset --hard        │
│                                      npm ci (backend)        │
│                                      npm run build (frontend)│
│                                      pm2 restart             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## What the Deploy Script Does

1. **Pre-flight checks**
   - Verifies VPS connection
   - Checks local git status
   - Checks VPS git status for drift

2. **Deployment**
   - `git fetch origin main`
   - `git reset --hard origin/main` (deterministic sync)
   - `npm ci` in backend (clean install from lockfile)
   - `npm run build` in frontend (if not skipped)
   - `pm2 restart koda-backend`

3. **Verification**
   - Shows before/after commit hashes
   - Displays pm2 process status

## Handling "Local Changes Would Be Overwritten"

This error occurs when files on VPS differ from git. The deploy script prevents this:

### Scenario: VPS has uncommitted changes
```bash
# Deploy script will fail with:
# [ERROR] VPS has uncommitted changes. Use --force to reset

# Option 1: Force reset (DISCARDS VPS CHANGES)
./scripts/deploy_vps.sh --force

# Option 2: SSH in and manually commit if changes are important
ssh root@31.97.255.253
cd /home/koda/koda-webapp
git status
git diff  # Review changes
git stash  # Or commit them
```

### Why This Happens
- Someone used SCP to copy files directly (DON'T DO THIS)
- Manual edits via SSH (DON'T DO THIS)
- Testing changes directly on VPS (Use a dev branch instead)

### Prevention
1. **Never SCP files** - Always commit and deploy
2. **Never edit on VPS** - Edit locally, push, deploy
3. **Use `--force` sparingly** - It discards uncommitted VPS changes

## Command Options

| Option | Description |
|--------|-------------|
| `--force` | Reset VPS to origin/main even if local changes exist |
| `--skip-build` | Skip frontend build (useful for backend-only changes) |
| `--backend-only` | Only restart backend, no frontend operations |
| `--dry-run` | Show what would happen without making changes |
| `--help` | Show help |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VPS_HOST` | 31.97.255.253 | VPS IP address |
| `VPS_USER` | root | SSH user |
| `VPS_DEPLOY_DIR` | /home/koda/koda-webapp | App directory on VPS |
| `BRANCH` | main | Branch to deploy |

## Examples

### Deploy backend changes only
```bash
git add backend/
git commit -m "fix: update API endpoint"
git push origin main
./scripts/deploy_vps.sh --backend-only
```

### Deploy with custom branch
```bash
BRANCH=feature-branch ./scripts/deploy_vps.sh
```

### Full deployment with build
```bash
git push origin main
./scripts/deploy_vps.sh
```

## Rollback

To rollback to a previous commit:

```bash
# On local machine
git log --oneline -10  # Find the commit to rollback to
git reset --hard <commit-hash>
git push origin main --force-with-lease
./scripts/deploy_vps.sh --force
```

Or directly on VPS:
```bash
ssh root@31.97.255.253
cd /home/koda/koda-webapp
git log --oneline -10
git reset --hard <commit-hash>
pm2 restart koda-backend
```

## Troubleshooting

### Deploy fails with SSH error
```bash
# Check SSH connectivity
ssh root@31.97.255.253 echo "connected"

# If using password, ensure sshpass is installed
brew install sshpass  # macOS with hudochenkov/sshpass tap
```

### Frontend build fails
```bash
# Skip frontend and deploy backend only
./scripts/deploy_vps.sh --backend-only

# Then fix frontend locally and redeploy
```

### PM2 process not found
```bash
ssh root@31.97.255.253
cd /home/koda/koda-webapp/backend
pm2 start npm --name koda-backend -- start
pm2 save
```

## Safety Features

1. **Drift Detection**: Script fails if VPS has local changes (unless `--force`)
2. **Deterministic State**: `git reset --hard` ensures VPS matches git exactly
3. **Clean Installs**: `npm ci` ensures dependencies match lockfile
4. **Visibility**: Logs before/after commit hashes for audit trail

## CI/CD Integration (Future)

This script can be called from GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy to VPS
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        env:
          SSH_PRIVATE_KEY: ${{ secrets.VPS_SSH_KEY }}
        run: ./scripts/deploy_vps.sh --force
```
