"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UnavailableState } from "@/components/data-state";
import { cn } from "@/lib/utils";

import {
  hasMmrAdjustments,
  MMR_COLOR_OPTIONS,
  MMR_GRADE_OPTIONS,
  MMR_REGION_OPTIONS,
  type MmrAdjustments,
} from "./mmr-adjustments";
import { DASH, MmrMoney, MmrRange } from "./mmr-value";

export type ResultBandPhase = "idle" | "loading" | "ready" | "recomputing" | "unavailable";

type Props = {
  phase?: ResultBandPhase;
  adjustments: MmrAdjustments;
  onAdjustmentsChange: (next: MmrAdjustments) => void;
  onAdjustmentsClear: () => void;
  baseMmr: number | null;
  confidence?: "high" | "medium" | "low" | null;
  method?: string | null;
  unavailableReason?: string | null;
  avgOdometer?: number | null;
  avgCondition?: number | null;
  rangeLow?: number | null;
  rangeHigh?: number | null;
  adjustedMmr?: number | null;
  odometerAdjustment?: number | null;
  buildOptionsAdjustment?: number | null;
  gradeAdjustment?: number | null;
  colorAdjustment?: number | null;
  regionAdjustment?: number | null;
  retailValue?: number | null;
  retailRangeLow?: number | null;
  retailRangeHigh?: number | null;
};

function formatNumber(value: number | null | undefined): string {
  return Number.isFinite(value) ? (value as number).toLocaleString() : DASH;
}

function Stat({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="border-t border-border py-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm tabular-nums">{formatNumber(value)}</div>
    </div>
  );
}

const adjSelectClass =
  "h-10 w-full rounded-md border border-border bg-card px-3 text-sm " +
  "disabled:cursor-not-allowed disabled:opacity-50";

