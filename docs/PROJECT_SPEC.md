# TAV Marketplace — Complete Project Specification
> Generated: 2026-05-02 | Version: v1.5.0 | Author: Claude Code

---

## 1. PROJECT OVERVIEW

**Project name:** TAV Marketplace Lead Aggregator

**Purpose and business objective:**
Texas Auto Value (TAV) acquires used vehicles below wholesale market value. This system automates sourcing by continuously scraping Facebook Marketplace vehicle listings across Texas and Oklahoma, enriching each listing with Manheim Market Report (MMR) wholesale valuations, scoring the deal quality, and surfacing the best opportunities to operators via a mobile AppSheet dashboard.

**Problem it solves:**
Manual FB Marketplace browsing is slow, inconsistent, and misses time-sensitive deals. This pipeline runs every 10 minutes, evaluates every listing against wholesale auction data, and alerts operators to underpriced vehicles before competitors act.

**Target users:**
- Vehicle acquisition operators at TAV who review and pursue leads
- Operations managers monitoring pipeline health

**Core features:**
- Automated FB Marketplace scraping across 4 geographic regions (TX East, TX South, TX West, OK)
- Deduplication via SHA-1 fingerprint (mileage bucket + price bucket + YMM + city)
- Relist detection — same vehicle re-listed under a new listing ID
- Manheim MMR enrichment (VIN-first, YMM fallback via search endpoint)
- Deal grading: steal / great / good / fair / pass / unknown
- Composite deal score (0–100) incorporating MMR delta, days on market, relist count, price drops
- Mobile AppSheet dashboard with color-coded deal grades and direct FB links
- Ops dashboard showing pipeline health metrics

---

## 2. SYSTEM ARCHITECTURE

### Full data flow (text diagram)

```
┌─────────────────────────────────────────────────────────────────┐
│  APIFY CLOUD (4 tasks, staggered 10-min crons)                 │
│  Actor: raidr-api~facebook-marketplace-vehicle-scraper          │
│  Regions: TX-East, TX-South, TX-West, OK                       │
└─────────────────┬───────────────────────────────────────────────┘
                  │ Apify dataset (raw FB items, fetchDetailedItems:true)
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  MAKE.COM SCENARIO (triggered by Apify Watch Run)              │
│  Module 1: Apify Watch Run (trigger)                           │
│  Module 2: Log Run Start → tav.log_run_start() RPC             │
│  Module 3: Apify Get Dataset Items                             │
│  Module 4: Iterator                                            │
│  Module 5: Filter (is_vehicle = true, price > 0)              │
│  Module 6: HTTP POST → Cloudflare Worker /normalize            │
│  Module 7: Router                                              │
│    Branch YES: Supabase RPC → tav.upsert_listing()             │
│    Branch NO:  Supabase RPC → tav.log_dead_letter()            │
│  Module 8: Log Scenario End → tav.log_scenario_end() RPC       │
└─────────────────┬───────────────────────────────────────────────┘
                  │ Normalized payload (JSON)
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE WORKER: tav-normalizer (v1.5.0)                    │
│  URL: https://tav-normalizer.rami-1a9.workers.dev/normalize     │
│  - Transforms raw Apify item → validated normalized payload     │
│  - Extracts year from title regex if vehicle_year absent        │
│  - Extracts VIN from title/description                          │
│  - Computes SHA-1 fingerprint for dedup                         │
│  - Cache-hit: enriches inline with MMR (synchronous)            │
│  - Cache-miss: ships payload immediately, fires MMR via         │
│    ctx.waitUntil() (async, non-blocking)                        │
└─────────────────┬───────────────────┬───────────────────────────┘
                  │ upsert_listing()   │ upsert_mmr_async() (background)
                  ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  SUPABASE POSTGRESQL (schema: tav)                              │
│  Project: cotczqpmpbzguepogzfd.supabase.co                      │
│  Tables: listings, listings_history, fingerprints,              │
│          relisted_events, price_changes, lead_state,            │
│          config, config_kv, run_metrics, scenario_metrics,      │
│          dead_letter, mmr_retry_queue, drift_snapshots          │
│  Views:  v_deal_inbox, v_active_inbox, v_ops_dashboard,         │
│          v_motivated_sellers, v_ops_by_cluster, and others      │
└─────────────────┬───────────────────────────────────────────────┘
                  │ Direct PostgreSQL connection (port 5432, SSL)
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  APPSHEET (mobile + web dashboard)                              │
│  Views: Deal Inbox, All Listings, Pipeline Health              │
│  Color-coded by deal_grade, links to FB listing                │
└─────────────────────────────────────────────────────────────────┘
```

### MMR enrichment sub-flow

