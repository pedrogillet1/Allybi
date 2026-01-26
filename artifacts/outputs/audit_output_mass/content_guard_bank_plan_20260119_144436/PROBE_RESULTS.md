# Content Guard Probe Results

## Summary
- **Date**: 2026-01-19T18:14:44.939Z
- **Overall Accuracy**: 100.00%
- **Gate (≥98%)**: ✓ PASS

## Bank Statistics
| Bank | Patterns |
|------|----------|
| EN Content | 442 |
| PT Content | 584 |
| EN Negative | 274 |
| PT Negative | 328 |

## Results by Language

### English (EN)
- **Total Probes**: 100
- **Passed**: 100
- **Failed**: 0
- **Accuracy**: 100.00%

✓ All EN probes passed

### Portuguese (PT)
- **Total Probes**: 120
- **Passed**: 120
- **Failed**: 0
- **Accuracy**: 100.00%

✓ All PT probes passed

## Critical Test Cases

### Q42 Pattern (Topics + Cover)
```
Query: "What topics does the Project Management Presentation cover?"
Expected: content
Result: ✓ PASS
```

### File Action Collision Prevention
```
Query: "List my files"
Expected: file_action
Result: ✓ PASS
```
