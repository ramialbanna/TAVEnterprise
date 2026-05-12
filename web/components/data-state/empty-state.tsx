import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Compact "nothing here" state for a region whose query succeeded but returned no rows. */
export function EmptyState({
  title = "Nothing to show",
  hint,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title?: string;
  hint?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-10 text-center",
        className,
      )}
    >
      <Icon className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
