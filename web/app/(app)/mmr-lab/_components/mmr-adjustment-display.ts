import type { MmrVinOk } from "@/lib/app-api/schemas";

import {
  parseAdjustmentOdometer,
  type MmrAdjustments,
} from "./mmr-adjustments";

/** Reference adjusted MMR at average odometer with build options included. */
export type MmrAdjustmentBaseline = {
  adjustedAtAvgOdometer: number;
  buildOptionsAdjustment: number;
};

export type MmrAdjustmentDeltas = {
  odometerAdjustment: number | null;
  buildOptionsAdjustment: number | null;
};

function nonZeroDelta(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded !== 0 ? rounded : null;
}

/** Capture baseline when Cox prices at average odometer with build options. */
export function buildMmrAdjustmentBaseline(
  result: Pick<
    MmrVinOk,
    | "mmrValue"
    | "adjustedMmr"
    | "avgOdometer"
    | "mileageUsed"
    | "buildOptionsIncluded"
    | "buildOptionsAdjustment"
    | "odometerAdjustment"
  >,
): MmrAdjustmentBaseline | null {
  if (result.adjustedMmr == null || result.buildOptionsIncluded !== true) return null;

  const buildAdj = nonZeroDelta(
    result.buildOptionsAdjustment ??
      (result.mmrValue != null ? result.adjustedMmr - result.mmrValue : null),
  );
  if (buildAdj == null) return null;

  const avgOdo = result.avgOdometer;
  const mileage = result.mileageUsed;
  const atAvg =
    avgOdo != null &&
    mileage != null &&
    Math.round(mileage) === Math.round(avgOdo);
  const noUserOdo = mileage == null || mileage <= 0;

  if (!atAvg && !noUserOdo) return null;

  return {
    adjustedAtAvgOdometer: result.adjustedMmr,
    buildOptionsAdjustment: buildAdj,
  };
}

/** Derive per-field dollar deltas for the adjustments panel (Manheim-style). */
export function deriveMmrAdjustmentDeltas(params: {
  baseMmr: number | null;
  adjustedMmr: number | null;
  buildOptionsIncluded?: boolean;
  buildOptionsAdjustment?: number | null;
  odometerAdjustment?: number | null;
  adjustments: MmrAdjustments;
  baseline: MmrAdjustmentBaseline | null;
}): MmrAdjustmentDeltas {
  const {
    baseMmr,
    adjustedMmr,
    buildOptionsAdjustment,
    odometerAdjustment,
    adjustments,
    baseline,
  } = params;

  const odo = parseAdjustmentOdometer(adjustments.odometer);
  const buildOn = adjustments.buildOptions;

  let buildAdj = buildOn
    ? nonZeroDelta(buildOptionsAdjustment ?? baseline?.buildOptionsAdjustment ?? null)
    : null;

  let odoAdj = nonZeroDelta(odometerAdjustment);

  if (
    odoAdj == null &&
    odo != null &&
    adjustedMmr != null &&
    baseline != null &&
    buildOn
  ) {
    odoAdj = nonZeroDelta(adjustedMmr - baseline.adjustedAtAvgOdometer);
  }

  if (
    odoAdj == null &&
    odo != null &&
    baseMmr != null &&
    adjustedMmr != null &&
    buildOn &&
    buildAdj != null
  ) {
    odoAdj = nonZeroDelta(adjustedMmr - baseMmr - buildAdj);
  }

  if (
    odoAdj == null &&
    odo != null &&
    baseMmr != null &&
    adjustedMmr != null &&
    !buildOn
  ) {
    odoAdj = nonZeroDelta(adjustedMmr - baseMmr);
  }

  if (
    buildAdj == null &&
    buildOn &&
    baseMmr != null &&
    adjustedMmr != null &&
    odoAdj != null
  ) {
    buildAdj = nonZeroDelta(adjustedMmr - baseMmr - odoAdj);
  }

  return {
    odometerAdjustment: odo != null ? odoAdj : null,
    buildOptionsAdjustment: buildOn ? buildAdj : null,
  };
}
