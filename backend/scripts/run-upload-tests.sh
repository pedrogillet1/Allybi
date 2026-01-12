#!/bin/bash
#
# Upload Test Runner Wrapper
# Usage: ./scripts/run-upload-tests.sh [test_name]
#
# Auto-generates auth token and runs upload tests.
# No secrets are printed to stdout.
#
# Test names:
#   unicode    - 17 files with unicode/emoji filenames
#   bulk600    - 600 files load test
#   edge       - Hidden file filtering test
#   all        - Run all tests sequentially
#
# Exit codes:
#   0 - All tests passed
#   1 - Test failed
#   2 - Token generation failed

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

cd "$BACKEND_DIR"

# Generate token (suppress output for security)
log_info "Generating auth token..."
TOKEN=$(node scripts/generate-test-token.js 2>/dev/null | head -1 | tr -d '\r\n')

if [ -z "$TOKEN" ]; then
    log_error "Failed to generate auth token"
    exit 2
fi

log_info "Token generated (not printed for security)"

TEST_NAME="${1:-all}"

# Map friendly names to actual test names
case "$TEST_NAME" in
    unicode)
        ACTUAL_TEST="unicode"
        ;;
    bulk600|bulk)
        ACTUAL_TEST="bulk"
        ;;
    edge|edge-cases)
        ACTUAL_TEST="edge-cases"
        ;;
    all)
        ACTUAL_TEST="--all"
        ;;
    *)
        log_error "Unknown test: $TEST_NAME"
        echo ""
        echo "Available tests:"
        echo "  unicode    - 17 files with unicode/emoji filenames"
        echo "  bulk600    - 600 files load test"
        echo "  edge       - Hidden file filtering test"
        echo "  all        - Run all tests sequentially"
        exit 1
        ;;
esac

log_info "Running test: $TEST_NAME"
echo ""

# Run the test (token is passed but not echoed)
if [ "$ACTUAL_TEST" = "--all" ]; then
    node scripts/upload-test-runner.js --all "$TOKEN"
else
    node scripts/upload-test-runner.js "$ACTUAL_TEST" "$TOKEN"
fi

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    log_info "Test completed successfully"
else
    log_error "Test failed with exit code $EXIT_CODE"
fi

exit $EXIT_CODE
