# Cox/Manheim Wholesale-Valuations API Integration

**Status:** Production-bound Cox Storefront integration, implemented on main
through PR #50 for Issue #45.
**Chosen path:** Cox Storefront
`/wholesale-valuations/vehicle/mmr-lookup/*` for catalog metadata and
`/wholesale-valuations/vehicle/mmr/search/*` for YMM valuation.
**Not chosen:** legacy Manheim `/valuations/*`; production probing classified it
as not provisioned for this account.
**Implementation home:** `workers/tav-intelligence-worker/src/clients/manheimHttp.ts`

---

## 1. Production account facts

| Field | Value |
|---|---|
| OAuth server | Bridge 2 |
| Application type | server_to_server |
| Grant type | `client_credentials` |
| Scope | `wholesale-valuations.vehicle.mmr-ext.get` (single value, no spaces) |
| Token URL | `https://authorize.coxautoinc.com/oauth2/.../v1/token` (exact path is per-app — copy from the Cox app detail page; do not guess) |
| MMR API base | production Cox Storefront wholesale-valuations base ending in `/wholesale-valuations/vehicle/mmr` |
| Catalog path family | `/mmr-lookup/*` |
| Valuation path family | `/search/*` |
| Required headers (lookup) | `Accept: application/vnd.coxauto.v1+json`, `Content-Type: application/vnd.coxauto.v1+json` |

> **Do not use the `title-services` sample scope** that appears in some Cox docs.
> The MMR sandbox issues tokens only for `wholesale-valuations.vehicle.mmr-ext.get`.
> A wrong scope returns `400 invalid_scope`.

---

## 2. OAuth — `client_credentials` flow

Cox Bridge 2 follows OAuth 2.0 §4.4 with **HTTP Basic** for client authentication.

**Request:**

```
POST https://authorize.coxautoinc.com/oauth2/.../v1/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=wholesale-valuations.vehicle.mmr-ext.get
```

**Rules:**

- Credentials go in the `Authorization: Basic` header. **Never in the body.**
- Body is form-encoded. `scope` is space-delimited if multi-value (we use one value).
- For `client_credentials`, **never send `username` or `password`.**
- Legacy Manheim password grant remains supported in code as a fallback for old accounts.

**Successful response (200):**

```json
{
  "access_token": "...",
  "token_type":   "Bearer",
  "expires_in":   3600,
  "scope":        "wholesale-valuations.vehicle.mmr-ext.get"
}
```

**Error responses we map:**

| HTTP | Body shape | Mapped error |
|---|---|---|
| 400 | `{"error":"invalid_scope"}` | `ManheimAuthError` (log includes `error_code: "invalid_scope"`) |
| 401 | invalid client | `ManheimAuthError` |
| 5xx | upstream failure | `ManheimUnavailableError` (retried) |
| network | fetch threw | `ManheimUnavailableError` (retried) |

---

## 3. MMR endpoints

All lookup requests carry:

```
Authorization: Bearer <access_token>
Accept:        application/vnd.coxauto.v1+json
Content-Type:  application/vnd.coxauto.v1+json
```

`MANHEIM_MMR_URL` is set to the full Cox Storefront base ending in
`/wholesale-valuations/vehicle/mmr`. Code appends path segments from that base:

| Function | Method | Path appended | Phase |
|---|---|---|---|
| Single VIN | GET | `/vin/{vin}` | this phase |
| Catalog years | GET | `/mmr-lookup/years` | implemented |
| Catalog makes | GET | `/mmr-lookup/years/{year}/makes` | implemented |
| Catalog models | GET | `/mmr-lookup/years/{year}/makes/{make}/models` | implemented |
| Catalog trims/styles | GET | `/mmr-lookup/years/{year}/makes/{make}/models/{model}/trims` | implemented |
| YMMT valuation | GET | `/search/{year}/{makename}/{modelname}/{bodyname}` | implemented (trim + odometer gated) |

**Trim gating:** the YMMT endpoint requires `bodyname` (trim) as a path segment.
`ManheimHttpClient.lookupByYmm` short-circuits to a null envelope (`mmr_value: null`,
no fetch, log `manheim.http.skipped { reason: "cox_ymm_requires_trim" }`) when trim
is missing or whitespace-only and vendor=cox.

