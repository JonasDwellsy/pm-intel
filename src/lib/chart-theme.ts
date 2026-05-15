// Dwellsy IQ Recharts theme. Apply consistently across every Recharts chart in
// the scorecard. The values mirror the inline-SVG mock so that PDF / web /
// preview surfaces all read the same brand language.

export const dqChartTheme = {
  colors: {
    primary: "#0F1F3F", // navy
    accent: "#D97834", // orange — operator-of-record
    teal: "#1B6E8C",
    good: "#3E7C3E",
    bad: "#A63A2A",
    rose: "#C97B70",
    muted: "#7A8694",
    grid: "#D5DBE3",
    gridSoft: "#E6EAF0",
    cohort: "#C7CDD6", // peer cohort dots / bars
    quad: "#5C6573", // within-quadrant peer
    surfaceSoft: "#F2F5F8",
  },
  fontFamily:
    'var(--font-inter, "Inter"), Arial, Helvetica, system-ui, sans-serif',
  fontMono:
    'var(--font-jetbrains-mono, "JetBrains Mono"), ui-monospace, monospace',
  axis: {
    fontSize: 11,
    color: "#5C6573",
  },
  grid: {
    stroke: "#D5DBE3",
    strokeDasharray: "2 3",
    strokeWidth: 1,
  },
  tooltip: {
    backgroundColor: "#FFFFFF",
    border: "1px solid #D5DBE3",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 12,
    color: "#1A1A1A",
    boxShadow: "0 4px 18px rgb(15 31 63 / 0.08)",
  },
} as const;

// Common Recharts tick props for consistency
export const dqTick = {
  fontSize: dqChartTheme.axis.fontSize,
  fill: dqChartTheme.axis.color,
  fontFamily: dqChartTheme.fontFamily,
};

// Common CartesianGrid props
export const dqGrid = {
  stroke: dqChartTheme.grid.stroke,
  strokeDasharray: dqChartTheme.grid.strokeDasharray,
  strokeWidth: dqChartTheme.grid.strokeWidth,
};

// Recharts <Tooltip /> contentStyle for consistent visual treatment
export const dqTooltipContentStyle: React.CSSProperties = {
  backgroundColor: dqChartTheme.tooltip.backgroundColor,
  border: dqChartTheme.tooltip.border,
  borderRadius: dqChartTheme.tooltip.borderRadius,
  padding: dqChartTheme.tooltip.padding,
  fontSize: dqChartTheme.tooltip.fontSize,
  color: dqChartTheme.tooltip.color,
  boxShadow: dqChartTheme.tooltip.boxShadow,
  fontFamily: dqChartTheme.fontFamily,
};

export const dqTooltipLabelStyle: React.CSSProperties = {
  color: dqChartTheme.colors.primary,
  fontWeight: 600,
  marginBottom: 4,
};
