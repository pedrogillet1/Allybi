#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "[dev] Starting local Postgres via docker-compose.dev.yml..."
cd "${ROOT}"
docker compose -f docker-compose.dev.yml up -d postgres

echo "[dev] Waiting for Postgres to become ready..."
for i in $(seq 1 60); do
  if docker exec koda_postgres_dev pg_isready -U koda -d koda_dev >/dev/null 2>&1; then
    echo "[dev] Postgres is ready."
    break
  fi
  sleep 1
  if [[ "${i}" == "60" ]]; then
    echo "[dev] Timed out waiting for Postgres. Check: docker logs koda_postgres_dev"
    exit 1
  fi
done

ENV_LOCAL="${ROOT}/backend/.env.local"
if [[ ! -f "${ENV_LOCAL}" ]]; then
  cat > "${ENV_LOCAL}" <<'EOF'
# Local overrides (loaded before backend/.env)
#
# docker-compose.dev.yml maps container 5432 -> localhost 5433
DATABASE_URL="postgresql://koda:koda@localhost:5433/koda_dev?schema=public"
DIRECT_DATABASE_URL="postgresql://koda:koda@localhost:5433/koda_dev?schema=public"
EOF
  echo "[dev] Wrote ${ENV_LOCAL}"
else
  echo "[dev] ${ENV_LOCAL} already exists (leaving as-is)."
fi

echo "[dev] Applying Prisma migrations..."
cd "${ROOT}/backend"
npx prisma migrate deploy
npx prisma generate

echo "[dev] Done. Start backend with: npm run dev"
