# Policy A-Grade Rubric

This rubric defines the minimum bar for policy-system release readiness.

## Hard Gates

1. `npm run typecheck` passes with zero errors.
2. `npm run policy:cert:strict` passes.
3. `RuntimeWiringIntegrityService.validate()` returns `ok=true`.
4. Required runtime policies are enforced by runtime consumers.
5. Required runtime policies are `requiredByEnv.production=true` and `requiredByEnv.staging=true`.

## Policy Certification Expectations

1. Critical/high policies declare executable rules unless explicitly marked `config.configModeOnly=true`.
2. Critical policies declare at least 2 test cases.
3. High policies declare at least 1 test case.
4. Behavioral policy cases that include `runtime` and `expect.action` must pass.
5. In strict mode, warnings on critical/high policies fail certification.

## Runtime Wiring Expectations

1. All runtime-required banks are present.
2. Runtime-required policies have at least one runtime consumer reference.
3. No hardcoded runtime heuristics bypass policy banks.
4. Runtime safety checks for logging, memory, and fallback remain green.
