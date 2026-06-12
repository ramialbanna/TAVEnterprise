/**
 * Pick a Cox catalog style for a VIN-derived trim. Mirrors ingest logic in
 * `src/valuation/selectCatalogStyle.ts` for MMR Lab autofill.
 */

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

export function resolveCatalogStyle(
  styles: readonly string[],
  trim: string | null | undefined,
): CatalogStyleResolution | null {
  const options = styles.filter((style) => style.trim().length > 0);
  if (options.length === 0) return null;

  const trimmed = trim?.trim() ?? "";
  if (!trimmed) {
    return { style: options[0]!, isEstimated: true };
  }

  const exact = options.find((style) => style === trimmed);
  if (exact) return { style: exact, isEstimated: false };

  const caseInsensitive = options.find(
    (style) => style.toLowerCase() === trimmed.toLowerCase(),
  );
  if (caseInsensitive) return { style: caseInsensitive, isEstimated: false };

  const scored = options
    .map((style) => ({ style, score: scoreStyle(style, trimmed) }))
    .filter((row) => row.score >= 6)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 || !scored[0]) {
    return { style: options[0]!, isEstimated: true };
  }

  const [best, second] = scored;
  if (second && second.score === best.score) {
    return { style: options[0]!, isEstimated: true };
  }

  return { style: best.style, isEstimated: best.score < 100 };
}
