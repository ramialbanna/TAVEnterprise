import {
  opportunitiesPageQuery,
  opportunitiesQuery,
  type OpportunitiesFilter,
  type OpportunitiesPageFilter,
} from "./client";
import { parseOpportunities, parseOpportunitiesPage } from "./parse";
import type { ApiResult } from "./parse";
import type { OpportunityListPage } from "./schemas";
import { paginateOpportunityRowsClient } from "@/lib/opportunities/list-page";

/** Max rows the Worker returns on the classic (non-paginated) list endpoint. */
const CLASSIC_FALLBACK_LIMIT = 100;

type JsonFetcher = (path: string) => Promise<{ status: number; json: unknown } | null>;

const TRANSPORT_ERROR: ApiResult<OpportunityListPage> = {
  ok: false,
  kind: "unavailable",
  error: "client_fetch_failed",
  status: 0,
  message: "The browser could not reach the dashboard API. Check your connection and try again.",
};

/**
 * Fetch a paginated opportunities page. If the Worker returns a legacy or partial
 * paginated shape, fall back to the classic array endpoint and paginate in the web tier.
 */
export async function fetchOpportunitiesPage(
  getJson: JsonFetcher,
  filter: OpportunitiesPageFilter = {},
): Promise<ApiResult<OpportunityListPage>> {
  const paginated = await getJson(`opportunities${opportunitiesPageQuery(filter)}`);
  if (!paginated) return TRANSPORT_ERROR;

  const parsed = parseOpportunitiesPage(paginated.status, paginated.json);
  if (parsed.ok) return parsed;

  const classicFilter: OpportunitiesFilter = {
    limit: CLASSIC_FALLBACK_LIMIT,
    source: filter.source,
    region: filter.region,
    type: filter.type,
    grade: filter.grade,
    status: filter.status,
  };
  const classic = await getJson(`opportunities${opportunitiesQuery(classicFilter)}`);
  if (!classic) return TRANSPORT_ERROR;

  const rows = parseOpportunities(classic.status, classic.json);
  if (rows.ok) {
    return {
      ok: true,
      status: classic.status,
      data: paginateOpportunityRowsClient(rows.data, filter),
    };
  }

  return parsed;
}
