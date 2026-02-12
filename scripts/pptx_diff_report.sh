#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <pptx1> <pptx2>" >&2
  exit 2
fi

P1="$1"
P2="$2"

tmp1="$(mktemp -d /tmp/pptx_a.XXXXXX)"
tmp2="$(mktemp -d /tmp/pptx_b.XXXXXX)"
cleanup() {
  rm -rf "$tmp1" "$tmp2"
}
trap cleanup EXIT

unzip -q "$P1" -d "$tmp1"
unzip -q "$P2" -d "$tmp2"

report_one() {
  local label="$1"
  local root="$2"
  echo "== ${label} =="
  echo "slides: $(ls -1 "$root/ppt/slides" 2>/dev/null | rg -c '^slide[0-9]+\\.xml$' || true)"
  echo "literal_ellipsis_in_slides: $(rg -o \"…|\\.\\.\\.\" \"$root/ppt/slides\" --glob '*.xml' 2>/dev/null | wc -l | tr -d ' ')"
  echo "autofit_tags:"
  rg -o "<a:(spAutoFit|noAutofit|normAutofit)\\s*/>" "$root/ppt/slides" --glob '*.xml' 2>/dev/null \
    | sed -E 's/.*<(a:[^/> ]+).*/\\1/' \
    | sort | uniq -c | sort -nr \
    | sed -E 's/^/  /' \
    || echo "  (none)"
  echo "picLocks_tags: $(rg -o \"<a:picLocks\" \"$root/ppt/slides\" --glob '*.xml' 2>/dev/null | wc -l | tr -d ' ')"
  echo "koda_icon_frames: $(rg -o \"koda:visual_frame:icon:[a-z_]+:[0-9]+\" \"$root/ppt/slides\" --glob '*.xml' 2>/dev/null | wc -l | tr -d ' ')"
  echo
}

report_one "PPTX_A" "$tmp1"
report_one "PPTX_B" "$tmp2"

