/**
 * Typed, browser-callable client for the `/app/*` product API.
 *
 * Every function hits the same-origin Next proxy (`/api/app/<path>` — see
 * `web/app/api/app/[...path]/route.ts`), which injects the server-side Bearer and
 * forwards to the Cloudflare Worker. No secret or Worker URL is referenced here, so
 * this module is safe to import from client components. Each call returns an
 * `ApiResult<T>` (see `parse.ts`) — never throws on an HTTP error, only on a network
 * failure that even `fetch` can't model.
 *
 * The server-side equivalent (RSC first-paint) lives in `server.ts` and is kept
 * deliberately parallel — same names, same parsers, different transport.
 */
import {
  parseHistoricalSales,
  parseImportBatches,
  parseIngestRuns,
  parseIngestRunDetail,
  parseOpportunities,
  parseOpportunityDetail,
  parseManualSubmission,
  parseAppUsers,
  parseAppMe,
  parseStaffDirectory,
  parseStaffDirectoryEntry,
  parseKpis,
  parseMmrCatalog,
  parseMmrYmm,
  parseMmrVin,
  parseSystemStatus,
  parseMaxbuyEvaluate,
  parseMaxbuyOverride,
  parseMaxbuyPass,
  type ApiResult,
} from "./parse";
import { fetchOpportunitiesPage } from "./opportunities-page-fetch";
import { parseParsedListingFields } from "./listing-parse";
import { codeMessage } from "./missing-reason";
import type {
  HistoricalSale,
  ImportBatch,
  IngestRunSummary,
  IngestRunDetail,
  OpportunityRow,
  OpportunityListPage,
  OpportunityDetail,
  ManualSubmissionResult,
  ParsedListingFields,
  AppUserSummary,
  AppUser,
  MutatableWorkflowStatus,
  DismissReasonCode,
  StaffDirectoryEntry,
  StaffDirectoryRole,
  Kpis,
  MmrCatalog,
  MmrVinOk,
  SystemStatus,
  MaxbuyEvaluateOk,
  MaxbuyOverrideOk,
  MaxbuyPassOk,
} from "./schemas";

/** Query filter for `GET /app/ingest-runs` (all optional; see `docs/03-api/app-api.md`). */
export type IngestRunsFilter = {
  /** Default 20, clamped to 100 by the Worker. */
  limit?: number;
  source?: string;
  region?: string;
  status?: string;
};

/** Query filter for `GET /app/opportunities` (Classic — plain array response). */
export type OpportunitiesFilter = {
  limit?: number;
  source?: string;
  region?: string;
  type?: "lead" | "near_miss" | "manual_submission" | "scraper_review";
  grade?: string;
  status?: string;
};

export type OpportunitySort =
  | "spread_desc"
  | "score_desc"
  | "last_seen_desc"
  | "received_desc"
  | "posted_desc";
export type OpportunityView =
  | "needs_action"
  | "mine"
  | "worth_a_look"
  | "all"
  | "scraper_review";

/** Paginated list filter — triggers `{ items, total, offset }` response from the Worker. */
export type OpportunitiesPageFilter = OpportunitiesFilter & {
  offset?: number;
  sort?: OpportunitySort;
  view?: OpportunityView;
};

