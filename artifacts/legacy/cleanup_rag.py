#!/usr/bin/env python3
"""
RAG Service Cleanup Script - Option B
Removes ~560 lines of dead code and aggressive comment cleanup
"""

import re
import sys

def remove_dead_code_blocks(lines):
    """Remove confirmed dead code blocks"""
    removed_count = 0
    result_lines = []
    i = 0
    in_multiline_comment = False
    multiline_start = -1

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Detect start of /* Old code removed - using folderNav service
        if '/* Old code removed' in line and 'folderNav' in line:
            in_multiline_comment = True
            multiline_start = i
            removed_count += 1
            i += 1
            continue

        # If in multiline comment, keep removing until we find */
        if in_multiline_comment:
            removed_count += 1
            if '*/' in line:
                in_multiline_comment = False
            i += 1
            continue

        # Dead code block 1: Lines 7913-7938 (enableComplexReasoning)
        # Look for the exact pattern
        if 'DISABLED: Complex reasoning for speed optimization' in line:
            # Remove from this line until we hit the else block
            removed_count += 1
            i += 1
            # Keep removing until we find the else or the comment about building evidence
            while i < len(lines):
                if '} else {' in lines[i]:
                    # Skip the "} else {" line too
                    removed_count += 1
                    i += 1
                    # Skip the console.log line after else
                    if i < len(lines) and 'console.log' in lines[i] and 'SPEED' in lines[i]:
                        removed_count += 1
                        i += 1
                    # Skip blank line
                    if i < len(lines) and lines[i].strip() == '':
                        removed_count += 1
                        i += 1
                    break
                removed_count += 1
                i += 1
            continue

        result_lines.append(line)
        i += 1

    return result_lines, removed_count

def remove_section_dividers(lines):
    """Remove section divider lines with only === or ---"""
    removed_count = 0
    result_lines = []

    for line in lines:
        stripped = line.strip()
        # Match lines that are ONLY comment dividers
        if re.match(r'^//\s*[═─]{20,}\s*$', stripped):
            removed_count += 1
            continue
        result_lines.append(line)

    return result_lines, removed_count

def remove_aggressive_comments(lines):
    """Aggressively remove unnecessary comments"""
    removed_count = 0
    result_lines = []
    i = 0

    # Patterns for comments to remove
    remove_patterns = [
        r'^\s*//\s*REASON:',
        r'^\s*//\s*WHY:',
        r'^\s*//\s*HOW:',
        r'^\s*//\s*IMPACT:',
        r'^\s*//\s*TODO:',
        r'^\s*//\s*FIXME:',
        r'^\s*//\s*NOTE:',
        r'^\s*//\s*CLEANUP:',
        r'^\s*//\s*MATHEMATICAL PROOF:',
        r'^\s*//\s*QUALITY IMPACT:',
        r'^\s*//\s*Generation steps per response:',
        r'^\s*//\s*Time per step',
        r'^\s*//\s*Difference:',
        r'^\s*//\s*Total saved:',
        r'^\s*//\s*- topK=',
        r'^\s*//\s*For RAG',
        r'^\s*//\s*Per-query adaptation',
        r'^\s*//\s*STUB IMPORTS:',
        r'^\s*//\s*Using stub implementations',
        r'^\s*//\s*âš¡\s*SPEED',
        r'^\s*//\s*âš¡\s*PERFORMANCE',
        r'^\s*//\s*âš¡\s*FAST',
        r'^\s*//\s*FIXED:',
        r'^\s*//\s*ENHANCED:',
        r'^\s*//\s*SAFEGUARD:',
        r'^\s*//\s*âœ…',
        r'^\s*//\s*âš ï¸',
        r'^\s*//\s*ðŸ"§',
        r'^\s*//\s*ðŸ"¥',
        r'^\s*//\s*Initialize',
        r'^\s*//\s*Per-query',
        r'^\s*//\s*Default to',
        r'^\s*//\s*Real Service',
        r'^\s*//\s*Calculation Engine',
        r'^\s*//\s*Format Validation',
        r'^\s*//\s*Confidence Scoring',
        r'^\s*//\s*Fallback System',
        r'^\s*//\s*ChatGPT-style',
        r'^\s*//\s*Infinite Conversation',
        r'^\s*//\s*Keep same',
        r'^\s*//\s*Reduced from',
    ]

    # Large comment blocks to remove entirely
    in_large_block = False
    block_start_patterns = [
        'ARCHITECTURE:',
        'KEY FEATURES:',
        'SPEED OPTIMIZATION',
        'HYBRID RAG SERVICE',
        'GEMINI MODEL CONFIGURATION',
        'âš¡ FAST CITATION',
        'TABLE CELL FIX',
        'FOLDER LISTING QUERY',
        'CALCULATION ENGINE',
        'FORMAT VALIDATION',
        'CONFIDENCE SCORING',
        'QA ORCHESTRATOR',
        'MASTER ANSWER',
        'CHATGPT-STYLE',
        'INFINITE CONVERSATION',
        'PSYCHOLOGICAL SAFETY',
        'FALLBACK SYSTEM',
    ]

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Remove JSDoc comment blocks (/** ... */) only if they're long and not for exports
        if stripped.startswith('/**') and not stripped.startswith('/***/'):
            # Find the end of JSDoc block
            j = i
            jsdoc_lines = []
            while j < len(lines) and '*/' not in lines[j]:
                jsdoc_lines.append(lines[j])
                j += 1
            if j < len(lines):
                jsdoc_lines.append(lines[j])
                j += 1

            # Check if next non-empty line is an export
            k = j
            while k < len(lines) and lines[k].strip() == '':
                k += 1

            is_export = False
            if k < len(lines):
                next_line = lines[k].strip()
                if next_line.startswith('export ') or next_line.startswith('public '):
                    is_export = True

            # Only remove if it's not for an export and is longer than 3 lines
            if not is_export and len(jsdoc_lines) > 3:
                removed_count += len(jsdoc_lines)
                i = j
                continue

        # Remove any comment-only line that's longer than 80 chars (likely explanatory)
        if stripped.startswith('//') and len(stripped) > 80:
            removed_count += 1
            i += 1
            continue

        # Check if this is a large comment block header
        if not in_large_block and stripped.startswith('//'):
            line_text = stripped[2:].strip()
            for block_pattern in block_start_patterns:
                if block_pattern in line_text:
                    # Count consecutive comment lines
                    block_size = 0
                    j = i
                    while j < len(lines) and (lines[j].strip().startswith('//') or lines[j].strip() == ''):
                        if lines[j].strip().startswith('//'):
                            block_size += 1
                        j += 1

                    # If block has 3+ comment lines, remove it (more aggressive)
                    if block_size >= 3:
                        in_large_block = True
                        block_end = j - 1
                        removed_count += (block_end - i + 1)
                        i = j
                        continue

        # Check individual remove patterns
        should_remove = False
        for pattern in remove_patterns:
            if re.match(pattern, stripped):
                should_remove = True
                removed_count += 1
                break

        if not should_remove:
            result_lines.append(line)

        i += 1

    return result_lines, removed_count

