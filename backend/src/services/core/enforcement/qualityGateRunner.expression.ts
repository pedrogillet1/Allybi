type RuleHelpers = {
  diAny: (value: unknown, predicate: unknown) => boolean;
  diCount: (value: unknown) => number;
  diDistinctCount: (value: unknown) => number;
  diIn: (value: unknown, candidates: unknown) => boolean;
  diStartsWith: (value: unknown, prefix: unknown) => boolean;
  diMatchesPattern: (
    value: unknown,
    pattern: unknown,
    flags?: unknown,
  ) => boolean;
  diIncludes: (container: unknown, item: unknown) => boolean;
  diSum: (values: unknown) => number;
  diLog10: (value: unknown) => number;
};

type EvaluationScope = {
  answerMode: string;
  context: Record<string, unknown>;
  output: Record<string, unknown>;
  attachments: Record<string, unknown>;
  source: Record<string, unknown>;
  config: Record<string, unknown>;
};

export function evaluateRuleBooleanExpression(params: {
  normalizedExpression: string;
  scope: EvaluationScope;
  helpers: RuleHelpers;
}): boolean {
  const { normalizedExpression, scope, helpers } = params;
  // eslint-disable-next-line no-new-func
  const evaluator = new Function(
    "context",
    "output",
    "attachments",
    "source",
    "config",
    "answerMode",
    "diAny",
    "diCount",
    "diDistinctCount",
    "diIn",
    "diStartsWith",
    "diMatchesPattern",
    "diIncludes",
    "diSum",
    "diLog10",
    `return Boolean(${normalizedExpression});`,
  ) as (
    context: Record<string, unknown>,
    output: Record<string, unknown>,
    attachments: Record<string, unknown>,
    source: Record<string, unknown>,
    config: Record<string, unknown>,
    answerMode: string,
    diAnyFn: RuleHelpers["diAny"],
    diCountFn: RuleHelpers["diCount"],
    diDistinctCountFn: RuleHelpers["diDistinctCount"],
    diInFn: RuleHelpers["diIn"],
    diStartsWithFn: RuleHelpers["diStartsWith"],
    diMatchesPatternFn: RuleHelpers["diMatchesPattern"],
    diIncludesFn: RuleHelpers["diIncludes"],
    diSumFn: RuleHelpers["diSum"],
    diLog10Fn: RuleHelpers["diLog10"],
  ) => boolean;

  return evaluator(
    scope.context,
    scope.output,
    scope.attachments,
    scope.source,
    scope.config,
    scope.answerMode,
    helpers.diAny,
    helpers.diCount,
    helpers.diDistinctCount,
    helpers.diIn,
    helpers.diStartsWith,
    helpers.diMatchesPattern,
    helpers.diIncludes,
    helpers.diSum,
    helpers.diLog10,
  );
}
