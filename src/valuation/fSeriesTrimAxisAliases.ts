/**
 * Item 72 action 9 — map Ford F-series listing trim + axis evidence to booked
 * Cox model variants when no `mmr_style_aliases` row exists for the exact key.
 *
 * Axis-qualified alias lookup deliberately skips the short make|model|trim key
 * when axes are named (§72 action 5). Most F-150 npb residue is
 * `ford|f-150|xlt|4wd|v6|crew`-shaped keys that were never learned. This
 * resolver fills that gap from the catalog tree + proven-bookable set.
 */
import type { CoxCatalogTreeRow } from "./matchListingToCoxCatalog";
import type { ProvenBookableCombo } from "./provenBookable";
import {
  catalogStyleContainsListingTrim,
  findProvenBookableCombo,
  isProvenBookableCombo,
} from "./provenBookable";
import { isCatalogModelVariantOf } from "./selectCatalogModelVariant";
import { squashCatalogToken } from "./matchCatalogOption";

const F_SERIES_MODEL_RE = /^f[- ]?(150|250|350|450|550)\b/i;

/** Listing trim words that appear on Ford trucks but are not Cox bodynames alone. */
const FORD_TRUCK_TRIM_TOKENS = new Set([
  "xlt",
  "lariat",
  "platinum",
  "xl",
  "limited",
  "king ranch",
  "king",
  "ranch",
  "fx4",
  "stx",
  "raptor",
  "tremor",
  "harley",
  "se",
  "sport",
  "le",
]);

const MIN_AXIS_SCORE = 8;

export function isFSeriesListingModel(model: string | null | undefined): boolean {
  if (!model?.trim()) return false;
  return F_SERIES_MODEL_RE.test(model.trim());
}

function normalizeListingTrim(trim: string | null | undefined): string | null {
  const value = trim?.trim().toLowerCase();
  if (!value) return null;
  if (value === "king") return "king ranch";
  return FORD_TRUCK_TRIM_TOKENS.has(value) ? value : null;
}

function normalizeHaystack(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ");
}

function haystackHasPhrase(haystack: string, phrase: string): boolean {
  const needle = normalizeHaystack(phrase);
  if (!needle) return false;
  return new RegExp(`(?:^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`).test(
    normalizeHaystack(haystack),
  );
}

function scoreAxisToken(
  axis: string,
  model: string,
  style: string,
): number {
  const combined = `${model} ${style}`;
  switch (axis) {
    case "4wd":
      return haystackHasPhrase(combined, "4WD") || haystackHasPhrase(combined, "AWD") ? 10 : 0;
    case "2wd":
      return haystackHasPhrase(combined, "2WD") ? 10 : 0;
    case "awd":
      return haystackHasPhrase(combined, "AWD") ? 10 : 0;
    case "fwd":
      return haystackHasPhrase(combined, "FWD") ? 10 : 0;
    case "rwd":
      return haystackHasPhrase(combined, "2WD") || haystackHasPhrase(combined, "RWD") ? 10 : 0;
    case "v6":
      return haystackHasPhrase(combined, "V6") || haystackHasPhrase(combined, "3.5L") ||
        haystackHasPhrase(combined, "2.7L") || haystackHasPhrase(combined, "3.3L")
        ? 10
        : 0;
    case "v8":
      return haystackHasPhrase(combined, "V8") || haystackHasPhrase(combined, "5.0L") ||
        haystackHasPhrase(combined, "7.3L")
        ? 10
        : 0;
    case "diesel":
      return haystackHasPhrase(combined, "TDSL") || haystackHasPhrase(combined, "DIESEL") ||
        haystackHasPhrase(combined, "6.7L") || haystackHasPhrase(combined, "6.2L")
        ? 10
        : 0;
    case "i6":
      return haystackHasPhrase(combined, "I6") ? 10 : 0;
    case "crew":
      return haystackHasPhrase(style, "CREW CAB") || haystackHasPhrase(style, "SUPERCREW") ? 10 : 0;
    case "double":
      return haystackHasPhrase(style, "EXT CAB") || haystackHasPhrase(style, "SUPERCAB") ||
        haystackHasPhrase(style, "SUPER CAB")
        ? 10
        : 0;
    case "regular":
      return haystackHasPhrase(style, "REG CAB") || haystackHasPhrase(style, "REGULAR CAB") ? 10 : 0;
    default:
      return 0;
  }
}

function scoreAxisEvidence(
  axisTokens: readonly string[],
  model: string,
  style: string,
): number {
  if (axisTokens.length === 0) return 0;
  return axisTokens.reduce((sum, axis) => sum + scoreAxisToken(axis, model, style), 0);
}

function isFordFSeriesCatalogRow(sourceModel: string, row: CoxCatalogTreeRow): boolean {
  const squashed = squashCatalogToken(row.model);
  if (/^f150|^f250|^f350|^f450|^f550/.test(squashed)) return true;
  return isCatalogModelVariantOf(sourceModel, row.model);
}

export type FSeriesTrimAxisAliasInput = {
  model: string;
  trim?: string | null;
  titleTrim?: string | null;
  axisTokens: readonly string[];
  catalogRows: readonly CoxCatalogTreeRow[];
  provenCombos?: readonly ProvenBookableCombo[] | null;
};

export type FSeriesTrimAxisAliasPick = {
  make: string;
  model: string;
  style: string;
};

/**
 * Pick a booked Cox row for a Ford F-series listing when axis-qualified alias
 * keys miss. Returns null when trim is absent, axes are absent, or no single
 * best proven candidate exists.
 */
export function resolveFSeriesTrimAxisAlias(
  input: FSeriesTrimAxisAliasInput,
): FSeriesTrimAxisAliasPick | null {
  const sourceModel = input.model.trim();
  if (!isFSeriesListingModel(sourceModel)) return null;

  const listingTrim =
    normalizeListingTrim(input.trim) ?? normalizeListingTrim(input.titleTrim);
  if (!listingTrim) return null;

  const axisTokens = input.axisTokens;
  if (axisTokens.length === 0) return null;

  const constrainProven = (input.provenCombos?.length ?? 0) > 0;

  type Scored = FSeriesTrimAxisAliasPick & { score: number };
  const scored: Scored[] = [];

  for (const row of input.catalogRows) {
    if (!isFordFSeriesCatalogRow(sourceModel, row)) continue;
    if (!catalogStyleContainsListingTrim(row.style, listingTrim)) continue;

    const pick = { make: row.make, model: row.model, style: row.style };
    if (constrainProven && !isProvenBookableCombo(input.provenCombos ?? [], pick)) continue;

    const axisScore = scoreAxisEvidence(axisTokens, row.model, row.style);
    if (axisScore < MIN_AXIS_SCORE) continue;

    scored.push({ ...pick, score: axisScore });
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.score - a.score);
  const topScore = scored[0]!.score;
  const leaders = scored.filter((row) => row.score === topScore);

  if (leaders.length !== 1) {
    if (!constrainProven) return null;
    const provenLeaders = leaders.filter((row) =>
      isProvenBookableCombo(input.provenCombos ?? [], row),
    );
    if (provenLeaders.length !== 1) return null;
    const pick = provenLeaders[0]!;
    return { make: pick.make, model: pick.model, style: pick.style };
  }

  const pick = leaders[0]!;
  if (constrainProven) {
    const booked = findProvenBookableCombo(input.provenCombos ?? [], pick);
    if (!booked) return null;
    return booked;
  }

  return { make: pick.make, model: pick.model, style: pick.style };
}
