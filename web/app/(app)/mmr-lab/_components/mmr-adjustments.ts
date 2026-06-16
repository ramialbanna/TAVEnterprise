/** MMR adjustment fields for Zone B — mapped to Cox query params on recompute (P3). */
export type MmrAdjustments = {
  odometer: string;
  region: string;
  grade: string;
  exteriorColor: string;
  buildOptions: boolean;
  expressGrade: string;
};

export const EMPTY_MMR_ADJUSTMENTS: MmrAdjustments = {
  odometer: "",
  region: "",
  grade: "",
  exteriorColor: "",
  buildOptions: false,
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

/** Map Cox build-options fields from a completed MMR lookup into Zone B adjustments. */
export function seedMmrAdjustmentsFromResult(
  result: {
    buildOptionsIncluded?: boolean;
    buildOptionsAdjustment?: number | null;
    mileageUsed?: number | null;
  },
): MmrAdjustments {
  const mileageUsed = result.mileageUsed;
  const buildOptions =
    result.buildOptionsIncluded === true ||
    (result.buildOptionsAdjustment != null && result.buildOptionsAdjustment > 0);
  return {
    ...EMPTY_MMR_ADJUSTMENTS,
    buildOptions,
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
  } else if (
    adjustments.odometer !== "" ||
    adjustments.region ||
    adjustments.grade ||
    adjustments.exteriorColor ||
    adjustments.expressGrade
  ) {
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
