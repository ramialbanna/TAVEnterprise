import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";

import { EMPTY_VALUE, formatMoney, formatNumber, formatPercent, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PendingBackendState, UnavailableState } from "@/components/data-state";

export type KpiValueFormat = "money" | "number" | "percent" | "relativeDate";
export type KpiState = "pending" | "unavailable";
export type KpiTrendDir = "up" | "down" | "flat";
export type KpiTrend = { dir: KpiTrendDir; text: string };

export interface KpiCardProps {
  label: string;
  /**
   * The metric. `null` / `undefined` renders the "Not available" marker — never `0`.
   * For numeric formats (`money|number|percent`) a non-finite number also renders "Not available".
   * For `format="relativeDate"` pass an ISO timestamp / epoch ms / `Date`; unparseable input
   * also renders "Not available" (never the em-dash `—` sentinel).
   */
  value?: number | string | Date | null;
  /** Display format. Defaults to `"money"` (whole dollars). */
  format?: KpiValueFormat;
  /**
   * For `format="number"` / `"percent"`: how many fractional digits to show. Defaults
   * to `0` so counts stay clean; fractional metrics like "Avg hold days" can pass `1`.
   * Ignored for `"money"` (use cents-format upstream if you need them) and `"relativeDate"`.
   */
  digits?: number;
  /**
   * `"pending"`    — the backend endpoint isn't built yet (`PendingBackendState`).
   * `"unavailable"`— the backend tried and couldn't (`UnavailableState`); `reason` → its `code`.
   * When set, it takes precedence over `value`.
   */
  state?: KpiState;
  /** For `state="unavailable"` → the `missingReason`/error code; for `state="pending"` → an extra note. */
  reason?: string;
  /** Optional small trend badge under the value. */
  trend?: KpiTrend;
  className?: string;
}

const TREND_ICON: Record<KpiTrendDir, LucideIcon> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
};

const TREND_VARIANT: Record<KpiTrendDir, "healthy" | "error" | "neutral"> = {
  up: "healthy",
  down: "error",
  flat: "neutral",
};

/**
 * Resolve a `value` + `format` to either a printable string OR `null` (meaning render the
 * missing marker). `null`/`undefined` is always missing. Numeric formats reject non-finite
 * input; `relativeDate` rejects unparseable input by treating the `EMPTY_VALUE` sentinel
 * returned by `formatRelativeTime` as missing.
 */
function resolveDisplay(
  value: number | string | Date | null | undefined,
  format: KpiValueFormat,
  digits: number | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  if (format === "relativeDate") {
    const text = formatRelativeTime(value);
    return text === EMPTY_VALUE ? null : text;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  switch (format) {
    case "percent":
      return formatPercent(value, digits !== undefined ? { maximumFractionDigits: digits } : undefined);
    case "number":
      return formatNumber(value, digits !== undefined ? { maximumFractionDigits: digits } : undefined);
    case "money":
    default:
      return formatMoney(value);
  }
}

/**
 * One dashboard KPI tile: a label and a big, null-safe value (or a `Pending backend` /
 * `Not available` marker), with an optional trend badge. Never renders `0` for missing data.
 * Pure presentational — pass already-fetched values.
 */
export function KpiCard({
  label,
  value,
  format = "money",
  digits,
  state,
  reason,
  trend,
  className,
}: KpiCardProps) {
  const display = state ? null : resolveDisplay(value, format, digits);

  const body: ReactNode =
    state === "pending" ? (
      <PendingBackendState label={label} note={reason} size="inline" />
    ) : state === "unavailable" ? (
      <UnavailableState code={reason} size="inline" />
    ) : display === null ? (
      <UnavailableState size="inline" />
    ) : (
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{display}</p>
    );

  const TrendIcon = trend ? TREND_ICON[trend.dir] : null;

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {body}
        {trend && TrendIcon ? (
          <Badge variant={TREND_VARIANT[trend.dir]} className="gap-1">
            <TrendIcon className="size-3" aria-hidden />
            {trend.text}
          </Badge>
        ) : null}
      </CardContent>
    </Card>
  );
}
