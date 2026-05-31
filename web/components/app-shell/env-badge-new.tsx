import { cn } from "@/lib/utils";
import type { EnvLabel } from "@/lib/env";
import type { AppRole } from "@/lib/app-shell/nav-new";
import { isAdminRole } from "@/lib/app-shell/nav-new";

const STYLES: Record<EnvLabel, string> = {
  PRODUCTION: "bg-status-error-bg text-status-error ring-1 ring-status-error/40 font-semibold",
  STAGING: "bg-status-neutral-bg text-primary ring-1 ring-primary/30",
  LOCAL: "bg-surface-sunken text-text-subtle ring-1 ring-border",
};

const PRODUCTION_SOFT =
  "bg-surface-sunken text-text-subtle ring-1 ring-border font-medium normal-case tracking-normal";

/**
 * New-mode env badge — loud PRODUCTION only for admins; subtle for typical buyers.
 */
export function EnvBadgeNew({ label, role }: { label: EnvLabel; role?: AppRole }) {
  const loudProduction = label === "PRODUCTION" && isAdminRole(role);
  const style =
    label === "PRODUCTION" && !loudProduction ? PRODUCTION_SOFT : STYLES[label];
  const display = label === "PRODUCTION" && !loudProduction ? "Live" : label;

  return (
    <span
      title={`Connected to the ${label} backend`}
      className={cn(
        "select-none rounded-md px-2 py-0.5 text-[11px] uppercase tracking-wider",
        style,
      )}
    >
      {display}
    </span>
  );
}