function ResultBandSkeleton() {
  return (
    <div
      className="grid min-w-0 gap-4 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]"
      aria-busy
      aria-label="Loading MMR valuation"
    >
      <div className="space-y-3 text-center">
        <Skeleton className="mx-auto h-4 w-24" />
        <Skeleton className="mx-auto h-10 w-36" />
        <Skeleton className="mx-auto h-6 w-20" />
      </div>
      <Card className="bg-surface-sunken">
        <CardContent className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

type AdjustmentsPanelProps = {
  interactive: boolean;
  adjustments: MmrAdjustments;
  odometerAdjustment: number | null;
  buildOptionsAdjustment: number | null;
  gradeAdjustment: number | null;
  colorAdjustment: number | null;
  regionAdjustment: number | null;
  onChange: (next: MmrAdjustments) => void;
  onClear: () => void;
};

function formatAdjustmentDelta(value: number): string {
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}$${Math.abs(value).toLocaleString()}`;
}

function AdjustmentDelta({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums",
        positive && "text-emerald-600",
        negative && "text-red-600",
        !positive && !negative && "text-muted-foreground",
      )}
      aria-label={`${label} ${formatAdjustmentDelta(value)}`}
    >
      {positive ? (
        <ArrowUp className="size-3.5" aria-hidden />
      ) : negative ? (
        <ArrowDown className="size-3.5" aria-hidden />
      ) : null}
      {formatAdjustmentDelta(value)}
    </span>
  );
}

function MmrAdjustmentsPanel({
  interactive,
  adjustments,
  odometerAdjustment,
  buildOptionsAdjustment,
  gradeAdjustment,
  colorAdjustment,
  regionAdjustment,
  onChange,
  onClear,
}: AdjustmentsPanelProps) {
  const showOdometerDelta =
    adjustments.odometer !== "" &&
    odometerAdjustment != null &&
    odometerAdjustment !== 0;
  const showBuildOptionsDelta =
    adjustments.buildOptions &&
    buildOptionsAdjustment != null &&
    buildOptionsAdjustment !== 0;
  const showGradeDelta =
    adjustments.grade !== "" &&
    gradeAdjustment != null &&
    gradeAdjustment !== 0;
  const showColorDelta =
    adjustments.exteriorColor !== "" &&
    colorAdjustment != null &&
    colorAdjustment !== 0;
  const showRegionDelta =
    adjustments.region !== "" &&
    adjustments.region !== "National" &&
    regionAdjustment != null &&
    regionAdjustment !== 0;
  const canClear = interactive && hasMmrAdjustments(adjustments);

  return (
    <Card className="bg-surface-sunken">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            MMR Adjustments
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs font-medium uppercase"
              disabled={!canClear}
              onClick={onClear}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            key={`odo-${adjustments.odometer}`}
            disabled={!interactive}
            placeholder="Enter ODO (mi)"
            aria-label="Enter ODO (mi)"
            inputMode="numeric"
            defaultValue={adjustments.odometer}
            onChange={(e) => { e.target.value = e.target.value.replace(/[^\d]/g, ""); }}
            onBlur={(e) => onChange({ ...adjustments, odometer: e.target.value })}
            className={cn(adjSelectClass, "min-w-0 flex-1")}
          />
          {showOdometerDelta ? (
            <AdjustmentDelta value={odometerAdjustment} label="Odometer adjustment" />
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <select
            disabled={!interactive}
            aria-label="Region"
            value={adjustments.region}
            onChange={(e) => onChange({ ...adjustments, region: e.target.value })}
            className={cn(adjSelectClass, "min-w-0 flex-1")}
          >
            <option value="">Region</option>
            {MMR_REGION_OPTIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
          {showRegionDelta ? (
            <AdjustmentDelta value={regionAdjustment} label="Region adjustment" />
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <select
            disabled={!interactive}
            aria-label="Grade"
            value={adjustments.grade}
            onChange={(e) => onChange({ ...adjustments, grade: e.target.value })}
            className={cn(adjSelectClass, "min-w-0 flex-1")}
          >
            <option value="">Grade**</option>
            {MMR_GRADE_OPTIONS.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
          {showGradeDelta ? (
            <AdjustmentDelta value={gradeAdjustment} label="Grade adjustment" />
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <select
            disabled={!interactive}
            aria-label="Exterior Color"
            value={adjustments.exteriorColor}
            onChange={(e) => onChange({ ...adjustments, exteriorColor: e.target.value })}
            className={cn(adjSelectClass, "min-w-0 flex-1")}
          >
            <option value="">Exterior Color</option>
            {MMR_COLOR_OPTIONS.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </select>
          {showColorDelta ? (
            <AdjustmentDelta value={colorAdjustment} label="Color adjustment" />
          ) : null}
        </div>

        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm",
            !interactive && "opacity-50",
          )}
        >
          <span>Build Options?</span>
          <div className="flex items-center gap-2">
            {showBuildOptionsDelta ? (
              <AdjustmentDelta value={buildOptionsAdjustment} label="Build options adjustment" />
            ) : null}
            <div className="flex gap-1">
              {(["NO", "YES"] as const).map((label) => {
                const yes = label === "YES";
                const active = adjustments.buildOptions === yes;
                return (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    disabled={!interactive}
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                    onChange({
                      ...adjustments,
                      buildOptions: yes,
                      buildOptionsUserExcluded: !yes,
                    })
                  }
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        <input
          key={`grade-${adjustments.expressGrade}`}
          disabled={!interactive}
          placeholder="Enter Express grade"
          aria-label="Enter Express grade"
          inputMode="numeric"
          defaultValue={adjustments.expressGrade}
          onChange={(e) => { e.target.value = e.target.value.replace(/[^\d]/g, "").slice(0, 3); }}
          onBlur={(e) => onChange({ ...adjustments, expressGrade: e.target.value })}
          className={adjSelectClass}
        />

        <p className="text-xs text-muted-foreground">
          Numbers may not add exactly due to rounding ** AutoGrade™ or Manheim Express Grade.
          {interactive
            ? " Changes recompute adjusted MMR from Cox."
            : " Run a search to enable adjustment controls."}
        </p>
        {interactive ? (
          <p className="text-xs text-muted-foreground">Express grade eligible from 75 to 100.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ResultBand({
  phase = "idle",
  adjustments,
  onAdjustmentsChange,
  onAdjustmentsClear,
  baseMmr,
  confidence,
  method,
  unavailableReason,
  avgOdometer,
  avgCondition,
  rangeLow,
  rangeHigh,
  adjustedMmr,
  odometerAdjustment = null,
  buildOptionsAdjustment = null,
  gradeAdjustment = null,
  colorAdjustment = null,
  regionAdjustment = null,
  retailValue,
  retailRangeLow,
  retailRangeHigh,
}: Props) {
  const interactive = phase === "ready" || phase === "recomputing";
  const panelBusy = phase === "recomputing";

  if (phase === "loading") {
    return <ResultBandSkeleton />;
  }

  return (
    <div className="grid min-w-0 gap-4 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0 text-center">
        <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Base MMR
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums text-primary sm:text-3xl">
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
          <Stat label="Avg Odometer (mi)" value={avgOdometer} />
          <Stat label="Avg Condition" value={avgCondition} />
          <Stat label="Avg EV Battery Score" />
        </div>
      </div>

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

      <div
        className={cn(
          "min-w-0 rounded-lg bg-primary p-4 text-center text-primary-foreground sm:p-6",
          panelBusy && "opacity-80",
        )}
        aria-busy={panelBusy}
      >
        <div className="text-sm uppercase tracking-wider opacity-90">MMR Range</div>
        <div className="mt-1 text-lg font-semibold tabular-nums">
          <MmrRange low={rangeLow} high={rangeHigh} />
        </div>
        <div className="mt-4 rounded-md bg-background/95 p-4 text-foreground">
          <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Adjusted MMR
            {panelBusy ? (
              <span className="ml-2 text-xs font-normal normal-case">Updating…</span>
            ) : null}
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
            {panelBusy ? (
              <Skeleton className="mx-auto h-8 w-32" />
            ) : (
              <MmrMoney value={adjustedMmr} />
            )}
          </div>
        </div>
        {retailValue != null ? (
          <>
            <div className="mt-4 text-sm uppercase tracking-wider opacity-90">
              Estimated Retail Value
            </div>
            <div className="text-xs opacity-75">Based on Cox Automotive Retail Transactions</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              <MmrMoney value={retailValue} />
            </div>
            <div className="mt-4 text-sm uppercase tracking-wider opacity-90">Typical Range</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              <MmrRange low={retailRangeLow} high={retailRangeHigh} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
