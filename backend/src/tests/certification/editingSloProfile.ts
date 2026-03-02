export interface EditingSloThresholds {
  docxPassRateMin: number;
  xlsxPassRateMin: number;
  pyPassRateMin: number;
  adversarialPassRateMin: number;
  docxP95MsMax: number;
  xlsxP95MsMax: number;
  pyP95MsMax: number;
}

export function resolveEditingSloProfile():
  | "aggressive"
  | "balanced"
  | "conservative" {
  const raw = String(process.env.EDITING_SLO_PROFILE || "balanced")
    .trim()
    .toLowerCase();
  if (raw === "aggressive") return "aggressive";
  if (raw === "conservative") return "conservative";
  return "balanced";
}

export function resolveEditingSloThresholds(): EditingSloThresholds {
  const profile = resolveEditingSloProfile();
  if (profile === "aggressive") {
    return {
      docxPassRateMin: 0.97,
      xlsxPassRateMin: 0.96,
      pyPassRateMin: 0.96,
      adversarialPassRateMin: 0.995,
      docxP95MsMax: 7000,
      xlsxP95MsMax: 7000,
      pyP95MsMax: 7000,
    };
  }
  if (profile === "conservative") {
    return {
      docxPassRateMin: 0.9,
      xlsxPassRateMin: 0.9,
      pyPassRateMin: 0.9,
      adversarialPassRateMin: 0.98,
      docxP95MsMax: 12000,
      xlsxP95MsMax: 12000,
      pyP95MsMax: 12000,
    };
  }
  return {
    docxPassRateMin: 0.95,
    xlsxPassRateMin: 0.94,
    pyPassRateMin: 0.94,
    adversarialPassRateMin: 0.99,
    docxP95MsMax: 9000,
    xlsxP95MsMax: 9000,
    pyP95MsMax: 9000,
  };
}
