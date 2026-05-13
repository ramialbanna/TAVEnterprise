import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HealthDot, type OperationalStatus } from "@/components/status";

/**
 * Dashboard-local tile for a non-numeric live metric (e.g. "Worker mode",
 * "Connected"). Mirrors `KpiCard`'s visual shell — same `Card` + label header — but
 * renders a string value with an optional `HealthDot`, plus an optional sub-line for
 * a secondary detail. Never renders a missing value as `"0"`.
 *
 * Use `KpiCard` for numeric/date metrics; use `MetricTile` for status-string ones.
 */
export function MetricTile({
  label,
  value,
  status,
  sub,
  className,
}: {
  label: string;
  /** The status text. `null`/empty renders the muted em-dash sentinel. */
  value: string | null;
  /** Optional health dot — colour matches the dashboard status palette. */
  status?: OperationalStatus;
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
          <p className="text-base font-medium text-muted-foreground">—</p>
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