```
normalizer receives listing with mileage
         │
         ├─ Check in-memory MMR cache (TTL: 24h)
         │     └─ HIT: enrich inline, ship immediately
         │
         └─ MISS: ship payload as deal_grade='unknown'
                  │
                  └─ ctx.waitUntil(enqueueMmrAsync())
                           │
                           ├─ 1. Get Manheim OAuth2 token (cached 50min)
                           │     POST /oauth2/token.oauth2
                           │     Basic base64(client_id:client_secret)
                           │     grant_type=password
                           │
                           ├─ 2. Try VIN lookup (if VIN extracted)
                           │     GET /valuations/vin/{VIN}?odometer={miles}&region={region}
                           │     Pick bestMatch item → adjustedPricing.wholesale.average
                           │
                           ├─ 3. YMM fallback (search endpoint)
                           │     GET /valuations/search/years/{Y}/makes/{M}/models/{cleanModel}
                           │         ?odometer={miles}&region={region}
                           │     cleanModel() strips trim designators
                           │
                           └─ 4. Write back via upsert_mmr_async() RPC
                                 POST /rest/v1/rpc/upsert_mmr_async
                                 Content-Profile: tav
```

---

## 3. TECH STACK

| Layer | Technology |
|-------|-----------|
| Scraping | Apify Cloud — actor `raidr-api~facebook-marketplace-vehicle-scraper` |
| Integration bus | Make.com (formerly Integromat) |
| Normalization / enrichment | Cloudflare Workers (JavaScript ES2022 modules) |
| Database | Supabase — PostgreSQL 15, schema `tav` |
| Vehicle valuation API | Manheim MMR API (Mashery OAuth2) |
| Mobile dashboard | AppSheet (Google) |
| Deploy tooling | Wrangler CLI v4 |
| Runtime | Node.js 20+ (for backfill scripts only) |

---

## 4. ENVIRONMENT & CONFIGURATION

### Cloudflare Worker secrets (set via `wrangler secret put <NAME> --name tav-normalizer`)

| Variable | Description | Where to obtain |
|----------|-------------|-----------------|
| `NORMALIZER_SECRET` | Shared bearer token. Make.com sends this in `Authorization: Bearer` on every /normalize call. | Generate with `openssl rand -hex 32`. Store in Make HTTP connection. |
| `MANHEIM_CLIENT_ID` | Mashery API key (production) | Manheim developer portal / Cox Automotive |
| `MANHEIM_CLIENT_SECRET` | Mashery API secret | Same as above |
| `MANHEIM_USERNAME` | Manheim account username | Your Manheim dealer account |
| `MANHEIM_PASSWORD` | Manheim account password | Your Manheim dealer account |
| `SUPABASE_URL` | `https://cotczqpmpbzguepogzfd.supabase.co` | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role JWT — bypasses RLS for upsert_mmr_async write-back | Supabase Dashboard → Settings → API → service_role |

### Wrangler vars (in wrangler.toml, not secret)

| Variable | Value | Description |
|----------|-------|-------------|
| `MANHEIM_ENV` | `prod` | Switches Manheim base URL between prod and UAT |

### Backfill script env vars (set in shell before running `node scripts/backfill-mmr.js`)

Same as Worker secrets above, prefixed as shell exports.

### Supabase connection (for AppSheet and direct access)

| Parameter | Value |
|-----------|-------|
| Host | `db.cotczqpmpbzguepogzfd.supabase.co` |
| Port | `5432` |
| Database | `postgres` |
| Username | `postgres` |
| Schema | `tav` |
| SSL | Required |
| IPv4 add-on | Required ($4/month) for external tool direct connections |

---

## 5. DATABASE DESIGN

### Schema: `tav`

All tables live in the `tav` PostgreSQL schema. PostgREST requires `Accept-Profile: tav` (reads) and `Content-Profile: tav` (writes) headers on all REST calls.

---

