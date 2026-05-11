// Maps raw auction/dealer condition text to a normalized grade.
// Pure function — no I/O.

export type ConditionGradeNormalized = "excellent" | "good" | "fair" | "poor" | "unknown";

const EXCELLENT = new Set([
  "excellent", "exc", "perfect", "pristine", "like new", "like-new", "outstanding",
]);
const GOOD = new Set([
  "good", "very good", "above average", "clean", "nice", "sharp",
]);
const FAIR = new Set([
  "fair", "average", "ok", "okay", "acceptable", "decent", "average condition",
]);
const POOR = new Set([
  "poor", "rough", "below average", "needs work", "project", "parts",
  "salvage", "damaged", "rough condition",
]);

export function normalizeConditionGrade(raw: string | null | undefined): ConditionGradeNormalized {
  if (!raw) return "unknown";
  const normalized = raw.trim().toLowerCase();
  if (EXCELLENT.has(normalized)) return "excellent";
  if (GOOD.has(normalized)) return "good";
  if (FAIR.has(normalized)) return "fair";
  if (POOR.has(normalized)) return "poor";
  return "unknown";
}
