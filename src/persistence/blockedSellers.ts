import type { SupabaseClient } from "./supabase";

/** Item 69/74 — Facebook only. Region is first-seen audit, not part of the match. */
export const BLOCKED_SELLER_V1_SOURCE = "facebook" as const;
/** @deprecated Item 74 — kept for audit/default region; scope is no longer Dallas-only. */
export const BLOCKED_SELLER_V1_REGION = "dallas_tx" as const;

const FACEBOOK_SELLER_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.com",
  "www.fb.com",
]);

export type BlockedSellerReason = "dealer";

export interface BlockedSellerLookup {
  keys: Set<string>;
}

export interface UpsertBlockedSellerInput {
  source: string;
  region: string;
  sellerUrl?: string | null;
  sellerName?: string | null;
  reason?: BlockedSellerReason;
  flaggedByUserId?: string | null;
  normalizedListingId?: string | null;
  /** Live Facebook listings for this seller URL, including the current ad. */
  listingCount?: number;
}

/** Auto-blocks need more than one car. Buyer flags may persist a single URL. */
export const BLOCKED_SELLER_AUTO_MIN_LISTINGS = 2;
/** Same profile with this many live cars is a dealer even if the copy is empty. */
export const REPEAT_SELLER_DEALER_MIN_LISTINGS = 3;
export const LIVE_SELLER_LISTING_DAYS = 30;

