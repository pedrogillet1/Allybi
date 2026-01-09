/**
 * CONVERSATION Intent Schema - Zero Overlap with DOCUMENTS and HELP
 *
 * CONVERSATION = Meta-conversational control about AI's responses
 * - Continue/stop AI response
 * - Clarify/expand/simplify AI's previous answer
 * - Acknowledgments (ok, got it, thanks)
 * - AI trust/honesty questions
 * - General AI capabilities (NOT Koda-specific features)
 */

export const CONVERSATION_STRUCTURE = {
  // 1. CONVERSATION STATES (20-25)
  states: [
    'direct_follow_up',
    'clarification_of_prior_message',
    'expanded_explanation_needed',
    'change_of_direction',
    'rephrasing_request',
    'shortened_explanation',
    'change_in_tone_required',
    'adding_more_context',
    'user_asking_about_system_behavior',
    'acknowledgment_of_statement',
    'user_seeking_affirmation',
    'requesting_an_example',
    'requesting_further_details',
    'repeating_previous_information',
    'adding_new_context',
    'seeking_additional_confirmation',
    'user_asking_for_repetition',
    'expressing_frustration',
    'filler_conversation',
    'transition_into_new_subject'
  ],

  // 2. CONVERSATION ACTIONS (30-35)
  actions: [
    'acknowledge_user_statement',
    'rephrase_response',
    'expand_response',
    'simplify_explanation',
    'provide_clarification',
    'provide_examples',
    'ask_for_clarification',
    'correct_previous_explanation',
    'provide_confidence_score',
    'ask_user_for_follow_up_question',
    'offer_next_steps_in_conversation',
    'clarify_ambiguity_in_question',
    'acknowledge_misunderstanding',
    'prompt_user_for_additional_context',
    'provide_conversational_filler',
    'ask_meta_question_about_reasoning',
    'ask_for_further_detail_on_topic',
    'stop_conversation',
    'restart_conversation',
    'guide_user_to_specific_next_action',
    'suggest_refinement_of_query',
    'provide_short_response',
    'redirect_to_relevant_document_if_necessary'
  ],

  // 3. CONVERSATION SCOPE (12-15)
  scope: [
    'single_statement',
    'single_section_of_conversation',
    'full_context_so_far',
    'cross_referencing_multiple_topics',
    'entire_conversation_history',
    'temporal_based',
    'user_defined_scope',
    'confidence_bounded_conversation',
    'narrow_focus_bound_conversation',
    'focused_on_specific_answer_types'
  ],

  // 4. CONVERSATIONAL DEPTH (10-12)
  depth: [
    'direct_response_to_query',
    'surface_level_explanation',
    'contextual_elaboration',
    'cross_reference_reasoning',
    'logical_reasoning_behind_response',
    'assessing_contradictions',
    'providing_step_by_step_breakdown',
    'going_into_high_detail_analysis',
    'interpreting_assumptions',
    'offering_multi_turn_reasoning',
    'expert_level_analysis',
    'providing_personal_or_user_specific_context'
  ],

  // 5. EVIDENCE & TRUST CONTROL (8-10)
  evidence_trust: [
    'direct_citation_required',
    'evidence_recommended_not_required',
    'multiple_citation_requirements',
    'inference_allowed_when_unavailable',
    'approximate_answers_allowed',
    'speculative_answers_forbidden',
    'speculative_reasoning_with_disclaimer',
    'user_preference_signal',
    'confidence_level_explicit'
  ],

  // 6. CONVERSATION TERMINATION (5-7)
  termination: [
    'user_satisfied_explicit',
    'confidence_below_threshold',
    'context_gap',
    'ambiguous_unclear_input',
    'user_explicitly_ends',
    'all_info_provided',
    'conversation_logic_completes'
  ],

  // 7. OUTPUT CONTROL (20-25)
  output_control: [
    'single_paragraph',
    'bullet_points',
    'numbered_steps',
    'table',
    'matrix_comparisons',
    'timeline',
    'mixed_sections',
    'pause_emphasis_markers',
    'ask_follow_up_questions',
    'suggest_next_actions',
    'offer_refinement',
    'show_more',
    'clarify_ambiguous_statement',
    'provide_more_context',
    'recommend_user_action',
    'context_based_suggestions',
    'highlight_risks',
    'emphasize_critical_steps',
    'provide_key_takeaways',
    'suggest_alternative_paths',
    'confirm_major_points',
    'highlight_important_values'
  ],

  // 8. CONVERSATION MEMORY (10-12)
  memory: [
    'active_conversation_context',
    'users_most_recent_query',
    'users_preferences_or_context_signals',
    'prior_assumptions_based_on_conversation',
    'current_status_or_progress',
    'users_past_behaviors',
    'users_history_of_previous_responses',
    'specific_user_based_or_task_based_data',
    'answers_previously_flagged_or_confirmed',
    'clarification_flags',
    'persistent_question_context',
    'topics_previously_covered'
  ],

  // 9. CONVERSATION FAILURE MODES (10-12)
  failure_modes: [
    'missing_premise_or_user_input',
    'hidden_assumption_causing_misunderstanding',
    'conflicting_information',
    'over_explanation',
    'under_explanation',
    'user_misunderstanding_answer',
    'logical_error_or_gap',
    'factual_inaccuracy',
    'unclear_or_incomplete_response',
    'ambiguity_in_users_query',
    'no_answer_due_to_lack_of_context',
    'misalignment_of_conversation_goals'
  ]
};

/**
 * Generate all CONVERSATION jobs
 */
export function generateAllJobs() {
  const jobs = [];
  const languages = ['en', 'pt', 'es'];
  const targetKeywords = 7000;
  const targetPatterns = 4000;

  for (const lang of languages) {
    jobs.push({
      jobId: `conversation-${lang}-keywords`,
      intent: 'conversation',
      language: lang,
      artifactType: 'keywords',
      targetCount: targetKeywords,
      structure: CONVERSATION_STRUCTURE
    });

    jobs.push({
      jobId: `conversation-${lang}-patterns`,
      intent: 'conversation',
      language: lang,
      artifactType: 'patterns',
      targetCount: targetPatterns,
      structure: CONVERSATION_STRUCTURE
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
