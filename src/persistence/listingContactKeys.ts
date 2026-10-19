import { LIVE_SELLER_LISTING_DAYS, REPEAT_SELLER_DEALER_MIN_LISTINGS } from "./blockedSellers";
import type { SupabaseClient } from "./supabase";
import { contactVehicleKey, extractListingContactKeys } from "../ingest/listingContactKeys";

export type ContactRepeatHit = {
  contactKey: string;
  vehicleCount: number;
  otherListingUrls: string[];
};

type ContactRow = {
  contact_key: string;
  vehicle_key: string;
  listing_url: string;
};

/**
 * Remember this listing's phone, website, WhatsApp number, or email, then
 * report the key that already appears on 3 different cars in the last 30 days.
 * Returns null when nothing repeats enough to drop the car.
 */
export async function matchRepeatedListingContact(
  db: SupabaseClient,
  input: {
    listingUrl: string;
    vin?: string | null;
    title?: string | null;
    description?: string | null;
  },
): Promise<ContactRepeatHit | null> {
  const keys = extractListingContactKeys(input);
  if (keys.length === 0) return null;

  const listingUrl = input.listingUrl.trim();
  const vehicleKey = contactVehicleKey(listingUrl, input.vin);
  const now = new Date().toISOString();
  const { error: upsertError } = await db.from("listing_contact_keys").upsert(
    keys.map((contactKey) => ({
      source: "facebook",
      listing_url: listingUrl,
      contact_key: contactKey,
      vehicle_key: vehicleKey,
      last_seen_at: now,
    })),
    { onConflict: "listing_url,contact_key" },
  );
  if (upsertError) throw upsertError;

  const since = new Date(Date.now() - LIVE_SELLER_LISTING_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("listing_contact_keys")
    .select("contact_key, vehicle_key, listing_url")
    .eq("source", "facebook")
    .in("contact_key", keys)
    .gte("last_seen_at", since);
  if (error) throw error;

  const rows = (data ?? []) as ContactRow[];
  let best: ContactRepeatHit | null = null;
  for (const contactKey of keys) {
    const matches = rows.filter((row) => row.contact_key === contactKey);
    const vehicles = new Set(matches.map((row) => row.vehicle_key));
    if (!vehicles.has(vehicleKey)) vehicles.add(vehicleKey);
    if (vehicles.size < REPEAT_SELLER_DEALER_MIN_LISTINGS) continue;
    const otherListingUrls = [
      ...new Set(
        matches.map((row) => row.listing_url).filter((url) => url && url !== listingUrl),
      ),
    ].slice(0, 20);
    if (!best || vehicles.size > best.vehicleCount) {
      best = { contactKey, vehicleCount: vehicles.size, otherListingUrls };
    }
  }
  return best;
}
