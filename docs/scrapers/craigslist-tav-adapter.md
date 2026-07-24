# Craigslist ingest — TAV adapter & scraper integration

**Created:** 2026-07-23  
**Tracker:** [`NEXT_STEPS.md`](../NEXT_STEPS.md) item **63**  
**Scraper repo contract (external):** [`README.md`](README.md) — envelope, HMAC, §8.2 item schema  
**Implementation plan template:** [`../05-process/plan-prompts/01-add-source-adapter.md`](../05-process/plan-prompts/01-add-source-adapter.md)

Read this doc first in a fresh chat when building item **63**. It captures TAV-side state as of 2026-07-23 so you do not re-derive wiring from the codebase.

---

## 1. Goal

Bring **scheduled Craigslist scraper** listings into the same pipeline as Facebook:

`POST /ingest` → raw → **source adapter** → normalized → dedupe → MMR → scoring → leads → Opportunities queue.

The scraper is expected to run on a **schedule** and POST batches to the Worker (not via the Apify Facebook webhook).

---

## 2. Current state (2026-07-23)

| Layer | Craigslist ready? | Notes |
|-------|-------------------|--------|
| Ingest envelope | **Yes** | `IngestRequestSchema` accepts `source: "craigslist"` (`src/validate.ts`) |
| DB constraints | **Yes** | `normalized_listings.source`, leads, buy-box rules include `craigslist` |
| Product UI | **Yes** | Labels, manual submit source, opportunity filters |
| Scoring | **Yes** | `computeSourceConfidenceScore`: **70** (vs Facebook **65**) |
| Buy box seed | **Yes** | Default + truck rules include `craigslist` (`0006_buy_box_seed.sql`) |
| **Source adapter** | **No** | Only `src/sources/facebook.ts` exists |
| **Ingest routing** | **No** | Non-Facebook → `unsupported_source` (`handleIngest.ts`) |
| Apify webhook | **N/A** | `APIFY_TASK_REGION_MAP` is Facebook-only; CL uses **`POST /ingest`** |
| LLM Y/M/M/S prefetch | **No** | `buildLlmYmmsPrefetchInputs` returns empty unless `source === "facebook"` |
| URL parse (manual intake) | **Partial** | `detectListingSource` recognizes CL URLs; live parse is Facebook-only |
| **Production data** | **None observed** | Supabase query 2026-07-23: zero `raw_listings` / `source_runs` / `filtered_out` with `source = craigslist` |

### What happens if the scraper POSTs today

1. HMAC + envelope validate → **200** (if auth/region/items OK).
2. Each item: `insertRawListing` → adapter → **`unsupported_source`** → `filtered_out`, **`rejected++`**.
3. Response: **`processed: 0`**, **`rejected: N`** (documented in scraper README §11).

This is **not** a scraper bug until the TAV adapter ships.

---

## 3. Integration path (locked)

```text
[Craigslist scraper on schedule]
        │
        │  POST /ingest
        │  Header: x-tav-signature (HMAC-SHA256 of body)
        │  Body: { source, run_id, region, scraped_at, items[] }
        ▼
tav-aip-production (or staging first)
        │
        ├─ ingestCore (src/ingest/handleIngest.ts)
        ├─ parseCraigslistItem (TO BUILD — src/sources/craigslist.ts)
        └─ same downstream as Facebook (dedupe, MMR, leads, …)
```

**Not in scope for v1:** Apify task mapping, `/apify-webhook` changes, unless ops later runs CL through Apify with a custom forwarder.

### Ingest URLs

| Environment | URL |
|-------------|-----|
| Staging (soak first) | `https://tav-aip-staging.rami-1a9.workers.dev/ingest` |
| Production | `https://tav-aip-production.rami-1a9.workers.dev/ingest` |

Health (no auth): `GET …/health` → `{ "ok": true, "service": "tav-enterprise", … }`.

### Auth

