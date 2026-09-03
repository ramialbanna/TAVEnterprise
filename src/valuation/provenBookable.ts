/**
 * Item 72 action 2 — a (year, make, model, style) Cox actually priced.
 *
 * The catalog tree says a row exists. This set says Manheim returned money.
 * Last-resort and listing-text fallbacks must land in it before we call Cox;
 * a catalog-valid ladder hit may still go through so the set can grow.
 */

import { squashCatalogToken } from "./matchCatalogOption";

export type ProvenBookableCombo = {
  make: string;
  model: string;
  style: string;
};

export function provenBookableKey(make: string, model: string, style: string): string {
  return `${squashCatalogToken(make)}|${squashCatalogToken(model)}|${squashCatalogToken(style)}`;
}

/**
 * The booked row whose tokens squash-equal the pick, so callers send Cox's
 * spelling rather than listing words. Null when the pick has never booked.
 */
export function findProvenBookableCombo(
  combos: readonly ProvenBookableCombo[],
  pick: { make: string; model: string; style: string },
): ProvenBookableCombo | null {
  const make = pick.make.trim();
  const model = pick.model.trim();
  const style = pick.style.trim();
  if (!make || !model || !style || combos.length === 0) return null;

  const exact = combos.find(
    (row) =>
      row.make === make &&
      row.model === model &&
      row.style === style,
  );
  if (exact) return exact;

  const key = provenBookableKey(make, model, style);
  if (!key.replace(/\|/g, "")) return null;
  const loose = combos.filter(
    (row) => provenBookableKey(row.make, row.model, row.style) === key,
  );
  return loose.length >= 1 ? loose[0]! : null;
}

export function isProvenBookableCombo(
  combos: readonly ProvenBookableCombo[],
  pick: { make: string; model: string; style: string },
): boolean {
  return findProvenBookableCombo(combos, pick) !== null;
}

function catalogTokens(value: string): string[] {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => squashCatalogToken(part))
    .filter((part) => part.length >= 2);
}

/**
 * True when every listing-trim token appears as its own token in the Cox
 * style (`XLT` in `SUPERCREW XLT 4WD`). Token-wise so `LT` does not match
 * `XLT` and leftover listing words are never treated as a Cox bodyname.
 */
export function catalogStyleContainsListingTrim(style: string, listingTrim: string): boolean {
  const needles = catalogTokens(listingTrim);
  if (needles.length === 0) return false;
  const hay = new Set(catalogTokens(style));
  return needles.every((token) => hay.has(token));
}
