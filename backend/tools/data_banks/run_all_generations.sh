#!/bin/bash
# Run all data bank generations sequentially with logging

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."

LOG_DIR="/tmp/data_bank_gen"
mkdir -p "$LOG_DIR"

export TS_NODE_TRANSPILE_ONLY=true

echo "=== Koda Data Bank Batch Generator ===" | tee "$LOG_DIR/main.log"
echo "Started: $(date)" | tee -a "$LOG_DIR/main.log"

# Function to run a generation
run_gen() {
  local type=$1
  local name=$2
  echo "[$(date +%H:%M:%S)] Starting $type/$name..." | tee -a "$LOG_DIR/main.log"
  npx ts-node tools/data_banks/generate_banks.ts "$type" "$name" > "$LOG_DIR/${type}_${name}.log" 2>&1
  local status=$?
  if [ $status -eq 0 ]; then
    echo "[$(date +%H:%M:%S)] ✓ Completed $type/$name" | tee -a "$LOG_DIR/main.log"
  else
    echo "[$(date +%H:%M:%S)] ✗ Failed $type/$name (exit $status)" | tee -a "$LOG_DIR/main.log"
  fi
  # Rate limit
  sleep 2
}

# === TRIGGERS ===
echo "" | tee -a "$LOG_DIR/main.log"
echo "=== TRIGGERS ===" | tee -a "$LOG_DIR/main.log"

run_gen triggers legal_subintents
run_gen triggers accounting_subintents
run_gen triggers medical_subintents
run_gen triggers help_subintents
run_gen triggers edit_subintents
run_gen triggers reasoning_subintents
run_gen triggers doc_stats_subintents

# === NEGATIVES ===
echo "" | tee -a "$LOG_DIR/main.log"
echo "=== NEGATIVES ===" | tee -a "$LOG_DIR/main.log"

run_gen negatives not_help
run_gen negatives not_conversation
run_gen negatives not_reasoning
run_gen negatives not_excel_finance
run_gen negatives not_inventory_when_doc_stats
run_gen negatives not_filename_when_locator
run_gen negatives force_clarify
run_gen negatives force_disambiguate

# === OVERLAYS ===
echo "" | tee -a "$LOG_DIR/main.log"
echo "=== OVERLAYS ===" | tee -a "$LOG_DIR/main.log"

run_gen overlays followup_inherit
run_gen overlays followup_file_actions
run_gen overlays clarify_required
run_gen overlays drift_detectors
run_gen overlays scope_rules

# === FORMATTING ===
echo "" | tee -a "$LOG_DIR/main.log"
echo "=== FORMATTING ===" | tee -a "$LOG_DIR/main.log"

run_gen formatting constraints
run_gen formatting validators
run_gen formatting repair_rules
run_gen formatting readability_rules

# === NORMALIZERS ===
echo "" | tee -a "$LOG_DIR/main.log"
echo "=== NORMALIZERS ===" | tee -a "$LOG_DIR/main.log"

run_gen normalizers language_indicators
run_gen normalizers filename
run_gen normalizers filetypes
run_gen normalizers months
run_gen normalizers quarters
run_gen normalizers time_windows
run_gen normalizers numbers_currency
run_gen normalizers typos
run_gen normalizers diacritics_pt
run_gen normalizers diacritics_es
run_gen normalizers abbreviations_finance
run_gen normalizers abbreviations_legal
run_gen normalizers abbreviations_medical

# === LEXICONS ===
echo "" | tee -a "$LOG_DIR/main.log"
echo "=== LEXICONS ===" | tee -a "$LOG_DIR/main.log"

run_gen lexicons finance
run_gen lexicons accounting
run_gen lexicons legal
run_gen lexicons medical
run_gen lexicons excel
run_gen lexicons project_agile
run_gen lexicons marketing_service_quality
run_gen lexicons analytics_telemetry
run_gen lexicons ui_navigation

# === TEMPLATES ===
echo "" | tee -a "$LOG_DIR/main.log"
echo "=== TEMPLATES ===" | tee -a "$LOG_DIR/main.log"

run_gen templates answer_styles
run_gen templates file_actions_microcopy
run_gen templates clarify_templates
run_gen templates error_templates

echo "" | tee -a "$LOG_DIR/main.log"
echo "=== ALL GENERATIONS COMPLETE ===" | tee -a "$LOG_DIR/main.log"
echo "Finished: $(date)" | tee -a "$LOG_DIR/main.log"

# Summary
echo "" | tee -a "$LOG_DIR/main.log"
echo "=== SUMMARY ===" | tee -a "$LOG_DIR/main.log"
ls -la /Users/pg/Desktop/koda-webapp/backend/src/data_banks/*/*.json 2>/dev/null | wc -l | xargs echo "Total JSON files generated:" | tee -a "$LOG_DIR/main.log"
