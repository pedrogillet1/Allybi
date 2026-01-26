#!/bin/bash

# Script to standardize all API model references in Koda codebase
# Replaces outdated models with recommended versions

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   🔧 Koda API Model Standardization Script${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

BACKEND_DIR="src"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="model-backups-${TIMESTAMP}"

# Create backup directory
mkdir -p "$BACKUP_DIR"
echo -e "${YELLOW}📦 Creating backups in: ${BACKUP_DIR}${NC}"
echo ""

# Define standardization rules
echo -e "${BLUE}📋 Standardization Rules:${NC}"
echo -e "   ${RED}gpt-4-turbo-preview${NC} → ${GREEN}gpt-4o${NC}"
echo -e "   ${RED}gemini-1.5-flash${NC} → ${GREEN}gemini-2.5-flash${NC}"
echo -e "   ${RED}gemini-1.5-flash-latest${NC} → ${GREEN}gemini-2.5-flash${NC}"
echo -e "   ${RED}gemini-2.0-flash-exp${NC} → ${GREEN}gemini-2.5-flash${NC}"
echo -e "   ${YELLOW}gemini-2.0-flash${NC} → ${GREEN}gemini-2.5-flash${NC} (optional)"
echo ""

echo -e "${YELLOW}🔄 Starting automatic standardization...${NC}"
echo ""

CHANGES_MADE=0

# Function to replace model in file
replace_model() {
    local file="$1"
    local old_model="$2"
    local new_model="$3"
    local description="$4"

    if grep -q "$old_model" "$file"; then
        # Backup the file
        local backup_path="$BACKUP_DIR/$(basename $file).backup"
        cp "$file" "$backup_path"

        # Replace the model (handle both single and double quotes)
        sed -i "s/'${old_model}'/'${new_model}'/g" "$file"
        sed -i "s/\"${old_model}\"/\"${new_model}\"/g" "$file"

        echo -e "   ${GREEN}✅${NC} $file"
        echo -e "      ${description}"
        CHANGES_MADE=$((CHANGES_MADE + 1))
    fi
}

# 1. Replace gpt-4-turbo-preview with gpt-4o
echo -e "${BLUE}1. Upgrading GPT-4 Turbo to GPT-4o...${NC}"
for file in $(grep -rl "gpt-4-turbo-preview" src/ 2>/dev/null | grep -E "\.(ts|js)$"); do
    replace_model "$file" "gpt-4-turbo-preview" "gpt-4o" "Upgraded to latest GPT-4 model"
done
if [ $CHANGES_MADE -eq 0 ]; then
    echo -e "   ${YELLOW}No files found with gpt-4-turbo-preview${NC}"
fi
echo ""

# 2. Replace gemini-1.5-flash with gemini-2.5-flash
PREV_CHANGES=$CHANGES_MADE
echo -e "${BLUE}2. Upgrading Gemini 1.5 to Gemini 2.5...${NC}"
for file in $(grep -rl "gemini-1.5-flash" src/ 2>/dev/null | grep -E "\.(ts|js)$"); do
    replace_model "$file" "gemini-1.5-flash" "gemini-2.5-flash" "Upgraded to latest Gemini model"
done
if [ $CHANGES_MADE -eq $PREV_CHANGES ]; then
    echo -e "   ${YELLOW}No files found with gemini-1.5-flash${NC}"
fi
echo ""

# 3. Replace gemini-1.5-flash-latest with gemini-2.5-flash
PREV_CHANGES=$CHANGES_MADE
echo -e "${BLUE}3. Upgrading Gemini 1.5 Flash Latest to Gemini 2.5...${NC}"
for file in $(grep -rl "gemini-1.5-flash-latest" src/ 2>/dev/null | grep -E "\.(ts|js)$"); do
    replace_model "$file" "gemini-1.5-flash-latest" "gemini-2.5-flash" "Upgraded to latest stable Gemini model"
done
if [ $CHANGES_MADE -eq $PREV_CHANGES ]; then
    echo -e "   ${YELLOW}No files found with gemini-1.5-flash-latest${NC}"
fi
echo ""

# 4. Replace gemini-2.0-flash-exp with gemini-2.5-flash
PREV_CHANGES=$CHANGES_MADE
echo -e "${BLUE}4. Replacing experimental Gemini with stable version...${NC}"
for file in $(grep -rl "gemini-2.0-flash-exp" src/ 2>/dev/null | grep -E "\.(ts|js)$"); do
    replace_model "$file" "gemini-2.0-flash-exp" "gemini-2.5-flash" "Replaced experimental with stable model"
done
if [ $CHANGES_MADE -eq $PREV_CHANGES ]; then
    echo -e "   ${YELLOW}No files found with gemini-2.0-flash-exp${NC}"
fi
echo ""

# 5. Upgrade gemini-2.0-flash to gemini-2.5-flash
PREV_CHANGES=$CHANGES_MADE
echo -e "${BLUE}5. Upgrading Gemini 2.0 to Gemini 2.5...${NC}"
for file in $(grep -rl "gemini-2.0-flash" src/ 2>/dev/null | grep -E "\.(ts|js)$"); do
    # Only replace if not already replaced (avoid double replacement)
    if grep -q "gemini-2.0-flash" "$file"; then
        replace_model "$file" "gemini-2.0-flash" "gemini-2.5-flash" "Upgraded to Gemini 2.5"
    fi
done
if [ $CHANGES_MADE -eq $PREV_CHANGES ]; then
    echo -e "   ${YELLOW}No files found with gemini-2.0-flash${NC}"
fi
echo ""

# Summary
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   📊 Standardization Complete${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ $CHANGES_MADE -gt 0 ]; then
    echo -e "${GREEN}✅ Modified ${CHANGES_MADE} files${NC}"
    echo -e "${BLUE}📦 Backups saved to: ${BACKUP_DIR}${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Review changes:"
    echo "   git diff src/"
    echo ""
    echo "2. Build and test:"
    echo "   npm run build"
    echo ""
    echo "3. If everything works, commit:"
    echo "   git add . && git commit -m 'Standardize API models to latest versions'"
    echo ""
    echo "4. To restore backups if needed:"
    echo "   cp ${BACKUP_DIR}/*.backup src/"
else
    echo -e "${GREEN}✅ No changes needed - all models are up to date!${NC}"
    rmdir "$BACKUP_DIR" 2>/dev/null || true
fi
echo ""