- Worker secret: **`WEBHOOK_HMAC_SECRET`** (Cloudflare secret on `tav-aip-*`).
- Scraper signs the **exact JSON body**; mismatch → **401 unauthorized**.
- Do not commit secrets; scraper repo uses `.env` locally.

---

## 4. Envelope contract (scraper → TAV)

From `IngestRequestSchema` + scraper README §5:

| Field | Type | Rules |
|-------|------|--------|
| `source` | `"craigslist"` | Required |
| `run_id` | string | 1–128 chars; idempotent per `(source, run_id)` once run completes |
| `region` | `RegionKey` | Must be one of `REGION_KEYS` in `src/types/domain.ts` |
| `scraped_at` | ISO datetime | Zulu |
| `items` | array | 1–500 entries (`MAX_INGEST_ITEMS`); opaque JSON per item until adapter runs |

### Valid `region` values (TAV)

`dallas_tx` · `houston_tx` · `austin_tx` · `san_antonio_tx` · `lubbock_tx` · `oklahoma_city_ok`

Scraper README §9.4 example subdomain → region mapping (e.g. `dallas.craigslist.org` → `dallas_tx`). **Each scheduled job must set `region` explicitly** in the envelope — scoring and buy box are region-aware.

---

## 5. Per-item schema (scraper contract — §8.2)

Adapter should accept the canonical scraper shape and map to `NormalizedListingInput`.

### Required for adapter success (mirror Facebook gates where sensible)

| Field | Notes |
|-------|--------|
| `url` | Canonical listing URL |
| `title` | Min ~6 chars after normalize |
| `year` | **2000–2035** (Facebook adapter rejects outside; keep aligned) |
| `make` | Lowercase normalized |
| `model` | Lowercase normalized |

### Strongly recommended (MMR + item 62 mirror)

| Field | Maps to |
|-------|---------|
| `price` | integer dollars |
| `mileage` | integer miles — **do not invent** (item **54**) |
| `trim` | normalized trim/style hint |
| `vin` | optional; use when page has it |
| `source_listing_id` | CL post ID from URL (dedupe / identity) |
| `city`, `state` | seller location |
| `posted_at` | ISO seller post time |
| `images` | string[] — CL CDN URLs (item **62** gallery) |
| `body_text` | full description → `description` on normalized row |
| `seller_name`, `seller_type` | optional metadata |

Example payload: scraper README §8.2 (JSON block).

**Scraper rule:** do not pre-filter “buyable” in the scraper; send in-scope passenger vehicles; Worker applies buy box + scoring.

---

## 6. TAV implementation checklist (item 63)

### 6.1 New files

| File | Purpose |
|------|---------|
| `src/sources/craigslist.ts` | `parseCraigslistItem(item, ctx)` → `AdapterResult`; optional `detectCraigslistDrift` |
| `test/craigslist.adapter.test.ts` | Fixture-driven unit tests |
| `test/fixtures/craigslist/*.json` | ≥3 real-shaped items from scheduled scraper output |

Reference implementation: **`src/sources/facebook.ts`** (price parse, YMM from title vs structured fields, reject reason codes).

### 6.2 Modify

| File | Change |
|------|--------|
| `src/ingest/handleIngest.ts` | Route `source === "craigslist"` to `parseCraigslistItem`; optional drift logging |
| `test/ingest.test.ts` | At least one happy-path CL item → `processed > 0` |

No change to `IngestRequestSchema` or `SourceName` union — already includes `craigslist`.

### 6.3 Out of scope for adapter v1 (follow-ups)

| Topic | Notes |
|-------|--------|
| Item **57** LLM on CL | Extend prefetch + listing text from `body_text` (like item **60**) |
| `parseListingUrl` for CL | Manual intake fetch/parse — separate from ingest |
| Lead scoring tuning | Source confidence already 70; revisit after volume |
| Cross-source dedupe | Same identity key rules as Facebook |

### 6.4 Field mapping → `NormalizedListingInput`

