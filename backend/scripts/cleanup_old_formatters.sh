#!/bin/bash

# ============================================================================
# KODA - CLEANUP OLD FORMATTERS SCRIPT
# ============================================================================
# This script archives (moves) old formatting services that have been replaced
# by the unified kodaUnifiedPostProcessor.service.ts
#
# Author: Unified Post-Processing Implementation
# Date: 2025-12-08
# ============================================================================

echo "🔥 Archiving old, conflicting formatting services..."

SERVICES_DIR="./src/services"
ARCHIVE_DIR="./src/services/archived_formatters"
ARCHIVED_COUNT=0

# Create archive directory if it doesn't exist
mkdir -p "$ARCHIVE_DIR"

# List of old services to archive (not delete - for safety)
OLD_SERVICES=(
  "formatEnforcement.service.ts"
  "formatEnforcementV2.service.ts"
  "formatValidation.service.ts"
  "responseFormatter.service.ts"
  "outputPostProcessor.service.ts"
  "answerPostProcessor.service.ts"
  "kodaFormatEnforcement.service.ts"
)

for service in "${OLD_SERVICES[@]}"; do
  FILE_PATH="$SERVICES_DIR/$service"
  if [ -f "$FILE_PATH" ]; then
    echo "  📦 Archiving: $FILE_PATH"
    mv "$FILE_PATH" "$ARCHIVE_DIR/"
    ((ARCHIVED_COUNT++))
  else
    echo "  ⏭️  Not found (already archived or removed): $FILE_PATH"
  fi
done

echo ""
echo "✅ Cleanup complete. Archived $ARCHIVED_COUNT old services to $ARCHIVE_DIR"
echo "✨ Your post-processing is now unified!"
echo ""
echo "📝 NOTE: The archived services are in $ARCHIVE_DIR"
echo "   You can delete them later once you verify everything works."
