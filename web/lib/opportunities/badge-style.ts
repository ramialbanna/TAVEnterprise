export type BadgeTone = "healthy" | "review" | "error" | "neutral";

/** Dead chips — never render, even if an older Worker still sends them (§76). */
const KILLED_OPPORTUNITY_BADGES = new Set([
  "Estimated YMMS",
  "Estimated MMR",
  "Possible duplicate",
]);

export function isKilledOpportunityBadge(badge: string): boolean {
  return KILLED_OPPORTUNITY_BADGES.has(badge);
}

export function visibleOpportunityBadges(badges: string[]): string[] {
  return badges.filter((badge) => !KILLED_OPPORTUNITY_BADGES.has(badge));
}

/**
 * Situational meta-info badges (duplicates, re-seen/price churn, guessed
 * values) vs. lead-quality signals. Meta badges render as a muted dot + text
 * instead of a same-weight colored pill so the eye jumps to what matters
 * (grade, spread) instead of every badge competing for attention — NEXT_STEPS #58.
 */
export function isMetaBadge(badge: string): boolean {
  return (
    badge.startsWith("Estimated") ||
    badge.startsWith("Seen again") ||
    badge === "Price changed"
  );
}

/** Color meaning for non-meta badges: green/amber/red/gray by lead-quality signal. */
export function badgeTone(badge: string): BadgeTone {
  if (badge === "Near miss") return "review";
  if (badge === "Scraper review" || badge === "No MMR") return "review";
  if (badge === "Seller unchecked") return "error";
  if (badge === "Manual submission") return "healthy";
  if (badge === "First seen") return "healthy";
  return "neutral";
}
