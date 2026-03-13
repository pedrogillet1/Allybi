# Assistant Orchestration Brain Implementation

## Scope Built
This pass turns orchestration into policy-first control flow across task decomposition, tooling, model roles, provider routing, failure handling, and output mode delivery.

### New assistant policy banks
- `assistant/task_decomposition_policy.any.json`
- `assistant/tool_selection_policy.any.json`
- `assistant/research_planning.any.json`
- `assistant/work_product_types.any.json`
- `assistant/conversation_state_carryover.any.json`
- `assistant/project_memory_policy.any.json`
- `assistant/context_container_profiles.any.json`
- `assistant/custom_agent_profiles.any.json`
- `assistant/canvas_output_modes.any.json`
- `assistant/model_role_profiles.any.json`

### New provider strategy banks
- `llm/provider_routing_policy.any.json`
- `llm/provider_failure_ladders.any.json`
- `llm/provider_quality_profiles.any.json`
- `llm/provider_capabilities_expanded.any.json`

### Rewritten provider strategy banks
- `llm/provider_capabilities.any.json`
- `llm/provider_fallbacks.any.json`

## Architecture
1. Incoming request enters decomposition to assign a concrete strategy profile.
2. Tool policy binds the active toolset from task family and risk.
3. Research planning sets evidence depth and stop conditions.
4. Model-role policy selects behavior role, then provider routing maps role+task to provider+model.
5. Output policy maps work product, then canvas policy maps output surface.
6. Failure ladders and quality profiles govern retries, shadow comparison, and constrained degradation.

## Core execution contracts added
- Task families and failure modes are explicit, not matrix-only.
- Model role profiles separate behavior from raw provider selection.
- Failures have deterministic ladders (timeout, rate-limit, quality, tool failure, confidence failure).
- Quality profiles contain measurable checks and concrete failure actions.
- Work-product modes are first-class, enabling tool choice and canvas selection consistency.
- State/memory policy supports context carryover, project memory, and risk-based retention.

## Orchestration primitives now explicit
- `modelRole`: behavior-level role selection.
- `taskFamily`: decomposition and routing classification.
- `workProductType`: shape of final artifact.
- `outputSurface`: chat/canvas/hybrid decision.
- `failureReason`: triggers for reroute, shadow, or conservative degrade.

## Provider strategy intent
- Fast path remains available for planning and repair.
- Authority path is reserved for high-risk grounding, quote-intensive tasks, and numeric reconciliation.
- Shadow/compare hooks are enabled for high impact tasks and quality failures.

## Operational follow-up
- Wire runtime services to read the new `assistant/*` and new `llm/*` policy files.
- Replace legacy lane-only routing dependence where appropriate.
- Add dedicated tests for runtime wiring to align policy precedence with existing services.
