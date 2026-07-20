export type BadgeTone = "healthy" | "review" | "error" | "neutral";

/**
 * Situational meta-info badges (duplicates, re-seen/price churn, guessed
 * values) vs. lead-quality signals. Meta badges render as a muted dot + text
 * instead of a same-weight colored pill so the eye jumps to what matters
 * (grade, spread) instead of every badge competing for attention — NEXT_STEPS #58.
 */
export function isMetaBadge(badge: string): boolean {
  return (
    badge.startsWith("Estimated") ||
    badge === "Possible duplicate" ||
    badge.startsWith("Seen again") ||
    badge === "Price changed"
  );
}

/** Color meaning for non-meta badges: green/amber/red/gray by lead-quality signal. */
export function badgeTone(badge: string): BadgeTone {
  if (badge === "Near miss") return "review";
  if (badge === "Scraper review" || badge === "No MMR") return "review";
  if (badge === "Manual submission") return "healthy";
  if (badge === "First seen") return "healthy";
  return "neutral";
}
