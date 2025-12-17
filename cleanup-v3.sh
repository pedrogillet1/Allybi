#!/bin/bash
# Koda V3 Cleanup Script
# Removes ALL V1, V2, and unused/legacy files
# Safe: Creates backup before deletion

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Koda V3 Cleanup - Remove V1/V2/Legacy       ║${NC}"
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo ""

# Check if we're in the right directory
if [ ! -d "backend/src/services" ]; then
    echo -e "${RED}Error: Must run from koda-webapp root directory${NC}"
    echo "Current directory: $(pwd)"
    exit 1
fi

cd backend/src

echo -e "${YELLOW}📊 Current state:${NC}"
TOTAL_FILES=$(find . -name "*.ts" -not -path "*/node_modules/*" | wc -l)
echo "  Total TypeScript files: $TOTAL_FILES"
echo ""

# Create backup
echo -e "${YELLOW}📦 Creating backup...${NC}"
BACKUP_DIR="../backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/backup-before-v3-cleanup-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$BACKUP_FILE" .
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo -e "${GREEN}✅ Backup created: $BACKUP_FILE ($BACKUP_SIZE)${NC}"
echo ""

echo ""
echo -e "${GREEN}🗑️  Starting cleanup...${NC}"
echo ""

# Counter
REMOVED=0

# ============================================================
# 1. Remove V1 Services (11 files)
# ============================================================
echo -e "${YELLOW}[1/6] Removing V1 services...${NC}"

V1_FILES=(
    "services/formatting/formattingPipelineV1.service.ts"
    "services/formatting/kodaAnswerValidationEngineV1.service.ts"
    "services/formatting/kodaCitationEngineV1.service.ts"
    "services/formatting/kodaFormatEngineV1.service.ts"
    "services/formatting/kodaOutputStructureEngineV1.service.ts"
    "services/formatting/kodaUnifiedPostProcessorV1.service.ts"
    "services/retrieval/kodaCitationFormatV1.service.ts"
    "services/retrieval/kodaRetrievalEngineV1.service.ts"
    "config/kodaV1.config.ts"
    "types/kodaV1.types.ts"
    "types/ragV1.types.ts"
)

for file in "${V1_FILES[@]}"; do
    if [ -f "$file" ]; then
        rm -f "$file"
        echo "  ✓ Removed: $file"
        ((REMOVED++))
    fi
done

# ============================================================
# 2. Remove V2 Services (5 files)
# ============================================================
echo ""
echo -e "${YELLOW}[2/6] Removing V2 services...${NC}"

V2_FILES=(
    "services/core/kodaIntentEngineV2.service.ts"
    "services/core/ragV2.service.ts"
    "services/retrieval/kodaRetrievalEngineV2.service.ts"
    "types/intentV2.types.ts"
    "types/ragV2.types.ts"
)

for file in "${V2_FILES[@]}"; do
    if [ -f "$file" ]; then
        rm -f "$file"
        echo "  ✓ Removed: $file"
        ((REMOVED++))
    fi
done

# ============================================================
# 3. Remove Calculation Services (17 files)
# ============================================================
echo ""
echo -e "${YELLOW}[3/6] Removing calculation services...${NC}"

# Remove calculation directory
if [ -d "services/calculation" ]; then
    CALC_COUNT=$(find services/calculation -name "*.ts" | wc -l)
    rm -rf services/calculation
    echo "  ✓ Removed: services/calculation/ ($CALC_COUNT files)"
    REMOVED=$((REMOVED + CALC_COUNT))
fi

# Remove individual calculation files
CALC_FILES=(
    "services/calculation.service.ts"
    "services/calculationEngine.service.ts"
    "services/financialCalculator.service.ts"
    "tests/07-calculation.test.ts"
)

for file in "${CALC_FILES[@]}"; do
    if [ -f "$file" ]; then
        rm -f "$file"
        echo "  ✓ Removed: $file"
        ((REMOVED++))
    fi
