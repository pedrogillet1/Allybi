# Notification System V2 - QA Testing Script

**Purpose:** Systematically verify all aspects of the unified notification system
**Time Required:** ~30 minutes
**Prerequisites:** Frontend running locally, NotificationPlayground accessible

---

## Setup

1. Start frontend: `cd frontend && npm start`
2. Login to app
3. Navigate to NotificationPlayground: `/notifications-playground` (or add route manually)
4. Open DevTools Console + Network tab
5. Open browser localStorage inspector

---

## Test 1: Deduplication (Content-Based Keys)

### Objective
Verify same notification fired multiple times doesn't spam UI

### Steps
1. Click **"Spam Test (10x)"** button in NotificationPlayground
2. Observe active toasts

### Expected Result
- ✅ Only 1 toast appears (not 10)
- ✅ Console shows: "Spam count: 1, 2, 3..." (incrementing)
- ✅ Inbox shows only 1 new notification (not 10)

### Pass Criteria
- Only 1 toast visible despite 10 identical calls
- No duplicate entries in inbox

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 2: Language Switching (Active Toasts)

### Objective
Verify existing toasts re-render with new language

### Steps
1. Click **"File Types Detected"** button
2. Observe toast appears with English text
3. Click **"Português"** language button (while toast is still visible)
4. Observe toast content

### Expected Result
- ✅ Toast content changes to Portuguese immediately
- ✅ No flash/flicker during language change
- ✅ Toast structure remains intact

### Pass Criteria
- Text changes from English → Portuguese without dismissing toast

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 3: Language Switching (Inbox)

### Objective
Verify inbox notifications re-render with new language

### Steps
1. Fire 5-10 different notifications (use multiple buttons)
2. Open NotificationPanel inbox (bell icon in header)
3. Observe inbox rows in English
4. Switch language to **"Español"**
5. Re-open inbox

### Expected Result
- ✅ All inbox rows show Spanish text
- ✅ Timestamps remain localized (e.g., "hace 2 minutos")
- ✅ No missing translations (no fallback keys visible)

### Pass Criteria
- All inbox content translated correctly

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 4: Inbox Persistence (localStorage)

### Objective
Verify inbox notifications persist across page reloads

### Steps
1. Fire 10+ different notifications
2. Open DevTools → Application → Local Storage
3. Check key: `koda_notifications_${userId}`
4. Refresh page (F5)
5. Open inbox again

### Expected Result
- ✅ localStorage key exists with JSON array
- ✅ Array contains notification objects
- ✅ After reload, inbox shows all previous notifications
- ✅ Timestamps/read status preserved

### Pass Criteria
- All notifications persist after reload

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 5: Inbox Size Cap (200 Max)

### Objective
Verify inbox doesn't grow beyond 200 entries

### Steps
1. Open browser console
2. Run this code to spam 250 notifications:
   ```javascript
   const { addNotification } = window.notificationsStore; // Assumes store is exposed
   for (let i = 0; i < 250; i++) {
     addNotification({ type: 'info', title: `Test ${i}` });
   }
   ```
3. Check localStorage: `localStorage.getItem('koda_notifications_...')`
4. Parse JSON and check array length

### Expected Result
- ✅ Array length is exactly 200 (not 250)
- ✅ Console shows: "Capped inbox from 250 to 200 entries"
- ✅ Oldest 50 entries discarded (FIFO)

### Pass Criteria
- Inbox capped at 200 entries

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 6: File-Type Intelligence (Upload Modal)

### Objective
Verify file-type analysis works at upload entry points

### Steps
1. Navigate to Documents page
2. Click **"Upload"** button → Opens UniversalUploadModal
3. Select files with mixed types:
   - 2x PDF
   - 3x JPG
   - 1x DOCX
   - 1x EXE (unsupported)
4. Click **"Upload All"**

