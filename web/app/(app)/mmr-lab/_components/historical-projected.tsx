import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { DASH, MmrMoney } from "./mmr-value";
import type { MmrLowerSectionPhase } from "./mmr-lower-section-state";
import type {
  MmrHistoricalAverages,
  MmrHistoricalSlot,
  MmrProjectedAverage,
} from "./mmr-market-types";

type Props = {
  phase: MmrLowerSectionPhase;
  historicalAverages?: MmrHistoricalAverages | null;
  projectedAverage?: MmrProjectedAverage | null;
  className?: string;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
      {children}
    </h2>
  );
}

function formatMileage(value: number | null | undefined) {
  return Number.isFinite(value) ? `${(value as number).toLocaleString()} mi` : `Avg mi ${DASH}`;
}

function AvgSlot({
  label,
  slot,
  busy,
}: {
  label: string;
  slot?: MmrHistoricalSlot | MmrProjectedAverage | null;
  busy?: boolean;
}) {
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
          <div className="mt-1 text-lg font-semibold tabular-nums text-primary">
            <MmrMoney value={slot?.price ?? null} />
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatMileage(slot?.avgMileage ?? null)}
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

const HISTORICAL_SLOTS = [
  { label: "Past 30 Days", key: "past30Days" as const },
  { label: "6 Months Ago", key: "sixMonthsAgo" as const },
  { label: "Last Year", key: "lastYear" as const },
];

/** Zone C3 — Cox-style historical and projected average slots. */
export function HistoricalProjected({
  phase,
  historicalAverages = null,
  projectedAverage = null,
  className,
}: Props) {
  if (phase === "idle") {
    return (
      <div className={cn("grid min-w-0 gap-6 px-4 sm:grid-cols-2 sm:px-6", className)} aria-busy={false}>
        <IdlePanel title="Historical Average" />
        <IdlePanel title="Projected Average" />
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className={cn("grid min-w-0 gap-6 px-4 sm:grid-cols-2 sm:px-6", className)} aria-busy>
        <LoadingPanel title="Historical Average" slots={HISTORICAL_SLOTS.map((s) => s.label)} />
        <LoadingPanel title="Projected Average" slots={["Next Month"]} />
      </div>
    );
  }

  const missingHistorical =
    !historicalAverages ||
    (!historicalAverages.past30Days &&
      !historicalAverages.sixMonthsAgo &&
      !historicalAverages.lastYear);
  const missingProjected = !projectedAverage || projectedAverage.price === null;

  return (
    <div className={cn("min-w-0 space-y-4 px-4 sm:space-y-6 sm:px-6", className)}>
      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <SectionTitle>Historical Average</SectionTitle>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {HISTORICAL_SLOTS.map(({ label, key }) => (
              <AvgSlot
                key={key}
                label={label}
                slot={historicalAverages?.[key] ?? null}
              />
            ))}
          </div>
        </section>
        <section>
          <SectionTitle>Projected Average</SectionTitle>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <AvgSlot label="Next Month" slot={projectedAverage} />
          </div>
        </section>
      </div>
      {missingHistorical || missingProjected ? (
        <p className="text-xs text-muted-foreground">
          {missingHistorical && missingProjected
            ? "Historical and forecast averages were not included in this Cox response. Enable MANHEIM_INCLUDE_HISTORICAL and MANHEIM_INCLUDE_FORECAST on the intelligence worker."
            : missingHistorical
              ? "Historical averages were not included in this Cox response."
              : "Forecast average was not included in this Cox response."}
        </p>
      ) : null}
    </div>
  );
}
