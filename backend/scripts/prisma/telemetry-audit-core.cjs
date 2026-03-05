function parseBool(raw, fallback = false) {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function calculateAmbiguousRows(tableAudits) {
  return (tableAudits || []).reduce((sum, audit) => {
    if (typeof audit?.exactOneRows !== "number") return sum;
    return sum + audit.exactOneRows;
  }, 0);
}

function allRepairMigrationsApplied(requiredHistory, history) {
  return (requiredHistory || []).every((name) => history?.[name]?.applied === true);
}

module.exports = {
  parseBool,
  calculateAmbiguousRows,
  allRepairMigrationsApplied,
};
