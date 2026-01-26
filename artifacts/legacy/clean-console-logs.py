#!/usr/bin/env python3
"""
Clean console.log and console.warn statements from TypeScript files
while preserving console.error statements.
"""

import re
import sys

def clean_console_logs(content):
    """Remove console.log and console.warn, keep console.error"""
    lines = content.split('\n')
    result = []
    skip_until_semicolon = False
    paren_count = 0

    for line in lines:
        # Check if line starts with console.log or console.warn
        stripped = line.lstrip()

        if skip_until_semicolon:
            # Count parentheses to know when statement ends
            paren_count += line.count('(') - line.count(')')

            # Check if line ends the statement
            if ');' in line and paren_count <= 0:
                skip_until_semicolon = False
                paren_count = 0
            continue

        if stripped.startswith('console.log(') or stripped.startswith('console.warn('):
            # Count parentheses in this line
            paren_count = line.count('(') - line.count(')')

            # If statement doesn't end on this line, skip until it does
            if ');' not in line or paren_count > 0:
                skip_until_semicolon = True
            # Otherwise just skip this line
            continue

        result.append(line)

    return '\n'.join(result)

def main():
    if len(sys.argv) != 2:
        print("Usage: python clean-console-logs.py <file>")
        sys.exit(1)

    filename = sys.argv[1]

    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    cleaned = clean_console_logs(content)

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(cleaned)

    print(f"Cleaned {filename}")

if __name__ == '__main__':
    main()
