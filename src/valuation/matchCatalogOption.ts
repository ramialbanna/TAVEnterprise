/**
 * Case-insensitive Cox catalog option matching (item 46 / 55 Phase B).
 * Port of `web/.../use-vehicle-catalog.ts` for Worker ingest.
 */

/**
 * Item 72 — drop everything that is not a letter or digit.
 *
 * Cox and our parser disagree on spacing and punctuation for a handful of
 * makes: Cox stores `B M W`, we emit `bmw`. Neither exact nor whitespace-
 * collapsed comparison bridges that, so every BMW listing failed to resolve a
 * make at all (2.5% hit rate on ~400 attempts/day against 2,427 catalog rows
 * that were there the whole time). `AM GENERAL`, `MV-1`, `ROLLS-ROYCE` and
 * `MERCEDES-BENZ` differ the same way.
 *
 * Verified against the full catalog: no two makes collapse to the same value,
 * so this cannot introduce an ambiguous match.
 */
export function squashCatalogToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function matchCatalogOption(
  options: readonly string[],
  rawValue: string | undefined,
): string | null {
  if (!rawValue) return null;
  const needle = rawValue.trim().toLowerCase();
  if (!needle) return null;
  const exact = options.find((o) => o.toLowerCase() === needle);
  if (exact) return exact;
  const collapse = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const collapsedNeedle = collapse(rawValue);
  const collapsed = options.find((o) => collapse(o) === collapsedNeedle);
  if (collapsed) return collapsed;
  const squashedNeedle = squashCatalogToken(rawValue);
  if (!squashedNeedle) return null;
  return options.find((o) => squashCatalogToken(o) === squashedNeedle) ?? null;
}

/**
 * Broader catalog pick: exact / case-insensitive / contains (either direction).
 * Used for verbose listing models like `sportage fe` → `Sportage`.
 */
export function pickCatalogOptionFuzzy(
  options: readonly string[],
  rawValue: string | undefined,
): string | null {
  const exact = matchCatalogOption(options, rawValue);
  if (exact) return exact;
  if (!rawValue || options.length === 0) return null;
  const lower = rawValue.trim().toLowerCase();
  if (!lower) return null;
  const contains = options.find(
    (option) =>
      option.toLowerCase().includes(lower) || lower.includes(option.toLowerCase()),
  );
  return contains ?? null;
}
