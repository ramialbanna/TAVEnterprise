"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UnavailableState } from "@/components/data-state";
import { cn } from "@/lib/utils";

import { type MmrAdjustments } from "../../mmr-lab/_components/mmr-adjustments";
import {
  MmrAdjustmentsPanel,
  type ResultBandPhase,
} from "../../mmr-lab/_components/result-band";
import { DASH, MmrMoney, MmrRange } from "../../mmr-lab/_components/mmr-value";

type Props = {
  phase: ResultBandPhase;
  adjustments: MmrAdjustments;
  onAdjustmentsChange: (next: MmrAdjustments) => void;
  onAdjustmentsClear: () => void;
  baseMmr: number | null;
  unavailableReason?: string | null;
  avgOdometer?: number | null;
  avgCondition?: number | null;
  avgEvBatteryScore?: number | null;
  rangeLow?: number | null;
  rangeHigh?: number | null;
  adjustedMmr?: number | null;
  retailValue?: number | null;
  retailRangeLow?: number | null;
  retailRangeHigh?: number | null;
  odometerAdjustment?: number | null;
  buildOptionsAdjustment?: number | null;
  gradeAdjustment?: number | null;
  colorAdjustment?: number | null;
  regionAdjustment?: number | null;
};

function formatStat(value: number | null | undefined): string {
  return Number.isFinite(value) ? (value as number).toLocaleString() : DASH;
}

function SecondaryStats({
  baseMmr,
  retailValue,
  avgOdometer,
  avgCondition,
  avgEvBatteryScore,
}: Pick<
  Props,
  "baseMmr" | "retailValue" | "avgOdometer" | "avgCondition" | "avgEvBatteryScore"
>) {
  const parts = [
    `Base ${baseMmr != null ? `$${baseMmr.toLocaleString()}` : DASH}`,
    retailValue != null ? `Est. retail $${retailValue.toLocaleString()}` : null,
    avgOdometer != null ? `Avg odo ${formatStat(avgOdometer)} mi` : null,
    avgCondition != null ? `Avg cond ${avgCondition}` : null,
    avgEvBatteryScore != null ? `EV batt ${avgEvBatteryScore}%` : null,
  ].filter(Boolean);

  return (
    <p className="text-xs text-muted-foreground">{parts.join(" · ")}</p>
  );
}

export function MmrSummaryCard(props: Props) {
  const [expanded, setExpanded] = useState(false);
  const {
    phase,
    adjustments,
    onAdjustmentsChange,
    onAdjustmentsClear,
    baseMmr,
    unavailableReason,
    avgOdometer,
    avgCondition,
    avgEvBatteryScore,
    rangeLow,
    rangeHigh,
    adjustedMmr,
    retailValue,
    odometerAdjustment = null,
    buildOptionsAdjustment = null,
    gradeAdjustment = null,
    colorAdjustment = null,
    regionAdjustment = null,
  } = props;

  const interactive = phase === "ready" || phase === "recomputing";
  const busy = phase === "loading" || phase === "recomputing";

  if (phase === "loading") {
    return (
      <Card className="border-border bg-muted/30">
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-muted/30">
      <CardContent className="space-y-3 p-4">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          MMR
        </span>

        {unavailableReason ? (
          <UnavailableState code={unavailableReason} size="block" />
        ) : (
          <>
            <div className="space-y-1">
              <div className="text-2xl font-semibold tabular-nums text-primary">
                {busy ? (
                  <Skeleton className="h-8 w-32" />
                ) : (
                  <MmrMoney value={adjustedMmr} />
                )}
              </div>
              <div className="text-sm tabular-nums text-muted-foreground">
                {busy ? DASH : <MmrRange low={rangeLow} high={rangeHigh} />}
              </div>
            </div>

            <SecondaryStats
              baseMmr={baseMmr}
              retailValue={retailValue}
              avgOdometer={avgOdometer}
              avgCondition={avgCondition}
              avgEvBatteryScore={avgEvBatteryScore}
            />
          </>
        )}

        {interactive && !unavailableReason ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? "Hide adjustments" : "Adjust"}
            <ChevronDown
              className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </Button>
        ) : null}

        {expanded && interactive ? (
          <MmrAdjustmentsPanel
            interactive={interactive}
            adjustments={adjustments}
            odometerAdjustment={odometerAdjustment}
            buildOptionsAdjustment={buildOptionsAdjustment}
            gradeAdjustment={gradeAdjustment}
            colorAdjustment={colorAdjustment}
            regionAdjustment={regionAdjustment}
            onChange={onAdjustmentsChange}
            onClear={onAdjustmentsClear}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
