import type { SupabaseClient } from "./supabase";
import { squashCatalogToken } from "../valuation/matchCatalogOption";
import type { ProvenBookableCombo } from "../valuation/provenBookable";
import { logError } from "../logging/logger";

const COMBO_COLUMNS = "make, model, style";
const MAKE_LOAD_LIMIT = 2000;

type ProvenRow = {
  make: string;
  model: string;
  style: string;
};

function toCombo(row: ProvenRow): ProvenBookableCombo {
  return { make: row.make, model: row.model, style: row.style };
}

/**
 * Booked (make, model, style) tuples for one year + listing make.
 *
 * Same two-step make lookup as `loadCoxCatalogTreeForMake`: exact `ilike`,
 * then a punctuation-insensitive scan so `bmw` finds Cox's `B M W`. Fail
 * open (empty array) on a query error — the send path then skips the gate
 * rather than blocking every listing.
 */
export async function loadProvenBookableForMake(
  db: SupabaseClient,
  year: number,
  make: string,
): Promise<ProvenBookableCombo[]> {
  const trimmed = make.trim();
  if (!trimmed) return [];

  try {
    const { data, error } = await db
      .schema("tav")
      .from("cox_proven_bookable")
      .select(COMBO_COLUMNS)
      .eq("year", year)
      .ilike("make", trimmed)
      .limit(MAKE_LOAD_LIMIT);
    if (error) throw error;

    const rows = (data ?? []) as ProvenRow[];
    if (rows.length > 0) return rows.map(toCombo);

    return loadByPunctuationInsensitiveMake(db, year, trimmed);
  } catch (err) {
    logError("persistence", "ingest.proven_bookable_load_failed", err);
    return [];
  }
}

async function loadByPunctuationInsensitiveMake(
  db: SupabaseClient,
  year: number,
  make: string,
): Promise<ProvenBookableCombo[]> {
  const squashed = squashCatalogToken(make);
  if (!squashed) return [];

  const { data, error } = await db
    .schema("tav")
    .from("cox_proven_bookable")
    .select(COMBO_COLUMNS)
    .eq("year", year)
    .ilike("make", squashed.split("").join("%"))
    .limit(MAKE_LOAD_LIMIT);
  if (error) throw error;

  return ((data ?? []) as ProvenRow[])
    .filter((row) => squashCatalogToken(row.make) === squashed)
    .map(toCombo);
}

/**
 * Best-effort insert after a hit. Duplicate PK is a no-op. Never throws —
 * a snapshot write must not fail because the allowlist lagged.
 */
export async function recordProvenBookableHit(
  db: SupabaseClient,
  input: { year?: number | null; make?: string | null; model?: string | null; style?: string | null },
): Promise<void> {
  const year = input.year;
  const make = input.make?.trim() ?? "";
  const model = input.model?.trim() ?? "";
  const style = input.style?.trim() ?? "";
  if (year === undefined || year === null || !Number.isFinite(year) || !make || !model || !style) {
    return;
  }

  try {
    const { error } = await db.schema("tav").from("cox_proven_bookable").upsert(
      { year, make, model, style },
      { onConflict: "year,make,model,style", ignoreDuplicates: true },
    );
    if (error) throw error;
  } catch (err) {
    logError("persistence", "ingest.proven_bookable_record_failed", err);
  }
}
