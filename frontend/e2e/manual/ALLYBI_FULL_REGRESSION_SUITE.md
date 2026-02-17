# Allybi Full Regression Suite (Production)

## 1. Scope
This suite validates end-to-end behavior for:
- Auth: signup/login/verification/reset/OAuth.
- Core app surfaces: chat, home, documents, settings, integrations.
- Normal chat (main chat screen).
- Editing chat (document viewer panel) for DOCX and XLSX.
- Rendering correctness after apply/undo.

Primary account:
- `test@koda.com`

Environment:
- Production (`https://allybi.co` and `https://app.allybi.co`)

Browsers:
- Chrome latest (required)
- Safari latest (required for Apple sign-in checks)

## 2. Exit Criteria (Go/No-Go)
Release is blocked if any of these fail:
1. Cannot authenticate with standard login.
2. Apple sign-in still completes OAuth but does not create session.
3. Normal chat routes editing prompts incorrectly or fails grounding.
4. DOCX/XLSX editor applies wrong-target edits or fails to render applied edits.
5. Undo fails for both DOCX and XLSX.

## 3. Required Test Data (in `test@koda.com`)
Use two uploaded files:

1. DOCX test file:
- Name target: `QA_Contract_Operations_Playbook.docx`
- Must include:
  - Heading: `Executive Summary`
  - Phrase: `Orion program`
  - Bullet list (4+ items)
  - Numbered list (3+ items)
  - Section heading `Risks`

2. XLSX test file:
- Name target: `QA_LMR_Improvement_Plan.xlsx`
- Must include:
  - Sheet: `SUMMARY 1`
  - Numeric range suitable for formatting (example `D35:D48`)
  - Percent range (example `G51:G56`)
  - At least one blank cell in a selected numeric range
  - One text-number range to coerce to numeric

## 4. Evidence Rules
For each test:
- Capture one screenshot before action and one after apply (or after failure).
- For failures include:
  - Prompt/query used
  - Selected target (range/paragraph)
  - Proposed change card text/JSON if shown
  - Expected vs actual
- UTC timestamp

Use:
- `ALLYBI_TEST_CASE_CATALOG.md` for canonical IDs and expected behavior.
- `ALLYBI_PROD_CERT_RESULTS_TEMPLATE.csv` as the main execution matrix.
- `ALLYBI_PROD_CERT_REPORT_TEMPLATE.md` for final signoff report.

## 5. Test Execution Order
1. Create a run copy of `ALLYBI_PROD_CERT_RESULTS_TEMPLATE.csv`.
2. Pre-flight.
3. Auth/OAuth.
4. Home/Documents/Settings.
5. Normal chat (main screen).
6. DOCX editing.
7. XLSX editing.
8. Integrations sanity.
9. Apple diagnostics (`AP01`-`AP06`) if any OAuth issue appears.
10. Fill `ALLYBI_PROD_CERT_REPORT_TEMPLATE.md`.

## 6. Pre-flight
1. Open `https://allybi.co`.
- Expected: redirects to chat path.
2. Open `https://allybi.co/homepage/`.
- Expected: Allybi landing shows purpose and legal links.
3. Open legal routes:
- `https://allybi.co/legal/privacy`
- `https://allybi.co/legal/terms`
- Expected: pages load.

## 7. Auth and OAuth
### A01 Login valid
Steps:
1. Login with `test@koda.com`.
Expected:
- User is authenticated and enters app.

### A02 Login invalid
Steps:
1. Use wrong password.
Expected:
- Correct error and no session.

### A03 Email verification code flow (re-check after email changes)
Steps:
1. Trigger verification-code flow.
2. Use latest valid code.
3. Retry with invalid/expired code.
Expected:
- Valid accepted once.
- Invalid/expired rejected with clear message.

### A04 Password reset
Steps:
1. Run forgot-password flow.
2. Set new password.
3. Confirm old password fails, new succeeds.
Expected:
- Works end to end.

### A05 Google sign-in
Steps:
1. Start Google OAuth.
2. Complete consent.
Expected:
- Callback returns authenticated session.

### A06 Apple sign-in (high-priority)
Steps:
1. Use Safari.
2. Start Apple OAuth and complete.
3. Inspect post-callback auth state.
Expected:
- User becomes authenticated.
Failure evidence required:
- Callback URL + final page + session state.

## 8. Home / Documents / Settings
### H01 Home render
Expected:
- No blank/error state.

### H02 Documents render + open both test docs
Expected:
- DOCX and XLSX open in viewer.

### H03 Settings render
Expected:
- Profile, security, legal sections visible.

### H04 Session persistence
Steps:
1. Refresh protected route.
Expected:
- Session retained.

## 9. Normal Chat Suite (main screen only)
Run prompts from `ALLYBI_PROMPT_PACK.md` section "Normal Chat".
Expected for all:
- Correct response intent.
- No accidental editor action cards for non-edit prompts.

Minimum pass set:
1. Summary question over DOCX.
2. Specific extraction question over DOCX.
3. Cross-document comparison (DOCX + XLSX).
4. Connector request separation.
5. Non-edit conceptual question.

## 10. DOCX Editing Suite (viewer editor)
Open DOCX in viewer and use Ask Allybi panel.
Run prompts from "DOCX Editing Prompts".

For each edit:
1. Verify target scope matches selection.
2. Verify preview matches requested change.
3. Click Apply.
4. Verify canvas text/style updated.
5. Undo and verify revert.

Critical checks:
- Formatting-only commands must not rewrite text.
- Insert commands must insert, not replace.
- PT and EN equivalent prompts behave consistently.

## 11. XLSX Editing Suite (viewer editor)
Open XLSX in viewer and use Ask Allybi panel.
Run prompts from "XLSX Editing Prompts".

For each edit:
1. Verify full selected range is targeted (not top-left only).
2. Verify preview card range and operation.
3. Apply and verify visible grid updates.
4. Verify format without corrupting values.
5. Undo and verify revert.

Critical checks:
- `selected cells` must fan out to full selection.
- Currency and percent formatting render correctly.
- PT prompts route same as EN.

## 12. Integrations Sanity
1. Open Integrations page and load status.
2. Confirm no connection-refused/WebSocket failures while backend is healthy.
3. Run one connect+callback sanity for configured provider.

## 13. Final Reporting
Create summary with:
1. Total/pass/fail/blocked counts.
2. P0/P1 defects.
3. Apple sign-in verdict.
4. Normal chat verdict.
5. DOCX editing verdict.
6. XLSX editing verdict.
7. Go/No-Go recommendation.

Deliverables:
- `ALLYBI_PROD_CERT_RESULTS_<YYYY-MM-DD>.csv`
- `ALLYBI_PROD_CERT_REPORT_<YYYY-MM-DD>.md`
- `evidence/<run-id>/` screenshots and logs
