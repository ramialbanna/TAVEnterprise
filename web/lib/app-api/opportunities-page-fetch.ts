import {
  opportunitiesPageQuery,
  opportunitiesQuery,
  type OpportunitiesFilter,
  type OpportunitiesPageFilter,
} from "./client";
import { parseOpportunities, parseOpportunitiesPage } from "./parse";
import type { ApiResult } from "./parse";
import type { OpportunityListPage, OpportunityRow } from "./schemas";
import { paginateOpportunityRowsClient } from "@/lib/opportunities/list-page";
import { filterOpportunityRowsByView, shouldApplyClientViewFilter } from "@/lib/opportunities/view-filter";

function isOkJsonEnvelope(json: unknown): json is { ok: true; data: unknown } {
  return typeof json === "object" && json !== null && (json as { ok?: unknown }).ok === true;
}

/** Classic Worker returns a plain array even when view/sort/offset query params are present. */
function isLegacyArrayBody(json: unknown): boolean {
  return isOkJsonEnvelope(json) && Array.isArray(json.data);
}

/** Max rows the Worker returns on the classic (non-paginated) list endpoint. */
const CLASSIC_FALLBACK_LIMIT = 100;

type JsonFetcher = (path: string) => Promise<{ status: number; json: unknown } | null>;

export type FetchOpportunitiesPageOptions = {
  viewerUserId?: string;
  viewerDisplayName?: string | null;
};

function buildPageFromRows(
  rows: OpportunityRow[],
  filter: OpportunitiesPageFilter,
  status: number,
  options?: FetchOpportunitiesPageOptions,
): ApiResult<OpportunityListPage> {
  const filtered = filterOpportunityRowsByView(rows, filter.view, {
    viewerUserId: options?.viewerUserId,
    viewerDisplayName: options?.viewerDisplayName,
  });
  return {
    ok: true,
    status,
    data: paginateOpportunityRowsClient(filtered, filter),
  };
}

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
  options?: FetchOpportunitiesPageOptions,
): Promise<ApiResult<OpportunityListPage>> {
  const paginated = await getJson(`opportunities${opportunitiesPageQuery(filter)}`);
  if (!paginated) return TRANSPORT_ERROR;

  const parsed = parseOpportunitiesPage(paginated.status, paginated.json);
  if (parsed.ok) {
    const { items, total, offset } = parsed.data;
    const needsClientView =
      filter.view &&
      filter.view !== "all" &&
      (isLegacyArrayBody(paginated.json) ||
        shouldApplyClientViewFilter(filter, { items, total, offset }));
    if (needsClientView) {
      return buildPageFromRows(items, filter, parsed.status, options);
    }
    return parsed;
  }

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
    return buildPageFromRows(rows.data, filter, classic.status, options);
  }

  return parsed;
}
