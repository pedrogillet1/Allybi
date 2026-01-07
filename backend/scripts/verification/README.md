# KODA Backend Wiring Verification

Full pipeline test suite to validate routing, quality, streaming, and math engine integration.

## Quick Start

```bash
# Run all phases
npx ts-node scripts/verification/run_all.ts

# Run with verbose output
npx ts-node scripts/verification/run_all.ts --verbose

# Run specific phase
npx ts-node scripts/verification/run_all.ts --phase 1

# Skip streaming test (if backend not running)
npx ts-node scripts/verification/run_all.ts --skip-streaming
```

## Phase Overview

| Phase | Name | Critical | Description |
|-------|------|----------|-------------|
| 0 | Health Check | Yes | Verify all services running |
| 1 | Intent Routing | Yes | Validate intent classification |
| 2 | Domain Activation | No | Test domain-specific rules |
| 3 | Depth Decisions | No | Verify D1-D5 depth selection |
| 4 | Math Engine | Yes | Validate Python math integration |
| 5 | RAG Gating | Yes | Ensure RAG fires correctly |
| 6 | Answer Styles | No | Check style resolution |
| 7 | Streaming | No | Test incremental streaming |
| 8 | Quality Audit | Yes | Overall quality metrics |
| 9 | E2E Trace | No | Full pipeline trace |

## Individual Phase Commands

```bash
# Phase 0: Health Check
npx ts-node scripts/verification/phase0_health_check.ts

# Phase 1: Intent Routing
npx ts-node scripts/verification/phase1_intent_routing.ts

# Phase 2: Domain Activation
npx ts-node scripts/verification/phase2_domain_activation.ts

# Phase 3: Depth Decisions
npx ts-node scripts/verification/phase3_depth_decisions.ts

# Phase 4: Math Engine
npx ts-node scripts/verification/phase4_math_execution.ts

# Phase 5: RAG Gating
npx ts-node scripts/verification/phase5_rag_invocation.ts

# Phase 6: Answer Styles
npx ts-node scripts/verification/phase6_answer_styles.ts

# Phase 7: Streaming (requires running backend)
npx ts-node scripts/verification/phase7_streaming.ts

# Phase 8: Quality Audit
npx ts-node scripts/verification/phase8_quality_audit.ts

# Phase 9: E2E Trace
npx ts-node scripts/verification/phase9_e2e_trace.ts "your query here"
```

## GO / NO-GO Criteria

### System is 100% WIRED if:
- No misrouting (conversation doesn't go to documents)
- Depth varies correctly based on query complexity
- Python engine is authoritative for math
- RAG fires only when allowed
- Streaming is incremental
- Answer styles always resolve
- Confidence scores are NOT constant

### NOT READY if:
- Confidence always ~0.5
- Math answered by LLM (not Python)
- "hello" routes to extraction
- RAG called when not required

## Environment Variables

```bash
BACKEND_URL=http://localhost:5000
MATH_ENGINE_URL=http://127.0.0.1:5050
LOG_DEPTH_DECISIONS=true
TRACE_EXECUTION=true
QUALITY_AUDIT=true
```

## Expected Output

```
═══════════════════════════════════════════════════════════
   KODA BACKEND WIRING VERIFICATION
   Full Pipeline Test Suite
═══════════════════════════════════════════════════════════

Started: 2025-12-18T01:30:00.000Z

────────────────────────────────────────────────────────────
PHASE 0: Health Check
────────────────────────────────────────────────────────────
✓ backend: OK
✓ mathEngine: OK

✅ PHASE 0 PASSED (50ms)

...

═══════════════════════════════════════════════════════════
   ✅ SYSTEM IS 100% WIRED - READY FOR DEPLOYMENT
═══════════════════════════════════════════════════════════
```