#### `tav.listings` — canonical vehicle store

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | Internal row ID |
| `listing_id` | text UNIQUE | FB Marketplace listing ID (external) |
| `fingerprint` | text | SHA-1 of `year|make|model|mileage/5000|city|price/500` |
| `title` | text | Full listing title |
| `price` | integer | Asking price in USD |
| `year` | integer | Model year (extracted from title if not in Apify data) |
| `make` | text | Vehicle make |
| `model` | text | Vehicle model |
| `mileage` | integer | Odometer reading in miles |
| `location_city` | text | City |
| `location_state` | text | State abbreviation (TX, OK, etc.) |
| `seller_name` | text | Seller display name |
| `seller_id` | text | Seller FB ID |
| `listing_url` | text | Full FB Marketplace URL |
| `photo_url` | text | Primary photo URL |
| `description` | text | Full listing description (up to 5000 chars) |
| `transmission` | text | Manual / Automatic |
| `exterior_color` | text | Color string |
| `vehicle_type` | text | Car / Truck / SUV etc. |
| `is_live` | boolean | Currently active on FB |
| `is_sold` | boolean | Marked sold |
| `is_pending` | boolean | Marked pending |
| `vin` | text | 17-char VIN if extractable from title/description |
| `mmr` | integer | Manheim wholesale average (unadjusted) |
| `mmr_adjusted` | integer | MMR adjusted for mileage vs age baseline |
| `mmr_source` | text | `vin` or `ymm` |
| `mmr_confidence` | text | `high` / `medium` / `low` / `none` |
| `mmr_fetched_at` | timestamptz | When MMR was retrieved |
| `deal_grade` | text | `steal`/`great`/`good`/`fair`/`pass`/`unknown` |
| `deal_score` | integer | Composite 0–100 score |
| `deal_score_components` | jsonb | Breakdown of score components |
| `deal_score_computed_at` | timestamptz | When score was computed |
| `first_seen_at` | timestamptz | First time scraper found this listing |
| `last_seen_at` | timestamptz | Most recent scraper sighting |
| `raw` | jsonb | Full original Apify item (forensic/debug) |

**Key indexes:**
- `fingerprint` — dedup lookup
- `(make, model)` — filter by vehicle type
- `(is_live, is_sold)` partial — active listings only
- `deal_grade IN ('steal','great')` partial — hot leads
- `vin WHERE vin IS NOT NULL` — MMR VIN lookups
- `deal_grade='unknown' AND mileage IS NOT NULL` partial — MMR retry queue

---

#### `tav.listings_history` — time-series sightings

One row per scraper sighting per listing. Captures price and status at each observation.

#### `tav.fingerprints` — vehicle identity registry

Tracks SHA-1 fingerprints across relist events. `relist_count` increments when same vehicle appears under a new listing ID.

#### `tav.relisted_events` — relist detection log

Each row records a detected relist: original listing ID → new listing ID, price delta.

#### `tav.price_changes` — price drop log

One row per observed price change. Used to compute `price_drops_30d` in views.

#### `tav.lead_state` — operator CRM

| Status values | Meaning |
|---------------|---------|
| `new` | Not yet reviewed |
| `lead` | Flagged as interesting |
| `contacted` | Reached out to seller |
| `negotiating` | In active negotiation |
| `bought` | Vehicle acquired |
| `pass` | Decided to skip |
| `lost` | Lost to another buyer |

#### `tav.config` — scoring/grading thresholds

Single row keyed by `cluster_id = 'global'`. Contains MMR grade thresholds and deal score weights. Change values here to retune the entire scoring system without code changes.

#### `tav.config_kv` — operational envelope tunables

Key-value store for cost caps, warn thresholds, and rate limits per service (Apify, Make, Cloudflare, Manheim, Supabase).

---

### Key views

| View | Purpose |
|------|---------|
| `v_deal_inbox` | Hot leads: steal/great/good grades, live, not sold |
| `v_active_inbox` | All live listings with enrichment status |
| `v_ops_dashboard` | Single-row pipeline health summary (24h metrics) |
| `v_motivated_sellers` | Listings with ≥1 price drop or relist, sorted by urgency |
| `v_ops_by_cluster` | Per-region breakdown of run metrics |

---

### Data lifecycle

1. **Insert**: `upsert_listing()` RPC — inserts or updates on `listing_id` conflict
2. **Enrich**: `upsert_mmr_async()` RPC — writes MMR + deal_grade back (background)
3. **Score**: `compute_deal_score()` RPC — computes composite score (triggered on MMR write)
4. **Expire**: `prune_old_data()` cron — removes listings not seen in 30d, compacts history
5. **Retry**: `retry_failed_mmr()` cron — re-attempts MMR for listings still `unknown` after 1h

---

## 6. CORE LOGIC & WORKFLOWS

### Workflow A: Scrape → Normalize → Store

**Trigger:** Apify task completes a run (fires Make.com "Watch Run" webhook)

**Steps:**
1. Make receives Apify run completion event
2. `log_run_start()` RPC records run metadata in `tav.run_metrics`
3. Make fetches dataset items from Apify (up to 200 per run)
4. Iterator loops over each item
5. Filter passes items where vehicle price > 0 and listing_id present
6. For each item: POST `{ raw: <apify_item> }` to `/normalize` on the Cloudflare Worker
7. Worker normalizes the raw Apify payload:
   - Resolves fields via multi-path `pick()` (handles actor version differences)
   - Extracts year via title regex `/\b(19[5-9]\d|20[0-3]\d)\b/` if `vehicle_year` absent
   - Extracts VIN via `/\b[A-HJ-NPR-Z0-9]{17}\b/` from title + description
   - Computes SHA-1 fingerprint
   - Validates required fields: `listing_id`, `listing_url`, `fingerprint`
