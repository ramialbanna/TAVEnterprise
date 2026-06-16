import type { MmrVinOk } from "@/lib/app-api/schemas";

import {
  inferBuildOptionsIncluded,
  parseAdjustmentOdometer,
  type MmrAdjustments,
} from "./mmr-adjustments";

/** Reference adjusted MMR at average odometer with build options included. */
export type MmrAdjustmentBaseline = {
  adjustedAtAvgOdometer: number;
  buildOptionsAdjustment: number;
};

/** Marginal dollar deltas captured when the user changes one attribute at a time. */
export type MmrAttributeMarginals = {
  grade: number | null;
  color: number | null;
  region: number | null;
};

export const EMPTY_MMR_ATTRIBUTE_MARGINALS: MmrAttributeMarginals = {
  grade: null,
  color: null,
  region: null,
};

export type MmrAdjustmentDeltas = {
  odometerAdjustment: number | null;
  buildOptionsAdjustment: number | null;
  gradeAdjustment: number | null;
  colorAdjustment: number | null;
  regionAdjustment: number | null;
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
  if (result.adjustedMmr == null || !inferBuildOptionsIncluded(result)) return null;

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

/** Which grade/color/region fields changed between adjustment states. */
export function detectAttributeMarginalChanges(
  prev: MmrAdjustments,
  next: MmrAdjustments,
): (keyof MmrAttributeMarginals)[] {
  const changed: (keyof MmrAttributeMarginals)[] = [];
  if (prev.grade !== next.grade) changed.push("grade");
  if (prev.exteriorColor !== next.exteriorColor) changed.push("color");
  if (prev.region !== next.region) changed.push("region");
  return changed;
}

/** Update marginals when a single attribute change produced a new adjusted MMR. */
export function applyAttributeMarginalDelta(
  prev: MmrAttributeMarginals,
  changedFields: (keyof MmrAttributeMarginals)[],
  priorAdjustedMmr: number | null,
  nextAdjustedMmr: number | null,
): MmrAttributeMarginals {
  if (
    changedFields.length !== 1 ||
    priorAdjustedMmr == null ||
    nextAdjustedMmr == null
  ) {
    return prev;
  }

  const delta = nonZeroDelta(nextAdjustedMmr - priorAdjustedMmr);
  const field = changedFields[0];
  if (field === "grade") return { ...prev, grade: delta };
  if (field === "color") return { ...prev, color: delta };
  return { ...prev, region: delta };
}

/** Derive per-field dollar deltas for the adjustments panel (Manheim-style). */
export function deriveMmrAdjustmentDeltas(params: {
  baseMmr: number | null;
  adjustedMmr: number | null;
  buildOptionsIncluded?: boolean;
  buildOptionsAdjustment?: number | null;
  odometerAdjustment?: number | null;
  gradeAdjustment?: number | null;
  colorAdjustment?: number | null;
  regionAdjustment?: number | null;
  adjustments: MmrAdjustments;
  baseline: MmrAdjustmentBaseline | null;
  attributeMarginals?: MmrAttributeMarginals;
}): MmrAdjustmentDeltas {
  const {
    baseMmr,
    adjustedMmr,
    buildOptionsAdjustment,
    odometerAdjustment,
    gradeAdjustment,
    colorAdjustment,
    regionAdjustment,
    adjustments,
    baseline,
    attributeMarginals = EMPTY_MMR_ATTRIBUTE_MARGINALS,
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

  const gradeAdj = adjustments.grade
    ? nonZeroDelta(gradeAdjustment ?? attributeMarginals.grade)
    : null;
  const colorAdj = adjustments.exteriorColor
    ? nonZeroDelta(colorAdjustment ?? attributeMarginals.color)
    : null;
  const regionAdj =
    adjustments.region && adjustments.region !== "National"
      ? nonZeroDelta(regionAdjustment ?? attributeMarginals.region)
      : null;

  return {
    odometerAdjustment: odo != null ? odoAdj : null,
    buildOptionsAdjustment: buildOn ? buildAdj : null,
    gradeAdjustment: gradeAdj,
    colorAdjustment: colorAdj,
    regionAdjustment: regionAdj,
  };
}
