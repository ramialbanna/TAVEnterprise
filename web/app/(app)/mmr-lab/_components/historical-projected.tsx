import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { DASH } from "./mmr-value";
import type { MmrLowerSectionState } from "./mmr-lower-section-state";

type Props = {
  state: MmrLowerSectionState;
  className?: string;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
      {children}
    </h2>
  );
}

function AvgSlot({ label, busy }: { label: string; busy?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      {busy ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="mx-auto h-6 w-20" />
          <Skeleton className="mx-auto h-3 w-16" />
        </div>
      ) : (
        <>
          <div className="mt-1 text-lg font-semibold tabular-nums text-primary">{DASH}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Avg mi {DASH}
          </div>
        </>
      )}
    </div>
  );
}

function IdlePanel({ title }: { title: string }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <Card className="mt-2 border-dashed bg-surface-sunken">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Search to load {title.toLowerCase()} for this vehicle.
        </CardContent>
      </Card>
    </section>
  );
}

function LoadingPanel({ title, slots }: { title: string; slots: string[] }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {slots.map((label) => (
          <AvgSlot key={label} label={label} busy />
        ))}
      </div>
    </section>
  );
}

function EmptyPanel({ title, slots }: { title: string; slots: string[] }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {slots.map((label) => (
          <AvgSlot key={label} label={label} />
        ))}
      </div>
    </section>
  );
}

const HISTORICAL_SLOTS = ["Past 30 Days", "6 Months Ago", "Last Year"] as const;
const PROJECTED_SLOTS = ["Next Month"] as const;

/** Zone C3 — Cox-style historical and projected average slots. */
export function HistoricalProjected({ state, className }: Props) {
  if (state === "idle") {
    return (
      <div className={cn("grid min-w-0 gap-6 px-4 sm:grid-cols-2 sm:px-6", className)} aria-busy={false}>
        <IdlePanel title="Historical Average" />
        <IdlePanel title="Projected Average" />
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className={cn("grid min-w-0 gap-6 px-4 sm:grid-cols-2 sm:px-6", className)} aria-busy>
        <LoadingPanel title="Historical Average" slots={[...HISTORICAL_SLOTS]} />
        <LoadingPanel title="Projected Average" slots={[...PROJECTED_SLOTS]} />
      </div>
    );
  }

  return (
    <div className={cn("min-w-0 space-y-4 px-4 sm:space-y-6 sm:px-6", className)}>
      <div className="grid gap-6 sm:grid-cols-2">
        <EmptyPanel title="Historical Average" slots={[...HISTORICAL_SLOTS]} />
        <EmptyPanel title="Projected Average" slots={[...PROJECTED_SLOTS]} />
      </div>
      <p className="text-xs text-muted-foreground">
        Cox historical and forecast averages ship in Phase 4 — price and average mileage placeholders
        above.
      </p>
    </div>
  );
}
