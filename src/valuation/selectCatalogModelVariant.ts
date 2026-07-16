export interface CatalogModelVariantSelectionInput {
  models: readonly string[];
  sourceModel: string;
  title?: string | null;
  trim?: string | null;
}

export interface CatalogModelVariantSelection {
  model: string;
  matchedSignals: string[];
}

const DRIVETRAIN_SIGNALS: ReadonlyArray<{ signal: string; aliases: readonly string[] }> = [
  { signal: "AWD", aliases: ["AWD", "ALL WHEEL DRIVE", "ALL-WHEEL DRIVE"] },
  { signal: "FWD", aliases: ["FWD", "FRONT WHEEL DRIVE", "FRONT-WHEEL DRIVE"] },
  { signal: "RWD", aliases: ["RWD", "REAR WHEEL DRIVE", "REAR-WHEEL DRIVE"] },
  { signal: "4WD", aliases: ["4WD", "4X4", "FOUR WHEEL DRIVE", "FOUR-WHEEL DRIVE"] },
  { signal: "2WD", aliases: ["2WD", "4X2", "TWO WHEEL DRIVE", "TWO-WHEEL DRIVE"] },
];

const CAB_BED_BODY_SIGNALS: ReadonlyArray<{ signal: string; aliases: readonly string[] }> = [
  { signal: "CREW CAB", aliases: ["CREW CAB", "SUPERCREW", "MEGA CAB", "QUAD CAB"] },
  { signal: "DOUBLE CAB", aliases: ["DOUBLE CAB", "SUPERCAB", "SUPER CAB", "KING CAB", "EXTENDED CAB"] },
  { signal: "REGULAR CAB", aliases: ["REGULAR CAB", "STANDARD CAB"] },
  { signal: "SHORT BED", aliases: ["SHORT BED", "5 1/2 FT", "5.5 FT", "5 FT"] },
  { signal: "LONG BED", aliases: ["LONG BED", "6 1/2 FT", "6.5 FT", "8 FT"] },
  { signal: "PICKUP 4D", aliases: ["PICKUP 4D", "PICKUP TRUCK 4D"] },
  { signal: "SPORT UTILITY 4D", aliases: ["SPORT UTILITY 4D", "SUV 4D"] },
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

function collectMatchedSignalGroups(
  groups: ReadonlyArray<{ signal: string; aliases: readonly string[] }>,
  title?: string | null,
  trim?: string | null,
): Array<{ signal: string; aliases: readonly string[] }> {
  const evidence = normalizeToken([title, trim].filter(Boolean).join(" "));
  if (!evidence) return [];

  const matched: Array<{ signal: string; aliases: readonly string[] }> = [];
  for (const entry of groups) {
    if (entry.aliases.some((alias) => hasPhrase(evidence, normalizeToken(alias)))) {
      matched.push(entry);
    }
  }
  return matched;
}

function scoreVariantModel(
  catalogModel: string,
  drivetrainGroups: ReadonlyArray<{ signal: string; aliases: readonly string[] }>,
  cabBedBodyGroups: ReadonlyArray<{ signal: string; aliases: readonly string[] }>,
): { score: number; matched: string[] } {
  const normalized = normalizeToken(catalogModel);
  const matched: string[] = [];
  let score = 0;

  const scoreGroup = (
    groups: ReadonlyArray<{ signal: string; aliases: readonly string[] }>,
    weight: number,
  ) => {
    for (const group of groups) {
      const modelMatches =
        hasPhrase(normalized, group.signal) ||
        group.aliases.some((alias) => hasPhrase(normalized, normalizeToken(alias)));
      if (!modelMatches) continue;
      matched.push(group.signal);
      score += weight;
    }
  };

  scoreGroup(drivetrainGroups, 10);
  scoreGroup(cabBedBodyGroups, 8);

  return { score, matched };
}

export function isCatalogModelVariantOf(sourceModel: string, catalogModel: string): boolean {
  const source = normalizeToken(sourceModel);
  const candidate = normalizeToken(catalogModel);
  return source.length > 0 && (candidate === source || candidate.startsWith(`${source} `));
}

/**
 * Selects the exact Cox model variant when the catalog splits a normalized
 * source model by drivetrain, cab/bed, or body cues.
 * Returns null when the source listing does not provide explicit evidence.
 */
export function selectCatalogModelVariantForListing(
  input: CatalogModelVariantSelectionInput,
): CatalogModelVariantSelection | null {
  const variants = input.models.filter((model) => isCatalogModelVariantOf(input.sourceModel, model));
  if (variants.length === 0) return null;

  const exact = variants.find((model) => normalizeToken(model) === normalizeToken(input.sourceModel));
  if (exact) return { model: exact, matchedSignals: ["EXACT_MODEL"] };

  const drivetrainGroups = collectMatchedSignalGroups(DRIVETRAIN_SIGNALS, input.title, input.trim);
  const cabBedBodyGroups = collectMatchedSignalGroups(CAB_BED_BODY_SIGNALS, input.title, input.trim);
  if (drivetrainGroups.length === 0 && cabBedBodyGroups.length === 0) return null;

  const scored = variants
    .map((model) => {
      const { score, matched } = scoreVariantModel(model, drivetrainGroups, cabBedBodyGroups);
      return { model, score, matched };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.matched.length - a.matched.length);

  if (scored.length === 0) return null;
  const [best, second] = scored;
  if (!best) return null;
  if (second && second.score === best.score && second.matched.length === best.matched.length) return null;
  return { model: best.model, matchedSignals: best.matched };
}

/** All Cox catalog variants sharing the same normalized source model token. */
export function listCatalogModelVariants(
  models: readonly string[],
  sourceModel: string,
): string[] {
  return models.filter((model) => isCatalogModelVariantOf(sourceModel, model));
}
