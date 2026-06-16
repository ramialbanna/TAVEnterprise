/**
 * Pure extractor for Manheim/Cox MMR response distribution fields.
 *
 * Documented payload shape (bestMatch item, else items[0], else root):
 *   wholesale.average                    → wholesaleBaseAvg   (base MMR)
 *   adjustedPricing.wholesale.average    → wholesaleAvg       (adjusted MMR)
 *   adjustedPricing.wholesale.above      → wholesaleClean
 *   adjustedPricing.wholesale.below      → wholesaleRough
 *   adjustedPricing.retail.*             → retail tiers
 *   sampleSize                           → sampleCount
 *
 * Cox MMR 1.4 returns retail tiers when the request includes `retail` in the
 * include list (`MANHEIM_INCLUDE_RETAIL=true`); otherwise the retail object is
 * absent and the retail fields parse to null. The legacy Manheim VIN/YMM
 * endpoints did not return retail and produced null on every call.
 *
 * Used by both src/valuation/valuationResult.ts (main worker) and
 * workers/tav-intelligence-worker/src/persistence/mmrCacheRepository.ts.
 */

import { selectMmrPayloadItem } from "./manheimPayloadItem";

export interface ManheimDistribution {
  /** Adjusted wholesale average (build options, etc.). */
  wholesaleAvg:   number | null;
  wholesaleClean: number | null;
  wholesaleRough: number | null;
  /** Base wholesale average before option adjustments. */
  wholesaleBaseAvg:   number | null;
  wholesaleBaseClean: number | null;
  wholesaleBaseRough: number | null;
  /** Cox MMR 1.4 retail tier above. Null when retail include flag is off or absent from payload. */
  retailClean:    number | null;
  /** Cox MMR 1.4 retail tier average. Null when retail include flag is off or absent from payload. */
  retailAvg:      number | null;
  /** Cox MMR 1.4 retail tier below. Null when retail include flag is off or absent from payload. */
  retailRough:    number | null;
  sampleCount:    number | null;
}

export function extractManheimDistribution(payload: unknown): ManheimDistribution {
  const none: ManheimDistribution = {
    wholesaleAvg:   null,
    wholesaleClean: null,
    wholesaleRough: null,
    wholesaleBaseAvg:   null,
    wholesaleBaseClean: null,
    wholesaleBaseRough: null,
    retailClean:    null,
    retailAvg:      null,
    retailRough:    null,
    sampleCount:    null,
  };

  if (!payload || typeof payload !== "object") return none;

  const t = selectMmrPayloadItem(payload);
  if (t === null) return none;

  let wholesaleAvg:   number | null = null;
  let wholesaleClean: number | null = null;
  let wholesaleRough: number | null = null;
  let wholesaleBaseAvg:   number | null = null;
  let wholesaleBaseClean: number | null = null;
  let wholesaleBaseRough: number | null = null;
  let retailClean:    number | null = null;
  let retailAvg:      number | null = null;
  let retailRough:    number | null = null;

  if (t.adjustedPricing && typeof t.adjustedPricing === "object") {
    const ap = t.adjustedPricing as Record<string, unknown>;
    if (ap.wholesale && typeof ap.wholesale === "object") {
      const w = ap.wholesale as Record<string, unknown>;
      wholesaleAvg   = posNum(w.average);
      wholesaleClean = posNum(w.above);
      wholesaleRough = posNum(w.below);
    }
    if (ap.retail && typeof ap.retail === "object") {
      const r = ap.retail as Record<string, unknown>;
      retailAvg   = posNum(r.average);
      retailClean = posNum(r.above);
      retailRough = posNum(r.below);
    }
  }

  if (t.wholesale && typeof t.wholesale === "object") {
    const w = t.wholesale as Record<string, unknown>;
    wholesaleBaseAvg   = posNum(w.average);
    wholesaleBaseClean = posNum(w.above);
    wholesaleBaseRough = posNum(w.below);
  }

  return {
    wholesaleAvg,
    wholesaleClean,
    wholesaleRough,
    wholesaleBaseAvg,
    wholesaleBaseClean,
    wholesaleBaseRough,
    retailClean,
    retailAvg,
    retailRough,
    sampleCount: parseSampleSize(t.sampleSize),
  };
}

