/**
 * Item 55 Phase C-b — offline Cox catalog matcher using pre-synced tree rows.
 */

import type { CatalogMatchSuggestion } from "./resolveListingToCatalog";
import { buildListingCatalogEvidenceText } from "./listingCatalogEvidence";

export type CoxCatalogTreeRow = {
  year: number;
  make: string;
  model: string;
  style: string;
  searchText: string;
  variantKind: string | null;
};

export type ListingCatalogMatchInput = {
  year: number;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  title?: string | null;
  /** Item 64 — seller body text when title is sparse. */
  description?: string | null;
};

export type ListingCatalogMatchResult = {
  make: string | null;
  model: string | null;
  style: string | null;
  score: number;
  styleEstimated: boolean;
  variantEstimated: boolean;
  autoLookup: boolean;
  suggestions: CatalogMatchSuggestion[];
};

const AUTO_LOOKUP_MIN = 80;
const ESTIMATED_MIN = 60;
const SUGGESTION_MIN = 40;

/** §70 — offline-first gate threshold (score ≥ this, not estimated-only). */
export { AUTO_LOOKUP_MIN };

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeToken(value).split(" ").filter(Boolean));
}

function overlapScore(listingTokens: Set<string>, candidateTokens: Set<string>, weight: number): number {
  if (listingTokens.size === 0 || candidateTokens.size === 0) return 0;
  let hits = 0;
  for (const token of candidateTokens) {
    if (listingTokens.has(token)) hits += 1;
  }
  if (hits === 0) return 0;
  return Math.min(weight, Math.round((hits / candidateTokens.size) * weight));
}

function hasPhrase(haystack: string, phrase: string): boolean {
  const normalized = normalizeToken(phrase);
  if (!normalized) return false;
  return new RegExp(`(?:^| )${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`).test(
    normalizeToken(haystack),
  );
}

const DRIVETRAIN_TOKENS = ["awd", "fwd", "rwd", "4wd", "2wd", "4x4", "4x2"];
const CAB_BED_TOKENS = ["crew", "cab", "double", "regular", "supercrew", "supercab", "bed", "ft"];
const BODY_TOKENS = ["sedan", "suv", "pickup", "coupe", "wagon", "minivan", "utility", "2d", "4d"];

function signalBonus(evidence: string, style: string, model: string, tokens: string[], weight: number): number {
  const hay = normalizeToken(`${evidence} ${model} ${style}`);
  return tokens.some((token) => hasPhrase(hay, token)) ? weight : 0;
}

