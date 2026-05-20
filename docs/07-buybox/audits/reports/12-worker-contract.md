# Report 12 — `tav-intelligence-worker` MMR Contract (pinned)

**Punch item:** #12 · **Kit:** [`../12-worker-contract-pinning-plan.md`](../12-worker-contract-pinning-plan.md)
**Contract version:** `mmr-v1` · **Pinned:** 2026-05-20 · **Status:** Executed —
contract pinned from worker source; CI compatibility test pending (Phase 1).

**Provenance:** derived by read-only inspection of repo source. No live worker
call, no licensed payload captured. Authoritative source files:
`src/types/intelligence.ts` (Zod schemas, shared by both Workers),
`workers/tav-intelligence-worker/src/types/api.ts` (envelope),
`workers/tav-intelligence-worker/src/services/mmrLookup.ts` (envelope assembly),
`workers/tav-intelligence-worker/src/handlers/mmrVin.ts`,
`workers/tav-intelligence-worker/src/handlers/mmrYearMakeModel.ts`.

---

## 1. Key finding — the contract already exists as code

The MMR response contract MaxBuy depends on is **already a frozen Zod schema**:
`MmrResponseEnvelopeSchema` in `src/types/intelligence.ts` §3, commented
"Returned by both lookup endpoints and consumed by the Buy-Box scoring path."
It is shared verbatim by the main Worker and `tav-intelligence-worker` (the
worker's `src/validate/index.ts` re-exports it).

Item #12 therefore does not *design* a contract — it **pins the existing one**
as `mmr-v1`, records the safe-persist split, and adds a CI drift test. This
report is the pinned record.

## 2. Dependency surface

`tav-intelligence-worker` exposes two MMR endpoints. Both run the same
orchestrator (`performMmrLookup`) and return the same envelope.

| Endpoint | Method | Request schema |
|---|---|---|
| `/mmr/vin` | POST | `MmrVinLookupRequestSchema` |
| `/mmr/year-make-model` | POST | `MmrYearMakeModelLookupRequestSchema` |

Both require Cloudflare Access identity (`userContext.email` non-null) and are
reached from the main Worker over a Service Binding (not public ingress — see
`.claude-memory` 2026-05-09 service-binding cutover).

**Decision (kit §4.1):** MaxBuy depends on `MmrResponseEnvelopeSchema` as the
unit of contract. Whether MaxBuy calls the intelligence Worker directly over a
Service Binding (as the main Worker does today) or through a main-Worker
`/app/*` route is an implementation choice for Phase 1; either way the response
body is this same schema, so the pin holds. Recommendation unchanged: prefer a
single `/app/*` boundary so MaxBuy inherits one auth/version seam.

## 3. Request contract

### 3.1 `POST /mmr/vin` — `MmrVinLookupRequestSchema`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `vin` | string | yes | length 11–17 |
| `year` | int | no | 1900–2100 |
| `mileage` | int | no | 0–2,000,000 |
| `force_refresh` | boolean | no | default `false`; manager/allowlist only |
| `requested_by_user_id` / `requested_by_name` / `requested_by_email` | string | no | audit identity |

Note: VIN is the canonical year/make/model identity on the Cox side; `year` is
audit-only and is **not** forwarded to Cox.

### 3.2 `POST /mmr/year-make-model` — `MmrYearMakeModelLookupRequestSchema`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `year` | int | yes | 1900–2100 |
| `make` | string | yes | length 1–64 |
| `model` | string | yes | length 1–128 |
| `trim` | string | no | length ≤128 |
| `mileage` | int | no | 0–2,000,000 |
| `force_refresh` | boolean | no | default `false` |
| `requested_by_*` | string | no | audit identity |

## 4. Response contract

Every response is wrapped in the standard envelope (`ApiResponse<T>`,
`types/api.ts`):

| Field | Type | Notes |
|---|---|---|
| `success` | boolean | — |
| `data` | `MmrResponseEnvelope` | present when `success` |
| `error` | `{ code, message, details? }` | present when `!success` |
| `requestId` | string | — |
| `timestamp` | string (ISO) | — |

The `data` body — `MmrResponseEnvelopeSchema`:

| Field | Type | Nullable | Meaning |
|---|---|:--:|---|
| `ok` | boolean | no | `true` when `mmr_value` resolved |
| `mmr_value` | number | **yes** | `null` = no result (negative cache) |
| `mileage_used` | int ≥ 0 | no | mileage actually used (may be inferred) |
| `is_inferred_mileage` | boolean | no | `true` when mileage was inferred |
| `cache_hit` | boolean | no | served from cache vs live Manheim |
| `source` | enum | no | `manheim` \| `cache` \| `manual` |
| `fetched_at` | string (ISO) | no | upstream fetch time |
| `expires_at` | string (ISO) | **yes** | cache expiry |
| `mmr_payload` | object | optional | **licensed raw Cox payload** |
| `error_code` | string | **yes** | set on a handled miss/error |
| `error_message` | string | **yes** | human-readable miss/error |

## 5. Safe-persist field list (R18)

The MaxBuy decision-replay snapshot ([`../../03-TECHNICAL-SPEC.md`](../../03-TECHNICAL-SPEC.md)
§1.4) stores **only** the normalized scalar set below — never the raw payload.

**Safe to persist** — TAV-normalized / derived scalars, not licensed verbatim
vendor content:
`ok`, `mmr_value` (single integer), `mileage_used`, `is_inferred_mileage`,
`cache_hit`, `source`, `fetched_at`, `expires_at`, `error_code`,
`error_message`, plus the derived `valuation_method` (`vin` vs
`year_make_model`, known from the endpoint used).

**Must NOT persist into MaxBuy tables** — `mmr_payload`. It is the raw licensed
Cox/Manheim payload. MaxBuy references it by the existing
`tav.mmr_queries` / `tav.mmr_cache` rows (where the worker already stores it
inside TAV's controlled database) — MaxBuy does not re-copy it into
`tav.maxbuy_*`.

**Owner sign-off required:** confirm with the Manheim/Cox vendor terms that the
scalar `mmr_value` plus distribution columns already mirrored in
`tav.valuation_snapshots` may be retained indefinitely in a MaxBuy replay
snapshot. This is the vendor-confirmation half of punch-list item #14.

## 6. Pinned version

`intelligence_worker_contract_version = "mmr-v1"`.

Pin this literal in [`../../03-TECHNICAL-SPEC.md`](../../03-TECHNICAL-SPEC.md)
§1.4 so every MaxBuy recommendation records the contract version that produced
its MMR inputs. Bump to `mmr-v2` on any field add/remove/retype.

## 7. Compatibility-test design (build in Phase 1 CI)

- A frozen fixture file holds a representative `ApiResponse<MmrResponseEnvelope>`
  with **synthetic** numbers (no real VIN, no real MMR value).
- A test parses the fixture with `MmrResponseEnvelopeSchema` and asserts success.
- A second test asserts the schema's own field set against a pinned key list,
  so an added/removed/retyped field fails the build before MaxBuy ships.
- Lives alongside the existing worker tests; runs on every PR.
- The fixture is never a captured live payload.

## 8. Change procedure

Any change to this contract requires an ADR in `docs/01-architecture/adr/`,
consistent with the change procedure in
[`../../../03-api/intelligence-contracts.md`](../../../03-api/intelligence-contracts.md).
A change also bumps `intelligence_worker_contract_version`.

## 9. Definition of done — status

| Check | Status |
|---|---|
| Contract document committed | Done (this file) |
| `intelligence_worker_contract_version` pinned | `mmr-v1` defined here; needs landing in TECH §1.4 |
| Safe-persist field list | Done (§5); vendor sign-off pending owner (item #14) |
| Compatibility test in CI | Designed (§7); build in Phase 1 |

Remaining to fully close #12: land `mmr-v1` in TECH-SPEC §1.4 and add the CI
test. Both are Phase-1 code actions, out of scope for this pre-code phase.
