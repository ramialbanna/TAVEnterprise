import { Construction } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Size = "inline" | "block";

/**
 * Placeholder for a metric/region whose backend endpoint hasn't been built yet
 * (distinct from `UnavailableState`, which means "the backend tried and couldn't").
 * Visually a dashed, muted "Pending backend" marker — never renders a value or a zero.
 */
export function PendingBackendState({
  label,
  note,
  size = "block",
  className,
}: {
  label: string;
  note?: string;
  size?: Size;
  className?: string;
}) {
  if (size === "inline") {
    return (
      <Badge variant="neutral" className={cn("gap-1", className)} title={note ?? `${label} — not built yet`}>
        <Construction className="size-3" aria-hidden />
        Pending backend
      </Badge>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-surface-sunken px-6 py-8 text-center",
        className,
      )}
    >
      <Construction className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-muted-foreground">Pending backend</p>
      <p className="max-w-md text-xs text-muted-foreground">
        {label} isn&apos;t available yet — the backend endpoint hasn&apos;t been built.
        {note ? ` ${note}` : ""}
      </p>
    </div>
  );
}
