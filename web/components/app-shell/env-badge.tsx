import { cn } from "@/lib/utils";
import type { EnvLabel } from "@/lib/env";

const STYLES: Record<EnvLabel, string> = {
  PRODUCTION: "bg-status-error-bg text-status-error ring-1 ring-status-error/40 font-semibold",
  STAGING: "bg-status-neutral-bg text-primary ring-1 ring-primary/30",
  LOCAL: "bg-surface-sunken text-text-subtle ring-1 ring-border",
};

/** Always-visible environment indicator. PRODUCTION is loud on purpose. */
export function EnvBadge({ label }: { label: EnvLabel }) {
  return (
    <span
      title={`Connected to the ${label} backend`}
      className={cn(
        "select-none rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        STYLES[label],
      )}
    >
      {label}
    </span>
  );
}
