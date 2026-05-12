import { cn } from "@/lib/utils";

export type OperationalStatus = "healthy" | "review" | "error" | "neutral";

const DOT_COLOR: Record<OperationalStatus, string> = {
  healthy: "bg-status-healthy",
  review: "bg-status-review",
  error: "bg-status-error",
  neutral: "bg-status-neutral",
};

/**
 * A small filled circle in the semantic status colour. Decorative by default (it's
 * usually paired with a `StatusPill` label); pass `label` to expose it to assistive tech
 * when it stands alone.
 */
export function HealthDot({
  status,
  label,
  className,
}: {
  status: OperationalStatus;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", DOT_COLOR[status], className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    />
  );
}