8. Worker checks MMR in-memory cache:
   - **Hit**: enriches payload inline, returns with deal_grade set
   - **Miss**: returns payload with `deal_grade='unknown'`, fires async MMR fetch via `ctx.waitUntil()`
9. Make Router checks `ok` field:
   - **YES**: calls `upsert_listing()` RPC → Supabase upserts into `tav.listings`
   - **NO**: calls `log_dead_letter()` RPC → stores in `tav.dead_letter` for debugging
10. `log_scenario_end()` RPC updates `tav.scenario_metrics`

**Edge cases:**
- Apify sometimes omits `vehicle_year` — handled by `extractYearFromTitle()`
- Apify `extraListingData` is a nested object — Worker resolves via dot-notation `pick()` paths
- Mileage `null` → MMR enrichment skipped (`mmr_outcome='skip_no_miles'`)
- Worker timeout 4s on Manheim call — `AbortController` prevents blocking ingest

---

### Workflow B: Manheim MMR Enrichment (async)

**Trigger:** Cache miss on new listing with mileage

**Steps:**
1. `getManheimToken(env)` — checks token cache (50min TTL), fetches new token if needed
   - `POST https://api.manheim.com/oauth2/token.oauth2`
   - `Authorization: Basic base64(MANHEIM_CLIENT_ID:MANHEIM_CLIENT_SECRET)`
   - Body: `grant_type=password&username=...&password=...&scope=inventory:customer`
2. Compute `region` from `location_state` via STATE_REGION map (TX/OK → `sw`)
3. **VIN lookup** (if VIN available):
   - `GET /valuations/vin/{VIN}?odometer={miles}&region={region}`
   - Select `bestMatch:true` item (or first item)
   - Read `adjustedPricing.wholesale.average`
4. **YMM fallback** (if VIN miss or no VIN):
   - `cleanModel(model)` strips trim designators (LE, XLT, LT, etc.)
   - `GET /valuations/search/years/{year}/makes/{make}/models/{cleanModel}?odometer={miles}&region={region}`
   - Same field extraction
5. `computeAdjusted(mmr, year, miles)`:
   - Baseline = `age_years × 12,000 miles`
   - Excess miles above baseline → penalty up to 15%
   - `mmr_adjusted = round(mmr × (1 - penalty))`
6. `gradeDeal(price, mmr_adjusted)`:
   - `price ≤ adj − $2000` → **steal**
   - `price ≤ adj − $500` → **great**
   - `|price − adj| < $500` → **good**
   - `price ≤ adj + $1500` → **fair**
   - `else` → **pass**
7. `POST /rest/v1/rpc/upsert_mmr_async` with `Content-Profile: tav`
   - Writes back: mmr, mmr_adjusted, mmr_source, mmr_confidence, mmr_fetched_at, deal_grade, mmr_outcome, mmr_lookup_ms

**Miss outcomes:**
- No VIN + no make/model → `mmr_outcome='skip_no_miles'` or just miss
- Manheim returns no items → `mmr_outcome='miss'`
- Network error / timeout → `mmr_outcome='error'`
- Motorcycles, commercial trucks, classics → expected misses (~45% of inventory)

---

### Workflow C: MMR Backfill (manual)

**Trigger:** Manual — `node scripts/backfill-mmr.js`

**Purpose:** Enrich existing listings that have mileage but `deal_grade='unknown'`

**Steps:**
1. Fetch up to 200 listings from `tav.listings` where `mileage IS NOT NULL AND deal_grade='unknown'`
2. For each: attempt VIN lookup, then YMM search lookup
3. On hit: call `upsert_mmr_async` RPC
4. Rate limit: 250ms delay between calls (≤4 req/sec to Manheim)

**Last run results:** 52/95 enriched, 43 misses (motorcycles, commercial, classics, 2026+ model years)

---

## 7. AUTOMATIONS & INTEGRATIONS

### Apify — 4 tasks, staggered crons

| Task | Region | Config file |
|------|--------|-------------|
| `task-tx-east.json` | TX East (Dallas/Ft Worth area) | `tasks/task-tx-east.json` |
| `task-tx-south.json` | TX South (Houston/SA area) | `tasks/task-tx-south.json` |
| `task-tx-west.json` | TX West (Midland/Lubbock area) | `tasks/task-tx-west.json` |
| `task-ok.json` | Oklahoma | `tasks/task-ok.json` |

- Actor: `raidr-api~facebook-marketplace-vehicle-scraper`
- Key setting: `fetchDetailedItems: true` — populates `extraListingData` with vehicle attributes
- Crons: staggered 10-minute intervals to avoid simultaneous runs

### Make.com — Integration bus