done

# ============================================================
# 4. Remove Legacy AI Services (5 files)
# ============================================================
echo ""
echo -e "${YELLOW}[4/6] Removing legacy AI services...${NC}"

LEGACY_AI_FILES=(
    "services/agent.service.ts"
    "services/explanation.service.ts"
    "services/persona.service.ts"
    "services/mistral-ocr.service.ts"
    "services/vision.service.ts"
)

for file in "${LEGACY_AI_FILES[@]}"; do
    if [ -f "$file" ]; then
        rm -f "$file"
        echo "  ✓ Removed: $file"
        ((REMOVED++))
    fi
done

# ============================================================
# 5. Remove Old Pipelines (19 files)
# ============================================================
echo ""
echo -e "${YELLOW}[5/6] Removing old pipelines...${NC}"

# Remove centralized directory
if [ -d "centralized" ]; then
    CENT_COUNT=$(find centralized -name "*.ts" | wc -l)
    rm -rf centralized
    echo "  ✓ Removed: centralized/ ($CENT_COUNT files)"
    REMOVED=$((REMOVED + CENT_COUNT))
fi

# Remove koda-4-layer-pipeline directory
if [ -d "koda-4-layer-pipeline" ]; then
    LAYER_COUNT=$(find koda-4-layer-pipeline -name "*.ts" | wc -l)
    rm -rf koda-4-layer-pipeline
    echo "  ✓ Removed: koda-4-layer-pipeline/ ($LAYER_COUNT files)"
    REMOVED=$((REMOVED + LAYER_COUNT))
fi

# ============================================================
# 6. Remove Other Legacy (10 files)
# ============================================================
echo ""
echo -e "${YELLOW}[6/6] Removing other legacy services...${NC}"

OTHER_LEGACY_FILES=(
    "rag.service.ts"
    "services/rag.service.ts"
    "services/errorMessages.service.ts"
    "services/graceful-degradation.service.ts"
    "services/imageProcessing.service.ts"
    "services/numericFactsExtractor.service.ts"
    "services/performanceMonitor.service.ts"
    "services/statusEmitter.service.ts"
    "services/systemPromptTemplates.service.ts"
)

for file in "${OTHER_LEGACY_FILES[@]}"; do
    if [ -f "$file" ]; then
        rm -f "$file"
        echo "  ✓ Removed: $file"
        ((REMOVED++))
    fi
done

# ============================================================
# 7. Clean up empty directories
# ============================================================
echo ""
echo -e "${YELLOW}🧹 Cleaning up empty directories...${NC}"
EMPTY_DIRS=$(find . -type d -empty | wc -l)
find . -type d -empty -delete 2>/dev/null || true
if [ $EMPTY_DIRS -gt 0 ]; then
    echo "  ✓ Removed $EMPTY_DIRS empty directories"
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Cleanup Complete!                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""

REMAINING_FILES=$(find . -name "*.ts" -not -path "*/node_modules/*" | wc -l)
REDUCTION=$((TOTAL_FILES - REMAINING_FILES))

echo -e "${GREEN}📊 Summary:${NC}"
echo "  Files before:  $TOTAL_FILES"
echo "  Files removed: $REMOVED"
echo "  Files after:   $REMAINING_FILES"
echo ""
echo -e "${GREEN}📦 Backup:${NC}"
echo "  Location: $BACKUP_FILE"
echo "  Size:     $BACKUP_SIZE"
echo ""
echo -e "${GREEN}✅ V3 Services Remaining:${NC}"
echo "  - kodaOrchestrator.service.ts"
echo "  - kodaIntentEngine.service.ts"
echo "  - kodaPatternClassification.service.ts"
echo "  - kodaFallbackEngine.service.ts"
echo "  - kodaFormattingPipeline.service.ts"
echo "  - kodaDocumentListingFormatter.service.ts"
echo "  - kodaMarkerGenerator.service.ts"
