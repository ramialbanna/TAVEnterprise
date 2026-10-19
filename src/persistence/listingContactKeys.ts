import { LIVE_SELLER_LISTING_DAYS, REPEAT_SELLER_DEALER_MIN_LISTINGS } from "./blockedSellers";
import type { SupabaseClient } from "./supabase";
import {
  contactVehicleKey,
  extractListingContactKeys,
  listingClusterKeys,
} from "../ingest/listingContactKeys";

export type ContactRepeatHit = {
  contactKey: string;
  vehicleCount: number;
  otherListingUrls: string[];
  source: "contact_repeat" | "buyer_contact";
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
  const keys = listingClusterKeys(input);
  if (keys.length === 0) return null;
  const buyerKeys = extractListingContactKeys(input);

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

  if (buyerKeys.length > 0) {
    const { data: blocked, error: blockedError } = await db
      .from("blocked_contact_keys")
      .select("contact_key")
      .eq("source", "facebook")
      .in("contact_key", buyerKeys);
    if (blockedError) throw blockedError;
    const blockedKey = (blocked?.[0] as { contact_key?: string } | undefined)?.contact_key;
    if (blockedKey) {
      const matches = rows.filter((row) => row.contact_key === blockedKey);
      const vehicles = new Set(matches.map((row) => row.vehicle_key));
      if (!vehicles.has(vehicleKey)) vehicles.add(vehicleKey);
      const otherListingUrls = [
        ...new Set(matches.map((row) => row.listing_url).filter((url) => url && url !== listingUrl)),
      ].slice(0, 20);
      return {
        contactKey: blockedKey,
        vehicleCount: vehicles.size,
        otherListingUrls,
        source: "buyer_contact",
      };
    }
  }

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
      best = { contactKey, vehicleCount: vehicles.size, otherListingUrls, source: "contact_repeat" };
    }
  }
  return best;
}

/**
 * A buyer marked this lead as a dealer. Remember its phone, website, or email
 * even when Facebook never sent a profile URL. The next car with that key drops.
 */
export async function rememberBuyerContactKeys(
  db: SupabaseClient,
  normalizedListingId: string,
  flaggedByUserId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("normalized_listings")
    .select("source, listing_url, title, description")
    .eq("id", normalizedListingId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.source !== "facebook") return [];

  const listingUrl = typeof data.listing_url === "string" ? data.listing_url.trim() : "";
  const keys = extractListingContactKeys({
    title: typeof data.title === "string" ? data.title : null,
    description: typeof data.description === "string" ? data.description : null,
  });
  if (!listingUrl || keys.length === 0) return [];

  const { error: upsertError } = await db.from("blocked_contact_keys").upsert(
    keys.map((contactKey) => ({
      source: "facebook",
      contact_key: contactKey,
      listing_url: listingUrl,
      flagged_by_user_id: flaggedByUserId,
    })),
    { onConflict: "source,contact_key" },
  );
  if (upsertError) throw upsertError;
  return keys;
}
