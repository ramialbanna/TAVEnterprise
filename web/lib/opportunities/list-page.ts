import type { OpportunitySort } from "@/lib/app-api/client";
import type { OpportunitiesPageKeyFilter } from "@/lib/query";
import type { OpportunityListPage, OpportunityRow } from "@/lib/app-api/schemas";

/** Client-side sort/pagination when the Worker only supports the classic array response. */
export function paginateOpportunityRowsClient(
  rows: OpportunityRow[],
  filter: Pick<OpportunitiesPageKeyFilter, "offset" | "limit" | "sort">,
): OpportunityListPage {
  const sorted = [...rows];
  const sort: OpportunitySort = filter.sort ?? "spread_desc";

  sorted.sort((a, b) => {
    switch (sort) {
      case "spread_desc":
        return (b.spread ?? Number.NEGATIVE_INFINITY) - (a.spread ?? Number.NEGATIVE_INFINITY);
      case "score_desc":
        return (b.finalScore ?? Number.NEGATIVE_INFINITY) - (a.finalScore ?? Number.NEGATIVE_INFINITY);
      case "last_seen_desc":
        return (
          new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime()
        );
      case "received_desc":
        return (
          new Date(b.receivedAt ?? 0).getTime() - new Date(a.receivedAt ?? 0).getTime()
        );
      case "posted_desc":
        return (
          new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime()
        );
      default:
        return 0;
    }
  });

  const offset = Math.max(filter.offset ?? 0, 0);
  const limit = filter.limit ?? 25;

  return {
    items: sorted.slice(offset, offset + limit),
    total: sorted.length,
    offset,
  };
}

function asFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Coerce partial Worker payloads into the paginated page shape before Zod validation. */
export function normalizeOpportunityListPagePayload(data: unknown): unknown {
  if (Array.isArray(data)) return data;

  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      return {
        items: record.items,
        total: asFiniteNumber(record.total, record.items.length),
        offset: asFiniteNumber(record.offset, 0),
      };
    }
  }

  return data;
}