def clean_blank_lines(lines):
    """Remove excessive blank lines (more than 2 in a row)"""
    result_lines = []
    blank_count = 0
    removed_count = 0

    for line in lines:
        if line.strip() == '':
            blank_count += 1
            if blank_count <= 2:
                result_lines.append(line)
            else:
                removed_count += 1
        else:
            blank_count = 0
            result_lines.append(line)

    return result_lines, removed_count

def main():
    input_file = r'C:\Users\Pedro\Desktop\webapp\backend\src\services\rag.service.ts'
    output_file = r'C:\Users\Pedro\Desktop\webapp\backend\src\services\rag.service.ts.cleaned'

    print("Reading file...")
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    original_count = len(lines)
    print(f"Original line count: {original_count}")

    # Step 1: Remove dead code blocks
    print("\n1. Removing dead code blocks...")
    lines, dead_removed = remove_dead_code_blocks(lines)
    print(f"   Removed {dead_removed} lines")

    # Step 2: Remove section dividers
    print("\n2. Removing section dividers...")
    lines, dividers_removed = remove_section_dividers(lines)
    print(f"   Removed {dividers_removed} lines")

    # Step 3: Aggressive comment removal
    print("\n3. Removing aggressive comments...")
    lines, comments_removed = remove_aggressive_comments(lines)
    print(f"   Removed {comments_removed} lines")

    # Step 4: Clean excessive blank lines
    print("\n4. Cleaning excessive blank lines...")
    lines, blanks_removed = clean_blank_lines(lines)
    print(f"   Removed {blanks_removed} lines")

    final_count = len(lines)
    total_removed = original_count - final_count

    print(f"\n{'='*60}")
    print(f"SUMMARY:")
    print(f"  Original lines:  {original_count:,}")
    print(f"  Final lines:     {final_count:,}")
    print(f"  Lines removed:   {total_removed:,}")
    print(f"  Target removal:  ~560")
    print(f"  Target final:    ~10,210")
    print(f"{'='*60}")

    # Write cleaned file
    print(f"\nWriting cleaned file to: {output_file}")
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(lines)

    print("Cleanup complete!")

    # Show breakdown
    print(f"\nBreakdown:")
    print(f"  Dead code blocks:    {dead_removed:>4} lines")
    print(f"  Section dividers:    {dividers_removed:>4} lines")
    print(f"  Aggressive comments: {comments_removed:>4} lines")
    print(f"  Excess blank lines:  {blanks_removed:>4} lines")
    print(f"  {'-'*30}")
    print(f"  Total removed:       {total_removed:>4} lines")

if __name__ == '__main__':
    main()
