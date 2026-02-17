# Allybi Test Case Catalog (Canonical IDs)

This catalog is the authoritative source of test IDs for production certification.

## Status legend
- `PASS`
- `FAIL`
- `BLOCKED`
- `NOT_RUN`

## Severity legend
- `P0` critical blocker (auth/data corruption/wrong destructive edit)
- `P1` major regression (core workflow broken)
- `P2` non-blocking regression

## A — Authentication (A01–A12)
1. `A01` Valid login with `test@koda.com`.
2. `A02` Invalid password login rejected.
3. `A03` Logout clears session.
4. `A04` Pending email verification code accepted.
5. `A05` Invalid/expired email code rejected.
6. `A06` Resend verification code behavior.
7. `A07` Password reset request.
8. `A08` Password reset code verify.
9. `A09` Password reset complete + new password works.
10. `A10` Google OAuth login end-to-end.
11. `A11` Apple OAuth login end-to-end (Safari required).
12. `A12` Session persists on hard refresh of protected route.

## C — Core Surfaces (C01–C08)
1. `C01` Home/dashboard renders.
2. `C02` Documents list renders and is interactive.
3. `C03` Open DOCX test file in viewer.
4. `C04` Open XLSX test file in viewer.
5. `C05` Settings page renders (profile/security/legal).
6. `C06` Integrations page status loads.
7. `C07` Legal routes load (`/legal/privacy`, `/legal/terms`).
8. `C08` Root/homepage routes behave as configured.

## N — Normal Chat (N01–N12)
1. `N01` DOCX summary request.
2. `N02` DOCX fact extraction with quoted sentence.
3. `N03` Cross-doc comparison (DOCX+XLSX).
4. `N04` Spreadsheet concept explanation.
5. `N05` Connector intent separation prompt.
6. `N06` Safety/refusal prompt.
7. `N07` Follow-up question uses same context.
8. `N08` Follow-up that switches document context.
9. `N09` PT natural-language prompt grounding.
10. `N10` EN prompt with explicit file naming.
11. `N11` Non-edit question in viewer-adjacent context remains non-edit.
12. `N12` Chat response includes source grounding when applicable.

## D — DOCX Editor (D01–D16)
1. `D01` Replace text in selected paragraph only.
2. `D02` Bold+italic selected sentence (format-only).
3. `D03` Convert selected bullets to paragraphs.
4. `D04` Translate selected section only.
5. `D05` Insert sentence after selected paragraph.
6. `D06` Font family EN prompt without `font` keyword.
7. `D07` Font family PT prompt without `fonte` keyword.
8. `D08` Grammar rewrite preserving meaning.
9. `D09` Undo after text rewrite.
10. `D10` Undo after formatting-only edit.
11. `D11` Multi-intent prompt yields ordered multi-op plan.
12. `D12` Preview card matches selection scope.
13. `D13` Apply updates rendered text immediately.
14. `D14` Formatting does not rewrite content text.
15. `D15` Insert does not replace existing content.
16. `D16` Clarifier shown only on ambiguous request (e.g., `change to roman`).

## X — XLSX Editor (X01–X18)
1. `X01` Set all selected cells to `0`.
2. `X02` Fill blank selected cells with `0`.
3. `X03` Convert to numbers + currency + bold chain.
4. `X04` Format percentages without changing values.
5. `X05` PT parity: set selected cells to `0`.
6. `X06` PT parity: currency + bold without value change.
7. `X07` Sort selected table/range descending by Return on Cost.
8. `X08` Chart create from selected range with explicit mapping.
9. `X09` Multi-range selection fanout.
10. `X10` `only first one` override limits operation to first range.
11. `X11` Preview range equals actual changed range.
12. `X12` Apply visibly updates grid immediately.
13. `X13` Undo after value edit.
14. `X14` Undo after format edit.
15. `X15` Currency pattern renders correctly (`$#,##0.00`).
16. `X16` Percent pattern renders correctly (`0.00%`).
17. `X17` Text-number coercion failure reports problematic cells.
18. `X18` Formatting-only prompts never trigger rewrite ops.

## I — Integrations Sanity (I01–I08)
1. `I01` Integrations status endpoint returns healthy payload.
2. `I02` No `ERR_CONNECTION_REFUSED` in integrations UI when backend is up.
3. `I03` No websocket handshake errors in healthy state.
4. `I04` Google connect callback success path.
5. `I05` Slack connect callback success path.
6. `I06` Connector explicit-request routing in viewer mode.
7. `I07` Non-explicit connector fallback blocked in viewer mode.
8. `I08` Disconnect flow updates provider status.

## AP — Apple OAuth Diagnostics (AP01–AP06)
1. `AP01` Apple callback contains expected query/body fields.
2. `AP02` OAuthCallback page stores tokens in local storage.
3. `AP03` `/api/auth/me` succeeds immediately after Apple callback.
4. `AP04` Auth context updates to authenticated state.
5. `AP05` Protected route access works after Apple callback.
6. `AP06` Failure path captures deterministic root-cause evidence.

