# Notification Inbox - QA Verification Checklist

**Test Environment:** Localhost (after restart)
**Time Required:** ~10 minutes
**Priority:** ⚠️ CRITICAL (Production bug fix)

---

## Pre-Test Setup

1. Ensure frontend and backend are running
2. Open browser DevTools Console (watch for warnings)
3. Navigate to the app and login
4. Open NotificationPanel (click bell icon)

---

## Test 1: Translation Key Bug Fix ✅

**Objective:** Verify raw keys no longer appear

### Steps
1. Upload a file (any type)
2. Wait for upload to complete
3. Open NotificationPanel (bell icon)
4. Look at the first notification

### Expected Result
- ✅ Title shows "Upload complete" (or translated)
- ❌ Title does NOT show `upload.notifications.uploadComplete`
- ✅ Message shows readable text (not a key)

### Pass Criteria
- NO raw translation keys visible anywhere in inbox

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 2: Legacy Notification Migration

**Objective:** Old notifications render correctly

### Steps
1. Check browser localStorage: `koda_notifications_${userId}`
2. If any notifications have `title: "upload.notifications.*"`, they should still render
3. Open NotificationPanel
4. Verify all rows show translated text

### Expected Result
- ✅ All notifications show translated text
- ✅ Console may show: "Migrated and capped inbox" (first load)
- ❌ NO raw keys visible

### Pass Criteria
- Old notifications automatically migrated

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 3: Duplicate Prevention

**Objective:** Same event doesn't create multiple inbox entries

### Steps
1. Delete a folder (or trigger any notification event)
2. Immediately trigger the SAME event again (within 10 seconds)
3. Open NotificationPanel
4. Count entries

### Expected Result
- ✅ Only 1 inbox entry (not 2)
- ✅ Timestamp is recent (refreshed)
- ✅ Marked as unread

### Pass Criteria
- No duplicate entries for same event within 10s

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 4: Delete + Undo

**Objective:** Delete notification with undo capability

### Steps
1. Open NotificationPanel
2. Hover over any notification
3. Click the trash icon (red on hover)
4. Observe toast notification

### Expected Result
- ✅ Toast appears: "Notification deleted" with "Undo" button
- ✅ Notification removed from inbox
- ✅ Click "Undo" → notification restored with original timestamp

### Pass Criteria
- Delete works + Undo restores correctly

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 5: Clear Read Notifications

**Objective:** Bulk delete all read notifications

### Steps
1. Ensure some notifications are marked as read (click on them)
2. Open NotificationPanel
3. At bottom, click "Clear read" button
4. Observe result

### Expected Result
- ✅ All read notifications removed
- ✅ Toast shows: "X read notifications cleared"
- ✅ Unread notifications remain

### Pass Criteria
- Only read notifications removed

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 6: Mark All Read

**Objective:** Mark all as read with feedback

### Steps
1. Ensure some unread notifications exist
2. Open NotificationPanel
3. Click checkmark button (top right)
4. Observe result

### Expected Result
- ✅ All notifications marked as read
- ✅ Toast shows: "All notifications marked as read"
- ✅ Unread count badge updates to 0

### Pass Criteria
- All marked read + toast confirmation

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 7: Language Switching

**Objective:** Existing notifications update when language changes

### Steps
1. Open NotificationPanel (with some notifications)
2. Observe current language (e.g., English)
3. Navigate to Settings → Change language to Português
4. Return to NotificationPanel

### Expected Result
- ✅ Notification titles re-render in Portuguese
- ✅ Timestamps ("5m ago") translate to Portuguese
- ✅ Buttons ("Close", "Clear read") translate
- ⚠️ If Portuguese keys missing, may show English (acceptable for now)

### Pass Criteria
- Notifications re-render when language changes

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 8: Navigable Notifications

**Objective:** Notifications with navigation show chevron

### Steps
1. Find a notification with `action.type === 'navigate'`
2. Hover over it
3. Click the notification (not the delete icon)

### Expected Result
- ✅ Chevron icon visible on right side
- ✅ Clicking navigates to target route
- ✅ Notification marked as read

### Pass Criteria
- Navigation works correctly

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 9: Timestamp Formatting

**Objective:** Timestamps show in user's language

### Steps
1. Open NotificationPanel
2. Look at timestamp column (right side)
3. Check format

### Expected Result
- ✅ Recent: "Just now" (or translated)
- ✅ < 1 hour: "Xm ago" (or translated)
- ✅ < 24 hours: "Xh ago"
- ✅ Older: "Jan 13, 3:45 PM" (localized format)

### Pass Criteria
- Timestamps readable and translated

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 10: Console Warnings

**Objective:** Check for translation warnings

### Steps
1. Open DevTools Console
2. Navigate through app, trigger notifications
3. Look for warnings

### Expected Result
- ⚠️ May see: `[NotificationRow] Missing translation for titleKey: ...`
  - This is OK if key genuinely missing
- ❌ Should NOT see: `TypeError`, `Cannot read property`, or crashes

### Pass Criteria
- No critical errors, only informational warnings

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 11: Inbox Persistence

**Objective:** Notifications persist across page reloads

### Steps
1. Note current notifications in inbox
2. Refresh page (F5)
3. Open NotificationPanel again

### Expected Result
- ✅ All previous notifications still present
- ✅ Read/unread state preserved
- ✅ Timestamps unchanged

### Pass Criteria
- Inbox persists across reloads

**Status:** ⬜ PASS / ⬜ FAIL

---

## Test 12: Inbox Size Cap

**Objective:** Inbox doesn't grow beyond 200 entries

### Steps
1. Check localStorage size: `koda_notifications_${userId}`
2. If < 200 entries, this test is informational only
3. If >= 200, verify oldest entries dropped

### Expected Result
- ✅ localStorage array length <= 200
- ✅ Console: "Migrated and capped inbox: X → 200 entries"

### Pass Criteria
- Inbox capped at 200 max

**Status:** ⬜ PASS / ⬜ FAIL / ⬜ N/A

---

## Summary

| Test # | Test Name | Status | Notes |
|--------|-----------|--------|-------|
| 1 | Translation Key Bug | ⬜ | |
| 2 | Legacy Migration | ⬜ | |
| 3 | Duplicate Prevention | ⬜ | |
| 4 | Delete + Undo | ⬜ | |
| 5 | Clear Read | ⬜ | |
| 6 | Mark All Read | ⬜ | |
| 7 | Language Switching | ⬜ | |
| 8 | Navigable Notifications | ⬜ | |
| 9 | Timestamp Formatting | ⬜ | |
| 10 | Console Warnings | ⬜ | |
| 11 | Inbox Persistence | ⬜ | |
| 12 | Inbox Size Cap | ⬜ | |

**Overall Status:** ⬜ APPROVED / ⬜ ISSUES FOUND

---

## Issues Found (If Any)

| Test # | Issue Description | Severity | Screenshot |
|--------|-------------------|----------|------------|
| | | | |

---

## Sign-Off

**Tested By:** ___________________
**Date:** ___________________
**Browser:** ___________________
**Environment:** ___________________

**Approved for Production:** ⬜ YES / ⬜ NO / ⬜ WITH CAVEATS

**Caveats (if any):**
- Portuguese translations pending (non-blocking)
- Spanish translations pending (non-blocking)
- Visual polish optional (post-deployment)

---

**QA Complete:** ⬜