function parserGarbagePenalty(evidence: string, make: string, model: string): number {
  const t = normalizeToken(evidence);
  const m = normalizeToken(model);
  if (t.includes("+") || m.includes("+")) return 30;
  if (/\bbighorn\s+1500\b/.test(t) || /\b1500\s+bighorn\b/.test(t)) return 30;

  const makeToken = normalizeToken(make);
  if (makeToken) {
    const escaped = makeToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\s+${escaped}\\b`).test(t)) return 30;
  }
  return 0;
}

function styleEvidenceScore(
  input: ListingCatalogMatchInput,
  row: CoxCatalogTreeRow,
  listingTokens: Set<string>,
): number {
  const trimTokens = tokenSet(input.trim ?? "");
  const styleTokens = tokenSet(row.style);
  return overlapScore(new Set([...listingTokens, ...trimTokens]), styleTokens, 25);
}

function scoreCandidate(
  input: ListingCatalogMatchInput,
  row: CoxCatalogTreeRow,
  listingTokens: Set<string>,
): number {
  const makeTokens = tokenSet(row.make);
  const modelTokens = tokenSet(row.model);
  const styleTokens = tokenSet(row.style);
  const trimTokens = tokenSet(input.trim ?? "");
  const evidenceText = buildListingCatalogEvidenceText(input);

  let score = 0;
  score += overlapScore(listingTokens, makeTokens, 15);
  score += overlapScore(listingTokens, modelTokens, 25);
  score += overlapScore(new Set([...listingTokens, ...trimTokens]), styleTokens, 25);
  score += signalBonus(evidenceText, row.style, row.model, DRIVETRAIN_TOKENS, 15);
  score += signalBonus(evidenceText, row.style, row.model, CAB_BED_TOKENS, 10);
  score += signalBonus(evidenceText, row.style, row.model, BODY_TOKENS, 5);

  const coxTokens = new Set([...makeTokens, ...modelTokens, ...styleTokens]);
  for (const token of coxTokens) {
    if (token.length <= 1) continue;
    if (!listingTokens.has(token) && !trimTokens.has(token)) score -= 10;
  }

  score -= parserGarbagePenalty(evidenceText, input.make ?? "", input.model ?? "");
  return Math.max(0, score);
}

export function matchListingToCoxCatalog(
  input: ListingCatalogMatchInput,
  treeRows: readonly CoxCatalogTreeRow[],
): ListingCatalogMatchResult | null {
  const makeRaw = input.make?.trim() ?? "";
  const modelRaw = input.model?.trim() ?? "";
  if (!makeRaw || !modelRaw || treeRows.length === 0) return null;

  const evidence = normalizeToken(
    [buildListingCatalogEvidenceText(input), input.make, input.model].filter(Boolean).join(" "),
  );
  const listingTokens = tokenSet(evidence);

  const scored = treeRows
    .map((row) => ({
      row,
      score: scoreCandidate(input, row, listingTokens),
      styleScore: 0,
    }))
    .map((entry) => ({
      ...entry,
      styleScore: styleEvidenceScore(input, entry.row, listingTokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.styleScore - a.styleScore ||
        b.row.style.localeCompare(a.row.style),
    );

  if (scored.length === 0) return null;

  const suggestions: CatalogMatchSuggestion[] = scored.slice(0, 3).map(({ row, score }) => ({
    make: row.make,
    model: row.model,
    style: row.style,
    score,
    estimatedVariant: row.variantKind === "drivetrain" || row.variantKind === "cab_bed",
    estimatedStyle: score < AUTO_LOOKUP_MIN,
  }));

  const [best, second] = scored;
  if (!best) return null;

  const tied =
    second &&
    second.score === best.score &&
    second.styleScore === best.styleScore;
  const autoLookup = !tied && best.score >= AUTO_LOOKUP_MIN;
  const estimatedLookup = !tied && !autoLookup && best.score >= ESTIMATED_MIN;

  if (!autoLookup && !estimatedLookup && best.score < SUGGESTION_MIN) {
    return {
      make: null,
      model: null,
      style: null,
      score: best.score,
      styleEstimated: true,
      variantEstimated: true,
      autoLookup: false,
      suggestions,
    };
  }

  if (!autoLookup && !estimatedLookup) {
    return {
      make: null,
      model: null,
      style: null,
      score: best.score,
      styleEstimated: true,
      variantEstimated: true,
      autoLookup: false,
      suggestions,
    };
  }

  return {
    make: best.row.make,
    model: best.row.model,
    style: best.row.style,
    score: best.score,
    styleEstimated: !autoLookup,
    variantEstimated: best.row.variantKind != null,
    autoLookup: autoLookup || estimatedLookup,
    suggestions,
  };
}

/** §70 — true when offline matcher is confident enough to skip Claude (score ≥ 80, not estimated-only). */
export function isOfflineConfidentCatalogMatch(
  result: ListingCatalogMatchResult | null,
): result is ListingCatalogMatchResult & { make: string; model: string; style: string } {
  return (
    result != null &&
    result.autoLookup &&
    !result.styleEstimated &&
    result.make != null &&
    result.model != null &&
    result.style != null
  );
}

export function buildCoxCatalogSearchText(
  year: number,
  make: string,
  model: string,
  style: string,
): string {
  return normalizeToken(`${year} ${make} ${model} ${style}`);
}

export function inferVariantKind(model: string): string | null {
  const normalized = normalizeToken(model);
  if (DRIVETRAIN_TOKENS.some((token) => hasPhrase(normalized, token))) return "drivetrain";
  if (CAB_BED_TOKENS.some((token) => hasPhrase(normalized, token))) return "cab_bed";
  return "base";
}