/** Accept a positive number and round it; return null for zero, negative, or non-number. */
function posNum(v: unknown): number | null {
  return typeof v === "number" && v > 0 ? Math.round(v) : null;
}

/**
 * Manheim returns sampleSize as a string (e.g. "6", "140", "0").
 * "0" is valid — it means extended coverage with no same-trim auction data.
 */
function parseSampleSize(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Primary MMR scalar for cache/envelope — adjusted wholesale from the selected item.
 */
export function extractMmrAdjustedValue(payload: unknown): number | null {
  const t = selectMmrPayloadItem(payload);
  if (t === null) return null;

  if (t.adjustedPricing && typeof t.adjustedPricing === "object") {
    const ap = t.adjustedPricing as Record<string, unknown>;
    if (ap.wholesale && typeof ap.wholesale === "object") {
      const avg = posNum((ap.wholesale as Record<string, unknown>).average);
      if (avg !== null) return avg;
    }
  }

  for (const key of [
    "adjustedWholesaleAverage",
    "wholesaleMileageAdjusted",
    "wholesaleAverage",
    "mmrValue",
    "average",
    "value",
  ]) {
    const v = t[key];
    if (typeof v === "number" && v > 0) return Math.round(v);
  }

  if (t.wholesale && typeof t.wholesale === "object") {
    const avg = posNum((t.wholesale as Record<string, unknown>).average);
    if (avg !== null) return avg;
  }

  return null;
}

/** Cox build-options adjustment from `adjustedBy.buildOptions` on the selected item. */
export interface ManheimBuildOptions {
  /** True when Cox reports a non-zero build-options dollar adjustment. */
  included: boolean;
  /** Rounded dollar delta (e.g. 200). Null when absent or zero. */
  adjustment: number | null;
}

function readBuildOptionsDollars(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  return rounded !== 0 ? rounded : null;
}

function readBuildOptionsIncludedFlag(raw: unknown): boolean | null {
  if (raw === true) return true;
  if (raw === false) return false;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw !== 0;
  return null;
}

function pickAdjustedBy(item: Record<string, unknown>): Record<string, unknown> | null {
  if (item.adjustedBy && typeof item.adjustedBy === "object") {
    return item.adjustedBy as Record<string, unknown>;
  }
  if (item.adjustedPricing && typeof item.adjustedPricing === "object") {
    const ap = item.adjustedPricing as Record<string, unknown>;
    if (ap.adjustedBy && typeof ap.adjustedBy === "object") {
      return ap.adjustedBy as Record<string, unknown>;
    }
  }
  return null;
}

function readAdjustedByBuildOptionsDollars(obj: Record<string, unknown>): number | null {
  return (
    readBuildOptionsDollars(obj.buildOptions) ??
    readBuildOptionsDollars(obj.BuildOptions)
  );
}

function readAdjustedByBuildOptionsIncluded(obj: Record<string, unknown>): boolean | null {
  const raw = obj.buildOptions ?? obj.BuildOptions;
  if (raw === undefined) return null;
  return readBuildOptionsIncludedFlag(raw);
}

function hasOdometerAdjustment(adjustedBy: Record<string, unknown>): boolean {
  return adjustedBy.Odometer !== undefined || adjustedBy.odometer !== undefined;
}

/** True when Cox odometer input matches the vehicle's average odometer (zero net mileage adj). */
function odometerMatchesAverage(
  item: Record<string, unknown>,
  adjustedBy: Record<string, unknown>,
): boolean {
  const raw = adjustedBy.Odometer ?? adjustedBy.odometer;
  const avg = item.averageOdometer;
  if (raw == null || avg == null) return false;
  const odo = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d]/g, ""));
  if (!Number.isFinite(odo)) return false;
  return Math.round(odo) === Math.round(Number(avg));
}

function wholesaleBuildOptionsDelta(payload: unknown): number | null {
  const dist = extractManheimDistribution(payload);
  if (dist.wholesaleBaseAvg === null || dist.wholesaleAvg === null) return null;
  const delta = dist.wholesaleAvg - dist.wholesaleBaseAvg;
  return delta > 0 ? delta : null;
}

