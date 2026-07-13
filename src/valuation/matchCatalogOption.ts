/**
 * Case-insensitive Cox catalog option matching (item 46 / 55 Phase B).
 * Port of `web/.../use-vehicle-catalog.ts` for Worker ingest.
 */

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
  return collapsed ?? null;
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
