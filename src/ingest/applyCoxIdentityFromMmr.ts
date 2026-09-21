import type { SupabaseClient } from "../persistence/supabase";
import { updateNormalizedListingYmms } from "../persistence/normalizedListings";
import type { MmrResult } from "../valuation/mmr";
import { logError } from "../logging/logger";
import type { LogContext } from "../logging/logger";

/** Write Cox lookup tokens onto the listing after a successful ingest MMR hit. */
export async function applyCoxIdentityFromMmr(
  db: SupabaseClient,
  listingId: string,
  mmrResult: Pick<MmrResult, "lookupMake" | "lookupModel" | "lookupTrim">,
  listingCtx: LogContext,
): Promise<void> {
  const make = mmrResult.lookupMake?.trim() ?? "";
  const model = mmrResult.lookupModel?.trim() ?? "";
  const trim = mmrResult.lookupTrim?.trim() ?? "";
  if (!make || !model || !trim) return;

  try {
    await updateNormalizedListingYmms(db, listingId, { make, model, trim });
  } catch (err) {
    logError("valuation", "ingest.cox_identity_writeback_failed", err, listingCtx);
  }
}
