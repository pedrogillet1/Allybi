/**
 * CONVERSATION Intent Prompts
 */

export function buildConversationPrompt(job) {
  const { jobId, language, artifactType, targetCount, structure } = job;

  const langNames = {
    en: 'English',
    pt: 'Portuguese (Brazilian)',
    es: 'Spanish (Latin American and Spain)'
  };

  if (artifactType === 'keywords') {
    return `Generate ${targetCount} CONVERSATION intent keywords in ${langNames[language]}.

CONVERSATION INTENT = Meta-conversational control about AI's responses
- Continue/stop AI response ("continue", "stop", "wait")
- Clarify/expand/simplify AI's previous answer ("clarify that", "expand on what you said")
- Acknowledgments ("ok", "got it", "understood", "thanks")
- AI trust/honesty questions ("are you sure", "are you trustworthy")
- General AI capabilities ("what can AI do" - NOT Koda features)

CRITICAL RULES:
1. ZERO overlap with DOCUMENTS intent (no "summarize document", "extract from file")
2. ZERO overlap with HELP intent (no "how do I upload", "what is Koda")
3. ONLY meta-conversational AI response management
4. NO exact duplicates
5. Keep similar variations ("continue", "keep going", "go on", "proceed" all STAY)

Generate keywords covering these dimensions:
${Object.entries(structure).map(([key, items]) => `- ${key}: ${items.join(', ')}`).join('\n')}

Distribution (target ${targetCount} keywords):
- Conversation flow signals: 600 keywords (continue, stop, go on, keep going, pause, wait, etc.)
- Action triggers: 600 keywords (clarify, expand, simplify, rephrase, elaborate, etc.)
- Context modifiers: 280 keywords (regarding that, about what you said, in context of, etc.)
- Depth modifiers: 200 keywords (deeper, more detail, surface level, briefly, etc.)
- Confidence levels: 200 keywords (are you sure, how confident, certain, probably, etc.)
- Clarification triggers: 180 keywords (what do you mean, unclear, confusing, etc.)
- User satisfaction cues: 140 keywords (got it, ok, understood, thanks, perfect, etc.)
- Follow-up cues: 280 keywords (tell me more, what about, also, additionally, etc.)
- Acknowledgments: 500 keywords (yes, yeah, yep, ok, okay, sure, right, etc.)
- Tone adjustment: 400 keywords (more formal, casual, simpler, technical, etc.)
- AI trust/honesty: 500 keywords (trustworthy, reliable, accurate, confident, etc.)
- AI capabilities: 600 keywords (what can you do, your abilities, features, etc.)
- AI limitations: 600 keywords (what can't you do, limits, unable, cannot, etc.)
- Privacy/data: 400 keywords (is data safe, private, secure, confidential, etc.)
- Response control: 500 keywords (shorter, longer, brief, detailed, quick, etc.)
- Conversation meta: 400 keywords (this conversation, our chat, talking about, etc.)
- Error acknowledgment: 300 keywords (wrong, mistake, error, incorrect, etc.)
- Restart/reset: 200 keywords (start over, begin again, reset, restart, etc.)
- Affirmation seeking: 300 keywords (right, correct, is that true, makes sense, etc.)
- Example requests: 320 keywords (for example, such as, like what, demonstrate, etc.)

Output JSON format:
{
  "keywords": [
    {"text": "continue", "category": "flow_control", "weight": 0.95, "language": "${language}"},
    {"text": "clarify that", "category": "clarification", "weight": 0.9, "language": "${language}"}
  ]
}

Generate EXACTLY ${targetCount} keywords with natural ${langNames[language]} expressions.`;
  }

  if (artifactType === 'patterns') {
    return `Generate ${targetCount} regex PATTERNS for CONVERSATION intent in ${langNames[language]}.

CONVERSATION = Meta-conversational control
Generate patterns that match:
- Conversation flow: "(continue|keep going|go on|proceed)"
- Clarification: "(clarify|explain (that|what you (said|mean)))"
- Expansion: "(tell me more|expand|elaborate|go deeper)"
- Simplification: "(simpler|simplify|make it (shorter|easier|clearer))"
- Acknowledgment: "(ok|okay|got it|understood|makes sense)"
- AI capabilities: "(what can (you|AI) do|your (abilities|capabilities))"
- AI limitations: "(what (can't|cannot) (you|AI) do|your limits)"
- Trust: "(are you (sure|certain|confident|trustworthy))"
- Privacy: "(is (my )?data (safe|secure|private))"

CRITICAL: NO document operations, NO Koda features

Output JSON:
{
  "patterns": [
    {"regex": "(continue|keep going|go on)", "category": "flow_control", "weight": 0.9, "language": "${language}"}
  ]
}

Generate EXACTLY ${targetCount} patterns.`;
  }
}
