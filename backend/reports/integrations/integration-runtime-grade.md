# Integration Runtime Grade

- Generated: 2026-03-05T01:31:56.321Z
- Final score: **100**
- Final grade: **A+**
- Verdict: **ready**

## Checks

| Check | Severity | Weight | Pass | Detail |
|---|---|---:|:---:|---|
| no_wildcard_postmessage | high | 20 | yes | OAuth callback must not use postMessage targetOrigin='*'. |
| no_raw_error_leakage | high | 20 | yes | Integrations routes/controller must not return raw exception messages. |
| no_console_runtime_paths | medium | 15 | yes | Runtime integrations paths should use structured logger. |
| critical_tests_present | medium | 10 | yes | Required integrations runtime tests must exist. |
| runtime_test_pack_passes | high | 35 | yes | Target runtime integrations test pack passed. |