### Expected Result
- ✅ Toast appears: "Unsupported files detected: exe"
- ✅ Upload is BLOCKED (doesn't proceed)
- ✅ User must remove EXE file manually
- ✅ After removing EXE, upload proceeds
- ✅ Toast appears: "Limited support files: jpg" (warning)
- ✅ Toast appears: "Multiple file types detected" (info)

### Pass Criteria
- EXE file blocks upload
- JPG files show limited support warning
- Mixed types show info toast

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 7: Chat Upload (File-Type Analysis)

### Objective
Verify ChatInterface upload has file-type analysis (newly added)

### Steps
1. Navigate to Chat page
2. Click paperclip icon → Select files:
   - 1x PDF
   - 1x MP3 (unsupported)
3. Observe behavior

### Expected Result
- ✅ Toast appears: "Unsupported file types detected"
- ✅ Error toast: "Please remove them and try again"
- ✅ Upload is BLOCKED
- ✅ Must remove MP3 to proceed

### Pass Criteria
- MP3 upload blocked in chat (same as upload modal)

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 8: Sticky Notifications (Duration = 0)

### Objective
Verify sticky notifications don't auto-dismiss

### Steps
1. In NotificationPlayground, click **"Sticky Error"**
2. Observe toast appears with **"Retry"** button
3. Wait 30 seconds (do NOT hover)

### Expected Result
- ✅ Toast remains visible after 30 seconds
- ✅ Toast does NOT auto-dismiss
- ✅ Only manual close or action click dismisses it

### Pass Criteria
- Toast persists indefinitely until manually dismissed

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 9: Keyboard Navigation (Escape Key)

### Objective
Verify Escape key closes top toast

### Steps
1. Fire 3 different notifications (stack them)
2. Press **Escape** key
3. Observe behavior
4. Press **Escape** again

### Expected Result
- ✅ First Escape: Top toast closes
- ✅ Second Escape: Second toast closes
- ✅ Third Escape: Third toast closes

### Pass Criteria
- Escape key dismisses toasts one by one

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 10: Accessibility (ARIA Labels)

### Objective
Verify screen reader support (using browser inspector)

### Steps
1. Fire a notification
2. Open DevTools → Elements
3. Inspect toast HTML
4. Check for ARIA attributes

### Expected Result
- ✅ Toast has `role="alert"`
- ✅ Toast has `aria-live="polite"`
- ✅ Toast has `aria-atomic="true"`
- ✅ Close button has `aria-label="Close notification"`
- ✅ Action button has `aria-label` (if present)

### Pass Criteria
- All ARIA attributes present

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 11: Backend File-Type Alignment (Video Files)

### Objective
Verify video files (mp4, mov) are now LIMITED_SUPPORT (not blocked)

### Steps
1. Navigate to Upload Modal
2. Select: 1x MP4 video file
3. Attempt upload

### Expected Result
- ✅ Toast appears: "Limited support files: mp4"
- ✅ Upload proceeds (NOT blocked)
- ✅ File uploads successfully
- ✅ No "unsupported" error

### Pass Criteria
- MP4 uploads with warning (not blocked)

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 12: Mixed Upload Batch (Real Scenario)

### Objective
Verify realistic mixed batch shows correct notifications

### Steps
1. Navigate to Upload Modal
2. Select:
   - 5x PDF
   - 3x JPG
   - 2x DOCX
   - 1x PNG
3. Click Upload

### Expected Result
- ✅ Toast 1: "Multiple file types detected" (info)
- ✅ Toast 2: "Limited support files: jpg, png" (warning)
- ✅ Toast 3: "11 files uploaded successfully" (success)
- ✅ All toasts appear in correct order
- ✅ All 11 files appear in Documents page

### Pass Criteria
- Correct notifications for mixed batch
- All files upload successfully

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 13: Hover Pause (Auto-Dismiss Timer)

### Objective
Verify timer pauses when hovering over toast

### Steps
1. Fire a success notification (5s auto-dismiss)
2. Immediately hover mouse over toast
3. Keep hovering for 10 seconds
4. Move mouse away

### Expected Result
- ✅ While hovering: Toast remains visible (timer paused)
- ✅ After moving away: Toast dismisses after remaining time (not immediately)

### Pass Criteria
- Hover extends toast lifetime

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 14: Max 3 Toasts (Stack Limit)

### Objective
Verify only 3 toasts visible at once

### Steps
1. Rapidly fire 10 different notifications (use different buttons)
2. Observe active toasts

### Expected Result
- ✅ Only 3 toasts visible on screen
- ✅ New toasts replace oldest toasts
- ✅ All 10 notifications in inbox (not lost)

### Pass Criteria
- Max 3 visible toasts enforced

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 15: Quota Exceeded Handling (Edge Case)

### Objective
Verify graceful fallback when localStorage quota exceeded

### Steps
1. Open browser console
2. Fill localStorage with junk data:
   ```javascript
   const junk = 'x'.repeat(5 * 1024 * 1024); // 5MB string
   localStorage.setItem('junk', junk);
   ```
3. Fire 10 notifications
4. Check console for errors

### Expected Result
- ✅ Console shows: "Reduced inbox to 100 entries due to storage quota"
- ✅ No crash or error thrown
- ✅ Notifications still work (fallback to 100 entries)

### Pass Criteria
- Graceful quota handling (no crash)

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 16: No window.showNotification (Cleanup Verification)

### Objective
Verify deprecated pattern is removed

### Steps
1. Open DevTools Console
2. Navigate to Chat page
3. Disconnect internet (trigger WebSocket disconnect)
4. Observe console logs

### Expected Result
- ✅ No calls to `window.showNotification()`
- ✅ Console shows: "Connection lost" (but no notification shown)
- ✅ No runtime errors

### Pass Criteria
- No window.showNotification calls

**Status:** ⬜ PASS / ⬜ FAIL

---

## Summary Checklist

| Test | Status | Notes |
|------|--------|-------|
| 1. Deduplication | ⬜ | |
| 2. Language Switch (Toasts) | ⬜ | |
| 3. Language Switch (Inbox) | ⬜ | |
| 4. Inbox Persistence | ⬜ | |
| 5. Inbox Size Cap | ⬜ | |
| 6. File-Type (Upload Modal) | ⬜ | |
| 7. File-Type (Chat) | ⬜ | |
| 8. Sticky Notifications | ⬜ | |
| 9. Keyboard Navigation | ⬜ | |
| 10. ARIA Labels | ⬜ | |
| 11. Video Files (Backend Align) | ⬜ | |
| 12. Mixed Upload Batch | ⬜ | |
| 13. Hover Pause | ⬜ | |
| 14. Max 3 Toasts | ⬜ | |
| 15. Quota Handling | ⬜ | |
| 16. No window.showNotification | ⬜ | |

**Overall Status:** ⬜ PASS / ⬜ FAIL

---

## Issues Found (If Any)

| Test # | Issue Description | Severity | Fix Required |
|--------|-------------------|----------|--------------|
| | | | |
| | | | |

---

## Sign-Off

**Tested By:** ___________________
**Date:** ___________________
**Environment:** ___________________
**Browser:** ___________________

**Approval:** ⬜ APPROVED / ⬜ REJECTED

---

## Notes

- All tests must PASS for production deployment
- Any FAIL requires investigation and fix
- Re-run failed tests after fixes applied
- Consider automated E2E tests for critical flows

---

**Document Version:** 1.0
**Last Updated:** 2026-01-13