- Scenario: "TAV FB Marketplace Pipeline"
- Blueprint: `state/make-scenario-blueprint.json`
- Connections needed: Apify API key, HTTP (normalizer bearer token), Supabase (service role key)

### Cloudflare Worker — tav-normalizer

- Deployed via `wrangler deploy scripts/normalizer-worker.js --name tav-normalizer`
- 7 secrets managed via `wrangler secret put`
- Observability enabled (7-day log retention)
- Zero cold-start penalty for normalization (stateless)
- MMR token and value caches live in isolate memory (reset on cold start)

### Supabase — Scheduled functions (pg_cron)

- `retry_failed_mmr()` — re-attempts MMR for `unknown` listings > 1h old
- `prune_old_data()` — removes stale listings not seen in 30d
- `poll_apify_costs()` — fetches billing data from Apify API
- `run_drift_check()` — detects schema drift between code and DB

### AppSheet — Mobile dashboard

- Connected via direct PostgreSQL (port 5432, SSL required, IPv4 add-on enabled)
- 3 views: Deal Inbox (Deck), All Listings (Table), Pipeline Health (Detail)
- `listing_url` opens FB Marketplace directly
- `photo_url` renders vehicle photo in cards

---

## 8. FILE STRUCTURE

```
tav-marketplace/
├── CLAUDE.md                    # Project rules and agent config
├── RUNBOOK.md                   # Operational runbook
├── wrangler.toml                # Cloudflare Worker config (root, legacy)
│
├── scripts/
│   ├── normalizer-worker.js     # PRIMARY: Cloudflare Worker (v1.5.0)
│   ├── backfill-mmr.js          # Manual MMR backfill script (Node.js)
│   ├── enrichment-worker.js     # Legacy enrichment worker (superseded)
│   ├── normalizer-worker copy.js # Backup copy
│   └── wrangler.toml            # Worker deploy config (scripts/ dir)
│
├── docs/
│   ├── ARCHITECTURE.md          # Architecture diagram (text)
│   ├── DEAL_SCORE.md            # Deal scoring specification
│   ├── MANHEIM_INTEGRATION.md   # Manheim API notes
│   └── PROJECT_SPEC.md          # This file
│
├── state/
│   ├── supabase-schema.sql      # Full Supabase schema (idempotent)
│   ├── make-scenario-blueprint.json  # Make.com scenario export
│   ├── schedule-ids.txt         # Apify schedule IDs
│   └── session-resume.md        # Session context
│
├── tasks/
│   ├── task-tx-east.json        # Apify task config — TX East
│   ├── task-tx-south.json       # Apify task config — TX South
│   ├── task-tx-west.json        # Apify task config — TX West
│   └── task-ok.json             # Apify task config — Oklahoma
│
└── setup.sh                     # Initial project setup script
```

---

## 9. API & ENDPOINTS

### Cloudflare Worker — tav-normalizer

**Base URL:** `https://tav-normalizer.rami-1a9.workers.dev`

---

#### `GET /health`

Health check. No authentication required.

**Response:**
```json
{
  "ok": true,
  "service": "tav-normalizer",
  "payload_version": 1,
  "worker_version": "v1.5.0"
}
```

---

#### `POST /normalize`

Normalize a raw Apify item. Optionally enriches with Manheim MMR.

**Auth:** `Authorization: Bearer <NORMALIZER_SECRET>`

**Request:**
```json
{
  "raw": { /* full Apify marketplace item */ }
}
```

**Success response:**
```json
{
  "ok": true,
  "payload": {
    "listing_id": "123456789",
    "fingerprint": "a1b2c3...",
    "title": "2022 Ford F-150",
    "price": 35000,
    "year": 2022,
    "make": "Ford",
    "model": "F-150",
    "mileage": 45000,
    "vin": "1FTFW1E83NFA12345",
    "location_city": "Dallas",
    "location_state": "TX",
    "seller_name": "John D.",
    "listing_url": "https://www.facebook.com/marketplace/item/123456789",
    "photo_url": "https://...",
    "mmr": 27400,
    "mmr_adjusted": 26974,
    "mmr_source": "vin",
    "mmr_confidence": "high",
    "deal_grade": "pass",
    "mmr_outcome": "vin_hit",
    "mmr_lookup_ms": 312,
    "normalizer_received_at": "2026-05-02T15:00:00.000Z",
    "normalizer_duration_ms": 45,
    "worker_version": "v1.5.0"
  }
}
```

**Failure response:**
```json
{
  "ok": false,
  "reason": "missing_required",
  "missing_fields": ["listing_id"],
  "error": "Required field(s) could not be resolved: listing_id",
  "original_keys": ["title", "price", "..."],
  "partial": { /* best-effort payload */ }
}
```

