import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { HealthDot, type OperationalStatus } from "./health-dot";

/**
 * Operational-status badge: a coloured dot + label in the semantic status palette
 * (`healthy | review | error | neutral` → `bg-status-*-bg text-status-*`). Used for the
 * dashboard system-health indicator and per-region status.
 */
export function StatusPill({
  status,
  children,
  className,
}: {
  status: OperationalStatus;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge variant={status} className={cn("gap-1.5", className)}>
      <HealthDot status={status} />
      {children}
    </Badge>
  );
}

export type { OperationalStatus };
