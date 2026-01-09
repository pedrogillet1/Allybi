/**
 * HELP Intent Prompts
 */

export function buildHelpPrompt(job) {
  const { jobId, language, artifactType, targetCount, structure } = job;

  const langNames = {
    en: 'English',
    pt: 'Portuguese (Brazilian)',
    es: 'Spanish (Latin American and Spain)'
  };

  if (artifactType === 'keywords') {
    return `Generate ${targetCount} HELP intent keywords in ${langNames[language]}.

HELP INTENT = Koda product usage, features, troubleshooting
- How to use Koda features ("how do I upload documents")
- Koda feature capabilities ("can Koda compare documents", "what features does Koda have")
- Tutorials and guidance ("show me how to use search")
- Troubleshooting ("not working", "error", "why isn't this working")
- Getting started ("what is Koda", "onboarding", "first time user")

CRITICAL RULES:
1. ZERO overlap with CONVERSATION intent (no "continue", "clarify your response", "are you sure")
2. ZERO overlap with DOCUMENTS intent (no "summarize this document", "extract from file")
3. ONLY Koda product features and usage
4. NO exact duplicates
5. Keep similar variations ("how do I upload", "how to upload", "upload how to" all STAY)

Generate keywords covering these dimensions:
${Object.entries(structure).map(([key, val]) => {
  if (typeof val === 'object' && !Array.isArray(val)) {
    return `- ${key}:\n${Object.entries(val).map(([subkey, items]) => `  - ${subkey}: ${Array.isArray(items) ? items.join(', ') : items}`).join('\n')}`;
  }
  return `- ${key}: ${Array.isArray(val) ? val.join(', ') : val}`;
}).join('\n')}

Distribution (target ${targetCount} keywords):
- Feature usage questions: 1200 keywords (how do I, how to, using feature, etc.)
- Feature capabilities: 1000 keywords (can Koda, does Koda support, what features, etc.)
- Tutorials: 800 keywords (show me how, guide me, step by step, tutorial, etc.)
- Product questions: 800 keywords (what is Koda, Koda pricing, who made Koda, etc.)
- Troubleshooting: 1000 keywords (not working, error, issue, problem, bug, broken, etc.)
- Configuration: 600 keywords (settings, configure, preferences, customize, setup, etc.)
- Getting started: 600 keywords (first time, onboarding, getting started, beginner, etc.)
- Error messages: 400 keywords (error code, failed, exception, crash, freeze, etc.)
- Permissions: 400 keywords (access denied, can't access, permission, restricted, etc.)
- Best practices: 300 keywords (recommended way, best way, should I, is it better, etc.)
- Feature discovery: 300 keywords (what else, other features, additional, more options, etc.)
- Workflow help: 400 keywords (process, workflow, sequence, steps, procedure, etc.)

Output JSON format:
{
  "keywords": [
    {"text": "how do I upload", "category": "feature_usage", "weight": 0.95, "language": "${language}"},
    {"text": "not working", "category": "troubleshooting", "weight": 0.9, "language": "${language}"}
  ]
}

Generate EXACTLY ${targetCount} keywords with natural ${langNames[language]} expressions.`;
  }

  if (artifactType === 'patterns') {
    return `Generate ${targetCount} regex PATTERNS for HELP intent in ${langNames[language]}.

HELP = Koda product usage and features
Generate patterns that match:
- Feature usage: "(how (do I|to)|using|use) (upload|search|tag|organize|compare)"
- Feature capabilities: "(can|does) Koda (support|compare|analyze|extract)"
- Tutorials: "(show me how|guide me|step by step|tutorial) (to|for)"
- Troubleshooting: "(not working|error|issue|problem|bug|broken|failed)"
- Product questions: "(what is Koda|Koda (features|pricing|capabilities))"
- Getting started: "(getting started|first time|onboarding|beginner guide)"
- Configuration: "(settings|configure|preferences|customize|set up)"
- Permissions: "(access denied|can't access|permission|restricted)"

CRITICAL: NO AI meta-conversation, NO document content operations

Output JSON:
{
  "patterns": [
    {"regex": "how (do I|to) (upload|search|tag)", "category": "feature_usage", "weight": 0.9, "language": "${language}"}
  ]
}

Generate EXACTLY ${targetCount} patterns.`;
  }
}