**mmr_outcome values:**
| Value | Meaning |
|-------|---------|
| `vin_hit` | MMR found via VIN lookup |
| `ymm_hit` | MMR found via YMM search |
| `miss` | No Manheim match found |
| `pending` | Cache miss, async fetch fired |
| `skip_no_miles` | No mileage data, MMR meaningless |
| `error` | Network/API error during fetch |

---

### Supabase RPCs (PostgREST)

All RPCs: `POST https://cotczqpmpbzguepogzfd.supabase.co/rest/v1/rpc/<function_name>`
Headers: `apikey: <service_role_key>`, `Authorization: Bearer <service_role_key>`, `Content-Profile: tav`

| RPC | Purpose | Key params |
|-----|---------|-----------|
| `upsert_listing` | Insert or update a listing | `p_payload: <normalized object>` |
| `upsert_mmr_async` | Write MMR + deal_grade back to listing | `p_listing_id`, `p_payload` |
| `log_run_start` | Record Apify run start | `p_apify_run_id`, `p_task_id`, `p_cluster` |
| `log_scenario_end` | Record Make scenario completion | `p_apify_run_id`, `p_items_processed` |
| `log_dead_letter` | Store failed normalizations | `p_raw`, `p_reason` |
| `compute_deal_score` | Recalculate composite score | `p_listing_id` |
| `refresh_all_deal_scores` | Bulk rescore all listings | none |
| `retry_failed_mmr` | Re-queue unknown listings | none |
| `prune_old_data` | Remove stale listings | none |

### Manheim MMR API

**Base:** `https://api.manheim.com`

| Endpoint | Use |
|----------|-----|
| `POST /oauth2/token.oauth2` | Get OAuth2 token (password grant) |
| `GET /valuations/vin/{VIN}?odometer={miles}&region={region}` | VIN lookup |
| `GET /valuations/search/years/{Y}/makes/{M}/models/{model}?odometer={miles}&region={region}` | YMM search (partial model match) |

**Auth:** `Authorization: Basic base64(client_id:client_secret)` for token, `Bearer {token}` for valuations.

---

## 10. DEPLOYMENT PROCESS

### Prerequisites

```bash
node --version    # 20+
wrangler --version  # 4+
```

### Step 1 — Clone and install

```bash
git clone <repo>
cd tav-marketplace
npm install
```

### Step 2 — Apply Supabase schema

```
1. Go to Supabase Dashboard → SQL Editor
2. Paste contents of state/supabase-schema.sql
3. Click Run
4. Verify: tables and views appear in Table Editor under tav schema
```

### Step 3 — Set Cloudflare Worker secrets

```bash
wrangler secret put NORMALIZER_SECRET --name tav-normalizer
wrangler secret put MANHEIM_CLIENT_ID --name tav-normalizer
wrangler secret put MANHEIM_CLIENT_SECRET --name tav-normalizer
wrangler secret put MANHEIM_USERNAME --name tav-normalizer
wrangler secret put MANHEIM_PASSWORD --name tav-normalizer
wrangler secret put SUPABASE_URL --name tav-normalizer
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name tav-normalizer
```

### Step 4 — Deploy the Worker

```bash
wrangler deploy scripts/normalizer-worker.js --name tav-normalizer
```

Verify:
```bash
curl https://tav-normalizer.rami-1a9.workers.dev/health
# Expected: {"ok":true,"worker_version":"v1.5.0"}
```

### Step 5 — Configure Make.com

```
1. Import state/make-scenario-blueprint.json into Make.com
2. Re-authenticate all connections:
   - Apify: API key from Apify console
   - HTTP: Bearer <NORMALIZER_SECRET>
   - Supabase: service role key
3. Enable scenario
4. Verify: run manually, check tav.listings in Supabase
```

### Step 6 — Configure Apify tasks

```
1. Create 4 tasks in Apify console using configs in tasks/*.json
2. Set up crons (staggered 10-min intervals)
3. Ensure fetchDetailedItems: true in actor input
```

### Step 7 — Set up AppSheet

```
1. appsheet.com → New App → Start with your own data → Database → PostgreSQL
2. Server: db.<project-ref>.supabase.co:5432
3. Database: postgres, Username: postgres, SSL: Required
4. (IPv4 add-on must be enabled in Supabase: Settings → Add-ons → IPv4)
5. Select views: v_deal_inbox, v_active_inbox, v_ops_dashboard
6. Set key columns: listing_id (deal_inbox, active_inbox), dashboard_generated_at (ops_dashboard)
7. Set photo_url type → Image, listing_url type → URL
8. Add Format Rules for deal_grade color coding
9. Add Action: "View on Facebook" → Open URL → [listing_url]
```

### Step 8 — Run MMR backfill (one-time)

