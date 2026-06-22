import type { MmrLookupAdjustments } from "../types/intelligence";
import { hasMmrLookupAdjustments } from "../types/intelligence";

/** Counterfactual lookup kinds used to isolate per-field MMR adjustment dollars. */
export type MmrIsolationKind =
  | "without_grade"
  | "without_color"
  | "without_region"
  | "at_average_odometer"
  | "without_build";

export type MmrIsolatedAdjustments = {
  odometerAdjustment: number | null;
  gradeAdjustment: number | null;
  colorAdjustment: number | null;
  regionAdjustment: number | null;
  buildOptionsAdjustment: number | null;
};

function cloneBody(body: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
}

function readAdjustments(body: Record<string, unknown>): MmrLookupAdjustments | undefined {
  const raw = body.adjustments;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return raw as MmrLookupAdjustments;
}

function writeAdjustments(
  body: Record<string, unknown>,
  adjustments: MmrLookupAdjustments | undefined,
): void {
  if (adjustments && Object.keys(adjustments).length > 0) {
    body.adjustments = adjustments;
  } else {
    delete body.adjustments;
  }
}

function omitAdjustmentField(
  adjustments: MmrLookupAdjustments,
  field: keyof MmrLookupAdjustments,
): MmrLookupAdjustments | undefined {
  const next = { ...adjustments };
  delete next[field];
  return Object.keys(next).length > 0 ? next : undefined;
}

function isNonNationalRegion(region: string | undefined): boolean {
  if (!region) return false;
  const label = region.trim().toUpperCase();
  return label !== "" && label !== "NATIONAL";
}

function mileageDiffersFromAverage(mileage: number | undefined, avgOdometer: number | null): boolean {
  if (mileage == null || avgOdometer == null) return false;
  return Math.round(mileage) !== Math.round(avgOdometer);
}

/** Which counterfactual Cox lookups are needed to isolate adjustment dollars. */
export function listMmrIsolationKinds(
  body: Record<string, unknown>,
  avgOdometer: number | null,
  buildIncluded: boolean,
): MmrIsolationKind[] {
  const adjustments = readAdjustments(body);
  const mileage = typeof body.mileage === "number" ? body.mileage : undefined;
  const kinds: MmrIsolationKind[] = [];

  if (adjustments?.grade) kinds.push("without_grade");
  if (adjustments?.color) kinds.push("without_color");
  if (isNonNationalRegion(adjustments?.region)) kinds.push("without_region");
  if (mileageDiffersFromAverage(mileage, avgOdometer)) kinds.push("at_average_odometer");
  if (buildIncluded && adjustments?.exclude_build === false) kinds.push("without_build");

  return kinds;
}

/** True when at least one adjustment field or non-average mileage warrants isolation. */
export function shouldRunMmrAdjustmentIsolation(
  body: Record<string, unknown>,
  avgOdometer: number | null,
  buildIncluded: boolean,
): boolean {
  const mileage = typeof body.mileage === "number" ? body.mileage : undefined;
  return (
    hasMmrLookupAdjustments(readAdjustments(body)) ||
    mileageDiffersFromAverage(mileage, avgOdometer) ||
    (buildIncluded && readAdjustments(body)?.exclude_build === false)
  );
}

/** Build the intel-worker request body for a counterfactual lookup. */
export function buildMmrIsolationBody(
  primaryBody: Record<string, unknown>,
  kind: MmrIsolationKind,
  avgOdometer: number | null,
): Record<string, unknown> {
  const body = cloneBody(primaryBody);
  const adjustments = readAdjustments(body) ?? {};

  switch (kind) {
    case "without_grade":
      writeAdjustments(body, omitAdjustmentField(adjustments, "grade"));
      break;
    case "without_color":
      writeAdjustments(body, omitAdjustmentField(adjustments, "color"));
      break;
    case "without_region":
      writeAdjustments(body, omitAdjustmentField(adjustments, "region"));
      break;
    case "at_average_odometer":
      if (avgOdometer != null) body.mileage = Math.round(avgOdometer);
      break;
    case "without_build":
      writeAdjustments(body, { ...adjustments, exclude_build: true });
      break;
  }

  return body;
}

function isolatedDelta(full: number, partial: number | null | undefined): number | null {
  if (partial == null || !Number.isFinite(partial) || !Number.isFinite(full)) return null;
  const delta = full - partial;
  return delta !== 0 ? delta : null;
}

/**
 * Compute per-field adjustment dollars from the full lookup and counterfactual
 * adjusted wholesale averages — matches Manheim native MMR isolation.
 */
export function isolationFlagsFromBody(
  body: Record<string, unknown>,
  avgOdometer: number | null,
  buildIncluded: boolean,
): {
  hasGrade: boolean;
  hasColor: boolean;
  hasRegion: boolean;
  hasNonAverageOdometer: boolean;
  hasBuildIsolation: boolean;
} {
  const adjustments = readAdjustments(body);
  const mileage = typeof body.mileage === "number" ? body.mileage : undefined;
  return {
    hasGrade: Boolean(adjustments?.grade),
    hasColor: Boolean(adjustments?.color),
    hasRegion: isNonNationalRegion(adjustments?.region),
    hasNonAverageOdometer: mileageDiffersFromAverage(mileage, avgOdometer),
    hasBuildIsolation: buildIncluded && adjustments?.exclude_build === false,
  };
}

/** Apply isolated dollars onto the app response; only overrides fields we fetched. */
export function applyMmrIsolationOverrides(
  data: Record<string, unknown>,
  isolated: MmrIsolatedAdjustments,
  fetched: ReadonlySet<MmrIsolationKind>,
): void {
  if (fetched.has("without_grade")) data.gradeAdjustment = isolated.gradeAdjustment;
  if (fetched.has("without_color")) data.colorAdjustment = isolated.colorAdjustment;
  if (fetched.has("without_region")) data.regionAdjustment = isolated.regionAdjustment;
  if (fetched.has("at_average_odometer")) data.odometerAdjustment = isolated.odometerAdjustment;
  if (fetched.has("without_build")) {
    data.buildOptionsAdjustment = isolated.buildOptionsAdjustment;
    if (isolated.buildOptionsAdjustment != null) data.buildOptionsIncluded = true;
  }
}

export function computeMmrIsolatedAdjustments(params: {
  fullAdjusted: number;
  withoutGrade?: number | null;
  withoutColor?: number | null;
  withoutRegion?: number | null;
  atAverageOdometer?: number | null;
  withoutBuild?: number | null;
  hasGrade: boolean;
  hasColor: boolean;
  hasRegion: boolean;
  hasNonAverageOdometer: boolean;
  hasBuildIsolation: boolean;
}): MmrIsolatedAdjustments {
  const {
    fullAdjusted,
    withoutGrade,
    withoutColor,
    withoutRegion,
    atAverageOdometer,
    withoutBuild,
    hasGrade,
    hasColor,
    hasRegion,
    hasNonAverageOdometer,
    hasBuildIsolation,
  } = params;

  return {
    gradeAdjustment: hasGrade ? isolatedDelta(fullAdjusted, withoutGrade) : null,
    colorAdjustment: hasColor ? isolatedDelta(fullAdjusted, withoutColor) : null,
    regionAdjustment: hasRegion ? isolatedDelta(fullAdjusted, withoutRegion) : null,
    odometerAdjustment: hasNonAverageOdometer
      ? isolatedDelta(fullAdjusted, atAverageOdometer)
      : null,
    buildOptionsAdjustment: hasBuildIsolation
      ? isolatedDelta(fullAdjusted, withoutBuild)
      : null,
  };
}