function buildOptionsFromBooleanTrue(
  item: Record<string, unknown>,
  payload: unknown,
  adjustedBy: Record<string, unknown> | null,
): ManheimBuildOptions {
  const delta = wholesaleBuildOptionsDelta(payload);
  if (delta === null) return { included: true, adjustment: null };
  if (
    adjustedBy &&
    hasOdometerAdjustment(adjustedBy) &&
    !odometerMatchesAverage(item, adjustedBy)
  ) {
    // Mileage and build both apply — wholesale delta is not build-only.
    return { included: true, adjustment: null };
  }
  return { included: true, adjustment: delta };
}

/** Per-field Cox MMR adjustment dollars for the adjustments panel. */
export interface ManheimAdjustmentBreakdown {
  buildOptionsIncluded: boolean;
  buildOptionsAdjustment: number | null;
  odometerAdjustment: number | null;
  gradeAdjustment: number | null;
  colorAdjustment: number | null;
  regionAdjustment: number | null;
}

function readAdjustedByFieldDollars(
  obj: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "number" && Number.isFinite(val)) {
      const rounded = Math.round(val);
      if (rounded !== 0) return rounded;
    }
  }
  return null;
}

function adjustedByHasGrade(adjustedBy: Record<string, unknown>): boolean {
  return adjustedBy.Grade !== undefined || adjustedBy.grade !== undefined;
}

function adjustedByHasColor(adjustedBy: Record<string, unknown>): boolean {
  return adjustedBy.Color !== undefined || adjustedBy.color !== undefined;
}

function adjustedByHasRegion(adjustedBy: Record<string, unknown>): boolean {
  const raw = adjustedBy.Region ?? adjustedBy.region;
  if (raw == null) return false;
  const label = String(raw).trim().toUpperCase();
  return label !== "" && label !== "NA" && label !== "NATIONAL";
}

/** Assign leftover wholesale delta when exactly one grade/color/region attr is active. */
function attributeSingleFieldResidual(
  residual: number | null,
  hasGrade: boolean,
  hasColor: boolean,
  hasRegion: boolean,
  gradeAdj: number | null,
  colorAdj: number | null,
  regionAdj: number | null,
): Pick<
  ManheimAdjustmentBreakdown,
  "gradeAdjustment" | "colorAdjustment" | "regionAdjustment"
> {
  const pending = [
    hasGrade && gradeAdj == null ? "grade" as const : null,
    hasColor && colorAdj == null ? "color" as const : null,
    hasRegion && regionAdj == null ? "region" as const : null,
  ].filter((v): v is "grade" | "color" | "region" => v != null);

  if (residual == null || pending.length !== 1) {
    return {
      gradeAdjustment: gradeAdj,
      colorAdjustment: colorAdj,
      regionAdjustment: regionAdj,
    };
  }

  const field = pending[0];
  return {
    gradeAdjustment: field === "grade" ? residual : gradeAdj,
    colorAdjustment: field === "color" ? residual : colorAdj,
    regionAdjustment: field === "region" ? residual : regionAdj,
  };
}

