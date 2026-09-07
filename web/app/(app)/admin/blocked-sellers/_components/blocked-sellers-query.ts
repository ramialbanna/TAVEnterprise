import type { BlockedSellerReview } from "@/lib/app-api/schemas";

export type OriginFilter = "all" | "auto" | "buyer";
export type ListingsFilter = "all" | "one" | "many";
export type ProfileFilter = "all" | "has_url" | "name_only";
export type SortKey = "createdAt" | "sellerName" | "listingCount";
export type SortDir = "asc" | "desc";

export type BlockedSellerQuery = {
  search: string;
  origin: OriginFilter;
  listings: ListingsFilter;
  profile: ProfileFilter;
  sortKey: SortKey;
  sortDir: SortDir;
};

export const DEFAULT_QUERY: BlockedSellerQuery = {
  search: "",
  origin: "all",
  listings: "all",
  profile: "all",
  sortKey: "createdAt",
  sortDir: "desc",
};

export const SORT_OPTIONS: readonly { key: SortKey; dir: SortDir; label: string }[] = [
  { key: "createdAt", dir: "desc", label: "Newest" },
  { key: "createdAt", dir: "asc", label: "Oldest" },
  { key: "sellerName", dir: "asc", label: "Name A–Z" },
  { key: "sellerName", dir: "desc", label: "Name Z–A" },
  { key: "listingCount", dir: "desc", label: "Most listings" },
  { key: "listingCount", dir: "asc", label: "Fewest listings" },
];

export function displaySellerName(name: string | null): string {
  if (!name) return "Unknown seller";
  return name.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function queryIsFiltered(query: BlockedSellerQuery): boolean {
  return (
    query.search.trim() !== "" ||
    query.origin !== "all" ||
    query.listings !== "all" ||
    query.profile !== "all"
  );
}

function matchesSearch(row: BlockedSellerReview, q: string): boolean {
  if (!q) return true;
  if ((row.sellerName ?? "").toLowerCase().includes(q)) return true;
  if ((row.sellerUrl ?? "").toLowerCase().includes(q)) return true;
  if (row.reason.toLowerCase().includes(q)) return true;
  return row.listings.some((listing) => listing.title.toLowerCase().includes(q));
}

export function filterBlockedSellers(
  rows: readonly BlockedSellerReview[],
  query: Pick<BlockedSellerQuery, "search" | "origin" | "listings" | "profile">,
): BlockedSellerReview[] {
  const q = query.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (query.origin !== "all" && row.origin !== query.origin) return false;
    if (query.listings === "one" && row.listingCount !== 1) return false;
    if (query.listings === "many" && row.listingCount <= 1) return false;
    if (query.profile === "has_url" && !row.sellerUrl) return false;
    if (query.profile === "name_only" && row.sellerUrl) return false;
    return matchesSearch(row, q);
  });
}

function nameKey(row: BlockedSellerReview): string {
  return (row.sellerName ?? "").toLowerCase();
}

export function sortBlockedSellers(
  rows: readonly BlockedSellerReview[],
  sortKey: SortKey,
  sortDir: SortDir,
): BlockedSellerReview[] {
  const sign = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "listingCount") {
      cmp = a.listingCount - b.listingCount;
    } else if (sortKey === "sellerName") {
      cmp = nameKey(a).localeCompare(nameKey(b));
    } else {
      cmp = a.createdAt.localeCompare(b.createdAt);
    }
    if (cmp !== 0) return cmp * sign;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function applyBlockedSellerQuery(
  rows: readonly BlockedSellerReview[],
  query: BlockedSellerQuery,
): BlockedSellerReview[] {
  return sortBlockedSellers(
    filterBlockedSellers(rows, query),
    query.sortKey,
    query.sortDir,
  );
}

export function countBlockedSellerOrigins(rows: readonly BlockedSellerReview[]): {
  all: number;
  auto: number;
  buyer: number;
} {
  let auto = 0;
  let buyer = 0;
  for (const row of rows) {
    if (row.origin === "auto") auto += 1;
    else buyer += 1;
  }
  return { all: rows.length, auto, buyer };
}
