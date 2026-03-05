#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:5001}"
TEST_USER_EMAIL="${TEST_USER_EMAIL:-test@example.com}"
TEST_USER_PASSWORD="${TEST_USER_PASSWORD:-test123}"
VISIBILITY_TIMEOUT_SECONDS="${VISIBILITY_TIMEOUT_SECONDS:-15}"

post_json() {
  local url="$1"
  local payload="$2"
  local auth_header="${3:-}"
  local tmp_body
  tmp_body="$(mktemp)"

  if [[ -n "$auth_header" ]]; then
    local status
    status=$(curl -sS -o "$tmp_body" -w "%{http_code}" -X POST "$url" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $auth_header" \
      -d "$payload")
    echo "$status"
  else
    local status
    status=$(curl -sS -o "$tmp_body" -w "%{http_code}" -X POST "$url" \
      -H "Content-Type: application/json" \
      -d "$payload")
    echo "$status"
  fi

  cat "$tmp_body"
  rm -f "$tmp_body"
}

extract_json_field() {
  local field="$1"
  node -e "
const fs = require('fs');
const input = fs.readFileSync(0, 'utf8');
const obj = JSON.parse(input);
const parts = process.argv[1].split('.');
let cur = obj;
for (const p of parts) {
  if (cur == null) { process.exit(2); }
  cur = cur[p];
}
if (cur == null || cur === '') process.exit(3);
if (typeof cur === 'string') process.stdout.write(cur);
else process.stdout.write(JSON.stringify(cur));
" "$field"
}

contains_document_id() {
  local doc_id="$1"
  node -e "
const fs = require('fs');
const input = fs.readFileSync(0, 'utf8');
const obj = JSON.parse(input);
const docs = obj?.data?.documents;
if (!Array.isArray(docs)) process.exit(2);
const found = docs.some((d) => d && d.id === process.argv[1]);
process.exit(found ? 0 : 1);
" "$doc_id"
}

echo "[upload-proof] Logging in as ${TEST_USER_EMAIL}"
login_payload=$(printf '{"email":"%s","password":"%s"}' "$TEST_USER_EMAIL" "$TEST_USER_PASSWORD")
login_raw=$(post_json "${BACKEND_URL}/api/auth/login" "$login_payload")
login_status=$(printf '%s' "$login_raw" | head -n 1)
login_body=$(printf '%s' "$login_raw" | tail -n +2)
if [[ "$login_status" != "200" ]]; then
  echo "[upload-proof] Login failed with HTTP ${login_status}"
  echo "$login_body"
  exit 1
fi

access_token=$(printf '%s' "$login_body" | extract_json_field "accessToken")
echo "[upload-proof] Login succeeded"

file_name="visibility-proof-$(date +%s).txt"
bulk_payload=$(printf '{"files":[{"fileName":"%s","fileType":"text/plain","fileSize":64}]}' "$file_name")
echo "[upload-proof] Requesting presigned upload slot"
bulk_raw=$(post_json "${BACKEND_URL}/api/presigned-urls/bulk" "$bulk_payload" "$access_token")
bulk_status=$(printf '%s' "$bulk_raw" | head -n 1)
bulk_body=$(printf '%s' "$bulk_raw" | tail -n +2)
if [[ "$bulk_status" != "200" ]]; then
  echo "[upload-proof] /bulk failed with HTTP ${bulk_status}"
  echo "$bulk_body"
  exit 1
fi

document_ids_json=$(printf '%s' "$bulk_body" | extract_json_field "documentIds")
document_id=$(printf '%s' "$document_ids_json" | node -e "const fs=require('fs'); const arr=JSON.parse(fs.readFileSync(0,'utf8')); if(!Array.isArray(arr)||arr.length===0){process.exit(2);} process.stdout.write(String(arr[0]));")
echo "[upload-proof] Got documentId ${document_id}"

complete_payload=$(printf '{"documentIds":["%s"]}' "$document_id")
echo "[upload-proof] Completing upload registration"
complete_raw=$(post_json "${BACKEND_URL}/api/presigned-urls/complete" "$complete_payload" "$access_token")
complete_status=$(printf '%s' "$complete_raw" | head -n 1)
complete_body=$(printf '%s' "$complete_raw" | tail -n +2)
if [[ "$complete_status" != "200" ]]; then
  echo "[upload-proof] /complete failed with HTTP ${complete_status}"
  echo "$complete_body"
  exit 1
fi

echo "[upload-proof] Polling /api/batch/initial-data for visibility"
for ((i=1; i<=VISIBILITY_TIMEOUT_SECONDS; i++)); do
  tmp_body="$(mktemp)"
  status=$(curl -sS -o "$tmp_body" -w "%{http_code}" \
    -H "Authorization: Bearer ${access_token}" \
    "${BACKEND_URL}/api/batch/initial-data")
  body=$(cat "$tmp_body")
  rm -f "$tmp_body"

  if [[ "$status" == "200" ]]; then
    if printf '%s' "$body" | contains_document_id "$document_id"; then
      echo "[upload-proof] Document became visible after ${i}s"
      exit 0
    fi
  fi

  sleep 1
done

echo "[upload-proof] Document ${document_id} did not become visible within ${VISIBILITY_TIMEOUT_SECONDS}s"
exit 1