/** `?...` query string for `ingest-runs`; empty when no params. */
export function ingestRunsQuery(filter: IngestRunsFilter = {}): string {
  const params = new URLSearchParams();
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  if (filter.source) params.set("source", filter.source);
  if (filter.region) params.set("region", filter.region);
  if (filter.status) params.set("status", filter.status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** `?...` query string for opportunities (Classic); empty when no params. */
export function opportunitiesQuery(filter: OpportunitiesFilter = {}): string {
  const params = new URLSearchParams();
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  if (filter.source) params.set("source", filter.source);
  if (filter.region) params.set("region", filter.region);
  if (filter.type) params.set("type", filter.type);
  if (filter.grade) params.set("grade", filter.grade);
  if (filter.status) params.set("status", filter.status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** `?...` query string for paginated opportunities (New mode). */
export function opportunitiesPageQuery(filter: OpportunitiesPageFilter = {}): string {
  const params = new URLSearchParams();
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  if (filter.offset !== undefined) params.set("offset", String(filter.offset));
  if (filter.sort) params.set("sort", filter.sort);
  if (filter.view) params.set("view", filter.view);
  if (filter.source) params.set("source", filter.source);
  if (filter.region) params.set("region", filter.region);
  if (filter.type) params.set("type", filter.type);
  if (filter.grade) params.set("grade", filter.grade);
  if (filter.status) params.set("status", filter.status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Query filter for `GET /app/historical-sales` (all fields optional; see `docs/03-api/app-api.md`). */
export type HistoricalSalesFilter = {
  /** Default 20, clamped to 100 by the Worker. */
  limit?: number;
  year?: number;
  make?: string;
  model?: string;
  /** ISO date — only sales on/after this date. */
  since?: string;
};

/** Cox MMR adjustment params (P3 — POST /app/mmr/vin|ymm). */
export type MmrAdjustmentsRequest = {
  region?: string;
  grade?: string;
  color?: string;
  exclude_build?: boolean;
  evbh?: number;
};

/** Request body for `POST /app/mmr/vin`. */
export type MmrVinRequest = {
  vin: string;
  year?: number;
  mileage?: number;
  adjustments?: MmrAdjustmentsRequest;
  /** Bypass intel MMR cache (Refresh valuation). */
  refresh_valuation?: boolean;
};

export type MmrYmmRequest = {
  year: number;
  make: string;
  model: string;
  style: string;
  mileage?: number;
  adjustments?: MmrAdjustmentsRequest;
  refresh_valuation?: boolean;
};

/** Request body for `POST /app/opportunities/manual` (WF-1 required fields). */
export type ManualSubmissionRequest = {
  listingUrl: string;
  region:
    | "dallas_tx"
    | "houston_tx"
    | "austin_tx"
    | "san_antonio_tx"
    | "lubbock_tx"
    | "oklahoma_city_ok";
  year: number;
  make: string;
  model: string;
  price: number;
  assignedToUserId?: string;
  source?: "facebook" | "craigslist" | "autotrader" | "cars_com" | "offerup";
  style?: string;
  mileage?: number;
  submitterNotes?: string;
};

export type AssignOpportunityRequest = {
  assignedToUserId: string | null;
};

/** Request body for POST /app/opportunities/:id/status. */
export type UpdateOpportunityStatusRequest = {
  status: MutatableWorkflowStatus;
};

/** Request body for POST /app/opportunities/:id/dismiss. */
export type DismissOpportunityRequest = {
  reason: DismissReasonCode;
  notes?: string;
};

/** Request body for POST /app/opportunities/:id/notes. */
export type AddOpportunityNoteRequest = {
  note: string;
  /** Immutable MaxBuy snapshot to attach to this workflow action (Phase 7). */
  maxbuy_recommendation_id?: string;
};

export type MaxbuyOverrideType =
  | "passed_despite_buy"
  | "bought_despite_pass"
  | "bid_reduced"
  | "title_condition_concern"
  | "transport_concern"
  | "manager_call"
  | "inventory_need"
  | "other";

/** Request body for `POST /app/maxbuy/overrides`. */
export type MaxbuyOverrideRequest = {
  contract_version?: "1.0.0";
  recommendation_id: string;
  override_type: MaxbuyOverrideType;
  override_note?: string;
  acted_price?: number;
};

/** Request body for `POST /app/maxbuy/passes` (OPEN-5: vin optional; ymm accepted). */
export type MaxbuyPassRequest = {
  contract_version?: "1.0.0";
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  recommendation_id?: string;
  asking_price?: number;
  bid_price?: number;
  mmr_value?: number;
  pass_reason: string;
  pass_note?: string;
};

export type MaxbuyRegion =
  | "dallas_tx"
  | "houston_tx"
  | "austin_tx"
  | "san_antonio_tx"
  | "lubbock_tx"
  | "oklahoma_city_ok";

/**
 * Request body for `POST /app/maxbuy/evaluate` (contract v1.0.0, OPEN-5).
 * Either `vin` or `year`+`make`+`model` must be supplied.
 */
export type MaxbuyEvaluateRequest = {
  contract_version?: "1.0.0";
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  mileage?: number;
  asking_price?: number;
  region?: MaxbuyRegion;
  normalized_listing_id?: string;
  lead_id?: string;
};

const PROXY_PREFIX = "/api/app";

/** Build the `?...` query string for `historical-sales`; empty string when no filters. */
export function historicalSalesQuery(filter: HistoricalSalesFilter = {}): string {
  const params = new URLSearchParams();
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  if (filter.year !== undefined) params.set("year", String(filter.year));
  if (filter.make) params.set("make", filter.make);
  if (filter.model) params.set("model", filter.model);
  if (filter.since) params.set("since", filter.since);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** `?limit=` for `import-batches` (empty when unset). */
export function importBatchesQuery(limit?: number): string {
  return limit === undefined ? "" : `?limit=${encodeURIComponent(String(limit))}`;
}

/** Best-effort JSON read — the parsers treat a non-object body as `bad_response`. */
async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * The browser couldn't even reach our own `/api/app/*` route (offline, DNS, aborted,
 * `fetch` rejected). This is a browser-to-`/web` transport failure — distinct from a
 * Worker `/app/*` error or a `/web`-to-Worker proxy error — so it's reported as
 * `kind:"proxy"` with `status:0`. UI consumes this as an `ApiResult`; the typed client
 * never throws on it.
 */
function clientTransportError<T>(): ApiResult<T> {
  return {
    ok: false,
    kind: "proxy",
    error: "client_fetch_failed",
    status: 0,
    message: codeMessage("client_fetch_failed"),
  };
}

/** Sentinel returned by the fetch wrappers when `fetch` itself rejects. */
const FETCH_FAILED = Symbol("fetch_failed");

async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; json: unknown } | typeof FETCH_FAILED> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_PREFIX}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return FETCH_FAILED;
  }
  return { status: res.status, json: await readJson(res) };
}

async function getJson(
  pathWithQuery: string,
): Promise<{ status: number; json: unknown } | typeof FETCH_FAILED> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_PREFIX}/${pathWithQuery}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
  } catch {
    return FETCH_FAILED;
  }
  return { status: res.status, json: await readJson(res) };
}

