import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";

import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PendingBackendState, UnavailableState } from "@/components/data-state";

export type KpiValueFormat = "money" | "number" | "percent";
export type KpiState = "pending" | "unavailable";
export type KpiTrendDir = "up" | "down" | "flat";
export type KpiTrend = { dir: KpiTrendDir; text: string };

export interface KpiCardProps {
  label: string;
  /** The metric. `null` / `undefined` / non-finite renders the "Not available" marker — never `0`. */
  value?: number | null;
  /** Display format. Defaults to `"money"` (whole dollars). */
  format?: KpiValueFormat;
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

function formatValue(value: number | null | undefined, format: KpiValueFormat): string {
  switch (format) {
    case "percent":
      return formatPercent(value);
    case "number":
      return formatNumber(value);
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
export function KpiCard({ label, value, format = "money", state, reason, trend, className }: KpiCardProps) {
  const body: ReactNode =
    state === "pending" ? (
      <PendingBackendState label={label} note={reason} size="inline" />
    ) : state === "unavailable" ? (
      <UnavailableState code={reason} size="inline" />
    ) : value === null || value === undefined || !Number.isFinite(value) ? (
      <UnavailableState size="inline" />
    ) : (
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatValue(value, format)}</p>
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
