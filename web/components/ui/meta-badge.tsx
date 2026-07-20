import { cn } from "@/lib/utils";

/**
 * Low-signal meta info (duplicate/estimate/price-churn badges) rendered as a
 * small dot + muted text instead of a same-weight pill, so it reads as
 * secondary context rather than competing with lead-quality badges — NEXT_STEPS #58.
 */
export function MetaBadgeDot({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-muted-foreground",
        compact ? "text-[10px] leading-4" : "text-xs",
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
      {label}
    </span>
  );
}
