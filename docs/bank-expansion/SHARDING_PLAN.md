# Sharding Plan for Data Bank Expansion

## Scope
This plan is the executable strategy for splitting oversized banks and keeping governance integrity as the tree grows across `backend/src/data_banks/**`.

## Canonical Shard Naming
Shard naming is governed by `backend/src/data_banks/governance/sharding_policy.any.json` and must follow:
- Pattern: `(?<family>[a-z][a-z0-9_]*)_(?<scope>[a-z0-9_]+)_(?<index>\d{3})\.any\.json`
- 1-based index, zero padded to 3 digits (`_001`, `_002`, ...).
- Folder policy:
  - Keep the same family within a domain folder where practical.
  - `domain/`, `audience/`, `adversarial/`, `multilingual/`, `style/` subfolders are allowed when they reduce collision and review risk.

## Deterministic Split Inputs
When deciding if a bank must shard:
- `lineCount` threshold: 900
- `testCaseCount` threshold: 80
- `ownerTeamExpansion` threshold: 5 owners
- `crossDomainCollisionRisk` threshold: `0.08`
- `mustShardBy`: `domain`, `queryComplexity`, and `changeVelocityPerWeek`
- split order for stable output: `family`, `scope`, `id`

Sort and dedupe policy is applied before split to prevent drift:
- sort by `id`, then `scope`, then `owner`
- reject duplicate bank-id pairs and duplicate test-case IDs
- keep the latest update for pattern-level duplicates

## Shard Lifecycle
1. Split candidate creation
 - Emit shard candidate set.
 - Preserve original bank intent and test coverage; never drop existing failing cases.
 - Move shared constants to a dedicated "kernel" shard where cross-shard reuse is required.
2. Review and ownership checks
 - Resolve owner for each shard in `..._policy` and `..._wire_rules` groups before merge.
 - Ensure `_meta.usedBy` in each shard points to concrete runtime services.
3. Runtime wiring + eval gate
 - Update registry/manifests for each new shard.
 - Run runtime wiring checks and eval gate checks before merge.
4. Merge/rotation
 - Merge only if stability persists for 8 weeks and collision risk is low.
 - Re-evaluate every 2 weeks for split pressure and line growth.

## Ownership / Conflict Risk Controls
- Any shard containing policy/selection/gating rules should have owners from `governance-team`, `composition-`, `assistant-`, `eval-`, or verified domain teams.
- Any shard containing provider routing, failure ladders, or runtime policy must include explicit `tests` proving runtime-wired service usage.
- Shards touching multi-service contracts must be reviewed by the owning runtime area before merge to avoid path conflicts.
- Shard families are not allowed to exceed the naming family set in policy:
  - `core`, `domain`, `overlays`, `quality`, `policy`, `proof`, `ops`

## Execution Order
1. Shard by policy first (`governance`, `assistant`, `llm`) because routing failures have highest blast radius.
2. Split heavy eval/style adversarial groups next to reduce review fatigue and flake risk.
3. Split domain-specific growth (`compose`, `eval`) after stability gates are in place.

## Guardrails and Review
- Any shard containing >1,000 lines must include at least one explicit regression set.
- Any shard with locale cases must include PT and EN coverage.
- No shard may be created without:
  - update to `runtime_wiring_requirements.any.json` expectations if runtime references change;
  - registry/manifest parity update;
  - an eval gate-ready test set in `_meta.tests`.

## Implementation Outputs
- `backend/src/data_banks/governance/sharding_policy.any.json` (canonical rules)
- `docs/bank-expansion/GOVERNANCE_IMPLEMENTATION.md` (control summary)
- This plan is the first-wave operating procedure for parallel-safe bank generation.