```bash
export MANHEIM_CLIENT_ID=<id>
export MANHEIM_CLIENT_SECRET=<secret>
export MANHEIM_USERNAME=<user>
export MANHEIM_PASSWORD=<pass>
export SUPABASE_URL=https://cotczqpmpbzguepogzfd.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<key>

node scripts/backfill-mmr.js
```

---

## 11. TESTING & VALIDATION

### Test Worker health

```bash
curl https://tav-normalizer.rami-1a9.workers.dev/health
```

### Test normalization (with a real Apify item)

```bash
curl -X POST https://tav-normalizer.rami-1a9.workers.dev/normalize \
  -H "Authorization: Bearer <NORMALIZER_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"raw": {"id":"123","marketplace_listing_title":"2022 Ford F-150","listing_price":{"amount":"35000"},"listingUrl":"https://fb.com/marketplace/item/123"}}'
```

### Test Manheim auth

```bash
curl -X POST 'https://api.manheim.com/oauth2/token.oauth2' \
  -H 'Authorization: Basic <base64(client_id:client_secret)>' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password&username=<user>&password=<pass>&scope=inventory:customer'
# Expected: {"access_token":"...","token_type":"Bearer","expires_in":3000}
```

### Test Supabase connection

```bash
curl "https://cotczqpmpbzguepogzfd.supabase.co/rest/v1/listings?select=count&limit=1" \
  -H "apikey: <service_role_key>" \
  -H "Accept-Profile: tav"
```

### Verify MMR enrichment

```sql
-- In Supabase SQL Editor
SELECT deal_grade, COUNT(*) FROM tav.listings GROUP BY deal_grade ORDER BY 2 DESC;
-- Expected: steal/great/good/fair/pass for enriched, unknown for misses
```

### Watch live Worker logs

```bash
wrangler tail tav-normalizer
```

### Debug a dead letter

```sql
SELECT reason_code, error, original_keys, created_at
FROM tav.dead_letter
ORDER BY created_at DESC
LIMIT 10;
```

---

## 12. KNOWN ISSUES & LIMITATIONS

| Issue | Impact | Status |
|-------|--------|--------|
| ~45% of listings get no MMR match | Motorcycles, commercial trucks, classics — Manheim wholesale only covers standard vehicles | Expected/by design |
| MMR token cache resets on Worker cold start | First request after cold start incurs Manheim OAuth call (~200ms) | Acceptable |
| `vehicle_year` absent from Apify actor output | Handled by `extractYearFromTitle()` regex fallback | Fixed in v1.4.0 |
| FB model names include trim (e.g. "F-150 Lariat Pickup 4D") | `cleanModel()` strips common trim words before YMM search | Partially mitigated v1.5.0 |
| 2026+ model years not in Manheim catalog | 2026 listings always miss | Not fixable |
| AppSheet reads are live but ~10s cache delay | AppSheet caches schema; new listings appear with slight delay | Acceptable |
| `v_ops_dashboard` has no natural primary key | Use `dashboard_generated_at` as AppSheet key | Workaround in place |

---

## 13. SECURITY CONSIDERATIONS

### Secrets management

- All credentials stored as Cloudflare Worker secrets (encrypted at rest, never in code)
- No secrets in `wrangler.toml` or any committed file
- Supabase service role key scoped to Worker only — never exposed to frontend

### Authentication layers

| Layer | Auth method |
|-------|-------------|
| Make → Worker | Shared bearer token (`NORMALIZER_SECRET`) — constant-time comparison via `crypto.subtle.timingSafeEqual()` |
| Worker → Supabase | Service role JWT (bypasses RLS for internal write-backs) |
| Worker → Manheim | OAuth2 Bearer token (cached, auto-refreshed) |
| AppSheet → Supabase | Direct PostgreSQL with password auth over SSL |

### Access control

- Supabase RLS enabled on `tav.config` and `tav.config_kv` — service role bypasses for internal ops
- Worker `/normalize` endpoint requires bearer token — no public access
- AppSheet connects as `postgres` user — consider creating a read-only role for AppSheet long-term

### Risks

- Supabase service role key was exposed in a plaintext shell script (`run-backfill.sh`) during initial setup — **key has been rotated**
- Manheim password was visible in chat during debugging — **password should be rotated**
- `state/supabase-schema.sql` contains no credentials — safe to commit

---

## 14. SCALABILITY & IMPROVEMENTS

### Current bottlenecks

| Bottleneck | Details |
|------------|---------|
| Manheim rate limit | 4 req/sec enforced by 250ms delay in backfill script. Worker uses AbortController (4s timeout) but no explicit rate limiting for concurrent requests. |
| Worker in-memory cache | MMR cache lives in a single isolate. Across isolates (high traffic) cache misses increase. |
| Make.com operations budget | Each item costs ~2 Make ops. At 200 items/run × 4 tasks/hour = 1,600 ops/hour |
| AppSheet refresh | No webhook-based refresh — AppSheet polls on open |

