/** Local MMR adjustment fields — UI preview until Phase 3 recompute (#45). */
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
