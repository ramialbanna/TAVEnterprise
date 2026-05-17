/**
 * Promote a real trim / body token already present in a listing title so the
 * YMM valuation path has something to send instead of short-circuiting to
 * `trim_missing`.
 *
 * IMPORTANT: this only ever returns a token that literally appears in the
 * title. It never fabricates or guesses a Cox bodyname — fabricating a
 * bodyname would risk a wrong MMR value. If nothing recognizable is present
 * the caller keeps the explicit `trim_missing` miss reason.
 *
 * Pure function, no I/O.
 */

// Curated, conservative set of common Facebook-title trim / body tokens.
// Canonical casing here is what gets returned.
const KNOWN_TOKENS: readonly string[] = [
  // ── body styles (Cox `bodyname`-adjacent) ──
  "Extended Cab",
  "Regular Cab",
  "Double Cab",
  "Crew Cab",
  "Quad Cab",
  "Mega Cab",
  "King Cab",
  "SuperCrew",
  "SuperCab",
  "Long Bed",
  "Short Bed",
  // ── EV ranges ──
  "Standard Range",
  "Extended Range",
  "Long Range",
  // ── multi-word trims ──
  "Laramie Longhorn",
  "High Country",
  "TRD Off-Road",
  "TRD Sport",
  "TRD Pro",
  "Pro-4X",
  // ── single-word trims ──
  "Tradesman",
  "Trailhawk",
  "Laramie",
  "Lariat",
  "Longhorn",
  "Platinum",
  "Limited",
  "Rubicon",
  "Sahara",
  "Big Horn",
  "Denali",
  "Rebel",
  "SR5",
  "XLT",
  "XSE",
  "SLT",
  "SLE",
  "SEL",
  "EX-L",
  "Sport",
  "Touring",
  "Performance",
  "XL",
  "LT",
  "LS",
  "LE",
  "SE",
  "EX",
  "LX",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Pre-compile: token → boundary-anchored, case-insensitive matcher.
// Boundaries use a non-alphanumeric lookaround so multi-word / hyphenated
// tokens match as whole units and never as substrings (`XL` ≠ `XLERATOR`).
const MATCHERS: ReadonlyArray<{ token: string; re: RegExp }> = KNOWN_TOKENS.map(
  (token) => ({
    token,
    re: new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(token)}(?![A-Za-z0-9])`, "i"),
  }),
);

/**
 * Returns the most specific recognized trim/body token in `title`, or `null`.
 * Tie-break: longest token wins; on equal length, the one appearing earliest
 * in the title.
 */
export function extractTitleTrim(
  title: string | null | undefined,
): string | null {
  if (!title || typeof title !== "string") return null;

  let best: { token: string; index: number } | null = null;
  for (const { token, re } of MATCHERS) {
    const m = re.exec(title);
    if (!m) continue;
    const index = m.index;
    if (
      best === null ||
      token.length > best.token.length ||
      (token.length === best.token.length && index < best.index)
    ) {
      best = { token, index };
    }
  }
  return best?.token ?? null;
}
