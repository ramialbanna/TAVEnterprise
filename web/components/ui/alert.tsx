import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertVariant = "default" | "amber" | "destructive";

const variantClasses: Record<AlertVariant, string> = {
  default: "border-border bg-card text-foreground",
  amber:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  destructive:
    "border-destructive/50 bg-destructive/10 text-destructive",
};

type Props = {
  variant?: AlertVariant;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
};

export function Alert({ variant = "default", children, onDismiss, className }: Props) {
  return (
    <div
      role="alert"
      className={cn(
        "relative flex items-start gap-3 rounded-md border px-4 py-3 text-sm",
        variantClasses[variant],
        className,
      )}
    >
      <div className="flex-1">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="shrink-0 rounded opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
