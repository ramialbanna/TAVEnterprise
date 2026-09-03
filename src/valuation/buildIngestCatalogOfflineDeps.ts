import type { SupabaseClient } from "../persistence/supabase";
import {
  hasCoxCatalogTreeForYear,
  loadCoxCatalogTreeForMake,
} from "../persistence/coxCatalogTree";
import {
  lookupMmrStyleAliasWithFallback,
} from "../persistence/mmrStyleAliases";
import type { IngestCatalogOfflineDeps } from "./resolveListingToCatalog";

export function buildIngestCatalogOfflineDeps(db: SupabaseClient): IngestCatalogOfflineDeps {
  return {
    lookupStyleAlias: (make, model, trim, titleTrim, axisTokens) =>
      lookupMmrStyleAliasWithFallback(db, make, model, trim, titleTrim, axisTokens),
    loadTreeRows: (year: number, make: string) => loadCoxCatalogTreeForMake(db, year, make),
    hasTreeForYear: (year: number) => hasCoxCatalogTreeForYear(db, year),
  };
}

export { buildListingStyleAliasKey } from "../persistence/mmrStyleAliases";
