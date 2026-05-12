import { CircleSlash } from "lucide-react";

import { codeMessage } from "@/lib/app-api";
import { cn } from "@/lib/utils";

type Size = "inline" | "block";

/**
 * "Not available" placeholder for a metric/region the backend explicitly couldn't
 * provide (`missingReason` / an error `code`). Shows the human copy from `codeMessage`
 * — never a number, never a zero, never a fabricated value.
 *
 *   - `size="inline"` — a small muted phrase, for inside a KPI card where a value would go.
 *   - `size="block"`  — a bordered muted panel, for a whole region.
 */
export function UnavailableState({
  code,
  title = "Not available",
  size = "block",
  className,
}: {
  code?: string | null;
  title?: string;
  size?: Size;
  className?: string;
}) {
  const message = codeMessage(code);

  if (size === "inline") {
    return (
      <span className={cn("text-sm text-muted-foreground", className)} title={message}>
        {title}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-sunken px-6 py-8 text-center",
        className,
      )}
    >
      <CircleSlash className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
