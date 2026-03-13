import type { AnswerMode, ChatRequest } from "../domain/chat.contracts";
import { getOptionalBank } from "../../domain/infra";
import { asObject, toPositiveInt } from "./chatComposeShared";

export class RuntimeFormattingStyleBuilder {
  buildFormattingStyleSignals(
    req: ChatRequest,
    answerModeHint: AnswerMode | string | null | undefined,
    operatorFamily: string | null,
  ): Record<string, unknown> | null {
    const answerStyleBank =
      getOptionalBank<Record<string, unknown>>("answer_style_policy");
    const boldingBank = getOptionalBank<Record<string, unknown>>("bolding_rules");
    const answerStyleConfig = asObject(answerStyleBank?.config);
    const boldingConfig = asObject(boldingBank?.config);
    if (
      (!answerStyleBank || answerStyleConfig.enabled === false) &&
      (!boldingBank || boldingConfig.enabled === false)
    ) {
      return null;
    }

    const answerMode = String(answerModeHint || "").trim().toLowerCase();
    const globalRules = asObject(answerStyleConfig.globalRules);
    const modeOverrides = asObject(globalRules.answerModeOverrides);
    const modeOverride =
      answerMode && typeof modeOverrides[answerMode] === "object"
        ? asObject(modeOverrides[answerMode])
        : null;
    const styleProfile = this.resolveAnswerStyleProfileHint(
      req,
      answerModeHint,
      answerStyleBank || {},
    );
    const profileEntry =
      styleProfile && answerStyleBank?.profiles
        ? asObject(asObject(answerStyleBank.profiles)[styleProfile])
        : null;
    const profileBudget = asObject(profileEntry?.budget);
    const profileMaxChars = toPositiveInt(profileBudget.maxChars);
    const profileMaxQuestions = toPositiveInt(profileBudget.maxQuestions);
    const contextSignals = asObject(asObject(req.context).signals);
    const userRequestedShort =
      req.truncationRetry === true || Boolean(contextSignals.userRequestedShort);
    const overrideMaxQuestions = Number.isFinite(Number(modeOverride?.maxQuestions))
      ? Math.max(0, Math.floor(Number(modeOverride?.maxQuestions)))
      : null;
    const globalMaxQuestions = toPositiveInt(globalRules.maxQuestionsPerAnswer);
    const styleMaxQuestions =
      overrideMaxQuestions ??
      (typeof profileMaxQuestions === "number" ? profileMaxQuestions : null) ??
      (typeof globalMaxQuestions === "number" ? globalMaxQuestions : null);
    const modeSuppressions = asObject(boldingBank?.modeSuppressions);
    const modeSuppression =
      answerMode && typeof modeSuppressions[answerMode] === "object"
        ? asObject(modeSuppressions[answerMode])
        : null;
    const familySuppression =
      operatorFamily && typeof modeSuppressions[operatorFamily] === "object"
        ? asObject(modeSuppressions[operatorFamily])
        : null;
    const boldingEnabled =
      boldingConfig.defaultBoldingEnabled !== false &&
      modeSuppression?.boldingEnabled !== false &&
      familySuppression?.boldingEnabled !== false;

    return {
      styleProfile: styleProfile || null,
      maxQuestions:
        typeof styleMaxQuestions === "number" ? styleMaxQuestions : undefined,
      profileMaxChars:
        typeof profileMaxChars === "number" ? profileMaxChars : undefined,
      userRequestedShort: userRequestedShort || undefined,
      allowBullets: modeOverride?.allowBullets === false ? false : undefined,
      allowTables: modeOverride?.allowTables === false ? false : undefined,
      allowQuotes: modeOverride?.allowQuotes === false ? false : undefined,
      suppressBodyFormatting:
        modeOverride?.suppressBodyFormatting === true ? true : undefined,
      boldingEnabled,
      maxBoldSpansTotal: toPositiveInt(
        asObject(boldingBank?.densityControl).maxBoldSpansTotal,
      ),
      operatorFamily: operatorFamily || undefined,
    };
  }

  private resolveAnswerStyleProfileHint(
    req: ChatRequest,
    answerModeHint: AnswerMode | string | null | undefined,
    answerStyleBank: Record<string, unknown>,
  ): string | null {
    const profiles = asObject(answerStyleBank.profiles);
    const profileKeys = Object.keys(profiles).map((key) => key.toLowerCase());
    const contextSignals = asObject(asObject(req.context).signals);
    const explicitProfile = String(
      contextSignals.styleProfile || contextSignals.profile || "",
    )
      .trim()
      .toLowerCase();
    if (explicitProfile && profileKeys.includes(explicitProfile)) {
      return explicitProfile;
    }

    const answerMode = String(answerModeHint || "").trim().toLowerCase();
    if (answerMode === "nav_pills" || answerMode === "rank_disambiguate") {
      return profileKeys.includes("micro") ? "micro" : profileKeys[0] || "micro";
    }
    if (req.truncationRetry === true || contextSignals.userRequestedShort) {
      if (profileKeys.includes("brief")) return "brief";
      if (profileKeys.includes("micro")) return "micro";
    }
    if (
      contextSignals.userRequestedDetailed ||
      contextSignals.goDeep ||
      contextSignals.fullBreakdown
    ) {
      if (profileKeys.includes("deep")) return "deep";
      if (profileKeys.includes("detailed")) return "detailed";
    }
    if (profileKeys.includes("standard")) return "standard";
    return profileKeys[0] || null;
  }
}