### Suggested improvements

1. **Real-time AppSheet refresh** — Supabase Realtime → push notification to AppSheet (or Google Sheets intermediary)
2. **Lead status actions in AppSheet** — write back to `tav.lead_state` via Supabase REST API action
3. **MMR retry rate improvement** — try subseries lookup (two-step VIN → subSeries → refined VIN call) for higher-value vehicles
4. **Cloudflare KV for MMR cache** — persist cache across isolates (currently resets on cold start)
5. **Deal score tuning** — `tav.config` weights are adjustable without code change; run `refresh_all_deal_scores()` after tuning
6. **Price drop alerts** — trigger AppSheet notification when `price_minus_mmr_adj` improves significantly
7. **Seller contact integration** — FB Messenger deep link from AppSheet action
8. **Read-only Supabase role for AppSheet** — principle of least privilege

---

## 15. REBUILD INSTRUCTIONS

Complete rebuild from zero. Assumes fresh accounts on all platforms.

### Phase 1 — Supabase

1. Create account at supabase.com
2. New project — region: US East or closest to TX
3. Note: project ref, URL (`https://<ref>.supabase.co`), service role key
4. Enable IPv4 add-on: Settings → Add-ons → IPv4 ($4/month)
5. SQL Editor → paste `state/supabase-schema.sql` → Run
6. Verify `tav` schema tables and views exist

### Phase 2 — Manheim API access

1. Contact Cox Automotive / Manheim to obtain API credentials
2. Requires dealer account + Mashery API subscription
3. Obtain: `client_id`, `client_secret`, Manheim `username`, `password`
4. Test auth:
   ```bash
   curl -X POST 'https://api.manheim.com/oauth2/token.oauth2' \
     -H 'Authorization: Basic <base64(id:secret)>' \
     -H 'Content-Type: application/x-www-form-urlencoded' \
     -d 'grant_type=password&username=X&password=Y&scope=inventory:customer'
   ```

### Phase 3 — Cloudflare Worker

1. Create Cloudflare account
2. Install Wrangler: `npm install -g wrangler`
3. Login: `wrangler login`
4. Set all 7 secrets (see Section 4)
5. Deploy: `wrangler deploy scripts/normalizer-worker.js --name tav-normalizer`
6. Generate `NORMALIZER_SECRET`: `openssl rand -hex 32` — save this value
7. Verify: `curl https://tav-normalizer.<subdomain>.workers.dev/health`

### Phase 4 — Apify

1. Create account at apify.com
2. Search for actor: `raidr-api~facebook-marketplace-vehicle-scraper`
3. Create 4 tasks (one per region) with configs from `tasks/*.json`
4. Set `fetchDetailedItems: true` in each task's input
5. Set up staggered crons (every 10 min, offset by 2.5 min each)
6. Note all task IDs and schedule IDs

### Phase 5 — Make.com

1. Create account at make.com
2. Create new scenario
3. Import blueprint from `state/make-scenario-blueprint.json`
4. Configure connections:
   - Apify: API key from Apify console
   - HTTP (normalizer): `Authorization: Bearer <NORMALIZER_SECRET>`
   - Supabase: service role key + project URL
5. In Module 6 (HTTP): URL = `https://tav-normalizer.<subdomain>.workers.dev/normalize`
6. Enable scenario
7. Test by manually triggering an Apify task and watching Make execution

### Phase 6 — Initial MMR backfill

```bash
# Set all env vars
export MANHEIM_CLIENT_ID=...
# (all vars from Section 4)

node scripts/backfill-mmr.js
# Watch for: "Done: X enriched, Y no match, Z errors"
```

### Phase 7 — AppSheet

1. Create account at appsheet.com
2. New App → Start with your own data → Database → PostgreSQL
3. Connection: see Section 10 Step 7
4. Add views: `v_deal_inbox`, `v_active_inbox`, `v_ops_dashboard`
5. Configure column types (photo_url → Image, listing_url → URL)
6. Set key columns
7. Create format rules for deal_grade color coding
8. Create "View on Facebook" action
9. Publish app to team

### Verification checklist

- [ ] `tav.listings` has rows after first Apify run
- [ ] `deal_grade` is populated (not all `unknown`) after backfill
- [ ] AppSheet Deal Inbox shows listings with photos
- [ ] Color coding visible (steal = green)
- [ ] "View on Facebook" button opens correct URL
- [ ] `v_ops_dashboard` shows non-zero `items_processed_24h`
- [ ] Worker `/health` returns `"ok": true`

---

*End of specification. For questions contact rami@texasautovalue.com*
