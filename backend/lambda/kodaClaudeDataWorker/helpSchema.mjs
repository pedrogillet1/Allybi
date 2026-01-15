/**
 * HELP Intent Schema - Zero Overlap with CONVERSATION and DOCUMENTS
 *
 * HELP = Koda product usage, features, troubleshooting
 * - How to use Koda features ("how do I upload")
 * - Koda feature capabilities ("can Koda compare documents")
 * - Tutorials and guidance
 * - Troubleshooting ("not working", "error")
 */

export const HELP_STRUCTURE = {
  // HELP_STATES (31 categories from spec)
  states: [
    'first_time_user',
    'returning_user',
    'experienced_user',
    'feature_known_usage_unknown',
    'feature_unknown',
    'error_encountered',
    'unexpected_behavior',
    'expected_behavior_clarification',
    'system_limitation_encountered',
    'permission_restriction',
    'configuration_missing',
    'misconfiguration_detected',
    'partial_understanding',
    'incorrect_mental_model',
    'conflicting_instructions',
    'blocked_workflow',
    'interrupted_workflow',
    'unsupported_request',
    'deprecated_behavior',
    'experimental_behavior_inquiry',
    'performance_concern',
    'reliability_concern',
    'security_concern',
    'privacy_concern',
    'data_handling_concern',
    'capability_boundary_inquiry',
    'feature_dependency_missing',
    'state_dependent_behavior',
    'context_dependent_behavior',
    'feature_interaction_confusion',
    'system_status_uncertainty'
  ],

  // HELP_ACTIONS (9 major groups)
  actions: {
    feature_understanding: [
      'explain_feature_purpose',
      'explain_feature_behavior',
      'explain_feature_limits',
      'explain_feature_availability',
      'explain_feature_requirements',
      'explain_feature_dependencies',
      'explain_feature_side_effects'
    ],
    feature_usage: [
      'how_to_use_feature',
      'step_by_step_usage',
      'correct_usage_pattern',
      'incorrect_usage_correction',
      'usage_prerequisites',
      'usage_sequencing',
      'usage_constraints'
    ],
    workflow_guidance: [
      'recommended_workflow',
      'alternative_workflow',
      'sequential_workflow',
      'parallel_workflow',
      'optimal_workflow',
      'minimal_workflow',
      'recovery_workflow'
    ],
    troubleshooting: [
      'identify_root_cause',
      'explain_error_message',
      'diagnose_failure',
      'resolve_failure',
      'recover_from_interruption',
      'prevent_recurrence',
      'escalation_guidance'
    ],
    limitation_handling: [
      'explain_limitation',
      'explain_why_limitation_exists',
      'hard_limitation_explanation',
      'soft_limitation_explanation',
      'suggest_workaround',
      'suggest_alternative_approach',
      'set_expectation_boundaries'
    ],
    permission_access: [
      'explain_permission_model',
      'explain_access_denial',
      'explain_role_limitations',
      'explain_scope_restrictions',
      'explain_ownership_rules',
      'explain_visibility_rules',
      'explain_inheritance_rules'
    ],
    capability_discovery: [
      'what_koda_can_do',
      'what_koda_cannot_do',
      'supported_actions',
      'unsupported_actions',
      'conditional_capabilities',
      'context_dependent_capabilities',
      'capability_roadmap_boundaries'
    ],
    best_practices: [
      'recommended_usage_patterns',
      'common_mistakes_to_avoid',
      'efficiency_practices',
      'accuracy_practices',
      'safety_practices',
      'scalability_practices',
      'reliability_practices'
    ],
    onboarding: [
      'getting_started',
      'core_concepts_explanation',
      'feature_overview',
      'initial_setup_guidance',
      'first_successful_workflow',
      'progressive_learning_path',
      'habit_formation_guidance'
    ]
  },

  // HELP_SCOPE (18 categories)
  scope: [
    'single_feature',
    'multiple_features',
    'entire_product',
    'current_session',
    'persistent_usage',
    'user_specific_configuration',
    'workspace_wide_behavior',
    'permission_bound_scope',
    'error_specific_scope',
    'workflow_specific_scope',
    'action_specific_scope',
    'ui_level_behavior',
    'system_level_behavior',
    'data_handling_behavior',
    'security_related_behavior',
    'privacy_related_behavior',
    'performance_related_behavior',
    'reliability_related_behavior'
  ],

  // HELP_DEPTH (14 categories)
  depth: [
    'one_line_clarification',
    'short_explanation',
    'step_by_step_explanation',
    'conceptual_explanation',
    'comparative_explanation',
    'cause_and_effect_explanation',
    'constraint_based_explanation',
    'trade_off_explanation',
    'risk_aware_explanation',
    'edge_case_explanation',
    'failure_mode_explanation',
    'expert_level_explanation',
    'meta_system_explanation',
    'behavioral_model_explanation'
  ],

  // EVIDENCE_AND_TRUST (13 categories)
  evidence_trust: [
    'no_evidence_required',
    'explanation_only',
    'behavioral_description_required',
    'system_rule_explanation_required',
    'limitation_explicitly_stated',
    'inference_allowed',
    'inference_restricted',
    'speculation_forbidden',
    'precision_required',
    'consistency_required',
    'safety_first_framing',
    'security_first_framing',
    'uncertainty_disclosure_required'
  ],

  // HELP_TEMPORAL_CONTEXT (9 categories)
  temporal_context: [
    'immediate_behavior',
    'session_level_behavior',
    'persistent_behavior',
    'version_dependent_behavior',
    'feature_rollout_behavior',
    'deprecated_behavior',
    'future_behavior_planned',
    'conditional_future_behavior',
    'state_transition_behavior'
  ],

  // HELP_CONSISTENCY (9 categories)
  consistency: [
    'internally_consistent_behavior',
    'context_dependent_behavior',
    'feature_interaction_conflict',
    'configuration_conflict',
    'permission_conflict',
    'state_conflict',
    'legacy_behavior_conflict',
    'documentation_mismatch',
    'user_expectation_mismatch'
  ],

  // OUTPUT_CONTROL (3 groups)
  output_control: {
    structural_formats: [
      'single_paragraph',
      'bullet_points',
      'numbered_steps',
      'table',
      'comparison_table',
      'decision_flow',
      'mixed_sections'
    ],
    interaction_controls: [
      'ask_clarification_question',
      'suggest_next_action',
      'offer_refinement',
      'show_more',
      'provide_alternative_path',
      'escalation_suggestion'
    ],
    emphasis_controls: [
      'highlight_limitations',
      'highlight_permissions',
      'highlight_risks',
      'highlight_prerequisites',
      'highlight_constraints',
      'highlight_best_practice'
    ]
  },

  // HELP_MEMORY (10 categories)
  memory: [
    'active_feature_context',
    'active_workflow_context',
    'known_user_proficiency',
    'prior_errors_encountered',
    'prior_solutions_attempted',
    'accepted_explanations',
    'rejected_explanations',
    'open_clarification_requests',
    'user_preference_signals',
    'resolution_status'
  ]
};

export function generateAllJobs() {
  const jobs = [];
  const languages = ['en', 'pt', 'es'];
  const targetKeywords = 7000;
  const targetPatterns = 4000;

  for (const lang of languages) {
    jobs.push({
      jobId: `help-${lang}-keywords`,
      intent: 'help',
      language: lang,
      artifactType: 'keywords',
      targetCount: targetKeywords,
      structure: HELP_STRUCTURE
    });

    jobs.push({
      jobId: `help-${lang}-patterns`,
      intent: 'help',
      language: lang,
      artifactType: 'patterns',
      targetCount: targetPatterns,
      structure: HELP_STRUCTURE
    });
  }

  return jobs;
}

export function calculateTotals() {
  const jobs = generateAllJobs();
  const totalJobs = jobs.length;
  const totalKeywords = jobs.filter(j => j.artifactType === 'keywords')
    .reduce((sum, j) => sum + j.targetCount, 0);
  const totalPatterns = jobs.filter(j => j.artifactType === 'patterns')
    .reduce((sum, j) => sum + j.targetCount, 0);

  return {
    totalJobs,
    totalKeywords,
    totalPatterns,
    totalSignals: totalKeywords + totalPatterns
  };
}
