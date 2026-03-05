# Answer Composing Quality — Audit Grade Report

**Audit date:** 2026-03-05
**Auditor:** Claude Opus 4.6 (automated)
**Cert tests baseline:** 19/19 PASS (`composition-formatting-regressions.cert.test.ts`)

---

## Grade Table

| Dimension | Max | Score | Status | Notes |
| --- | --- | --- | --- | --- |
| Structure templates by query family | 20 | 18 | PASS | 6 profiles, 7 operators, 5 format contracts. Missing dedicated `explain` and `help` compose templates. |
| Citations (correct, minimal, mapped) | 20 | 18 | PASS | 5 citation rules + contradiction guard + snippet linking. No inline footnote format tested. |
| Table rendering safety | 15 | 13 | PASS | GFM repair, dash corruption guard, row preservation. No wide-table column-overflow regression test. |
| Natural voice/personality | 10 | 7 | WARN | `closers.any.json` has EN/PT only (no ES). `anti_robotic_style_rules` has 1 rule. Opener pool is 7 entries total. |
| Followups useful and non-looping | 10 | 8 | PASS | 9 suggestions across 3 intents in EN/PT/ES. Missing `summary` intent followups. |
| Brevity control / verbosity ladder | 10 | 9 | PASS | 6 profiles + 13 selection rules + per-mode overrides. `verbosity_ladder` has only 1 auto-selection rule. |
| Multilingual tone parity EN/PT/ES | 10 | 8 | WARN | Full structural parity proven by tests. `closers` bank missing ES. |
| "Not found" behavior | 5 | 5 | PASS | 6 scenarios, combinatorial assembly, EN/PT/ES, seeded anti-repetition. |
| **Total** | **100** | **86** | **A-** | |

---

## P0 Blocker Check

| P0 Condition | Status | Evidence |
| --- | --- | --- |
| Truncation or broken tables | CLEAR | `tableNoDashCorruption` + `tablePreservation` tests pass; `table_render_policy.TRP_001` forbids row truncation |
| Misleading phrasing without evidence | CLEAR | `citationAlignment` + `citationContradictionGuard` strip unsupported claims; `CIT_001` blocks uncited facts |
| Robotic repeated openers | CLEAR | `openerVariation` test asserts distinct count >= 2; `banned_phrases` strips 20 robotic patterns |

**No P0 blockers detected.**

---

## Missing Compose Banks

| Bank ID (proposed) | Purpose | Priority |
| --- | --- | --- |
| `closers` ES entries | `closers.any.json` only has EN + PT; ES users get no localized closer | P1 |
| `summary_followup_suggestions` | `followup_suggestions` has no `summary` intent entries | P2 |
| `explain_response_template` | No dedicated template in `response_templates` for `explain`/`analyze` intents | P2 |
| `help_response_template` | No dedicated template for `help`/`how_to` intents | P3 |
| `compute_response_template` | `compute` operator has block plan overrides but no response template | P3 |
| `opener_variety_expansion` | Only 7 openers total; needs more variety per intent to reduce repetition risk | P2 |
| `anti_robotic_style_rules` expansion | Only 1 rule; needs sentence-starter diversity + transition-phrase injection rules | P2 |

## Missing Microcopy Banks

| Bank ID (proposed) | Purpose | Priority |
| --- | --- | --- |
| `partial_answer_microcopy` | No messaging for "I found partial evidence, here's what I have" | P2 |
| `truncation_notice_microcopy` | `truncation_and_limits` has `tableTruncation.truncationNote` but no general prose truncation notice bank | P2 |
| `confidence_phrasing_microcopy` | Hedging language exists; no positive-confidence microcopy ("This is strongly supported by...") | P3 |
| `greeting_microcopy` | No conversational welcome/greeting handling | P3 |

---

## 10 Formatting Regression Tests (proposed)

These tests should be added to `composition-formatting-regressions.cert.test.ts`:

### Test 1: Wide table wraps or degrades gracefully at >6 columns
```
Input: 8-column GFM table
Assert: output has <= 6 columns OR converts to key-value bullets
Covers: tableFormatting.maxColumnsBeforeWrap (render_policy)
```

### Test 2: Closers bank serves ES language without fallback to EN
```
Input: general_answer, language="es", analytical profile
Assert: closing line is in Spanish (not English, not empty)
Covers: closers ES gap (P1)
```

### Test 3: Opener pool produces >= 3 distinct openers across 5 seeds
```
Input: 5 different extract queries in EN
Assert: Set(openers).size >= 3
Covers: opener variety / anti-repetition at scale
```

### Test 4: Paragraph splitting never exceeds 2 sentences per paragraph
```
Input: 6-sentence block as content
Assert: every paragraph in output has <= 2 sentences
Covers: answer_style_policy.paragraphRules.maxSentencesPerParagraph
```

### Test 5: JSON request is denied and mapped to table or bullets
```
Input: "give me JSON of revenue by quarter", signals.userAskedForJson=true
Assert: output contains no `{` or `[` JSON tokens; contains table or bullet list
Covers: jsonRequestMapping.denyJsonOutput
```

### Test 6: No-docs combinatorial message never uses banned phrases
```
Input: state=empty_index, lang="en", 10 random seeds
Assert: no output contains "no relevant information found" or "nothing found"
Covers: no_docs_messages.config.hardConstraints.banPhrases
```

### Test 7: Followup line is locale-matched to query language
```
Input: language="es", extract intent
Assert: followup starts with "Si quieres," (not "If you'd like,")
Covers: followup localization consistency (FS_004)
```

### Test 8: Micro profile produces <= 260 chars and no intro/conclusion
```
Input: signals.justAnswer=true, content="Revenue is $5M."
Assert: output.length <= 260, no "In summary," line, no "If you'd like,"
Covers: micro profile budget enforcement
```

### Test 9: Truncation at sentence boundary preserves numeric integrity
```
Input: 800-char block with currency figure at char 250, profile=brief (maxChars=520)
Assert: output ends at sentence boundary; currency figure is complete (not mid-number)
Covers: truncationRules.neverTruncateMid: ["number","currency"]
```

### Test 10: Table cell content respects 120-char hard limit
```
Input: GFM table with one cell containing 200 chars
Assert: rendered cell <= 120 chars (or cell is split)
Covers: tableLimits.maxCellCharsHard
```