/** Strip query/hash, trailing slash, lowercase — stable dedupe for FB profile URLs. */
export function normalizeSellerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.search = "";
    let path = url.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    return `${url.protocol}//${url.host.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
}

/** Case-fold + collapse whitespace for fallback name matching. */
export function normalizeSellerName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** URL key only. Name-only keys are not written or matched. */
export function buildBlockedSellerKey(
  sellerUrl?: string | null,
  _sellerName?: string | null,
): string | null {
  const keys = listBlockedSellerKeys(sellerUrl);
  return keys[0] ?? null;
}

/** Persist and match on Facebook profile URL only. */
export function listBlockedSellerKeys(sellerUrl?: string | null, _sellerName?: string | null): string[] {
  const url = sellerUrl ? normalizeSellerUrl(sellerUrl) : "";
  return url ? [`url:${url}`] : [];
}

export function shouldPersistBlockedSeller(input: {
  sellerUrl?: string | null;
  listingCount: number;
  buyerFlagged?: boolean;
  dealerEvidence?: boolean;
}): boolean {
  if (!input.sellerUrl?.trim()) return false;
  if (input.buyerFlagged) return true;
  if (!input.dealerEvidence) return false;
  return input.listingCount >= BLOCKED_SELLER_AUTO_MIN_LISTINGS;
}

export function isRepeatSellerDealer(listingCount: number): boolean {
  return listingCount >= REPEAT_SELLER_DEALER_MIN_LISTINGS;
}

export function facebookMarketplaceProfileId(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    const match = url.pathname.match(/\/marketplace\/profile\/(\d+)\/?$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function normalizeListingUrl(raw: string): string {
  return raw.trim().split("?")[0].replace(/\/+$/, "").toLowerCase();
}

/**
 * Distinct live Facebook listing URLs on this seller profile (last 30 days),
 * plus the current listing if it is not already stored.
 */
export async function countLiveFacebookListingsForSellerUrl(
  db: SupabaseClient,
  sellerUrl: string,
  extraListingUrl?: string | null,
): Promise<number> {
  const profileId = facebookMarketplaceProfileId(sellerUrl);
  const urls = new Set<string>();
  if (extraListingUrl?.trim()) urls.add(normalizeListingUrl(extraListingUrl));
  if (!profileId) return urls.size;

  const since = new Date(Date.now() - LIVE_SELLER_LISTING_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("normalized_listings")
    .select("listing_url")
    .eq("source", BLOCKED_SELLER_V1_SOURCE)
    .ilike("seller_url", `%/marketplace/profile/${profileId}%`)
    .gte("last_seen_at", since);
  if (error) throw error;

  for (const row of (data ?? []) as Array<{ listing_url: string | null }>) {
    if (row.listing_url) urls.add(normalizeListingUrl(row.listing_url));
  }
  return urls.size;
}

/** Marketplace profile href we persist. `profile.php` / `/people/` are not used. */
export function isFacebookMarketplaceProfileUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    if (!FACEBOOK_SELLER_HOSTS.has(url.host.toLowerCase())) return false;
    return /\/marketplace\/profile\/\d+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function isBlockedSellerScope(source: string, _region?: string): boolean {
  return source === BLOCKED_SELLER_V1_SOURCE;
}

export function isBlockedSeller(
  lookup: BlockedSellerLookup,
  sellerUrl?: string | null,
  _sellerName?: string | null,
): boolean {
  const url = sellerUrl ? normalizeSellerUrl(sellerUrl) : "";
  return Boolean(url) && lookup.keys.has(`url:${url}`);
}

/**
 * Facebook cards may land on the buyer sheet only after we have a seller URL
 * we can check against `blocked_sellers`. Name-only is not enough — a blocked
 * dealer can change the display name on a new listing.
 */
export function hasFacebookSellerUrlForQueue(sellerUrl?: string | null): boolean {
  return Boolean(sellerUrl?.trim());
}

/** Facebook Opportunities rows whose seller is already in `blocked_sellers`. */
export function isBlockedSellerOpportunity(
  lookup: BlockedSellerLookup | null | undefined,
  input: { source?: string | null; sellerUrl?: string | null; sellerName?: string | null },
): boolean {
  if (!lookup) return false;
  if (!isBlockedSellerScope(input.source ?? "")) return false;
  return isBlockedSeller(lookup, input.sellerUrl, input.sellerName);
}

/**
 * Default queue views: hide until a Facebook seller URL exists, then hide if
 * that seller is blacklisted. Flagged leads stay auditable.
 */
export function isPendingFacebookSellerIdentity(
  source?: string | null,
  sellerUrl?: string | null,
): boolean {
  if (!isBlockedSellerScope(source ?? "")) return false;
  return !hasFacebookSellerUrlForQueue(sellerUrl);
}

export async function loadBlockedSellerLookup(
  db: SupabaseClient,
  source: string,
  _region?: string,
): Promise<BlockedSellerLookup | null> {
  if (!isBlockedSellerScope(source)) return null;

  const { data, error } = await db
    .from("blocked_sellers")
    .select("seller_key")
    .eq("source", source);
  if (error) throw error;

  const keys = new Set<string>();
  for (const row of (data ?? []) as Array<{ seller_key: string }>) {
    if (row.seller_key) keys.add(row.seller_key);
  }
  return { keys };
}

export async function upsertBlockedSeller(
  db: SupabaseClient,
  input: UpsertBlockedSellerInput,
): Promise<{ inserted: boolean; sellerKey: string } | null> {
  if (!isBlockedSellerScope(input.source, input.region)) return null;

  const url = input.sellerUrl ? normalizeSellerUrl(input.sellerUrl) || null : null;
  if (!url) return null;
  const persist = shouldPersistBlockedSeller({
    sellerUrl: url,
    listingCount: input.listingCount ?? 0,
    buyerFlagged: Boolean(input.flaggedByUserId),
    dealerEvidence: !input.flaggedByUserId,
  });
  if (!persist) return null;

  const name = input.sellerName ? normalizeSellerName(input.sellerName) || null : null;
  const sellerKey = `url:${url}`;
  const inserted = await upsertBlockedSellerKey(db, {
    source: input.source,
    region: input.region,
    sellerKey,
    sellerUrl: url,
    sellerName: name,
    reason: input.reason ?? "dealer",
    flaggedByUserId: input.flaggedByUserId ?? null,
    normalizedListingId: input.normalizedListingId ?? null,
  });

  return { inserted, sellerKey };
}

async function upsertBlockedSellerKey(
  db: SupabaseClient,
  row: {
    source: string;
    region: string;
    sellerKey: string;
    sellerUrl: string | null;
    sellerName: string | null;
    reason: BlockedSellerReason;
    flaggedByUserId: string | null;
    normalizedListingId: string | null;
  },
): Promise<boolean> {
  const { data: existing, error: existingErr } = await db
    .from("blocked_sellers")
    .select("id, region")
    .eq("source", row.source)
    .eq("seller_key", row.sellerKey)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const payload = {
    source: row.source,
    region: (existing?.region as string | undefined) ?? row.region,
    seller_key: row.sellerKey,
    seller_url: row.sellerUrl,
    seller_name: row.sellerName,
    reason: row.reason,
    flagged_by_user_id: row.flaggedByUserId,
    normalized_listing_id: row.normalizedListingId,
  };

  if (existing) {
    const { error } = await db
      .from("blocked_sellers")
      .update({
        seller_key: payload.seller_key,
        seller_url: payload.seller_url,
        seller_name: payload.seller_name,
        reason: payload.reason,
        flagged_by_user_id: payload.flagged_by_user_id,
        normalized_listing_id: payload.normalized_listing_id,
      })
      .eq("id", existing.id as string);
    if (error) throw error;
    return false;
  }

  const { error } = await db.from("blocked_sellers").insert(payload);
  if (error) throw error;
  return true;
}

export async function blockSellerFromDealerDismiss(
  db: SupabaseClient,
  normalizedListingId: string,
  flaggedByUserId: string,
): Promise<{ sellerKey: string; inserted: boolean } | null> {
  const { data, error } = await db
    .from("normalized_listings")
    .select("source, region, seller_url, seller_name")
    .eq("id", normalizedListingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const source = data.source as string;
  const region = data.region as string;
  if (!isBlockedSellerScope(source, region)) return null;

  const result = await upsertBlockedSeller(db, {
    source,
    region,
    sellerUrl: (data.seller_url as string | null) ?? null,
    sellerName: (data.seller_name as string | null) ?? null,
    reason: "dealer",
    flaggedByUserId,
    normalizedListingId,
  });
  if (!result) return null;
  return { sellerKey: result.sellerKey, inserted: result.inserted };
}

export type BlockedSellerDbRow = {
  id: string;
  source: string;
  region: string | null;
  seller_key: string;
  seller_url: string | null;
  seller_name: string | null;
  reason: string;
  flagged_by_user_id: string | null;
  normalized_listing_id: string | null;
  created_at: string;
};

export type BlockedSellerListingRow = {
  id: string;
  title: string | null;
  listing_url: string | null;
  price: number | null;
  year: number | null;
  make: string | null;
  model: string | null;
  seller_url: string | null;
  seller_name: string | null;
  first_seen_at: string | null;
};

export type BlockedSellerReviewListing = {
  id: string;
  title: string;
  listingUrl: string | null;
  price: number | null;
  year: number | null;
  make: string | null;
  model: string | null;
  firstSeenAt: string | null;
  opportunityHref: string | null;
};

export type BlockedSellerReview = {
  id: string;
  relatedIds: string[];
  sellerName: string | null;
  sellerUrl: string | null;
  reason: string;
  origin: "buyer" | "auto";
  listingCount: number;
  createdAt: string;
  listings: BlockedSellerReviewListing[];
};

type ReviewGroup = {
  ids: string[];
  sellerUrl: string | null;
  sellerName: string | null;
  reason: string;
  buyerFlagged: boolean;
  createdAt: string;
};

function listingTitle(row: BlockedSellerListingRow): string {
  const ymm = [row.year, row.make, row.model].filter(Boolean).join(" ");
  return row.title?.trim() || ymm || "Untitled listing";
}

/**
 * Collapse url+name key pairs into one review row and attach matching listings.
 */
export function groupBlockedSellerReviews(
  rows: readonly BlockedSellerDbRow[],
  listings: readonly BlockedSellerListingRow[],
  queueListingIds: ReadonlySet<string>,
): BlockedSellerReview[] {
  const urlGroups = new Map<string, ReviewGroup>();
  const nameGroups = new Map<string, ReviewGroup>();

  const ordered = [...rows].sort((a, b) => {
    const aUrl = a.seller_key.startsWith("url:") ? 0 : 1;
    const bUrl = b.seller_key.startsWith("url:") ? 0 : 1;
    return aUrl - bUrl;
  });

  for (const row of ordered) {
    const url = row.seller_url ? normalizeSellerUrl(row.seller_url) : "";
    const name = row.seller_name ? normalizeSellerName(row.seller_name) : "";
    const existing = (url && urlGroups.get(url)) || (name && nameGroups.get(name)) || null;
    const group: ReviewGroup = existing ?? {
      ids: [],
      sellerUrl: url || null,
      sellerName: name || null,
      reason: row.reason || "dealer",
      buyerFlagged: false,
      createdAt: row.created_at,
    };
    if (!group.ids.includes(row.id)) group.ids.push(row.id);
    if (url) group.sellerUrl = url;
    if (name) group.sellerName = name;
    if (row.flagged_by_user_id) group.buyerFlagged = true;
    if (row.created_at < group.createdAt) group.createdAt = row.created_at;
    if (url) urlGroups.set(url, group);
    if (name) nameGroups.set(name, group);
  }

  const unique = new Set<ReviewGroup>([...urlGroups.values(), ...nameGroups.values()]);

  const reviews: BlockedSellerReview[] = [];
  for (const group of unique) {
    const matched = listings.filter((listing) => {
      const listingUrl = listing.seller_url ? normalizeSellerUrl(listing.seller_url) : "";
      const listingName = listing.seller_name ? normalizeSellerName(listing.seller_name) : "";
      if (group.sellerUrl) return Boolean(listingUrl) && listingUrl === group.sellerUrl;
      if (!group.sellerName || listingName !== group.sellerName) return false;
      return !listingUrl || !urlGroups.has(listingUrl);
    });

    const [primaryId, ...rest] = group.ids;
    if (!primaryId) continue;

    reviews.push({
      id: primaryId,
      relatedIds: rest,
      sellerName: group.sellerName,
      sellerUrl: group.sellerUrl,
      reason: group.reason,
      origin: group.buyerFlagged ? "buyer" : "auto",
      listingCount: matched.length,
      createdAt: group.createdAt,
      listings: matched
        .slice()
        .sort((a, b) => (b.first_seen_at ?? "").localeCompare(a.first_seen_at ?? ""))
        .map((listing) => ({
          id: listing.id,
          title: listingTitle(listing),
          listingUrl: listing.listing_url,
          price: listing.price,
          year: listing.year,
          make: listing.make,
          model: listing.model,
          firstSeenAt: listing.first_seen_at,
          opportunityHref: queueListingIds.has(listing.id) ? `/opportunities/${listing.id}` : null,
        })),
    });
  }

  return reviews.sort((a, b) => {
    if (a.listingCount !== b.listingCount) return a.listingCount - b.listingCount;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

const LISTING_REVIEW_COLUMNS =
  "id, title, listing_url, price, year, make, model, seller_url, seller_name, first_seen_at";

function quoteOrValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function loadListingsForBlockedSellers(
  db: SupabaseClient,
  urls: string[],
  names: string[],
): Promise<BlockedSellerListingRow[]> {
  const byId = new Map<string, BlockedSellerListingRow>();

  if (urls.length > 0) {
    const urlVariants = urls.flatMap((url) => [url, `${url}/`]);
    const { data, error } = await db
      .from("normalized_listings")
      .select(LISTING_REVIEW_COLUMNS)
      .eq("source", "facebook")
      .in("seller_url", urlVariants);
    if (error) throw error;
    for (const row of (data ?? []) as BlockedSellerListingRow[]) {
      byId.set(row.id, row);
    }
  }

  for (let i = 0; i < names.length; i += 25) {
    const chunk = names.slice(i, i + 25);
    const orFilter = chunk.map((name) => `seller_name.ilike.${quoteOrValue(name)}`).join(",");
    const { data, error } = await db
      .from("normalized_listings")
      .select(LISTING_REVIEW_COLUMNS)
      .eq("source", "facebook")
      .or(orFilter);
    if (error) throw error;
    for (const row of (data ?? []) as BlockedSellerListingRow[]) {
      byId.set(row.id, row);
    }
  }

  return [...byId.values()];
}

export async function listBlockedSellerReviews(
  db: SupabaseClient,
): Promise<BlockedSellerReview[]> {
  const { data, error } = await db
    .from("blocked_sellers")
    .select(
      "id, source, region, seller_key, seller_url, seller_name, reason, flagged_by_user_id, normalized_listing_id, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as BlockedSellerDbRow[];
  const urls = [
    ...new Set(
      rows
        .map((row) => (row.seller_url ? normalizeSellerUrl(row.seller_url) : ""))
        .filter(Boolean),
    ),
  ];
  const names = [
    ...new Set(
      rows
        .map((row) => (row.seller_name ? normalizeSellerName(row.seller_name) : ""))
        .filter(Boolean),
    ),
  ];

  const listings = await loadListingsForBlockedSellers(db, urls, names);
  const listingIds = listings.map((row) => row.id);
  const queueListingIds = new Set<string>();
  if (listingIds.length > 0) {
    const { data: leads, error: leadsError } = await db
      .from("leads")
      .select("normalized_listing_id")
      .in("normalized_listing_id", listingIds);
    if (leadsError) throw leadsError;
    for (const lead of leads ?? []) {
      const id = (lead as { normalized_listing_id?: string }).normalized_listing_id;
      if (id) queueListingIds.add(id);
    }
  }

  return groupBlockedSellerReviews(rows, listings, queueListingIds);
}

export async function unblockBlockedSellerGroup(
  db: SupabaseClient,
  sellerId: string,
): Promise<{ deleted: number } | null> {
  const { data: seed, error: seedError } = await db
    .from("blocked_sellers")
    .select("id, seller_url, seller_name")
    .eq("id", sellerId)
    .maybeSingle();
  if (seedError) throw seedError;
  if (!seed) return null;

  const url = seed.seller_url ? normalizeSellerUrl(String(seed.seller_url)) : "";
  const name = seed.seller_name ? normalizeSellerName(String(seed.seller_name)) : "";

  const { data: siblings, error: siblingError } = await db
    .from("blocked_sellers")
    .select("id, seller_url, seller_name");
  if (siblingError) throw siblingError;

  const ids = [...new Set(
    ((siblings ?? []) as Array<{ id: string; seller_url: string | null; seller_name: string | null }>)
      .filter((row) => {
        const rowUrl = row.seller_url ? normalizeSellerUrl(row.seller_url) : "";
        const rowName = row.seller_name ? normalizeSellerName(row.seller_name) : "";
        if (url && rowUrl === url) return true;
        if (name && rowName === name && !rowUrl) return true;
        if (name && rowName === name && url && rowUrl === url) return true;
        if (!url && name && rowName === name) return true;
        return row.id === sellerId;
      })
      .map((row) => row.id),
  )];

  if (ids.length === 0) return null;

  const { error: deleteError } = await db.from("blocked_sellers").delete().in("id", ids);
  if (deleteError) throw deleteError;
  return { deleted: ids.length };
}
