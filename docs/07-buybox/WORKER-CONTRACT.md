# MaxBuy — Intelligence Worker MMR Contract

**Contract version:** `mmr-v1` · **Pinned:** 2026-05-20  
**Status:** Pinned from source; CI compatibility test pending (Phase 1)

**Source files:** `src/types/intelligence.ts` · `workers/tav-intelligence-worker/src/services/mmrLookup.ts`

Companion: [`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md) §1.4 (replay pins) · Full pre-code report: [`archive/pre-code/audits/reports/12-worker-contract.md`](archive/pre-code/audits/reports/12-worker-contract.md)

---

## Dependency surface

Two endpoints, same response envelope (`MmrResponseEnvelopeSchema`):

| Endpoint | Method | Request schema |
|---|---|---|
| `/mmr/vin` | POST | `MmrVinLookupRequestSchema` |
| `/mmr/year-make-model` | POST | `MmrYearMakeModelLookupRequestSchema` |

MaxBuy should call through the main Worker's `/app/*` boundary (same schema, one auth seam).

---

## Request — VIN lookup

| Field | Required | Notes |
|---|---|---|
| `vin` | yes | length 11–17 |
| `mileage` | no | 0–2,000,000 |
| `year` | no | audit only; not forwarded to Cox |
| `force_refresh` | no | manager/allowlist only |

---

## Response envelope

`ApiResponse<MmrResponseEnvelope>` — fields in `data`:

| Field | Nullable | Meaning |
|---|---|---|
| `ok` | no | `true` when `mmr_value` resolved |
| `mmr_value` | yes | `null` = no result |
| `mileage_used` | no | may be inferred |
| `is_inferred_mileage` | no | badge when inferred |
| `cache_hit` | no | cache vs live Manheim |
| `source` | no | `manheim` \| `cache` \| `manual` |
| `fetched_at` | no | ISO timestamp |
| `expires_at` | yes | cache expiry |
| `mmr_payload` | optional | **licensed — do not persist in maxbuy tables** |
| `error_code` / `error_message` | yes | on miss/error |

---

## Safe-persist list (MaxBuy snapshots)

**Persist:** `ok`, `mmr_value`, `mileage_used`, `is_inferred_mileage`, `cache_hit`, `source`, `fetched_at`, `expires_at`, `error_code`, `error_message`, plus derived `valuation_method` (`vin` vs `year_make_model`).

**Never persist in `tav.maxbuy_*`:** `mmr_payload` (reference existing `tav.mmr_queries` / `tav.mmr_cache` rows instead).

Record `intelligence_worker_contract_version = "mmr-v1"` on every recommendation. Bump to `mmr-v2` on any schema change (requires ADR).

---

## Phase 1 CI test (not yet built)

1. Frozen fixture with synthetic MMR values (no real VIN/payload)
2. Parse with `MmrResponseEnvelopeSchema`
3. Assert pinned field list — drift fails the build

Change procedure: ADR in `docs/01-architecture/adr/` + bump contract version.
