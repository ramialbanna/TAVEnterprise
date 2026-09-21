/** Shared Cox style-token helpers for ingest catalog matching. */

export function normalizeCatalogPhrase(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Model-series numbers like 300 / 43 — not calendar years. */
export function isCatalogSeriesNumber(token: string): boolean {
  if (!/^\d{2,4}$/.test(token)) return false;
  const n = Number(token);
  return n < 1900 || n > 2100;
}

export function extractCatalogSeriesNumbers(text: string): string[] {
  return normalizeCatalogPhrase(text).split(" ").filter(isCatalogSeriesNumber);
}

export function styleHasWholeToken(style: string, token: string): boolean {
  const needle = normalizeCatalogPhrase(token);
  if (!needle) return false;
  const hay = normalizeCatalogPhrase(style);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^| )${escaped}(?: |$)`).test(hay);
}

export function expandSportUtilitySignals(signals: readonly string[]): string[] {
  const next = [...signals];
  if (next.includes("SPORT UTILITY") && !next.includes("SUV")) next.push("SUV");
  return next;
}
