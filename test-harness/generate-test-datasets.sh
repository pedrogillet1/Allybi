#!/bin/bash
# ==============================================================================
# UPLOAD TRUTH AUDIT - Test Dataset Generator
# ==============================================================================
# Creates test folders A-E for comprehensive upload testing

set -e

BASE_DIR="/tmp/upload-test-datasets"
rm -rf "$BASE_DIR"
mkdir -p "$BASE_DIR"

echo "📁 Creating test datasets in $BASE_DIR"

# ==============================================================================
# FOLDER A: 150 files + nested subfolders (3 levels)
# ==============================================================================
echo "📂 Creating Folder A: 150 files with nested structure..."
FOLDER_A="$BASE_DIR/FolderA_Nested"
mkdir -p "$FOLDER_A"

# Create 3-level nested structure
for level1 in {1..5}; do
    mkdir -p "$FOLDER_A/level1_$level1"
    for level2 in {1..3}; do
        mkdir -p "$FOLDER_A/level1_$level1/level2_$level2"
        for level3 in {1..2}; do
            mkdir -p "$FOLDER_A/level1_$level1/level2_$level2/level3_$level3"
        done
    done
done

# Create 150 files distributed across structure
count=0
for level1 in {1..5}; do
    for level2 in {1..3}; do
        for level3 in {1..2}; do
            for f in {1..5}; do
                count=$((count + 1))
                echo "Test content for file $count - FolderA nested test" > "$FOLDER_A/level1_$level1/level2_$level2/level3_$level3/file_$count.txt"
            done
        done
    done
done

echo "   Created $count files in Folder A"

# ==============================================================================
# FOLDER B: 600 flat files
# ==============================================================================
echo "📂 Creating Folder B: 600 flat files..."
FOLDER_B="$BASE_DIR/FolderB_Bulk"
mkdir -p "$FOLDER_B"

for i in $(seq 1 600); do
    printf "Bulk test file %04d - content for stress testing\n" $i > "$FOLDER_B/bulk_file_$(printf '%04d' $i).txt"
done
echo "   Created 600 files in Folder B"

# ==============================================================================
# FOLDER C: Unicode filenames (NFC/NFD variants + emoji)
# ==============================================================================
echo "📂 Creating Folder C: Unicode and emoji filenames..."
FOLDER_C="$BASE_DIR/FolderC_Unicode"
mkdir -p "$FOLDER_C"

# NFC normalized names
echo "Capítulo content" > "$FOLDER_C/Capítulo_NFC.txt"
echo "Café content" > "$FOLDER_C/Café_NFC.txt"
echo "Niño content" > "$FOLDER_C/Niño_NFC.txt"
echo "Résumé content" > "$FOLDER_C/Résumé_NFC.txt"

# Japanese
echo "日本語 content" > "$FOLDER_C/日本語ファイル.txt"
echo "こんにちは content" > "$FOLDER_C/こんにちは.txt"

# Chinese
echo "中文 content" > "$FOLDER_C/中文文件.txt"

# Korean
echo "한국어 content" > "$FOLDER_C/한국어파일.txt"

# Arabic
echo "Arabic content" > "$FOLDER_C/ملف_عربي.txt"

# Emoji filenames
echo "Emoji 1 content" > "$FOLDER_C/📄_document.txt"
echo "Emoji 2 content" > "$FOLDER_C/🎉_celebration.txt"
echo "Emoji 3 content" > "$FOLDER_C/🚀_rocket_launch.txt"
echo "Mixed emoji" > "$FOLDER_C/File_with_🔥_emoji.txt"

# Spaces and special chars
echo "Spaces content" > "$FOLDER_C/File With Spaces.txt"
echo "Parens content" > "$FOLDER_C/File (with) parens.txt"
echo "Brackets content" > "$FOLDER_C/File [with] brackets.txt"

# NFD variants (decomposed form) - manually create decomposed
# Note: This may not work perfectly on all systems
echo "NFD test" > "$FOLDER_C/Cafe\xcc\x81_NFD.txt" 2>/dev/null || echo "NFD test" > "$FOLDER_C/Cafe_NFD.txt"

echo "   Created unicode test files in Folder C"

# ==============================================================================
# FOLDER D: Edge cases (0-byte, hidden files)
# ==============================================================================
echo "📂 Creating Folder D: Edge cases..."
FOLDER_D="$BASE_DIR/FolderD_EdgeCases"
mkdir -p "$FOLDER_D"

# 0-byte file
touch "$FOLDER_D/zero_byte_file.txt"

# Hidden files (should be filtered)
echo "DS_Store content" > "$FOLDER_D/.DS_Store"
echo "Thumbs content" > "$FOLDER_D/Thumbs.db"
echo "gitignore content" > "$FOLDER_D/.gitignore"
echo "localized content" > "$FOLDER_D/.localized"

# Valid files
echo "Valid file 1" > "$FOLDER_D/valid_file_1.txt"
echo "Valid file 2" > "$FOLDER_D/valid_file_2.txt"
echo "Valid file 3" > "$FOLDER_D/valid_file_3.txt"

# Nested hidden folder
mkdir -p "$FOLDER_D/__MACOSX"
echo "MACOSX content" > "$FOLDER_D/__MACOSX/._hidden_resource"

echo "   Created edge case files in Folder D (4 hidden, 4 valid, 1 zero-byte)"

# ==============================================================================
# FOLDER E: Mixed batch with intentional failure
# ==============================================================================
echo "📂 Creating Folder E: Mixed batch with intentional failures..."
FOLDER_E="$BASE_DIR/FolderE_MixedBatch"
mkdir -p "$FOLDER_E"

# 4 valid files
echo "Valid content 1" > "$FOLDER_E/valid_1.txt"
echo "Valid content 2" > "$FOLDER_E/valid_2.txt"
echo "Valid content 3" > "$FOLDER_E/valid_3.txt"
echo "Valid content 4" > "$FOLDER_E/valid_4.txt"

# 1 oversized file (create 501MB file to exceed 500MB limit)
echo "   Creating 501MB oversized file (this may take a moment)..."
dd if=/dev/zero of="$FOLDER_E/oversized_501MB.bin" bs=1M count=501 2>/dev/null || {
    # Fallback: create smaller "fake" oversized file with marker
    echo "OVERSIZED_MARKER_FILE" > "$FOLDER_E/oversized_501MB.bin"
    echo "   (Created marker file instead - actual size test requires 501MB disk space)"
}

# 1 file with invalid extension (should be rejected by backend)
echo "Invalid extension content" > "$FOLDER_E/malicious.exe"

echo "   Created mixed batch in Folder E"

# ==============================================================================
# Summary
# ==============================================================================
echo ""
echo "✅ Test datasets created successfully!"
echo ""
echo "Dataset Summary:"
echo "  📁 FolderA_Nested: 150 files in 3-level nested structure"
echo "  📁 FolderB_Bulk: 600 flat files for stress testing"
echo "  📁 FolderC_Unicode: 17 files with unicode/emoji names"
echo "  📁 FolderD_EdgeCases: 9 files (4 hidden, 4 valid, 1 zero-byte)"
echo "  📁 FolderE_MixedBatch: 6 files (4 valid, 1 oversized, 1 invalid ext)"
echo ""
echo "Total files created: $(find "$BASE_DIR" -type f | wc -l)"
echo "Location: $BASE_DIR"
