// Koda Chart Theme - Consistent styling across all charts
// Black/White/Gray only - NO bright colors

export const chartColors = {
  // Primary series colors (grayscale)
  primary: "#181818",
  secondary: "#525252",
  tertiary: "#737373",
  quaternary: "#a3a3a3",
  quinary: "#d4d4d4",

  // Domain colors (grayscale)
  finance: "#181818",
  legal: "#525252",
  general: "#737373",
  other: "#a3a3a3",

  // Status colors (grayscale)
  success: "#404040",
  warning: "#737373",
  error: "#262626",

  // Grid and axis
  grid: "#e5e5e5",
  axis: "#737373",
  axisLabel: "#525252",

  // Tooltip
  tooltipBg: "#ffffff",
  tooltipBorder: "#e5e5e5",
  tooltipText: "#181818",
};

export const chartConfig = {
  // Consistent margins
  margin: { top: 20, right: 20, bottom: 20, left: 20 },

  // Grid styling
  grid: {
    strokeDasharray: "3 3",
    stroke: chartColors.grid,
    vertical: false,
  },

  // Axis styling
  axis: {
    stroke: chartColors.grid,
    tick: {
      fill: chartColors.axisLabel,
      fontSize: 12,
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    },
  },

  // Tooltip styling
  tooltip: {
    contentStyle: {
      backgroundColor: chartColors.tooltipBg,
      border: `1px solid ${chartColors.tooltipBorder}`,
      borderRadius: "6px",
      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
      padding: "12px",
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      fontSize: "13px",
    },
    labelStyle: {
      color: chartColors.tooltipText,
      fontWeight: 600,
      marginBottom: "4px",
    },
    itemStyle: {
      color: chartColors.axisLabel,
      padding: "2px 0",
    },
  },

  // Legend styling
  legend: {
    wrapperStyle: {
      paddingTop: "16px",
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      fontSize: "12px",
    },
    iconType: "square" as const,
    iconSize: 10,
  },

  // Animation
  animation: {
    duration: 300,
    easing: "ease-out",
  },
};

// Domain color mapping
export const domainColors: Record<string, string> = {
  finance: chartColors.finance,
  legal: chartColors.legal,
  general: chartColors.general,
  other: chartColors.other,
};

// Series color array for charts with multiple series
export const seriesColors = [
  chartColors.primary,
  chartColors.secondary,
  chartColors.tertiary,
  chartColors.quaternary,
  chartColors.quinary,
];

// Get color for a specific series index
export function getSeriesColor(index: number): string {
  return seriesColors[index % seriesColors.length];
}

// Get color for a specific domain
export function getDomainColor(domain: string): string {
  return domainColors[domain.toLowerCase()] || chartColors.other;
}
