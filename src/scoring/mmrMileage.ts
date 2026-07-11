/**
 * Single source of truth for the mileage value sent to Manheim MMR.
 *
 * If the listing reports actual mileage, that value is returned as-is.
 * If mileage is missing or invalid, an estimate is inferred from the model
 * year and the current date using the U.S. average annual mileage figure.
 *
 * Pure module — no I/O, no env access, no Worker runtime assumptions.
 * Inject `now` to keep tests deterministic.
 */

/** U.S. average annual mileage. Used as the per-year multiplier for older models. */
export const US_ANNUAL_AVG_MILES = 15_000;

/** Average miles accumulated per month (1/12 of US_ANNUAL_AVG_MILES). */
export const MONTHLY_AVG_MILES = 1_250;

/** Hard upper bound on inferred mileage. Anything beyond this is unreliable for MMR. */
export const MAX_MILEAGE_CAP = 250_000;

/** Constant used for next-year / future model years (showroom-fresh assumption). */
export const NEXT_YEAR_BASE_MILES = 2_500;

/** Lower bound on inferred mileage. Never return zero or negative to Manheim. */
export const INFERRED_MILEAGE_FLOOR = 1_000;

export type MmrMileageMethod = "actual" | "estimated_annual_average";

export interface MmrMileageData {
  /** The mileage value to send to Manheim. Always a positive integer. */
  value: number;
  /** True when `value` was inferred from the model year, not supplied by the listing. */
  isInferred: boolean;
  /** Provenance of `value` for audit logging. */
  method: MmrMileageMethod;
}

/**
 * Resolve the mileage value for an MMR lookup when the caller **supplied** a
 * mileage argument (actual vs invalid → inferred classification).
 *
 * **Item 54:** Do **not** call this to invent miles for ingest or Max buy when
 * listing mileage is absent. Omit odometer instead (intel `resolveLookupMileage`
 * already returns null when `mileage === undefined`). This helper remains for
 * classifying a supplied mileage value (intel worker path).
 */
export function getMmrMileageData(
  modelYear: number,
  listedMiles: number | null | undefined,
  now: Date = new Date(),
): MmrMileageData {
  // ── Actual path ─────────────────────────────────────────────────────────────
  if (
    typeof listedMiles === "number" &&
    Number.isFinite(listedMiles) &&
    listedMiles > 0
  ) {
    return {
      value: Math.round(listedMiles),
      isInferred: false,
      method: "actual",
    };
  }

  // ── Inference path ──────────────────────────────────────────────────────────
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1–12

  // Future / next-year model — use the constant directly. Do NOT round.
  if (modelYear > currentYear) {
    return {
      value: NEXT_YEAR_BASE_MILES,
      isInferred: true,
      method: "estimated_annual_average",
    };
  }

  // Current-year or older — compute, round to nearest 1,000, cap, floor.
  let estimated: number;
  if (modelYear === currentYear) {
    estimated = currentMonth * MONTHLY_AVG_MILES;
  } else {
    const ageYears = currentYear - modelYear;
    estimated = ageYears * US_ANNUAL_AVG_MILES + currentMonth * MONTHLY_AVG_MILES;
  }

  estimated = Math.round(estimated / 1_000) * 1_000;

  if (estimated > MAX_MILEAGE_CAP) {
    estimated = MAX_MILEAGE_CAP;
  }

  if (estimated < INFERRED_MILEAGE_FLOOR) {
    estimated = INFERRED_MILEAGE_FLOOR;
  }

  return {
    value: estimated,
    isInferred: true,
    method: "estimated_annual_average",
  };
}
