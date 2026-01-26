/**
 * Collision Scanner
 *
 * Detects patterns that may cause routing conflicts:
 * - Overly broad patterns that match too much
 * - Patterns that overlap across intents without negatives
 * - Suggests negatives to resolve collisions
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TYPES
// ============================================================================

export interface PatternItem {
  id: string | number;
  pattern: string;
  intent?: string;
  priority?: number;
  [key: string]: any;
}

export interface CollisionResult {
  pattern1: PatternItem;
  pattern2: PatternItem;
  source1: string;
  source2: string;
  matchedTokens: string[];
  severity: "critical" | "warning" | "info";
  suggestedNegative?: string;
}

export interface BroadPatternResult {
  pattern: PatternItem;
  source: string;
  matchCount: number;
  severity: "critical" | "warning" | "info";
  reason: string;
}

export interface CollisionReport {
  timestamp: string;
  broadPatterns: BroadPatternResult[];
  collisions: CollisionResult[];
  suggestions: string[];
  summary: {
    criticalCount: number;
    warningCount: number;
    infoCount: number;
  };
}

// ============================================================================
// BROAD PATTERN DETECTION
// ============================================================================

const OVERLY_BROAD_PATTERNS = [
  "show me",
  "what is",
  "how many",
  "tell me",
  "give me",
  "find",
  "search",
  "list",
  "open",
  "get",
  "the",
  "a",
  "my",
  "all",
];

const BROAD_PATTERN_REGEXES = [
  /^(what|how|where|when|why|who)\s*$/i,
  /^(show|list|find|get|open)\s*$/i,
  /^[a-z]{1,3}$/i,
  /^\{[a-z]+\}$/i, // Just a placeholder like {n} or {file}
];

function isBroadPattern(pattern: string): { isBroad: boolean; reason: string } {
  const normalized = pattern.toLowerCase().trim();

  // Check exact matches
  if (OVERLY_BROAD_PATTERNS.includes(normalized)) {
    return { isBroad: true, reason: `Exact match with broad term: "${normalized}"` };
  }

  // Check regex patterns
  for (const regex of BROAD_PATTERN_REGEXES) {
    if (regex.test(normalized)) {
      return { isBroad: true, reason: `Matches broad pattern regex: ${regex}` };
    }
  }

  // Check if too short
  if (normalized.length < 4) {
    return { isBroad: true, reason: "Pattern too short (< 4 chars)" };
  }

  // Check if just common words
  const words = normalized.split(/\s+/);
  if (words.length === 1 && words[0].length < 5) {
    return { isBroad: true, reason: "Single short word" };
  }

  return { isBroad: false, reason: "" };
}

export function detectBroadPatterns(
  sources: { name: string; items: PatternItem[] }[]
): BroadPatternResult[] {
  const results: BroadPatternResult[] = [];

  for (const source of sources) {
    for (const item of source.items) {
      if (!item.pattern) continue;

      const check = isBroadPattern(item.pattern);
      if (check.isBroad) {
        results.push({
          pattern: item,
          source: source.name,
          matchCount: 0, // Would need actual query matching to calculate
          severity: item.pattern.length < 5 ? "critical" : "warning",
          reason: check.reason,
        });
      }
    }
  }

  return results.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

// ============================================================================
// COLLISION DETECTION
// ============================================================================

function tokenize(pattern: string): Set<string> {
  return new Set(
    pattern
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

function getTokenOverlap(tokens1: Set<string>, tokens2: Set<string>): string[] {
  return [...tokens1].filter((t) => tokens2.has(t));
}

function calculateOverlapScore(tokens1: Set<string>, tokens2: Set<string>): number {
  const overlap = getTokenOverlap(tokens1, tokens2);
  const minSize = Math.min(tokens1.size, tokens2.size);
  return minSize > 0 ? overlap.length / minSize : 0;
}

export function detectCollisions(
  sources: { name: string; intent: string; items: PatternItem[] }[],
  overlapThreshold: number = 0.6
): CollisionResult[] {
  const collisions: CollisionResult[] = [];

  // Compare patterns across different intents
  for (let i = 0; i < sources.length; i++) {
    const source1 = sources[i];

    for (let j = i + 1; j < sources.length; j++) {
      const source2 = sources[j];

      // Skip if same intent
      if (source1.intent === source2.intent) continue;

      // Compare all patterns between these two sources
      for (const item1 of source1.items) {
        if (!item1.pattern) continue;
        const tokens1 = tokenize(item1.pattern);

        for (const item2 of source2.items) {
          if (!item2.pattern) continue;
          const tokens2 = tokenize(item2.pattern);

          const overlap = getTokenOverlap(tokens1, tokens2);
          const overlapScore = calculateOverlapScore(tokens1, tokens2);

          if (overlapScore >= overlapThreshold) {
            const severity =
              overlapScore >= 0.9 ? "critical" : overlapScore >= 0.7 ? "warning" : "info";

            collisions.push({
              pattern1: item1,
              pattern2: item2,
              source1: source1.name,
              source2: source2.name,
              matchedTokens: overlap,
              severity,
              suggestedNegative: generateSuggestedNegative(
                item1.pattern,
                item2.pattern,
                source1.intent,
                source2.intent
              ),
            });
          }
        }
      }
    }
  }

  return collisions.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

function generateSuggestedNegative(
  pattern1: string,
  pattern2: string,
  intent1: string,
  intent2: string
): string {
  // Generate a negative pattern suggestion
  const tokens1 = tokenize(pattern1);
  const tokens2 = tokenize(pattern2);
  const uniqueToPattern1 = [...tokens1].filter((t) => !tokens2.has(t));
  const uniqueToPattern2 = [...tokens2].filter((t) => !tokens1.has(t));

  if (uniqueToPattern1.length > 0) {
    return `block_${intent2}_when: "${uniqueToPattern1.join(" ")}"`;
  }
  if (uniqueToPattern2.length > 0) {
    return `block_${intent1}_when: "${uniqueToPattern2.join(" ")}"`;
  }

  return `Consider adding discriminating keywords to differentiate ${intent1} from ${intent2}`;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

export function generateCollisionReport(
  broadPatterns: BroadPatternResult[],
  collisions: CollisionResult[]
): CollisionReport {
  const criticalCount =
    broadPatterns.filter((p) => p.severity === "critical").length +
    collisions.filter((c) => c.severity === "critical").length;

  const warningCount =
    broadPatterns.filter((p) => p.severity === "warning").length +
    collisions.filter((c) => c.severity === "warning").length;

  const infoCount =
    broadPatterns.filter((p) => p.severity === "info").length +
    collisions.filter((c) => c.severity === "info").length;

  // Generate suggestions
  const suggestions: string[] = [];

  if (broadPatterns.length > 0) {
    suggestions.push(
      `Found ${broadPatterns.length} overly broad patterns. Consider making them more specific.`
    );
  }

  if (collisions.length > 0) {
    suggestions.push(
      `Found ${collisions.length} potential collisions. Add negative patterns to disambiguate.`
    );

    // Add top suggested negatives
    const suggestedNegatives = collisions
      .filter((c) => c.suggestedNegative && c.severity === "critical")
      .map((c) => c.suggestedNegative!)
      .slice(0, 5);

    if (suggestedNegatives.length > 0) {
      suggestions.push("Top suggested negatives:");
      suggestedNegatives.forEach((n) => suggestions.push(`  - ${n}`));
    }
  }

  return {
    timestamp: new Date().toISOString(),
    broadPatterns,
    collisions,
    suggestions,
    summary: {
      criticalCount,
      warningCount,
      infoCount,
    },
  };
}

export function writeCollisionReport(report: CollisionReport, outputPath: string): void {
  const lines: string[] = [];

  lines.push("# Collision Report");
  lines.push("");
  lines.push(`Generated: ${report.timestamp}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push("| Severity | Count |");
  lines.push("|----------|-------|");
  lines.push(`| Critical | ${report.summary.criticalCount} |`);
  lines.push(`| Warning | ${report.summary.warningCount} |`);
  lines.push(`| Info | ${report.summary.infoCount} |`);
  lines.push("");

  // Status
  if (report.summary.criticalCount === 0) {
    lines.push("✅ No critical collisions detected");
  } else {
    lines.push("❌ Critical collisions require attention");
  }
  lines.push("");

  // Broad patterns
  lines.push("## Overly Broad Patterns");
  lines.push("");

  if (report.broadPatterns.length === 0) {
    lines.push("✅ No overly broad patterns found");
  } else {
    lines.push("| Pattern | Source | Severity | Reason |");
    lines.push("|---------|--------|----------|--------|");

    for (const bp of report.broadPatterns.slice(0, 50)) {
      const icon = bp.severity === "critical" ? "🔴" : bp.severity === "warning" ? "🟡" : "🔵";
      lines.push(
        `| \`${bp.pattern.pattern}\` | ${bp.source} | ${icon} ${bp.severity} | ${bp.reason} |`
      );
    }

    if (report.broadPatterns.length > 50) {
      lines.push(`... and ${report.broadPatterns.length - 50} more`);
    }
  }
  lines.push("");

  // Collisions
  lines.push("## Pattern Collisions");
  lines.push("");

  if (report.collisions.length === 0) {
    lines.push("✅ No pattern collisions found");
  } else {
    const criticalCollisions = report.collisions.filter((c) => c.severity === "critical");
    const warningCollisions = report.collisions.filter((c) => c.severity === "warning");

    if (criticalCollisions.length > 0) {
      lines.push("### Critical Collisions");
      lines.push("");

      for (const collision of criticalCollisions.slice(0, 20)) {
        lines.push(`**${collision.source1}** ↔ **${collision.source2}**`);
        lines.push(`- Pattern 1: \`${collision.pattern1.pattern}\``);
        lines.push(`- Pattern 2: \`${collision.pattern2.pattern}\``);
        lines.push(`- Matched tokens: ${collision.matchedTokens.join(", ")}`);
        if (collision.suggestedNegative) {
          lines.push(`- Suggestion: ${collision.suggestedNegative}`);
        }
        lines.push("");
      }
    }

    if (warningCollisions.length > 0) {
      lines.push("### Warning Collisions");
      lines.push("");
      lines.push(`Found ${warningCollisions.length} warning-level collisions.`);
      lines.push("");

      for (const collision of warningCollisions.slice(0, 10)) {
        lines.push(
          `- \`${collision.pattern1.pattern}\` (${collision.source1}) ↔ \`${collision.pattern2.pattern}\` (${collision.source2})`
        );
      }

      if (warningCollisions.length > 10) {
        lines.push(`... and ${warningCollisions.length - 10} more`);
      }
    }
  }
  lines.push("");

  // Suggestions
  lines.push("## Suggestions");
  lines.push("");

  if (report.suggestions.length === 0) {
    lines.push("No suggestions at this time.");
  } else {
    for (const suggestion of report.suggestions) {
      lines.push(`- ${suggestion}`);
    }
  }

  fs.writeFileSync(outputPath, lines.join("\n"));
}