function mileageFromAdjustedBy(adjustedBy: Record<string, unknown> | null): number | null {
  if (!adjustedBy) return null;
  const raw = adjustedBy.Odometer ?? adjustedBy.odometer;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw === "string") {
    const n = Number(raw.replace(/[^\d]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Split Cox adjusted wholesale into odometer and build-option dollar deltas when possible.
 * Cox often sends mileage as a string in `adjustedBy.Odometer` — dollar splits are derived.
 */
export function extractManheimAdjustmentBreakdown(
  payload: unknown,
  mileageUsed?: number | null,
): ManheimAdjustmentBreakdown {
  const build = extractManheimBuildOptions(payload);
  const item = selectMmrPayloadItem(payload);
  const dist = extractManheimDistribution(payload);
  const adjustedBy = item ? pickAdjustedBy(item) : null;

  const base = dist.wholesaleBaseAvg;
  const adjusted = dist.wholesaleAvg;
  const total =
    base != null && adjusted != null ? Math.round(adjusted - base) : null;

  const avgOdo =
    item?.averageOdometer != null ? Math.round(Number(item.averageOdometer)) : null;
  const mileage =
    mileageUsed != null && mileageUsed > 0
      ? Math.round(mileageUsed)
      : mileageFromAdjustedBy(adjustedBy);
  const atAvg = mileage != null && avgOdo != null && mileage === avgOdo;

  const odometerDollar = adjustedBy
    ? readAdjustedByFieldDollars(adjustedBy, ["Odometer", "odometer"])
    : null;

  let buildAdj = build.adjustment;
  let odometerAdj = odometerDollar;
  let gradeAdj: number | null = null;
  let colorAdj: number | null = null;
  let regionAdj: number | null = null;
  let hasGrade = false;
  let hasColor = false;
  let hasRegion = false;

  if (adjustedBy) {
    gradeAdj = readAdjustedByFieldDollars(adjustedBy, ["Grade", "grade"]);
    colorAdj = readAdjustedByFieldDollars(adjustedBy, ["Color", "color"]);
    regionAdj = readAdjustedByFieldDollars(adjustedBy, ["Region", "region"]);
    hasGrade = adjustedByHasGrade(adjustedBy);
    hasColor = adjustedByHasColor(adjustedBy);
    hasRegion = adjustedByHasRegion(adjustedBy);
  }

  const otherAttrsPresent = hasGrade || hasColor || hasRegion;

  if (
    build.included &&
    buildAdj == null &&
    atAvg &&
    total != null &&
    total !== 0 &&
    !otherAttrsPresent
  ) {
    buildAdj = total;
  }

  if (
    odometerAdj == null &&
    build.included &&
    buildAdj != null &&
    total != null &&
    mileage != null &&
    !atAvg
  ) {
    odometerAdj = total - buildAdj;
  }

  if (odometerAdj === 0) odometerAdj = null;

  if (
    odometerAdj == null &&
    !build.included &&
    total != null &&
    mileage != null &&
    !atAvg
  ) {
    odometerAdj = total;
  }

  const knownTotal =
    (buildAdj ?? 0) +
    (atAvg ? 0 : odometerAdj ?? 0) +
    (gradeAdj ?? 0) +
    (colorAdj ?? 0) +
    (regionAdj ?? 0);
  const residual =
    total != null && total !== knownTotal ? Math.round(total - knownTotal) : null;

  const attributed = attributeSingleFieldResidual(
    residual,
    hasGrade,
    hasColor,
    hasRegion,
    gradeAdj,
    colorAdj,
    regionAdj,
  );

  return {
    buildOptionsIncluded: build.included,
    buildOptionsAdjustment: buildAdj,
    odometerAdjustment: atAvg ? null : odometerAdj,
    ...attributed,
  };
}

/**
 * Extract build-options state from Cox `bestMatch` item.
 * Cox may send `adjustedBy.buildOptions` as a dollar amount or as boolean `true`.
 * Falls back to base-vs-adjusted wholesale delta when the flag is absent.
 */
export function extractManheimBuildOptions(payload: unknown): ManheimBuildOptions {
  const none: ManheimBuildOptions = { included: false, adjustment: null };
  if (!payload || typeof payload !== "object") return none;

  const t = selectMmrPayloadItem(payload);
  if (t === null) return none;

  const adjustedBy = pickAdjustedBy(t);
  const includedFlag = adjustedBy ? readAdjustedByBuildOptionsIncluded(adjustedBy) : null;
  const numericAdj = adjustedBy ? readAdjustedByBuildOptionsDollars(adjustedBy) : null;

  if (includedFlag === false) return none;

  if (numericAdj !== null) return { included: true, adjustment: numericAdj };

  if (includedFlag === true) {
    return buildOptionsFromBooleanTrue(t, payload, adjustedBy);
  }

  if (
    adjustedBy &&
    (adjustedByHasGrade(adjustedBy) ||
      adjustedByHasColor(adjustedBy) ||
      adjustedByHasRegion(adjustedBy))
  ) {
    return none;
  }

  const delta = wholesaleBuildOptionsDelta(payload);
  if (delta !== null) return { included: true, adjustment: delta };

  return none;
}
