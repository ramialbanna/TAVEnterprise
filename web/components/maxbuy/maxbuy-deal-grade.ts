/** Whole-letter deal grade (A best → F worst). Shown on opportunity detail Max buy card. */
export type DealGrade = "A" | "B" | "C" | "D" | "F";

const GRADE_ORDER: DealGrade[] = ["A", "B", "C", "D", "F"];

export type MaxbuyGradeVerdict =
  | "STRONG_BUY"
  | "BUY"
  | "REVIEW"
  | "PASS"
  | "strong_buy"
  | "buy"
  | "review"
  | "pass";

export type MaxbuyGradeInput = {
  verdict: MaxbuyGradeVerdict | null;
  dataStrength?: "low" | "medium" | "high" | null;
  deltaToAsk?: number | null;
  displayState?: "deal_fit" | "vehicle_fit";
};

function normalizeVerdict(
  verdict: MaxbuyGradeVerdict | null,
): "STRONG_BUY" | "BUY" | "REVIEW" | "PASS" | null {
  if (verdict == null) return null;
  const upper = verdict.toUpperCase() as "STRONG_BUY" | "BUY" | "REVIEW" | "PASS";
  return upper;
}

function verdictBaseGrade(
  verdict: "STRONG_BUY" | "BUY" | "REVIEW" | "PASS",
  deltaToAsk: number | null | undefined,
): DealGrade {
  switch (verdict) {
    case "STRONG_BUY":
      return "A";
    case "BUY":
      return "B";
    case "REVIEW":
      if (deltaToAsk != null && deltaToAsk < -750) return "D";
      return "C";
    case "PASS":
      if (deltaToAsk != null && deltaToAsk < -3_000) return "F";
      return "D";
    default:
      return "F";
  }
}

function downgradeGrade(grade: DealGrade, steps: number): DealGrade {
  const idx = GRADE_ORDER.indexOf(grade);
  return GRADE_ORDER[Math.min(GRADE_ORDER.length - 1, idx + steps)]!;
}

/**
 * Map Max buy verdict (+ optional delta and segment strength) to a single A–F deal grade.
 * Returns null when no deal verdict exists (vehicle ceiling / no ask price).
 */
export function computeMaxbuyDealGrade(input: MaxbuyGradeInput): DealGrade | null {
  if (input.displayState === "vehicle_fit") return null;

  const verdict = normalizeVerdict(input.verdict);
  if (verdict == null) return null;

  let grade = verdictBaseGrade(verdict, input.deltaToAsk);

  if (input.dataStrength === "low") {
    grade = downgradeGrade(grade, 1);
  }

  return grade;
}

export function dealGradeLabel(grade: DealGrade): string {
  switch (grade) {
    case "A":
      return "Excellent buy";
    case "B":
      return "Good buy";
    case "C":
      return "Review carefully";
    case "D":
      return "Weak deal";
    case "F":
      return "Pass";
  }
}