async function patchJson(
  path: string,
  body: unknown,
): Promise<{ status: number; json: unknown } | typeof FETCH_FAILED> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_PREFIX}/${path}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return FETCH_FAILED;
  }
  return { status: res.status, json: await readJson(res) };
}

export async function getSystemStatus(): Promise<ApiResult<SystemStatus>> {
  const r = await getJson("system-status");
  if (r === FETCH_FAILED) return clientTransportError();
  return parseSystemStatus(r.status, r.json);
}

export async function getKpis(): Promise<ApiResult<Kpis>> {
  const r = await getJson("kpis");
  if (r === FETCH_FAILED) return clientTransportError();
  return parseKpis(r.status, r.json);
}

export async function listImportBatches(limit?: number): Promise<ApiResult<ImportBatch[]>> {
  const r = await getJson(`import-batches${importBatchesQuery(limit)}`);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseImportBatches(r.status, r.json);
}

export async function listHistoricalSales(
  filter: HistoricalSalesFilter = {},
): Promise<ApiResult<HistoricalSale[]>> {
  const r = await getJson(`historical-sales${historicalSalesQuery(filter)}`);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseHistoricalSales(r.status, r.json);
}

export async function listIngestRuns(
  filter: IngestRunsFilter = {},
): Promise<ApiResult<IngestRunSummary[]>> {
  const r = await getJson(`ingest-runs${ingestRunsQuery(filter)}`);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseIngestRuns(r.status, r.json);
}

export async function getIngestRun(id: string): Promise<ApiResult<IngestRunDetail>> {
  const r = await getJson(`ingest-runs/${encodeURIComponent(id)}`);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseIngestRunDetail(r.status, r.json);
}

export async function listOpportunities(
  filter: OpportunitiesFilter = {},
): Promise<ApiResult<OpportunityRow[]>> {
  const r = await getJson(`opportunities${opportunitiesQuery(filter)}`);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseOpportunities(r.status, r.json);
}

export type ListOpportunitiesPageOptions = {
  viewerUserId?: string;
  viewerDisplayName?: string | null;
};

export async function listOpportunitiesPage(
  filter: OpportunitiesPageFilter = {},
  options?: ListOpportunitiesPageOptions,
): Promise<ApiResult<OpportunityListPage>> {
  return fetchOpportunitiesPage(
    async (path) => {
      const r = await getJson(path);
      return r === FETCH_FAILED ? null : r;
    },
    filter,
    options,
  );
}

