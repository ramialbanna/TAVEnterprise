/**
 * Pick a Cox catalog style from trim/style evidence. Port of
 * `web/.../resolve-catalog-style.ts` for ingest (item 46 / 55 Phase B).
 */

import {
  extractCatalogSeriesNumbers,
  styleHasWholeToken,
} from "./catalogStyleTokens";

export type CatalogStyleResolution = {
  style: string;
  isEstimated: boolean;
};

function normalizeToken(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreStyle(style: string, trim: string): number {
  const normalizedStyle = normalizeToken(style);
  const normalizedTrim = normalizeToken(trim);
  if (!normalizedTrim) return 0;
  if (normalizedStyle === normalizedTrim) return 100;
  if (normalizedStyle.includes(normalizedTrim) || normalizedTrim.includes(normalizedStyle)) {
    return 50 + Math.min(normalizedTrim.length, normalizedStyle.length);
  }
  const trimTokens = normalizedTrim.split(" ").filter((token) => token.length > 1);
  let score = 0;
  for (const token of trimTokens) {
    if (normalizedStyle.includes(token)) score += token.length;
  }
  return score;
}

export function resolveCatalogStyleFromEvidence(
  styles: readonly string[],
  trim: string | null | undefined,
): CatalogStyleResolution | null {
  const options = styles.filter((style) => style.trim().length > 0);
  if (options.length === 0) return null;

  const trimmed = trim?.trim() ?? "";
  const series = extractCatalogSeriesNumbers(trimmed);
  const pool =
    series.length > 0
      ? options.filter((style) => series.every((n) => styleHasWholeToken(style, n)))
      : options;

  if (!trimmed) {
    return { style: options[0]!, isEstimated: true };
  }

  if (pool.length === 0) return null;

  const exact = pool.find((style) => style === trimmed);
  if (exact) return { style: exact, isEstimated: false };

  const caseInsensitive = pool.find(
    (style) => style.toLowerCase() === trimmed.toLowerCase(),
  );
  if (caseInsensitive) return { style: caseInsensitive, isEstimated: false };

  const scored = pool
    .map((style) => ({ style, score: scoreStyle(style, trimmed) }))
    .filter((row) => row.score >= 3)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 || !scored[0]) {
    return { style: pool[0]!, isEstimated: true };
  }

  const [best, second] = scored;
  if (second && second.score === best.score) {
    return { style: best.style, isEstimated: true };
  }

  return { style: best.style, isEstimated: best.score < 100 };
}
