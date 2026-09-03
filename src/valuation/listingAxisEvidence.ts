/**
 * Item 72 action 5 — drivetrain / engine / cab tokens already sitting in
 * listing text, for the alias key. The key used to be make|model|trim only,
 * so a cached 2WD-V6 pick could win on a listing that says 4x4 V8.
 *
 * Tokens are canonical and ordered so learn and lookup produce the same key.
 * Conflicting signals on one axis are dropped rather than guessed.
 */

export type ListingAxisEvidenceInput = {
  title?: string | null;
  trim?: string | null;
  description?: string | null;
};

type AxisGroup = { token: string; aliases: readonly string[] };

const DRIVETRAIN_GROUPS: readonly AxisGroup[] = [
  { token: "4wd", aliases: ["4WD", "4X4", "4 X 4", "FOUR WHEEL DRIVE", "FOUR-WHEEL DRIVE"] },
  { token: "2wd", aliases: ["2WD", "4X2", "4 X 2", "TWO WHEEL DRIVE", "TWO-WHEEL DRIVE"] },
  { token: "awd", aliases: ["AWD", "ALL WHEEL DRIVE", "ALL-WHEEL DRIVE"] },
  { token: "fwd", aliases: ["FWD", "FRONT WHEEL DRIVE", "FRONT-WHEEL DRIVE"] },
  { token: "rwd", aliases: ["RWD", "REAR WHEEL DRIVE", "REAR-WHEEL DRIVE"] },
];

const ENGINE_GROUPS: readonly AxisGroup[] = [
  { token: "diesel", aliases: ["DIESEL", "DURAMAX", "CUMMINS", "POWERSTROKE", "POWER STROKE"] },
  { token: "v8", aliases: ["V8", "V 8", "HEMI"] },
  { token: "v6", aliases: ["V6", "V 6"] },
  { token: "i6", aliases: ["I6", "I 6", "STRAIGHT 6", "INLINE 6"] },
  { token: "i4", aliases: ["I4", "I 4", "4C", "4 CYL", "4 CYLINDER", "FOUR CYLINDER"] },
];

const CAB_GROUPS: readonly AxisGroup[] = [
  { token: "crew", aliases: ["CREW CAB", "SUPERCREW", "SUPER CREW", "MEGA CAB", "QUAD CAB"] },
  {
    token: "double",
    aliases: ["DOUBLE CAB", "SUPERCAB", "SUPER CAB", "KING CAB", "EXTENDED CAB", "EXT CAB"],
  },
  { token: "regular", aliases: ["REGULAR CAB", "STANDARD CAB", "REG CAB"] },
];

function normalizeToken(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  return new RegExp(`(?:^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`).test(haystack);
}

function matchedTokens(groups: readonly AxisGroup[], evidence: string): string[] {
  const hits: string[] = [];
  for (const group of groups) {
    if (group.aliases.some((alias) => hasPhrase(evidence, normalizeToken(alias)))) {
      hits.push(group.token);
    }
  }
  return hits;
}

function pickDrivetrain(hits: string[]): string | null {
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0] ?? null;
  const set = new Set(hits);
  if (set.has("4wd") && set.has("2wd")) return null;
  if (set.has("awd") && set.has("fwd")) return null;
  if (set.has("4wd") && set.has("awd") && !set.has("2wd") && !set.has("fwd")) return "4wd";
  if (set.has("2wd") && set.has("rwd") && !set.has("4wd")) return "rwd";
  if (set.has("2wd") && set.has("fwd") && !set.has("4wd") && !set.has("awd")) return "fwd";
  return null;
}

function pickEngine(hits: string[]): string | null {
  if (hits.length === 0) return null;
  if (hits.includes("diesel")) return "diesel";
  if (hits.length === 1) return hits[0] ?? null;
  return null;
}

function pickCab(hits: string[]): string | null {
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0] ?? null;
  return null;
}

/**
 * Canonical axis tokens for the alias key, in fixed order: drivetrain, engine, cab.
 * Empty when the listing does not name any of those axes (or names conflicting ones).
 */
export function extractListingAxisTokens(input: ListingAxisEvidenceInput): string[] {
  const evidence = normalizeToken(
    [input.title, input.trim, input.description].filter(Boolean).join(" "),
  );
  if (!evidence) return [];

  const tokens: string[] = [];
  const drivetrain = pickDrivetrain(matchedTokens(DRIVETRAIN_GROUPS, evidence));
  const engine = pickEngine(matchedTokens(ENGINE_GROUPS, evidence));
  const cab = pickCab(matchedTokens(CAB_GROUPS, evidence));
  if (drivetrain) tokens.push(drivetrain);
  if (engine) tokens.push(engine);
  if (cab) tokens.push(cab);
  return tokens;
}