export async function getOpportunity(id: string): Promise<ApiResult<OpportunityDetail>> {
  const r = await getJson(`opportunities/${encodeURIComponent(id)}`);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseOpportunityDetail(r.status, r.json);
}

export async function listAppUsers(): Promise<ApiResult<AppUserSummary[]>> {
  const r = await getJson("users");
  if (r === FETCH_FAILED) return clientTransportError();
  return parseAppUsers(r.status, r.json);
}

export async function getAppMe(): Promise<ApiResult<AppUser>> {
  const r = await getJson("me");
  if (r === FETCH_FAILED) return clientTransportError();
  return parseAppMe(r.status, r.json);
}

export type ListStaffDirectoryFilter = {
  type?: "salesperson" | "appraiser";
  includeInactive?: boolean;
};

export async function listStaffDirectory(
  filter: ListStaffDirectoryFilter = {},
): Promise<ApiResult<StaffDirectoryEntry[]>> {
  const params = new URLSearchParams();
  if (filter.type) params.set("type", filter.type);
  if (filter.includeInactive) params.set("includeInactive", "1");
  const qs = params.toString();
  const r = await getJson(qs ? `directory?${qs}` : "directory");
  if (r === FETCH_FAILED) return clientTransportError();
  return parseStaffDirectory(r.status, r.json);
}

export async function createStaffDirectoryEntry(body: {
  displayName: string;
  role: StaffDirectoryRole;
}): Promise<ApiResult<StaffDirectoryEntry>> {
  const r = await postJson("directory", body);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseStaffDirectoryEntry(r.status, r.json);
}

export async function deactivateStaffDirectoryEntry(
  id: string,
): Promise<ApiResult<StaffDirectoryEntry>> {
  const r = await postJson(`directory/${encodeURIComponent(id)}/deactivate`, {});
  if (r === FETCH_FAILED) return clientTransportError();
  return parseStaffDirectoryEntry(r.status, r.json);
}

export async function reactivateStaffDirectoryEntry(
  id: string,
): Promise<ApiResult<StaffDirectoryEntry>> {
  const r = await postJson(`directory/${encodeURIComponent(id)}/reactivate`, {});
  if (r === FETCH_FAILED) return clientTransportError();
  return parseStaffDirectoryEntry(r.status, r.json);
}

export async function parseListingUrl(
  listingUrl: string,
): Promise<ApiResult<ParsedListingFields>> {
  const r = await postJson("opportunities/parse", { listingUrl });
  if (r === FETCH_FAILED) return clientTransportError();
  return parseParsedListingFields(r.status, r.json);
}

export async function submitManualOpportunity(
  body: ManualSubmissionRequest,
): Promise<ApiResult<ManualSubmissionResult>> {
  const r = await postJson("opportunities/manual", body);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseManualSubmission(r.status, r.json);
}

export async function assignOpportunity(
  id: string,
  body: AssignOpportunityRequest,
): Promise<ApiResult<OpportunityDetail>> {
  const r = await postJson(`opportunities/${encodeURIComponent(id)}/assign`, body);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseOpportunityDetail(r.status, r.json);
}

export async function claimOpportunity(id: string): Promise<ApiResult<OpportunityDetail>> {
  const r = await postJson(`opportunities/${encodeURIComponent(id)}/claim`, {});
  if (r === FETCH_FAILED) return clientTransportError();
  return parseOpportunityDetail(r.status, r.json);
}

export async function evaluateOpportunity(id: string): Promise<ApiResult<OpportunityDetail>> {
  const r = await postJson(`opportunities/${encodeURIComponent(id)}/evaluate`, {});
  if (r === FETCH_FAILED) return clientTransportError();
  return parseOpportunityDetail(r.status, r.json);
}

export async function updateOpportunityStatus(
  id: string,
  body: UpdateOpportunityStatusRequest,
): Promise<ApiResult<OpportunityDetail>> {
  const r = await postJson(`opportunities/${encodeURIComponent(id)}/status`, body);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseOpportunityDetail(r.status, r.json);
}

export async function dismissOpportunity(
  id: string,
  body: DismissOpportunityRequest,
): Promise<ApiResult<OpportunityDetail>> {
  const r = await postJson(`opportunities/${encodeURIComponent(id)}/dismiss`, body);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseOpportunityDetail(r.status, r.json);
}