**Mileage gating:** app-facing YMM valuation requires finite odometer mileage before
the vendor call. A selected Year/Make/Model/Style without mileage is identity only.

### 3a. Query parameters (Cox MMR 1.4)

Both `/vin/{vin}` and `/search/...` accept the same query params. Code currently
sends `odometer`, optional `zipCode`, optional `evbh`, and optional `include`.

| Param | Notes |
|---|---|
| `odometer` | Sent from the existing `mileage` arg on `lookupByVin`/`lookupByYmm` when ≥0 and finite. |
| `zipCode` | Optional. Five-digit ZIP. Spelled `zipCode`, NOT `zip`. Sent only when caller passes it (whitespace-trimmed). |
| `include` | Comma-list of `retail`, `forecast`, `historical`, `ci`. Built from env flags (see §5). On Search/YMMT, `ci` is dropped — the MMR Lookup guide documents it as unsupported there. |
| `evbh` | Electric-Vehicle Battery Health. Validated to integer in `[75, 100]` inclusive; out-of-range values are dropped silently. |
| `region`, `color`, `grade`, `date`, `extendedCoverage`, `orgId`, `excludeBuild` | Documented by the Cox guide; not yet plumbed through the client. Add via `appendCoxQueryParams` when a use case lands. |

### 3b. Batch endpoint

`POST {MANHEIM_MMR_URL_BATCH}/vins` (separate base
`https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr-batch`) supports
up to 100 VINs per call. Not yet wired into ingest; deferred until a batch use case
is identified.

---

## 4. Production verification items

Production probing already chose Cox Storefront over legacy `/valuations/*`.
Before enabling any new surface, validate through the server-side Worker path only:

1. Token can be fetched with production credentials.
2. Catalog years/makes/models/trims return non-empty metadata.
3. YMM valuation requires style/bodyname and odometer before the vendor call.
4. `401`, `403`, `596`, and `invalid_scope` degrade to not-provisioned /
   unavailable state, never fake catalog data.
5. Logs and PR/issue comments contain only classifications and shape metadata,
   never secrets or licensed valuation figures.

Tests guard the URL templates, query params, and headers so any product-guide-driven
correction surfaces as a unit-test failure before deploy.

---

## 5. `include` flag configuration

Set as wrangler secrets on the intelligence worker (string `"true"` enables, anything
else — including absent — leaves the flag off):

| Env var | Token added | Notes |
|---|---|---|
| `MANHEIM_INCLUDE_RETAIL` | `retail` | Returns `adjustedPricing.retail.{above,average,below}`. Parser maps to `retailClean` / `retailAvg` / `retailRough` on `ValuationResult`. |
| `MANHEIM_INCLUDE_FORECAST` | `forecast` | Returns `forecast` field on the response. Parsed by `src/valuation/manheimMarketContextParser.ts` → `projectedAverage` on `/app/mmr/*`. |
| `MANHEIM_INCLUDE_HISTORICAL` | `historical` | Returns `historicalAverages`. Parsed by `manheimMarketContextParser.ts` → `historicalAverages` on `/app/mmr/*`. |
| `MANHEIM_INCLUDE_CI` | `ci` | Returns `confidenceInterval` data on VIN lookups only. **Stripped from Search/YMMT calls** because the MMR Lookup guide documents `include=ci` as unsupported there. |

**Default** when no flags are set: no `include=` query param at all (conservative —
request the minimum).

The token names `retail`, `forecast`, `historical`, and `ci` are confirmed by the
Cox MMR Valuations guide. `ci` is documented as unsupported on Search/YMMT and is
stripped from the include list there. Validate any newly enabled include flag
through a minimal production smoke before exposing its fields in the UI.

### Auction transaction rows (Manheim Transactions / Zone C2)

Per-sale wholesale auction comps appear on the Cox MMR payload when Cox returns them
(typically under `transactions`, `auctionTransactions`, or similar array keys on the
valuation item). There is **no separate `include=` token** for transactions in the
Cox MMR Valuations guide — rows may ride along with `historical` or depend on account
entitlements.

**TAV wiring (2026-06):**

