import type { MmrStyleAlias } from "../persistence/mmrStyleAliases";
import type { CoxCatalogTreeRow } from "./matchListingToCoxCatalog";

/** True when alias tokens match an exact row in the offline catalog tree. */
export function isCatalogAliasValid(
  rows: CoxCatalogTreeRow[],
  alias: Pick<MmrStyleAlias, "canonicalMake" | "canonicalModel" | "canonicalStyle">,
): boolean {
  const make = alias.canonicalMake.trim().toUpperCase();
  const model = alias.canonicalModel.trim();
  const style = alias.canonicalStyle.trim();
  if (!make || !model || !style) return false;

  return rows.some(
    (row) =>
      row.make.toUpperCase() === make && row.model === model && row.style === style,
  );
}

export function normalizeCatalogAliasTokens(alias: MmrStyleAlias): {
  make: string;
  model: string;
  style: string;
} {
  return {
    make: alias.canonicalMake.trim().toUpperCase(),
    model: alias.canonicalModel.trim(),
    style: alias.canonicalStyle.trim(),
  };
}
