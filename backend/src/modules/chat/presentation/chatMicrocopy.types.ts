export type ChatLanguage = "en" | "pt" | "es";

export type FallbackMessageContext = Record<string, unknown>;

export interface FallbackRouteHints {
  hasIndexedDocs?: boolean;
  hardScopeActive?: boolean;
  explicitDocRef?: boolean;
  needsDocChoice?: boolean;
  disambiguationOptions?: string[];
  topConfidence?: number;
  confidenceGap?: number;
}

export type ProcessingMessagesBank = {
  config?: {
    enabled?: boolean;
  };
  messages?: Record<string, Record<string, string[]>>;
};

export type FallbackRouterBank = {
  config?: {
    enabled?: boolean;
    canonicalReasonCodes?: string[];
    defaults?: {
      action?: string;
      telemetryReason?: string;
    };
  };
  rules?: Array<{
    when?: {
      reasonCodeIn?: string[];
    };
    do?: {
      action?: string;
      telemetryReason?: string;
    };
  }>;
  maps?: {
    reasonCodeToTelemetryReason?: Record<string, string>;
  };
};

export type EditErrorCatalogBank = {
  config?: {
    enabled?: boolean;
    fallbackLanguage?: string;
  };
  errors?: Record<string, Record<string, string>>;
};

export type MicrocopySanitization = {
  maxReplacementChars?: number;
  truncateEllipsis?: string;
  stripNewlines?: boolean;
  escapeMarkdown?: boolean;
};

export type MicrocopyFragment = {
  id?: string;
  lang?: string;
  t?: string;
  useOnlyIfProvided?: boolean;
};

export type CombinatorialMicrocopyBank = {
  config?: {
    enabled?: boolean;
    hardConstraints?: {
      maxSentences?: number;
      maxCharsHard?: number;
    };
    placeholders?: {
      sanitization?: MicrocopySanitization;
    };
    assembly?: {
      partsOrder?: string[];
      optionalParts?: string[];
      maxPartsUsed?: number;
      sentenceStrategy?: {
        joiner?: string;
      };
    };
  };
  routing?: {
    byReason?: Record<string, string>;
    byState?: Record<string, string>;
    fallbackScenario?: string;
  };
  scenarios?: Record<
    string,
    {
      parts?: Record<string, MicrocopyFragment[]>;
    }
  >;
};

export type DisambiguationMicrocopyBank = {
  config?: {
    enabled?: boolean;
    actionsContract?: {
      thresholds?: {
        maxOptions?: number;
        minOptions?: number;
        maxQuestionSentences?: number;
      };
    };
  };
  rules?: Array<{
    id?: string;
    when?: {
      all?: Array<{
        path?: string;
        op?: string;
        value?: number;
      }>;
    };
  }>;
};