| Layer | Behavior |
|---|---|
| Intel worker | Requests `include=historical,forecast` when `MANHEIM_INCLUDE_*` flags are on (`wrangler.toml` staging/prod). |
| Parser | `src/valuation/manheimMarketContextParser.ts` maps known transaction array keys → `MmrTransaction[]`. |
| App API | `mapIntelMmrEnvelopeToAppData` in `src/app/routes.ts` forwards `transactions` when non-empty. |
| UI | `/mmr-lab` Zone C2 **Manheim Transactions** table renders rows or an honest empty state. |

**Empty table diagnosis:** If historical/forecast populate but `transactions` is `[]`,
compare the raw Cox payload for the same VIN in the native Manheim MMR UI:

1. **API absent** — Cox omits transaction arrays for this account/VIN (common on
   Valuations API; not a frontend bug). Document and track with Cox support.
2. **Parser gap** — Cox returns rows under an unmapped key. Capture a redacted payload
   sample and extend `TRANSACTION_ARRAY_KEYS` / `mapTransactionRow` in the parser.
3. **Dropped in transit** — Rare; confirm `mmr_payload` on the intel worker response
   still contains the array before blaming the web client.

Do **not** substitute MarketCheck or retail listing data for Manheim sold comps
(DEC-MLB-3).

**Staging smoke (2026-06-12):** VIN lookup with `include=historical,forecast`
returned `historicalAverages` + `forecast` on every payload item but **zero**
transaction-array keys (`transactions`, `auctionTransactions`, etc.). Treat empty
Manheim Transactions table as Cox API/account entitlement until Cox confirms a
separate include or endpoint for per-sale rows.

---

## 6. Logging hygiene (hard rules)

The following must **never** appear in any log line, structured field, or error message:

- `Authorization` header value
- `Basic ` prefix or any base64 of `client_id:client_secret`
- `client_secret` value
- `username` value (legacy)
- `password` value (legacy)
- `access_token` value
- Any other bearer/basic credential material

Existing redaction tests in `manheimHttp.test.ts` enforce this. New tests extend the assertion to cover the Basic header.

Allowed structured fields: `requestId`, `grant_type`, `status`, `error_category`, `error_code`, `attempts`, `latency_ms`, `expires_in`, `vendor`, `kpi`, `mmr_value`.

---

## 7. Environment configuration

| Env var | Value | Source |
|---|---|---|
| `MANHEIM_API_VENDOR` | `cox` | wrangler secret |
| `MANHEIM_GRANT_TYPE` | `client_credentials` | wrangler secret |
| `MANHEIM_SCOPE` | `wholesale-valuations.vehicle.mmr-ext.get` | wrangler secret |
| `MANHEIM_CLIENT_ID` | (from Cox app detail) | wrangler secret |
| `MANHEIM_CLIENT_SECRET` | (from Cox app detail) | wrangler secret |
| `MANHEIM_TOKEN_URL` | `https://authorize.coxautoinc.com/oauth2/.../v1/token` | wrangler secret |
| `MANHEIM_MMR_URL` | production Cox Storefront MMR base ending in `/wholesale-valuations/vehicle/mmr` | wrangler secret |
| `MANHEIM_USERNAME` | — | not required for client_credentials |
| `MANHEIM_PASSWORD` | — | not required for client_credentials |
| `MANHEIM_INCLUDE_RETAIL` | `false` (default) | wrangler secret; `"true"` opts in |
| `MANHEIM_INCLUDE_FORECAST` | `false` (default) | wrangler secret; `"true"` opts in |
| `MANHEIM_INCLUDE_HISTORICAL` | `false` (default) | wrangler secret; `"true"` opts in |
| `MANHEIM_INCLUDE_CI` | `false` (default) | wrangler secret; `"true"` opts in (VIN only — stripped on Search/YMMT) |

---

## 8. Related documents

- `archive/2026-05-mvp/uat-staging/manheim-uat-validation-plan.md` — historical staging/UAT test matrix and pass/fail gates.
- `archive/2026-05-doc-consolidation/manheim-integration-architecture.md` — overall layered architecture (vendor-agnostic).
- `archive/2026-05-doc-consolidation/manheim-runtime-behavior.md` — runtime request flow.
- `docs/04-operations/runbook.md` — staging deploy sequence and provisioning commands.