export async function addOpportunityNote(
  id: string,
  body: AddOpportunityNoteRequest,
): Promise<ApiResult<OpportunityDetail>> {
  const r = await postJson(`opportunities/${encodeURIComponent(id)}/notes`, body);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseOpportunityDetail(r.status, r.json);
}

export type PatchOpportunityRequest = {
  vin?: string | null;
  mileage?: number | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  style?: string | null;
  bodyType?: string | null;
  engine?: string | null;
  transmission?: string | null;
  color?: string | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactHomePhone?: string | null;
  contactEmail?: string | null;
  contactAddress?: string | null;
  contactPostalCode?: string | null;
  salesperson?: string | null;
  appraiser?: string | null;
  titleOwner?: string | null;
  titleStateRegion?: string | null;
  lienHolder?: string | null;
  lienAccountNumber?: string | null;
  lienPayoff?: number | null;
  tagOrPlate?: string | null;
  tagStateRegion?: string | null;
  tagExpiration?: string | null;
  certified?: boolean;
  extendedWarranty?: boolean;
};

export async function patchOpportunity(
  id: string,
  body: PatchOpportunityRequest,
): Promise<ApiResult<OpportunityDetail>> {
  const r = await patchJson(`opportunities/${encodeURIComponent(id)}`, body);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseOpportunityDetail(r.status, r.json);
}

export async function postMaxbuyEvaluate(
  body: MaxbuyEvaluateRequest,
): Promise<ApiResult<MaxbuyEvaluateOk>> {
  const r = await postJson("maxbuy/evaluate", {
    contract_version: "1.0.0",
    ...body,
  });
  if (r === FETCH_FAILED) return clientTransportError();
  return parseMaxbuyEvaluate(r.status, r.json);
}

export async function postMaxbuyOverride(
  body: MaxbuyOverrideRequest,
): Promise<ApiResult<MaxbuyOverrideOk>> {
  const r = await postJson("maxbuy/overrides", {
    contract_version: "1.0.0",
    ...body,
  });
  if (r === FETCH_FAILED) return clientTransportError();
  return parseMaxbuyOverride(r.status, r.json);
}

export async function postMaxbuyPass(
  body: MaxbuyPassRequest,
): Promise<ApiResult<MaxbuyPassOk>> {
  const r = await postJson("maxbuy/passes", {
    contract_version: "1.0.0",
    ...body,
  });
  if (r === FETCH_FAILED) return clientTransportError();
  return parseMaxbuyPass(r.status, r.json);
}

export async function postMmrVin(body: MmrVinRequest): Promise<ApiResult<MmrVinOk>> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_PREFIX}/mmr/vin`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return clientTransportError();
  }
  return parseMmrVin(res.status, await readJson(res));
}

export async function postMmrYmm(body: MmrYmmRequest): Promise<ApiResult<MmrVinOk>> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_PREFIX}/mmr/ymm`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return clientTransportError();
  }
  return parseMmrYmm(res.status, await readJson(res));
}

export async function getMmrCatalogYears(): Promise<ApiResult<MmrCatalog>> {
  const r = await getJson("mmr/catalog/years");
  if (r === FETCH_FAILED) return clientTransportError();
  return parseMmrCatalog(r.status, r.json);
}

export async function getMmrCatalogMakes(year: string | number): Promise<ApiResult<MmrCatalog>> {
  const params = new URLSearchParams({ year: String(year) });
  const r = await getJson(`mmr/catalog/makes?${params.toString()}`);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseMmrCatalog(r.status, r.json);
}

export async function getMmrCatalogModels(
  year: string | number,
  make: string,
): Promise<ApiResult<MmrCatalog>> {
  const params = new URLSearchParams({ year: String(year), make });
  const r = await getJson(`mmr/catalog/models?${params.toString()}`);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseMmrCatalog(r.status, r.json);
}

export async function getMmrCatalogStyles(
  year: string | number,
  make: string,
  model: string,
): Promise<ApiResult<MmrCatalog>> {
  const params = new URLSearchParams({ year: String(year), make, model });
  const r = await getJson(`mmr/catalog/styles?${params.toString()}`);
  if (r === FETCH_FAILED) return clientTransportError();
  return parseMmrCatalog(r.status, r.json);
}
