import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { UnavailableState } from "@/components/data-state";
import { DASH, MmrMoney, MmrRange } from "./mmr-value";

type Props = {
  baseMmr: number | null;
  confidence?: "high" | "medium" | "low" | null;
  method?: string | null;
  unavailableReason?: string | null;
};

function Stat({ label }: { label: string }) {
  return (
    <div className="border-t border-border py-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm tabular-nums">{DASH}</div>
    </div>
  );
}

const adjSelectClass =
  "h-10 w-full rounded-md border border-border bg-card px-3 text-sm " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function ResultBand({ baseMmr, confidence, method, unavailableReason }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
      {/* Left — Base MMR */}
      <div className="text-center">
        <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Base MMR
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums text-primary">
          {unavailableReason ? (
            <UnavailableState code={unavailableReason} size="block" />
          ) : (
            <MmrMoney value={baseMmr} />
          )}
        </div>
        {confidence ? (
          <div className="mt-2">
            <Badge variant="neutral">{confidence}</Badge>
            {method ? (
              <span className="ml-2 text-xs text-muted-foreground">method: {method}</span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4">
          <Stat label="Avg Odometer (mi)" />
          <Stat label="Avg Condition" />
          <Stat label="Avg EV Battery Score" />
        </div>
      </div>

      {/* Center — MMR Adjustments (all disabled; no recompute endpoint) */}
      <Card className="bg-surface-sunken">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              MMR Adjustments
            </span>
            <span
              aria-disabled="true"
              className="cursor-not-allowed text-xs font-medium uppercase text-muted-foreground/60"
            >
              Clear
            </span>
          </div>
          <input
            disabled
            placeholder="Enter ODO (mi)"
            aria-label="Enter ODO (mi)"
            className={adjSelectClass}
          />
          <select disabled aria-label="Region" className={adjSelectClass}>
            <option value="">Region</option>
          </select>
          <select disabled aria-label="Grade" className={adjSelectClass}>
            <option value="">Grade**</option>
          </select>
          <select disabled aria-label="Exterior Color" className={adjSelectClass}>
            <option value="">Exterior Color</option>
          </select>
          <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm opacity-50">
            <span>Build Options?</span>
            <span className="text-muted-foreground">NO</span>
          </div>
          <input
            disabled
            placeholder="Enter Express grade"
            aria-label="Enter Express grade"
            className={adjSelectClass}
          />
          <p className="text-xs text-muted-foreground">
            Numbers may not add exactly due to rounding ** AutoGrade™ or Manheim
            Express Grade. Adjustments require a backend recompute endpoint (tracked
            in #45) — disabled until then.
          </p>
        </CardContent>
      </Card>

      {/* Right — navy result panel */}
      <div className="rounded-lg bg-primary p-6 text-center text-primary-foreground">
        <div className="text-sm uppercase tracking-wider opacity-90">MMR Range</div>
        <div className="mt-1 text-lg font-semibold tabular-nums">
          <MmrRange low={null} high={null} />
        </div>
        <div className="mt-4 rounded-md bg-background/95 p-4 text-foreground">
          <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Adjusted MMR
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{DASH}</div>
        </div>
        <div className="mt-4 text-sm uppercase tracking-wider opacity-90">
          Estimated Retail Value
        </div>
        <div className="text-xs opacity-75">Based on Cox Automotive Retail Transactions</div>
        <div className="mt-1 text-lg font-semibold tabular-nums">{DASH}</div>
        <div className="mt-4 text-sm uppercase tracking-wider opacity-90">
          Typical Range
        </div>
        <div className="mt-1 text-lg font-semibold tabular-nums">{DASH}</div>
      </div>
    </div>
  );
}
