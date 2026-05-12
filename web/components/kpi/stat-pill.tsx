import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Compact key/value chip — e.g. a sample size (`n=42`) or a sub-metric tucked next to a
 * heading or inside a KPI card. Neutral styling; not an operational-status indicator
 * (use `StatusPill` for that).
 */
export function StatPill({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <span>{label}</span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </span>
  );
}
