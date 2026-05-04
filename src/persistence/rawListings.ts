import type { SupabaseClient } from "./supabase";

type RawListingInsert = {
  source: string;
  source_run_id: string;
  raw_item: unknown;
  received_at: string;
};

export async function insertRawListing(
  db: SupabaseClient,
  params: RawListingInsert,
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("raw_listings")
    .insert({
      source: params.source,
      source_run_id: params.source_run_id,
      raw_item: params.raw_item,
      received_at: params.received_at,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data) throw new Error("insertRawListing: no row returned");

  return { id: (data as Record<string, unknown>).id as string };
}
