import type { MmrLookupAdjustments } from "../types/intelligence";

/**
 * Convert a UI Condition Report grade (e.g. "4.5") to Cox's query param (e.g. "45").
 * Cox accepts integers 10–50 only; decimal values like grade=4.5 are silently ignored.
 *
 * @see Cox MMR Valuations guide — grade parameter
 */
export function toCoxGradeParam(displayGrade: string): string | null {
  const trimmed = displayGrade.trim();
  if (!trimmed) return null;

  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;

  if (trimmed.includes(".")) {
    if (n < 1 || n > 5) return null;
    const cox = Math.round(n * 10);
    if (cox < 10 || cox > 50) return null;
    return String(cox);
  }

  if (Number.isInteger(n) && n >= 10 && n <= 50) return trimmed;

  return null;
}

/** Normalize adjustment fields before forwarding to the intel worker / Cox. */
export function normalizeMmrLookupAdjustments(
  adjustments: MmrLookupAdjustments,
): MmrLookupAdjustments {
  const out: MmrLookupAdjustments = { ...adjustments };
  if (out.grade !== undefined) {
    const cox = toCoxGradeParam(out.grade);
    if (cox !== null) out.grade = cox;
    else delete out.grade;
  }
  return out;
}
