# Koda ChatGPT-Grade E2E Test Report

## Summary
- **Date**: 2026-01-16T16:18:57.192Z
- **Total Queries**: 16
- **Passed**: 7 (43.8%)
- **Failed**: 9
- **Fallback Count**: 0 (must be 0)

## Performance
| Metric | P50 | P95 |
|--------|-----|-----|
| TTFT | 406ms | 10391ms |
| Total | 4494ms | 44651ms |

## Results by Phase

### Phase A: 5/10 passed
### Phase B: 2/6 passed

## Launch Gate

| Check | Status |
|-------|--------|
| Inventory Works | ❌ |
| Filters Work | ❌ |
| Context Survives | ✅ |
| Buttons Render | ✅ |
| No Fallbacks | ✅ |
| Frontend Matches Backend | ✅ |

**VERDICT: NO-GO**

## Failed Queries

### D_FORMATTING_RENDER (6)

#### Q008: Group my files by folder....
- **Reasons**: has_folder_sections: Missing folder sections
- **TTFT**: 419ms, **Total**: 4494ms
- **Screenshot**: screenshots/Q008_failure.png
- **Answer preview**: trabalhos / stress test / pdf / pdf 2 (6)

2511.11383v1_Optimal Dividend Reinsurance and Capital Injectio.pdf
2511.11416v1_Enhancing Efficiency of Pension Schemes through Ef.pdf
2511.11481v1_Risk-Awar...

#### Q009: How many files total, and how many of each type?...
- **Reasons**: has_counts: Missing type counts
- **TTFT**: 6273ms, **Total**: 10364ms
- **Screenshot**: screenshots/Q009_failure.png
- **Answer preview**: Step 1:
To determine the total number of files, please specify the context or locations you are referring to. For example, are you asking about files in a Step 2:
I'm Koda, an AI assistant specialized...

#### Q010: Where is 'Rosewood Fund v3.xlsx' located?...
- **Reasons**: has_folder_path: No folder path found; has_file_button: No file button found
- **TTFT**: 346ms, **Total**: 4492ms
- **Screenshot**: screenshots/Q010_failure.png
- **Answer preview**: I couldn't find a file named "rosewood fund v3.xlsx".RegenerateCopy...

#### Q012: Where is it located?...
- **Reasons**: has_folder_path: No folder path found; has_file_button: No file button found
- **TTFT**: 377ms, **Total**: 4456ms
- **Screenshot**: screenshots/Q012_failure.png
- **Answer preview**: I couldn't find a file named "it located".RegenerateCopy...

#### Q013: Show it again (button only)....
- **Reasons**: has_file_button: No file button found; ttft_acceptable: TTFT too slow: 10391ms > 8000ms; total_time_acceptable: Total time too slow: 44573ms > 30000ms
- **TTFT**: 10391ms, **Total**: 44573ms
- **Screenshot**: screenshots/Q013_failure.png
- **Answer preview**: I couldn't find a file named "it located".RegenerateCopy...

### F_PERFORMANCE (3)

#### Q004: Show only spreadsheets (Excel)....
- **Reasons**: only_xlsx_files: Contains non-Excel files; ttft_acceptable: TTFT too slow: 10332ms > 8000ms; total_time_acceptable: Total time too slow: 44474ms > 30000ms
- **TTFT**: 10332ms, **Total**: 44474ms
- **Screenshot**: screenshots/Q004_failure.png
- **Answer preview**: 
2511.11383v1_Optimal Dividend Reinsurance and Capital Injectio.pdf (419.9 KB | trabalhos / stress test / pdf / pdf 2)
2511.11416v1_Enhancing Efficiency of Pension Schemes through Ef.pdf (545.3 KB | t...

#### Q005: Show only images....
- **Reasons**: only_image_files: Contains non-image files; ttft_acceptable: TTFT too slow: 10350ms > 8000ms; total_time_acceptable: Total time too slow: 44557ms > 30000ms
- **TTFT**: 10350ms, **Total**: 44557ms
- **Screenshot**: screenshots/Q005_failure.png
- **Answer preview**: 
2511.11383v1_Optimal Dividend Reinsurance and Capital Injectio.pdf (419.9 KB | trabalhos / stress test / pdf / pdf 2)
2511.11416v1_Enhancing Efficiency of Pension Schemes through Ef.pdf (545.3 KB | t...

#### Q016: Move 'TRABALHO FINAL (1).PNG' into a folder called...
- **Reasons**: confirms_action_or_explains: No action confirmation; total_time_acceptable: Total time too slow: 40349ms > 30000ms
- **TTFT**: 6183ms, **Total**: 40349ms
- **Screenshot**: screenshots/Q016_failure.png
- **Answer preview**: 
Lone Mountain Ranch P&L 2024.xlsx
Lone Mountain Ranch P&L 2024.xlsxtrabalhos / stress test / xlsxPreviewRegenerateCopy...
