/**
 * Authoritative `segment_key` derivation.
 *
 * Format (see docs/INTELLIGENCE_CONTRACTS.md §B):
 *
 *   ${year ?? 'all'}:${makeLower}:${modelLower}:${trimLower ?? 'base'}:${region ?? 'national'}
 *
 * Pure function. Deterministic. Reordering inputs, case changes, or
 * whitespace differences MUST NOT produce different keys.
 *
 * Region validation is NOT enforced here — region is stored verbatim once
 * normalized. Callers (typically the request schema layer) validate that the
 * region is one of the known allowed values.
 */

export interface SegmentKeyArgs {
  year:   number | null;
  make:   string;
  model:  string;
  trim:   string | null;
  region: string | null;
}

export function deriveSegmentKey(args: SegmentKeyArgs): string {
  const yearPart   = args.year === null ? "all" : String(args.year);
  const makePart   = normalizeToken(args.make);
  const modelPart  = normalizeToken(args.model);
  const trimPart   = args.trim === null || args.trim.trim().length === 0
    ? "base"
    : normalizeToken(args.trim);
  const regionPart = args.region === null || args.region.trim().length === 0
    ? "national"
    : normalizeToken(args.region);

  return `${yearPart}:${makePart}:${modelPart}:${trimPart}:${regionPart}`;
}

/**
 * Normalize a free-text token per §B:
 *   - trim outer whitespace
 *   - collapse internal whitespace runs to a single space
 *   - strip everything outside [a-z0-9 _-] (case-insensitive)
 *   - lowercase
 *   - spaces → underscores
 */
function normalizeToken(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 _-]/gi, "")
    .toLowerCase()
    .replace(/ /g, "_");
}
