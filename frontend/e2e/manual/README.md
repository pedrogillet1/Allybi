# Allybi Manual Certification Kit

This folder contains the production-ready manual QA/certification kit.

## Files
1. `ALLYBI_FULL_REGRESSION_SUITE.md`
- End-to-end execution flow and release gates.

2. `ALLYBI_TEST_CASE_CATALOG.md`
- Canonical test IDs (`A/C/N/D/X/I/AP`) and expectations.

3. `ALLYBI_PROMPT_PACK.md`
- Exact normal-chat and viewer-editing prompts.

4. `ALLYBI_PROD_CERT_RESULTS_TEMPLATE.csv`
- Full result matrix template with all IDs.

5. `ALLYBI_PROD_CERT_REPORT_TEMPLATE.md`
- Final go/no-go report template.

6. `ALLYBI_RESULTS_TEMPLATE.csv`
- Small quick-start matrix (legacy/minimal).

## Quick Start
1. Copy `ALLYBI_PROD_CERT_RESULTS_TEMPLATE.csv` to a dated run file:
- `ALLYBI_PROD_CERT_RESULTS_<YYYY-MM-DD>.csv`
2. Run tests in order from `ALLYBI_FULL_REGRESSION_SUITE.md`.
3. Use prompts from `ALLYBI_PROMPT_PACK.md`.
4. Capture evidence in `evidence/<run-id>/`.
5. Fill `ALLYBI_PROD_CERT_REPORT_TEMPLATE.md` and publish:
- `ALLYBI_PROD_CERT_REPORT_<YYYY-MM-DD>.md`

