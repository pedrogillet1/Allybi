/**
 * Script to remove orphaned code from orchestrator
 */
const fs = require('fs');
const path = require('path');

const orchestratorPath = path.join(__dirname, '../src/services/core/kodaOrchestratorV3.service.ts');
let content = fs.readFileSync(orchestratorPath, 'utf-8');

// Remove the orphaned code block
// Find the pattern: closing brace of handleChitchat followed by orphaned code until handleMetaAI
const orphanedPattern = /(\n  \})\n\n    \/\/ Default chitchat response[\s\S]*?return \{[\s\S]*?\};\s*\n  \}\n\n  \/\*\*\n   \* Handle META_AI/;

if (content.match(orphanedPattern)) {
  content = content.replace(orphanedPattern, '$1\n\n  /**\n   * Handle META_AI');
  console.log('Removed orphaned chitchat code');
  fs.writeFileSync(orchestratorPath, content);
} else {
  console.log('Orphaned pattern not found - checking file state');
  // Let's find handleChitchat and handleMetaAI to see what's between them
  const chitchatEnd = content.indexOf('metadata: { _formatted: true },\n    };\n  }\n\n    // Default');
  if (chitchatEnd !== -1) {
    console.log('Found orphaned code at position:', chitchatEnd);
    // Find the problematic section manually
    const afterChitchat = content.indexOf('}', content.indexOf('metadata: { _formatted: true },\n    };'));
    const metaAIStart = content.indexOf('/**\n   * Handle META_AI');
    console.log('After chitchat close:', afterChitchat);
    console.log('META_AI start:', metaAIStart);

    if (afterChitchat !== -1 && metaAIStart !== -1 && metaAIStart > afterChitchat) {
      // Extract and fix
      const before = content.slice(0, afterChitchat + 1);
      const after = content.slice(metaAIStart - 4); // -4 for the "\n\n  " before comment
      content = before + '\n\n  ' + after;
      fs.writeFileSync(orchestratorPath, content);
      console.log('Fixed manually');
    }
  }
}
