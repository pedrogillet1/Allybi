# Upload Truth Audit - Test Matrix

## Test Datasets

| Dataset | Description | Files | Expected Behavior |
|---------|-------------|-------|-------------------|
| **Folder A** | Nested structure (3 levels) | 150 txt files | All should upload, folder structure preserved |
| **Folder B** | Bulk flat files | 600 txt files | All should upload, tests concurrency limits |
| **Folder C** | Unicode/emoji filenames | 17 files | All should upload with NFC normalization |
| **Folder D** | Edge cases | 9 files (4 hidden, 4 valid, 1 zero-byte) | 4 hidden filtered, 5 uploaded |
| **Folder E** | Mixed batch with failures | 6 files (4 valid, 1 oversized, 1 invalid ext) | 4 succeed, 2 fail |

## Entry Points to Test

| Entry Point | Component | Upload Method | Test Command |
|-------------|-----------|---------------|--------------|
| 1 | UniversalUploadModal | uploadFolder() | Folder drag-drop |
| 2 | UploadHub | uploadFiles() | File picker |
| 3 | UploadModal | addDocument() | Single file |
| 4 | ChatInterface | uploadSingleFile() | Chat attachment |

## Test Execution Steps

1. Generate datasets: bash generate-test-datasets.sh
2. Upload via each entry point
3. Capture browser console (session ID)
4. Run: node truth-report.js <session_id>

## Session ID Format
- Format: timestamp-random (e.g., 1704825600000-abc123)
- Header: X-Upload-Session-Id
- Body field: uploadSessionId