| Scraper field | `NormalizedListingInput` |
|---------------|----------------------------|
| `url` | `url` |
| `source_listing_id` | `sourceListingId` |
| `title`, `year`, `make`, `model`, `trim` | same semantics as Facebook |
| `price`, `mileage`, `vin` | same |
| `city`, `state` | same |
| `posted_at` | `postedAt` |
| `images` | `images` |
| `body_text` | `description` (column exists post migration **0067**) |
| `seller_name` | `sellerName` |
| — | `source: "facebook"` → **`"craigslist"`** |
| — | `region`, `scrapedAt` from `AdapterContext` |

---

## 7. Downstream behavior (same as Facebook after adapter)

```text
parseCraigslistItem ok
  → upsertNormalizedListing (RPC includes description, images, seller, …)
  → setNormalizedListingEntryMethod(..., "scraper") when new
  → computeIdentityKey / vehicle_candidates
  → resolveListingToCatalogForIngest + MMR (worker mode)
  → buy box + hybrid scoring
  → upsertLead when grade ≠ pass
```

- **LLM Y/M/M/S:** off for CL until explicitly wired; offline matcher + catalog suggestions still apply.
- **Item 62 mirror:** once `images` + `description` persist, detail API already exposes `listingImages` / `listingDescription` (source-agnostic).

---

## 8. Verification

### 8.1 Before adapter (scraper-only)

- `DRY_RUN=true` → valid envelopes in `out/` per scraper README §13 Phase A.
- `npm run smoke:ingest` (scraper repo) → **200**, not **401**.

### 8.2 After adapter

| Step | Pass |
|------|------|
| Staging POST with 1–3 §8.2 items | `processed > 0`, `rejected` only on bad fixtures |
| Supabase | `normalized_listings` rows with `source = craigslist` |
| Ingest Monitor / `source_runs` | `status = completed`, counts match |
| Opportunities | Near-miss/lead rows with source **Craigslist** when economics pass |
| Re-post same `run_id` | Idempotent 200, no duplicate processing |

### 8.3 SQL sanity (post-soak)

```sql
SELECT COUNT(*) FROM tav.normalized_listings WHERE source = 'craigslist';
SELECT reason_code, COUNT(*) FROM tav.filtered_out WHERE source = 'craigslist' GROUP BY 1;
```

---

## 9. Ops / product notes

- **Volume:** 500 items max per POST; batch wall clock same as Facebook (`BATCH_TIMEOUT_MS` in `handleIngest.ts`). CL without LLM is lighter per item.
- **Scheduled scraper:** Confirm production posts to **`tav-aip-production`** with correct **`region`** per market (Dallas vs Oklahoma vs Houston, etc.).
- **No Craigslist in Supabase yet (2026-07-23):** verify scraper `DRY_RUN`, `INGEST_URL`, and HMAC before blaming TAV.
- **Facebook Apify:** unrelated path; do not add CL tasks to `APIFY_TASK_REGION_MAP` unless product explicitly wants Apify-mediated CL.

---

## 10. Related docs & code

| Resource | Path |
|----------|------|
| External scraper bootstrap | `docs/scrapers/README.md` |
| System overview (adapter slot) | `docs/01-architecture/system-overview.md` |
| Ingest handler | `src/ingest/handleIngest.ts` |
| Facebook reference adapter | `src/sources/facebook.ts` |
| Manual URL source detect | `src/manual/listingSource.ts` |
| Item 62 listing mirror | `NEXT_STEPS.md` §62 |
| Item 54 no invented miles | `NEXT_STEPS.md` §54 |

---

## 11. Exit criteria (item 63)

- [ ] `parseCraigslistItem` + tests + fixtures merged
- [ ] `handleIngest` routes `craigslist`; Facebook behavior unchanged
- [ ] Staging soak: scheduled scraper (or manual POST) → `processed > 0`, normalized rows visible
- [ ] Production enable after staging metrics acceptable
- [ ] This doc updated with ship date, sample `run_id`, and any scraper↔adapter field deltas discovered in soak
