/**
 * Shared visual constants for the Recharts wrappers. Every colour resolves to a design-
 * token CSS variable, so charts follow the active light/dark theme automatically.
 *
 * Token map (the real `app/globals.css` tokens — not the names in the original plan draft):
 *   grid / axis line  → `--color-border`
 *   axis tick text    → `--color-muted-foreground`
 *   series palette    → `--color-chart-1 … --color-chart-5`
 *   status series     → `--color-status-{healthy,review,error,neutral}`
 */

const PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
] as const;

/** Categorical series palette (1-indexed at the call site via `seriesColor(n)`). */
export const CHART_PALETTE: readonly string[] = PALETTE;

export const STATUS_COLORS = {
  healthy: "var(--color-status-healthy)",
  review: "var(--color-status-review)",
  error: "var(--color-status-error)",
  neutral: "var(--color-status-neutral)",
} as const;
export type StatusColorKey = keyof typeof STATUS_COLORS;

export const CHART_COLORS = {
  palette: CHART_PALETTE,
  status: STATUS_COLORS,
  grid: "var(--color-border)",
  axisLine: "var(--color-border)",
  axisText: "var(--color-muted-foreground)",
} as const;

/**
 * Resolve a series colour:
 *   - a number `n` (1-5) → the n-th palette colour (wraps)
 *   - a status key (`"healthy"` | `"review"` | `"error"` | `"neutral"`) → that status colour
 *   - any other string → returned as-is (an explicit CSS colour)
 *   - `undefined` → `--color-chart-1`
 */
export function seriesColor(fill?: string | number): string {
  if (typeof fill === "number" && Number.isFinite(fill)) {
    const i = ((Math.trunc(fill) - 1) % PALETTE.length + PALETTE.length) % PALETTE.length;
    return PALETTE[i] ?? PALETTE[0];
  }
  if (typeof fill === "string" && fill in STATUS_COLORS) {
    return STATUS_COLORS[fill as StatusColorKey];
  }
  return typeof fill === "string" ? fill : PALETTE[0];
}

/** Spread onto `<XAxis>` / `<YAxis>` for consistent token-coloured axes. */
export const AXIS_PROPS = {
  stroke: CHART_COLORS.axisLine,
  tickLine: false,
  tick: { fontSize: 11, fill: CHART_COLORS.axisText },
};

/** Spread onto `<CartesianGrid>`. */
export const GRID_PROPS = {
  stroke: CHART_COLORS.grid,
  strokeDasharray: "3 3",
  vertical: false,
};

/** Tooltip content box styling (small, themed). */
export const TOOLTIP_CONTENT_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-popover)",
  color: "var(--color-popover-foreground)",
};

export const DEFAULT_CHART_HEIGHT = 240;
