/**
 * Message classification utilities extracted from ChatInterfaceV2.
 * Determines whether a message is navigation, document-grounded, etc.
 */

export function isDocumentGroundedMode(mode) {
  const value = String(mode || "").trim();
  return value.startsWith("doc_grounded");
}

export function isNavigationMode(mode) {
  const value = String(mode || "").trim().toLowerCase();
  return value === "nav_pills" || value === "nav_pill" || value === "rank_disambiguate";
}

export function hasSourceButtonsAttachment(attachments, { navOnly = false } = {}) {
  if (!Array.isArray(attachments)) return false;
  return attachments.some((att) => {
    if (!att || att.type !== "source_buttons" || !Array.isArray(att.buttons) || att.buttons.length === 0) {
      return false;
    }
    if (!navOnly) return true;
    return isNavigationMode(att.answerMode);
  });
}

export function isNavigationAnswerMessage(message) {
  const answerMode = String(message?.answerMode || "").trim();
  const answerClass = String(message?.answerClass || "").trim().toUpperCase();
  const navType = String(message?.navType || "").trim();
  const hasListing = Array.isArray(message?.listing) && message.listing.length > 0;
  const hasNavSourceButtons = hasSourceButtonsAttachment(message?.attachments, { navOnly: true });
  return (
    isNavigationMode(answerMode) ||
    answerClass === "NAVIGATION" ||
    Boolean(navType) ||
    hasListing ||
    hasNavSourceButtons
  );
}

export function isDocumentContextAnswerMessage(message) {
  if (isNavigationAnswerMessage(message)) return false;
  const answerClass = String(message?.answerClass || "").trim().toUpperCase();
  const answerMode = String(message?.answerMode || "").trim();
  if (answerClass === "DOCUMENT" || isDocumentGroundedMode(answerMode)) return true;
  const hasAnySources =
    (Array.isArray(message?.sources) && message.sources.length > 0) ||
    hasSourceButtonsAttachment(message?.attachments);
  return hasAnySources;
}

export function canRenderSourcesForMessage(message) {
  return isDocumentContextAnswerMessage(message) && !isNavigationAnswerMessage(message);
}
