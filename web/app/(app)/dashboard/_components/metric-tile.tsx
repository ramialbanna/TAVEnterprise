import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthDot, type OperationalStatus } from "@/components/status";
import { UnavailableState } from "@/components/data-state";

/**
 * Dashboard-local tile for a non-numeric live metric (e.g. "Worker mode",
 * "Connected"). Mirrors `KpiCard`'s visual shell — same `Card` + label header — but
 * renders a string value with an optional `HealthDot`, plus an optional sub-line for
 * a secondary detail.
 *
 * Missing value (`null` or whitespace-only) renders the dashboard-wide inline
 * `UnavailableState` so this tile and a missing `KpiCard` look the same when they
 * sit next to each other in `FutureMetricsSection`. Pass `unavailableReason` to map
 * to a specific `codeMessage` (e.g. `"db_error"`); omit it for the generic copy.
 *
 * Use `KpiCard` for numeric/date metrics; use `MetricTile` for status-string ones.
 */
export function MetricTile({
  label,
  value,
  status,
  unavailableReason,
  sub,
  className,
}: {
  label: string;
  /** The status text. `null`/whitespace-only renders the inline `UnavailableState`. */
  value: string | null;
  /** Optional health dot — colour matches the dashboard status palette. */
  status?: OperationalStatus;
  /** Reason code for the missing-value path (e.g. `"db_error"`); maps to codeMessage. */
  unavailableReason?: string;
  /** Optional secondary line in muted text (e.g. a count or URL). */
  sub?: ReactNode;
  className?: string;
}) {
  const isMissing = value === null || value.trim().length === 0;

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {isMissing ? (
          <UnavailableState code={unavailableReason} size="inline" />
        ) : (
          <p className="flex items-center gap-2 text-base font-medium">
            {status ? <HealthDot status={status} /> : null}
            <span>{value}</span>
          </p>
        )}
        {sub ? <p className="truncate text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}
