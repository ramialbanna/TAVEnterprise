import type { SupabaseClient } from "../persistence/supabase";
import {
  hasCoxCatalogTreeForYear,
  loadCoxCatalogTreeForMake,
} from "../persistence/coxCatalogTree";
import {
  buildListingStyleAliasKey,
  lookupMmrStyleAlias,
} from "../persistence/mmrStyleAliases";
import type { IngestCatalogOfflineDeps } from "./resolveListingToCatalog";

export function buildIngestCatalogOfflineDeps(db: SupabaseClient): IngestCatalogOfflineDeps {
  return {
    lookupStyleAlias: (aliasKey: string) => lookupMmrStyleAlias(db, aliasKey),
    loadTreeRows: (year: number, make: string) => loadCoxCatalogTreeForMake(db, year, make),
    hasTreeForYear: (year: number) => hasCoxCatalogTreeForYear(db, year),
  };
}

export { buildListingStyleAliasKey };
