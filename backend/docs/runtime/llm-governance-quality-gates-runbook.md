# LLM Governance Quality Gates Runbook

## Purpose
Operational playbook for governance and quality-gate failures in chat runtime.

## Core metrics
- `governance_gate_fail_total`
- `governance_fail_soft_mode_total`
- `source_policy_violation_total`

## Critical reason codes
- `quality_gate_blocked`
- `quality_gate_runner_error`
- `enforcer_runtime_error`

## Alert policy
- Page on-call when `governance_gate_fail_total` increases for critical reason codes.
- Open a high-priority incident if `governance_fail_soft_mode_total` appears in production.
- Create a follow-up defect when `source_policy_violation_total` trends upward for two consecutive windows.

## Triage steps
1. Confirm failing gate and reason code in trace telemetry.
2. Check latest certification evidence for `enforcer-failclosed` and `evidence-fidelity`.
3. Validate strict profile status (`CERT_PROFILE=ci|release|retrieval_signoff`) and runtime environment.
4. If failures persist in protected envs, rollback last governance-affecting deploy and re-run strict cert audit.

## Recovery verification
- `npm run audit:observability:ops-contract:strict`
- `npm run audit:cert:strict`
- Verify no new `governance_fail_soft_mode_total` in production traces.
