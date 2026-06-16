/** MMR adjustment fields for Zone B — mapped to Cox query params on recompute (P3). */
export type MmrAdjustments = {
  odometer: string;
  region: string;
  grade: string;
  exteriorColor: string;
  buildOptions: boolean;
  /** True when the user explicitly chose Build Options NO. */
  buildOptionsUserExcluded: boolean;
  expressGrade: string;
};

export const EMPTY_MMR_ADJUSTMENTS: MmrAdjustments = {
  odometer: "",
  region: "",
  grade: "",
  exteriorColor: "",
  buildOptions: false,
  buildOptionsUserExcluded: false,
  expressGrade: "",
};

export const MMR_REGION_OPTIONS = [
  "National",
  "Northeast",
  "Southeast",
  "Midwest",
  "Southwest",
  "West",
] as const;

export const MMR_GRADE_OPTIONS = ["1.0", "2.0", "3.0", "3.5", "4.0", "4.5", "5.0"] as const;

export const MMR_COLOR_OPTIONS = [
  "Black",
  "White",
  "Silver",
  "Gray",
  "Blue",
  "Red",
  "Green",
  "Brown",
  "Beige",
  "Other",
] as const;

export function hasMmrAdjustments(adjustments: MmrAdjustments): boolean {
  return (
    adjustments.odometer !== "" ||
    adjustments.region !== "" ||
    adjustments.grade !== "" ||
    adjustments.exteriorColor !== "" ||
    adjustments.buildOptions ||
    adjustments.expressGrade !== ""
  );
}

/** API body shape for `adjustments` on POST /app/mmr/vin|ymm (P3). */
export type MmrAdjustmentsApi = {
  region?: string;
  grade?: string;
  color?: string;
  exclude_build?: boolean;
  evbh?: number;
};

function parseExpressGrade(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 75 && n <= 100 ? n : null;
}

export type BuildOptionsSyncInput = Pick<
  MmrAdjustments,
  "buildOptions" | "buildOptionsUserExcluded"
>;

/** Resolve build-options toggle after a Cox lookup or recompute. */
export function resolveBuildOptionsState(
  prev: BuildOptionsSyncInput,
  result: Parameters<typeof inferBuildOptionsIncluded>[0],
): BuildOptionsSyncInput {
  if (prev.buildOptionsUserExcluded) {
    return { buildOptions: false, buildOptionsUserExcluded: true };
  }

  const buildOn = inferBuildOptionsIncluded(result);
  return {
    buildOptions: prev.buildOptions || buildOn,
    buildOptionsUserExcluded: false,
  };
}

/** Infer build-options YES from MMR values when the API omits buildOptionsIncluded. */
export function inferBuildOptionsIncluded(result: {
  mmrValue?: number;
  adjustedMmr?: number | null;
  buildOptionsIncluded?: boolean;
  buildOptionsAdjustment?: number | null;
  mileageUsed?: number | null;
  avgOdometer?: number | null;
  odometerAdjustment?: number | null;
}): boolean {
  if (result.buildOptionsIncluded === true) return true;
  if (result.buildOptionsIncluded === false) return false;
  if (result.buildOptionsAdjustment != null && result.buildOptionsAdjustment > 0) return true;

  const base = result.mmrValue;
  const adjusted = result.adjustedMmr;
  if (base == null || adjusted == null || adjusted <= base) return false;

  const mileage = result.mileageUsed;
  const avgOdo = result.avgOdometer;
  const atAvg =
    mileage == null ||
    mileage <= 0 ||
    (avgOdo != null && Math.round(mileage) === Math.round(avgOdo));
  if (!atAvg) return false;

  const odoAdj = result.odometerAdjustment ?? 0;
  return adjusted - base - odoAdj > 0;
}

/** Map Cox build-options fields from a completed MMR lookup into Zone B adjustments. */
export function seedMmrAdjustmentsFromResult(
  result: {
    mmrValue?: number;
    adjustedMmr?: number | null;
    avgOdometer?: number | null;
    buildOptionsIncluded?: boolean;
    buildOptionsAdjustment?: number | null;
    mileageUsed?: number | null;
    odometerAdjustment?: number | null;
  },
): MmrAdjustments {
  const mileageUsed = result.mileageUsed;
  const buildOptions = inferBuildOptionsIncluded(result);
  return {
    ...EMPTY_MMR_ADJUSTMENTS,
    buildOptions,
    buildOptionsUserExcluded: false,
    odometer:
      mileageUsed != null && mileageUsed > 0 ? String(mileageUsed) : "",
  };
}

/** Map Zone B UI fields to Cox adjustment query params. */
export function mapMmrAdjustmentsToApi(
  adjustments: MmrAdjustments,
): MmrAdjustmentsApi | undefined {
  const api: MmrAdjustmentsApi = {};
  if (adjustments.region) api.region = adjustments.region;
  if (adjustments.grade) api.grade = adjustments.grade;
  if (adjustments.exteriorColor) api.color = adjustments.exteriorColor;
  if (adjustments.buildOptions) {
    api.exclude_build = false;
  } else if (adjustments.buildOptionsUserExcluded) {
    api.exclude_build = true;
  }
  const evbh = parseExpressGrade(adjustments.expressGrade);
  if (evbh !== null) api.evbh = evbh;
  return Object.keys(api).length > 0 ? api : undefined;
}

export function parseAdjustmentOdometer(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 2_000_000 ? n : null;
}
