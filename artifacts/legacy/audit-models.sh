#!/bin/bash

# Script to audit all API model references in Koda codebase
# Detects inconsistencies and provides recommendations

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   🔍 Koda API Model Audit Script${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

BACKEND_DIR="src"
OUTPUT_FILE="model-audit-report.txt"

# Create output file
echo "Koda API Model Audit Report" > "$OUTPUT_FILE"
echo "Generated: $(date)" >> "$OUTPUT_FILE"
echo "═══════════════════════════════════════════════════════════" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# 1. Count total model references
echo -e "${YELLOW}📊 Analyzing model references...${NC}"
TOTAL_REFS=$(grep -r "model:" --include="*.ts" --include="*.js" src/ 2>/dev/null | grep -E "(gpt-|gemini|claude)" | wc -l)
echo -e "${BLUE}   Total model references found: ${TOTAL_REFS}${NC}"
echo "Total model references: $TOTAL_REFS" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# 2. List all unique models
echo ""
echo -e "${YELLOW}📋 Unique models in use:${NC}"
echo "Unique Models:" >> "$OUTPUT_FILE"
grep -rh "model:" --include="*.ts" --include="*.js" src/ 2>/dev/null | \
    grep -oE "(gpt-[^'\"]+|gemini-[^'\"]+|claude-[^'\"]+)" | \
    sort | uniq -c | sort -rn | while read count model; do
        echo -e "   ${GREEN}${count}x${NC} ${model}"
        echo "  $count x $model" >> "$OUTPUT_FILE"
    done
echo "" >> "$OUTPUT_FILE"

# 3. Detect inconsistencies
echo ""
echo -e "${YELLOW}⚠️  Detecting inconsistencies...${NC}"
echo "Inconsistencies Detected:" >> "$OUTPUT_FILE"

# Check for outdated models
echo "" >> "$OUTPUT_FILE"
echo "Outdated Models:" >> "$OUTPUT_FILE"
OUTDATED=0

if grep -r "gpt-4-turbo-preview" --include="*.ts" src/ 2>/dev/null | grep -q "model:"; then
    echo -e "   ${RED}❌ Found gpt-4-turbo-preview (outdated, use gpt-4o)${NC}"
    echo "  ❌ gpt-4-turbo-preview (should be gpt-4o)" >> "$OUTPUT_FILE"
    grep -r "gpt-4-turbo-preview" --include="*.ts" src/ 2>/dev/null | grep "model:" >> "$OUTPUT_FILE"
    OUTDATED=$((OUTDATED + 1))
fi

if grep -r "gemini-1.5-flash" --include="*.ts" src/ 2>/dev/null | grep -q "model:"; then
    echo -e "   ${RED}❌ Found gemini-1.5-flash (outdated, use gemini-2.5-flash)${NC}"
    echo "  ❌ gemini-1.5-flash (should be gemini-2.5-flash)" >> "$OUTPUT_FILE"
    grep -r "gemini-1.5-flash" --include="*.ts" src/ 2>/dev/null | grep "model:" >> "$OUTPUT_FILE"
    OUTDATED=$((OUTDATED + 1))
fi

if grep -r "gemini-1.5-flash-latest" --include="*.ts" src/ 2>/dev/null | grep -q "model:"; then
    echo -e "   ${RED}❌ Found gemini-1.5-flash-latest (outdated, use gemini-2.5-flash)${NC}"
    echo "  ❌ gemini-1.5-flash-latest (should be gemini-2.5-flash)" >> "$OUTPUT_FILE"
    grep -r "gemini-1.5-flash-latest" --include="*.ts" src/ 2>/dev/null | grep "model:" >> "$OUTPUT_FILE"
    OUTDATED=$((OUTDATED + 1))
fi

if grep -r "gemini-2.0-flash-exp" --include="*.ts" src/ 2>/dev/null | grep -q "model:"; then
    echo -e "   ${YELLOW}⚠️  Found gemini-2.0-flash-exp (experimental, consider gemini-2.5-flash)${NC}"
    echo "  ⚠️  gemini-2.0-flash-exp (experimental)" >> "$OUTPUT_FILE"
    grep -r "gemini-2.0-flash-exp" --include="*.ts" src/ 2>/dev/null | grep "model:" >> "$OUTPUT_FILE"
fi

if [ $OUTDATED -eq 0 ]; then
    echo -e "   ${GREEN}✅ No outdated models found${NC}"
    echo "  ✅ No outdated models found" >> "$OUTPUT_FILE"
fi

# Summary
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   📊 Summary${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "═══════════════════════════════════════════════════════════" >> "$OUTPUT_FILE"
echo "Summary:" >> "$OUTPUT_FILE"
echo "═══════════════════════════════════════════════════════════" >> "$OUTPUT_FILE"

echo -e "   Total references: ${BLUE}${TOTAL_REFS}${NC}"
echo "  Total references: $TOTAL_REFS" >> "$OUTPUT_FILE"
echo -e "   Outdated models: ${RED}${OUTDATED}${NC}"
echo "  Outdated models: $OUTDATED" >> "$OUTPUT_FILE"
echo ""
echo "" >> "$OUTPUT_FILE"

echo -e "${GREEN}✅ Audit complete!${NC}"
echo -e "${BLUE}📄 Full report saved to: ${OUTPUT_FILE}${NC}"
echo ""
