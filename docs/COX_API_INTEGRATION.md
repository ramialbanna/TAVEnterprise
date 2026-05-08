# Cox/Manheim Wholesale-Valuations API Integration

**Status:** Sandbox access provisioned 2026-05-08 for the TAV Evaluation app.
**Replaces:** Legacy `uat.api.manheim.com/valuations` integration (account not provisioned for that path).
**Implementation home:** `workers/tav-intelligence-worker/src/clients/manheimHttp.ts`

---

## 1. Sandbox account facts

| Field | Value |
|---|---|
| OAuth server | Bridge 2 |
| Application type | server_to_server |
| Grant type | `client_credentials` |
| Scope | `wholesale-valuations.vehicle.mmr-ext.get` (single value, no spaces) |
| Token URL | `https://authorize.coxautoinc.com/oauth2/.../v1/token` (exact path is per-app — copy from the Cox app detail page; do not guess) |
| MMR API base | `https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr` (note trailing `/mmr` — per MMR 1.4 spec) |
| Endpoints enabled | see §3 below — MMR 1.4 endpoints |
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

## 3. MMR 1.4 endpoints

All lookup requests carry:

```
Authorization: Bearer <access_token>
Accept:        application/vnd.coxauto.v1+json
Content-Type:  application/vnd.coxauto.v1+json
```

`MANHEIM_MMR_URL` is set to the full base ending in `/mmr` —
`https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr`.
Code appends path segments per the MMR 1.4 OpenAPI:

| Function | Method | Path appended | Phase |
|---|---|---|---|
| Single VIN | GET | `/vin/{vin}` | this phase |
| VIN + subseries | GET | `/vin/{vin}/{subseries}` | deferred |
| VIN + subseries + transmission | GET | `/vin/{vin}/{subseries}/{transmission}` | deferred |
| YMMT (short form) | GET | `/search/{year}/{makename}/{modelname}/{bodyname}` | this phase (trim-gated) |
| YMMT (long form) | GET | `/search/years/{year}/makes/{makename}/models/{modelname}/trims/{bodyname}` | deferred |
| Reference (colors) | GET | `/colors` | deferred |
| Reference (edition) | GET | `/edition` | deferred |
| Reference (grades) | GET | `/grades` | deferred |
| Reference (regions) | GET | `/regions`, `/regions/auction/id/{auction_id}`, `/regions/id/{region_id}` | deferred |

**Trim gating:** the YMMT endpoint requires `bodyname` (trim) as a path segment.
`ManheimHttpClient.lookupByYmm` short-circuits to a null envelope (`mmr_value: null`,
no fetch, log `manheim.http.skipped { reason: "cox_ymm_requires_trim" }`) when trim
is missing or whitespace-only and vendor=cox.

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

## 4. Open verification items (before first live call)

Resolved by the MMR 1.4 guide (no longer open):
- `odometer` is supported on both `/vin/{vin}` and `/search/...` — code now sends it.
- Response shape is documented and parsed via `extractManheimDistribution`
  (`adjustedPricing.wholesale.{above,average,below}`, `adjustedPricing.retail.{above,average,below}`,
  `sampleSize`).
- Endpoint paths and methods are confirmed.

Still open:

1. **Token URL exact path** — copy the full URL from the Cox app detail page; the
   `.../oauth2/<authServerId>/v1/token` segment is account-scoped.
2. **`bodyname` format coupling** — `normalizeMmrParams` returns trim pass-through
   (no alias table). Listing-source trim values may not match Cox's accepted
   `bodyname` strings. The future plan is to use Cox's `mmr-lookup` endpoints
   as the source-of-truth for make/model/trim alias data; tracked in
   `docs/followups.md`.
3. **Subseries / transmission disambiguation** — deferred; the bare `/vin/{vin}`
   variant ships in this phase.
4. **Long-form YMMT path** (`/search/years/.../makes/...`) — deferred in favor of
   the short form `/search/{year}/{make}/{model}/{bodyname}`.

Tests guard the URL templates, query params, and headers so any product-guide-driven
correction surfaces as a unit-test failure before deploy.

---

## 5. `include` flag configuration

Set as wrangler secrets on the intelligence worker (string `"true"` enables, anything
else — including absent — leaves the flag off):

| Env var | Token added | Notes |
|---|---|---|
| `MANHEIM_INCLUDE_RETAIL` | `retail` | Returns `adjustedPricing.retail.{above,average,below}`. Parser maps to `retailClean` / `retailAvg` / `retailRough` on `ValuationResult`. |
| `MANHEIM_INCLUDE_FORECAST` | `forecast` | Returns `forecast` field on the response. Not yet read by the parser. |
| `MANHEIM_INCLUDE_HISTORICAL` | `historical` | Returns `historicalAverages`. Not yet read by the parser. |
| `MANHEIM_INCLUDE_CI` | `ci` | Returns `confidenceInterval` data on VIN lookups only. **Stripped from Search/YMMT calls** because the MMR Lookup guide documents `include=ci` as unsupported there. |

**Default** when no flags are set: no `include=` query param at all (conservative —
request the minimum).

The token names `retail`, `forecast`, `historical`, and `ci` are confirmed by the
Cox MMR Valuations guide. `ci` is documented as unsupported on Search/YMMT and is
stripped from the include list there. End-to-end sandbox behavior (which response
sections each flag actually returns, and the exact 4xx code for an unsupported
combination) still needs validation against a live sandbox call before going live.

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

| Env var | Value (sandbox) | Source |
|---|---|---|
| `MANHEIM_API_VENDOR` | `cox` | wrangler secret |
| `MANHEIM_GRANT_TYPE` | `client_credentials` | wrangler secret |
| `MANHEIM_SCOPE` | `wholesale-valuations.vehicle.mmr-ext.get` | wrangler secret |
| `MANHEIM_CLIENT_ID` | (from Cox app detail) | wrangler secret |
| `MANHEIM_CLIENT_SECRET` | (from Cox app detail) | wrangler secret |
| `MANHEIM_TOKEN_URL` | `https://authorize.coxautoinc.com/oauth2/.../v1/token` | wrangler secret |
| `MANHEIM_MMR_URL` | `https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr` | wrangler secret |
| `MANHEIM_USERNAME` | — | not required for client_credentials |
| `MANHEIM_PASSWORD` | — | not required for client_credentials |
| `MANHEIM_INCLUDE_RETAIL` | `false` (default) | wrangler secret; `"true"` opts in |
| `MANHEIM_INCLUDE_FORECAST` | `false` (default) | wrangler secret; `"true"` opts in |
| `MANHEIM_INCLUDE_HISTORICAL` | `false` (default) | wrangler secret; `"true"` opts in |
| `MANHEIM_INCLUDE_CI` | `false` (default) | wrangler secret; `"true"` opts in (VIN only — stripped on Search/YMMT) |

---

## 8. Related documents

- `docs/manheim-uat-validation-plan.md` — staging UAT test matrix and pass/fail gates.
- `docs/MANHEIM_INTEGRATION_ARCHITECTURE.md` — overall layered architecture (vendor-agnostic).
- `docs/MANHEIM_RUNTIME_BEHAVIOR.md` — runtime request flow.
- `docs/RUNBOOK.md` — staging deploy sequence and provisioning commands.
