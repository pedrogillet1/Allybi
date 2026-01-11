# KODA Local Development Guide

This guide describes how to set up and run KODA locally for development and testing, including running the upload truth-audit test suite.

## Quick Start

```bash
# One-command setup
./scripts/setup-local.sh

# Start backend (in terminal 1)
cd backend && npm run dev

# Start frontend (in terminal 2)
cd frontend && npm start

# Run upload tests (in terminal 3)
cd backend
TOKEN=$(node scripts/generate-test-token.js)
node scripts/upload-test-runner.js --all "$TOKEN"
```

## Prerequisites

- **Docker Desktop** (with Docker Compose)
- **Node.js 18+**
- **npm 9+**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LOCAL DEVELOPMENT STACK                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Frontend (localhost:3000)                                   │
│      │                                                       │
│      │ HTTP/WS                                               │
│      ▼                                                       │
│  Backend (localhost:5001)                                    │
│      │                                                       │
│      ├──► PostgreSQL (localhost:5432)                        │
│      │         Container: koda-postgres                      │
│      │                                                       │
│      ├──► MinIO S3 (localhost:9000)                          │
│      │         Container: koda-minio                         │
│      │         Console: localhost:9001                       │
│      │                                                       │
│      └──► Redis (localhost:6379)                             │
│               Container: koda-redis                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Manual Setup

### 1. Start Docker Services

```bash
# Start all containers
docker compose -f docker-compose.local.yml up -d

# Verify they're running
docker ps

# Expected output:
# koda-postgres  - PostgreSQL database
# koda-minio     - MinIO S3-compatible storage
# koda-redis     - Redis (for background jobs)
```

### 2. Configure Backend

```bash
cd backend

# Copy the local environment template
cp .env.example.local .env

# Install dependencies
npm install

# Generate Prisma client and run migrations
npx prisma generate
npx prisma db push
```

### 3. Configure Frontend

```bash
cd frontend

# Copy the local environment template
cp .env.example.local .env

# Install dependencies
npm install
```

### 4. Start Development Servers

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm start
```

## MinIO S3 Configuration

MinIO provides S3-compatible storage locally. The key environment variables:

```bash
# Backend .env
AWS_S3_ENDPOINT=http://localhost:9000
AWS_S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin123
AWS_S3_BUCKET=koda-local-uploads
```

### Why Path-Style URLs?

Local S3 emulators (MinIO/LocalStack) require **path-style** URLs instead of **virtual-hosted-style**:

```
# Path-style (required for MinIO)
http://localhost:9000/bucket-name/object-key

# Virtual-hosted-style (AWS default)
http://bucket-name.s3.amazonaws.com/object-key
```

The `AWS_S3_FORCE_PATH_STYLE=true` setting ensures presigned URLs work locally.

### MinIO Console

Access the MinIO web console at: http://localhost:9001
- Username: `minioadmin`
- Password: `minioadmin123`

You can browse uploaded files and manage buckets here.

## Running Upload Tests

### Generate Test Token

```bash
cd backend
TOKEN=$(node scripts/generate-test-token.js)
echo "$TOKEN"
```

### Run All Tests

```bash
node scripts/upload-test-runner.js --all "$TOKEN"
```

### Run Individual Tests

```bash
# Unicode filenames
node scripts/upload-test-runner.js unicode "$TOKEN"

# Nested folders
node scripts/upload-test-runner.js nested "$TOKEN"

# Edge cases (empty files, special chars)
node scripts/upload-test-runner.js edge-cases "$TOKEN"

# Bulk upload (600 files)
node scripts/upload-test-runner.js bulk "$TOKEN"

# Large files (50MB, 200MB)
node scripts/upload-test-runner.js large-50mb "$TOKEN"
node scripts/upload-test-runner.js large-200mb "$TOKEN"

# Network interruption simulation
node scripts/upload-test-runner.js network-interrupt "$TOKEN"

# Duplicate filenames
node scripts/upload-test-runner.js duplicate-names "$TOKEN"
```

### Verify Upload Results

```bash
# After running tests, verify with truth-report
node scripts/truth-report.js --session=<SESSION_ID> --expected=<FILE_COUNT>
```

## Test Suite Requirements

| Test | Files | Expected Result |
|------|-------|-----------------|
| unicode | 17 | All files uploaded with correct names |
| nested | ~50 | Folder structure preserved |
| edge-cases | ~20 | Special characters handled |
| bulk | 600 | All files uploaded, 0 orphaned |
| large-50mb | 1 | File uploaded successfully |
| large-200mb | 1 | Multipart upload works |
| network-interrupt | 17 | Graceful failure handling |
| duplicate-names | ~10 | Renamed duplicates handled |

## Troubleshooting

### Docker Issues

```bash
# Check container logs
docker logs koda-postgres
docker logs koda-minio
docker logs koda-redis

# Restart containers
docker compose -f docker-compose.local.yml restart

# Full reset (removes data)
docker compose -f docker-compose.local.yml down -v
docker compose -f docker-compose.local.yml up -d
```

### Database Issues

```bash
cd backend

# Reset database
npx prisma db push --force-reset

# View database
npx prisma studio
```

### MinIO Issues

```bash
# Create bucket manually
docker exec koda-minio mc alias set local http://localhost:9000 minioadmin minioadmin123
docker exec koda-minio mc mb local/koda-local-uploads

# List bucket contents
docker exec koda-minio mc ls local/koda-local-uploads
```

### Backend Won't Start

```bash
# Check S3 connectivity
curl http://localhost:9000/minio/health/live

# Check PostgreSQL
docker exec koda-postgres pg_isready -U koda -d koda_db

# Check Redis
docker exec koda-redis redis-cli ping
```

## Stopping Services

```bash
# Stop containers (keeps data)
docker compose -f docker-compose.local.yml stop

# Stop and remove containers (keeps data in volumes)
docker compose -f docker-compose.local.yml down

# Full cleanup (removes all data)
docker compose -f docker-compose.local.yml down -v
```

## Differences from Production

| Aspect | Local | Production |
|--------|-------|------------|
| S3 | MinIO (localhost:9000) | AWS S3 |
| Database | Local PostgreSQL | AWS RDS |
| Redis | Local Redis | Upstash Redis |
| SSL | HTTP | HTTPS |
| Auth | Test tokens | Google/Apple OAuth |

## Files Created/Modified

- `docker-compose.local.yml` - Docker services definition
- `scripts/setup-local.sh` - One-command setup script
- `backend/.env.example.local` - Backend env template
- `frontend/.env.example.local` - Frontend env template
- `backend/src/services/s3Storage.service.ts` - S3 with local endpoint support
- `backend/scripts/truth-report.js` - Truth report with local S3 support
