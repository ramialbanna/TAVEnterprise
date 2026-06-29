import { cn } from "@/lib/utils";

import { type DealGrade, dealGradeLabel } from "./maxbuy-deal-grade";

const GRADE_RING: Record<DealGrade, string> = {
  A: "border-emerald-500/70 text-emerald-700 dark:text-emerald-400",
  B: "border-sky-500/70 text-sky-700 dark:text-sky-400",
  C: "border-amber-500/70 text-amber-800 dark:text-amber-400",
  D: "border-orange-500/70 text-orange-800 dark:text-orange-400",
  F: "border-rose-500/70 text-rose-700 dark:text-rose-400",
};

type Props = {
  grade: DealGrade | null;
  className?: string;
  /** Show "Grade" caption under the circle (vAuto-style). */
  showLabel?: boolean;
};

export function MaxbuyGradeBadge({ grade, className, showLabel = true }: Props) {
  if (grade == null) {
    return (
      <div className={cn("flex flex-col items-center gap-1", className)}>
        <div
          className="flex size-11 items-center justify-center rounded-full border border-dashed border-border text-sm text-muted-foreground"
          title="Add asking price to grade this deal"
          aria-label="Deal grade unavailable"
        >
          —
        </div>
        {showLabel ? (
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Grade
          </span>
        ) : null}
      </div>
    );
  }

  const description = dealGradeLabel(grade);

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        className={cn(
          "flex size-11 items-center justify-center rounded-full border-2 bg-background text-lg font-semibold tabular-nums",
          GRADE_RING[grade],
        )}
        title={description}
        aria-label={`Deal grade ${grade}: ${description}`}
      >
        {grade}
      </div>
      {showLabel ? (
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Grade
        </span>
      ) : null}
    </div>
  );
}
