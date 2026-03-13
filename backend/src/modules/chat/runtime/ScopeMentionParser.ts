import type { ScopeRuntimeMentionConfig } from "./ScopeMentionResolver";
import { matchRegexPatterns } from "./scopeMentionShared";

export class ScopeMentionParser {
  extractMentionSignals(
    message: string,
    config: Pick<
      ScopeRuntimeMentionConfig,
      "candidateFilenameRegex" | "candidateDocRefRegex"
    >,
  ): string[] {
    if (!message.trim()) return [];
    return [
      ...matchRegexPatterns(config.candidateFilenameRegex, message),
      ...matchRegexPatterns(config.candidateDocRefRegex, message),
    ];
  }
}
