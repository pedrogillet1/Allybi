# Integration Runtime Grade

- Generated: 2026-03-05T18:49:22.893Z
- Final score: **100**
- Final grade: **A+**
- Verdict: **ready**

## Checks

| Check | Severity | Weight | Pass | Detail |
|---|---|---:|:---:|---|
| no_wildcard_postmessage | high | 20 | yes | OAuth callback must not use postMessage targetOrigin='*'. |
| no_raw_error_leakage | high | 20 | yes | Integrations routes/controller must not return raw exception messages. |
| oauth_callback_no_localstorage_fallback | high | 20 | yes | OAuth callback page must not use localStorage fallback for completion signaling. |
| frontend_oauth_callback_no_url_token_ingest | high | 20 | yes | Frontend OAuth callback must not read tokens from URL query or write auth tokens to localStorage. |
| frontend_oauth_completion_no_localstorage_signal | medium | 10 | yes | Frontend integrations OAuth completion flow must not rely on localStorage cross-window signaling. |
| frontend_oauth_message_origin_validation | high | 15 | yes | OAuth completion messages must enforce trusted origin checks in integrations and chat surfaces. |
| no_console_runtime_paths | medium | 15 | yes | Runtime integrations paths should use structured logger. |
| critical_tests_present | medium | 10 | yes | Required integrations runtime tests must exist. |
| runtime_test_pack_passes | high | 35 | yes | Target runtime integrations test pack passed. |

