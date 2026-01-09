import { decide, DecisionSignals } from '../services/core/decisionTree.service';

// Simulate Q17 "Open that one"
const signals: DecisionSignals = {
  predicted: {
    primaryIntent: 'documents',
    confidence: 0.6,
    matchedKeywords: [], // Intent engine may not extract keywords
    language: 'en',
    metadata: {
      rawQuery: 'Open that one',
      processingTime: 10,
      totalIntentsScored: 15,
    },
  },
  hasDocs: true,
  isRewrite: false,
  isFollowup: true,
};

console.log('=== Simulating Q17: "Open that one" ===');
console.log('Input signals:');
console.log('  primaryIntent:', signals.predicted.primaryIntent);
console.log('  matchedKeywords:', signals.predicted.matchedKeywords);
console.log('  rawQuery:', signals.predicted.metadata?.rawQuery);

const decision = decide(signals);

console.log('');
console.log('Decision result:');
console.log('  family:', decision.family);
console.log('  subIntent:', decision.subIntent);
console.log('  reason:', decision.reason);
