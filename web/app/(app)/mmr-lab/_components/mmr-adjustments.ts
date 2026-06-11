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

/** Map Zone B UI fields to Cox adjustment query params. */
export function mapMmrAdjustmentsToApi(
  adjustments: MmrAdjustments,
): MmrAdjustmentsApi | undefined {
  const api: MmrAdjustmentsApi = {};
  if (adjustments.region) api.region = adjustments.region;
  if (adjustments.grade) api.grade = adjustments.grade;
  if (adjustments.exteriorColor) api.color = adjustments.exteriorColor;
  if (adjustments.buildOptions) api.exclude_build = false;
  const evbh = parseExpressGrade(adjustments.expressGrade);
  if (evbh !== null) api.evbh = evbh;
  return Object.keys(api).length > 0 ? api : undefined;
}

export function parseAdjustmentOdometer(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 2_000_000 ? n : null;
}
