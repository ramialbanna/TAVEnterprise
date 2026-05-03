# Architecture Reference — TAV-AIP

> Long-form companion to CLAUDE.md. Pulled in via `@docs/architecture.md` when needed.

## 1. End-to-End Flow (target enterprise vision)

```
Platform Scrapers
  Facebook / Craigslist / AutoTrader / Cars.com / OfferUp / Other
        ↓
Cloudflare Worker Ingestion Gateway   (HMAC-verified, Zod-validated)
        ↓
Raw Listing Store        (tav.raw_listings — untouched payload)
        ↓
Source-Specific Adapter  (src/sources/<platform>.ts)
        ↓
Normalized Listing       (tav.normalized_listings)
        ↓
Vehicle Candidate / Fuzzy Identity Grouping  (tav.vehicle_candidates)
        ↓
Duplicate Detection      (tav.duplicate_groups)
        ↓
Stale Listing Detection  (freshness_status, stale_score)
        ↓
Valuation Enrichment     (Manheim MMR — VIN or YMM fallback)
        ↓
Buy-Box Scoring          (rule-based first; ML later)
        ↓
Lead Creation            (tav.leads)
        ↓
Assignment / Buyer Workflow
        ↓
Buyer Actions            (tav.lead_actions)
        ↓
Purchase Outcomes        (tav.purchase_outcomes)
        ↓
Buy-Box Learning Layer   (rules updated from real outcomes)
```

## 2. Repository Layout

```
.
├── CLAUDE.md
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── package.json
├── tsconfig.json          ← strict: true
├── wrangler.toml
├── .dev.vars.example
├── .gitignore
├── docs/
│   ├── PRODUCT_SPEC.md
│   ├── ARCHITECTURE.md    ← this file (or symlink)
│   ├── DATA_MODEL.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── RUNBOOK.md
│   ├── SECURITY.md
│   └── API_CONTRACTS.md
├── supabase/
│   ├── schema.sql
│   └── migrations/
├── src/
│   ├── index.ts                ← Worker entry, routes only
│   ├── validate.ts             ← Zod schemas for ingestion wrapper + items
│   ├── auth/hmac.ts            ← x-tav-signature verification
│   ├── sources/
│   │   ├── facebook.ts         ← VIN-tolerant
│   │   ├── craigslist.ts
│   │   ├── autotrader.ts
│   │   ├── carsCom.ts
│   │   └── offerup.ts
│   ├── normalize/
│   │   ├── normalizeListing.ts
│   │   ├── cleanText.ts
│   │   ├── extractYmm.ts
│   │   └── mileage.ts
│   ├── dedupe/
│   │   ├── identity.ts         ← identity_key generator
│   │   ├── exactDedupe.ts      ← source + listing_id / source + url
│   │   └── fuzzyDedupe.ts      ← YMM + mileage band + region + seller
│   ├── stale/
│   │   ├── staleScore.ts       ← 0–100 score
│   │   └── freshnessStatus.ts  ← new|active|aging|stale_suspected|stale_confirmed|removed
│   ├── valuation/
│   │   ├── manheim.ts          ← VIN MMR + YMM fallback
│   │   ├── valuationCache.ts   ← Cloudflare KV
│   │   └── valuationTypes.ts
│   ├── scoring/
│   │   ├── scoreLead.ts        ← weighted final score
│   │   ├── buyBox.ts           ← rule evaluation
│   │   └── reasonCodes.ts      ← centralized reason-code constants
│   ├── assignment/
│   │   ├── assignLead.ts
│   │   └── locking.ts
│   ├── persistence/
│   │   ├── supabase.ts         ← service-role client (Worker-only)
│   │   ├── retry.ts            ← 3 attempts, 250/1000/4000ms backoff
│   │   └── deadLetter.ts       ← writes to tav.dead_letters or KV
│   ├── alerts/alerts.ts
│   └── types/
│       ├── domain.ts           ← four-concept types
│       ├── env.ts              ← Worker bindings
│       └── database.ts         ← generated Supabase types
├── test/
│   ├── fixtures/
│   ├── normalize.test.ts
│   ├── staleScore.test.ts
│   ├── scoring.test.ts
│   └── dedupe.test.ts
└── .github/
    ├── workflows/ci.yml
    └── ISSUE_TEMPLATE/
```

**Layer rules (recap):**
- `sources/` → `normalize/` → `dedupe/` → `stale/` → `valuation/` → `scoring/` → `assignment/` → `persistence/`
- Pure functions in `normalize/`, `dedupe/`, `stale/`, `scoring/`. No I/O.
- I/O wrapped behind `persistence/`, `valuation/`, `alerts/`.
- `sources/<platform>.ts` is the **only** place that knows that platform's quirks.

## 3. Worker Routes (current + planned)

### 3.1 `GET /health`
```json
{ "ok": true, "service": "tav-enterprise", "version": "0.1.0", "timestamp": "<ISO>" }
```

### 3.2 `POST /ingest`
Headers: `content-type: application/json`, `x-tav-signature: sha256=<hmac>`
Payload:
```json
{
  "source": "facebook",
  "run_id": "apify-run-id",
  "region": "dallas_tx",
  "scraped_at": "<ISO>",
  "items": [ { "title": "...", "price": "$13,500", "mileage": "82,000 miles",
               "location": "Dallas, TX", "url": "https://...", "sellerName": "..." } ]
}
```
Response:
```json
{ "ok": true, "source": "facebook", "run_id": "...", "processed": 95,
  "rejected": 5, "created_leads": 24, "duplicates": 40, "stale_suppressed": 31 }
```

### 3.3 `POST /admin/replay-dlq` (future) — admin secret or schedule.
### 3.4 `GET /admin/source-health` (future) — latest source-run status.

## 4. Source Adapter Contract

Every platform produces `NormalizedListingInput`:

```ts
export type SourceName =
  | 'facebook' | 'craigslist' | 'autotrader' | 'cars_com' | 'offerup';

export type NormalizedListingInput = {
  source: SourceName;
  sourceRunId?: string;
  sourceListingId?: string;
  url: string;
  title: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  price?: number;
  mileage?: number;
  city?: string;
  state?: string;
  region?: string;
  sellerName?: string;
  sellerUrl?: string;
  images?: string[];
  postedAt?: string;
  scrapedAt: string;
};
```

- **Facebook adapter:** must tolerate missing VIN. Extracts YMM from title when fields are absent.
- **Craigslist:** YMM usually in title; `post_id` is the stable id.
- **AutoTrader / Cars.com:** may expose VIN; use it when present, but YMM fallback must still work.

## 5. Validation Rules
- Wrapper Zod schema: `source` ∈ allowed, `items` non-empty, `run_id` & `region` preferred.
- Listing minimum: `source` + (`url` OR `sourceListingId`) + `title` + at least partial YMM (extracted from title if needed).
- Invalid → `tav.filtered_out` (business reason), `tav.dead_letters` (transient/infra), or `tav.schema_drift_events` (unexpected shape).
- **Never silently drop.** Every rejection has a `reason_code`.

## 6. Deduplication Strategy

**Exact dedupe** (`source` provides stable id):
```
key = source + source_listing_id
key = source + listing_url
```

**Fuzzy dedupe** (Facebook + cross-source):
Inputs: year, make, model, trim, mileage band, price band, city/state/region, seller URL, title similarity. Identity key example:
```
2021|toyota|camry|se|55000-60000|dallas|tx
```
Fuzzy duplicates do **not** merge permanently — they group via `tav.duplicate_groups` with confidence.

## 7. Stale Listing Strategy

**Freshness statuses:** `new | active | aging | stale_suspected | stale_confirmed | removed`

**Signals:** `first_seen_at`, `last_seen_at`, `scrape_count`, price/mileage/description/image change flags, URL liveness, source returning the listing, buyer feedback (stale/sold/no-response), seller repost detection.

**Score (0–100, starter logic):**
```
+30 first_seen_at > 14 days
+20 unchanged after 5 scrapes
+20 buyer marked no_response
+30 buyer marked sold/stale
+15 source no longer returns URL
+10 missing posted_at
−30 newly discovered (last 24h)
−20 price changed recently
−10 seller activity recent
```
Status mapping: 0–24 new/active · 25–49 aging · 50–74 stale_suspected · 75–100 stale_confirmed.
High stale-score listings are suppressed from buyer queue or downgraded.

## 8. Valuation (Manheim MMR)

**Hierarchy with VIN:** VIN MMR → YMM fallback.
**Hierarchy Facebook (no VIN):** YMM + mileage bucket + region. Confidence lowered. Trim if available.

**KV cache:**
```
manheim:token              → expires_in − 60s
mmr:vin:<VIN>              → 24h
mmr:ymm:<y>:<mk>:<md>:<mi_bucket>:<region>  → 7d
```

**Failure handling:** never fail ingestion. Set valuation `confidence = NONE`, add reason code `mmr_failed`, continue scoring.

## 9. Buy-Box Engine

Start **rule-based**. No ML until 2026 purchase outcomes exist (CLAUDE.md §1, identity.md).

Rule fields: make, model, year_min, year_max, max_mileage, min_mileage?, target_price_pct_of_mmr, region, source, priority_score, notes, is_active.

Example rule:
```
Toyota Camry · 2018–2023 · max 95,000 mi · target ≤ 82% MMR
Preferred regions: TX, OK, AR, LA · priority: high
```

Train future scoring from `tav.purchase_outcomes` (real gross profit per buy).

## 10. Lead Scoring

Weighted final score:
```
35% price vs valuation
25% buy-box match
20% freshness
10% region/logistics
10% source confidence
```

Return type:
```ts
type ScoredLead = {
  dealScore: number; buyBoxScore: number; freshnessScore: number;
  regionScore: number; sourceConfidenceScore: number;
  finalScore: number;
  grade: 'excellent' | 'good' | 'fair' | 'pass';
  reasonCodes: string[];
};
```
Grade map: 85–100 excellent · 70–84 good · 55–69 fair · 0–54 pass.

Standard reason codes: `missing_price`, `missing_mileage`, `missing_ymm`, `no_vin`, `mmr_failed`, `overpriced`, `high_mileage`, `out_of_region`, `stale_suspected`, `stale_confirmed`, `buy_box_match`, `excellent_price_to_mmr`, `duplicate`.

## 11. Lead Workflow & Assignment

Statuses:
```ts
type LeadStatus =
  | 'new' | 'assigned' | 'claimed' | 'contacted' | 'negotiating'
  | 'passed' | 'duplicate' | 'stale' | 'sold' | 'purchased' | 'archived';
```

Locking fields: `assigned_to`, `assigned_at`, `lock_expires_at`, `last_action_at`, `status`. Idle leads return to queue.

Assignment v1: by region → buyer capacity → priority → source → specialty. Excellent leads escalate to priority queues; unclaimed > 15 min → national queue; no action > 2h → manager alert.

## 12. Supabase Data Model (schema `tav`)

Tables (full DDL lives in `supabase/schema.sql`):
- `source_runs` — scraper run telemetry
- `raw_listings` — untouched payload
- `normalized_listings` — cleaned per-platform listing (with freshness fields)
- `vehicle_candidates` — fuzzy identity rollup
- `duplicate_groups` — group + confidence
- `valuation_snapshots` — MMR results, vin or ymm method
- `buy_box_rules`
- `leads` — buyer-facing
- `lead_actions` — audit
- `purchase_outcomes` — closes the loop
- `dead_letters` — final-failure capture
- `schema_drift_events` — unexpected fields
- `filtered_out` — business-reason rejections

**Required indexes:** `source`, `region`, `freshness_status`, `status`, `assigned_to`, `created_at`, `last_seen_at`, `(year, make, model)`, `identity_key`, `listing_url`, `source_listing_id`, `grade`, `score`.

**Required views:**
- `tav.v_active_inbox` — buyer-ready leads, excludes stale_confirmed/removed, last_seen_at > now() − 30d.
- `tav.v_source_health` — latest run per source/region.
- `tav.v_buyer_performance` (later) — assigned, contacted, purchased, conversion, gross, time-to-contact.

## 13. Persistence & Reliability

All critical writes:
- **Retry:** 3 attempts, exponential backoff `250ms → 1000ms → 4000ms`.
- **Final failure:** `tav.dead_letters` row OR KV key `dlq:<source>:<fingerprint>:<ts>`.
- **Never silently discard.**

## 14. Observability & Alerts

Trigger alerts for:
- No listings in last 30 minutes
- Scraper run with zero items
- MMR failure spike
- Supabase write failure burst
- DLQ count above threshold
- Schema drift detected
- Excellent leads unassigned
- Lead queue backlog
- Stale-rate spike

Initial channel: webhook → Twilio SMS to ALERT_TO_NUMBER.

## 15. Security

- **Secrets:** Cloudflare secrets only. Never commit `.dev.vars`. Never log `env`.
- **Webhook:** HMAC-SHA256 over raw body, header `x-tav-signature: sha256=<sig>`.
- **Supabase:** service role key in Worker only. Future dashboard → Supabase Auth + RLS, roles `admin | manager | buyer | viewer`.
- **No service role key** in AppSheet, Make, Zapier, browser, or public repo. Ever.

## 16. Environment Variables (`.dev.vars.example`)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace_me
WEBHOOK_HMAC_SECRET=replace_me
NORMALIZER_SECRET=replace_me
MANHEIM_CLIENT_ID=replace_me
MANHEIM_CLIENT_SECRET=replace_me
MANHEIM_USERNAME=replace_me
MANHEIM_PASSWORD=replace_me
MANHEIM_TOKEN_URL=replace_me
MANHEIM_MMR_URL=replace_me
ALERT_WEBHOOK_URL=replace_me
TWILIO_ACCOUNT_SID=replace_me
TWILIO_AUTH_TOKEN=replace_me
TWILIO_FROM_NUMBER=replace_me
ALERT_TO_NUMBER=replace_me
```

## 17. Production Deployment

```bash
npm install
cp .dev.vars.example .dev.vars   # fill it
npm run typecheck
npm test
npm run deploy

# secrets
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put WEBHOOK_HMAC_SECRET
wrangler secret put MANHEIM_CLIENT_ID
wrangler secret put MANHEIM_CLIENT_SECRET
wrangler secret put MANHEIM_USERNAME
wrangler secret put MANHEIM_PASSWORD
wrangler secret put MANHEIM_TOKEN_URL
wrangler secret put MANHEIM_MMR_URL

# KV
wrangler kv namespace create TAV_KV
# update wrangler.toml with the namespace id
```

## 18. Implementation Order (the canonical 15 steps)

1. Project foundation (`package.json`, `tsconfig.json`, `wrangler.toml`, `.dev.vars.example`, folder structure, `/health`, CI).
2. Supabase schema (`supabase/schema.sql` — all tables + indexes).
3. Ingest endpoint (`POST /ingest` + HMAC + Zod + batch loop).
4. Facebook adapter (VIN-tolerant).
5. Normalization utilities (clean text, price, mileage, YMM, location).
6. Raw + normalized persistence.
7. Dedupe (exact + identity key + candidate upsert).
8. Stale score v1.
9. Valuation (Manheim placeholder → real, KV cache).
10. Lead scoring formula.
11. Lead creation gate (not stale_confirmed, not duplicate, score above threshold).
12. Retry + DLQ wrapper.
13. Alerts (webhook).
14. Vitest suite.
15. Docs (README, RUNBOOK, API_CONTRACTS).

## 19. Suggested Commit Plan

```
chore: initialize worker project
docs: add enterprise product spec
db: add tav schema
feat: add hmac verification
feat: add ingest endpoint
feat: add facebook adapter
feat: add normalization utilities
feat: persist raw listings
feat: persist normalized listings
feat: add identity key generation
feat: add stale score v1
feat: add lead scoring v1
feat: create leads from scored listings
feat: add retry and dead letter queue
test: add normalization and scoring tests
docs: add runbook and deployment instructions
```

## 20. Anti-patterns we reject

- **One giant normalizer** that branches on `source` — split per platform under `src/sources/`.
- **VIN-required code paths** in the Facebook flow.
- **Silent drops** of listings.
- **Service role key** outside the Worker.
- **Collapsing** Normalized Listing and Vehicle Candidate.
- **Stale detection deferred** to "v2".
- **Microservices** before the Worker becomes a bottleneck.
- **ML buy-box** before 2026 purchase outcomes exist.

## 21. ADR Format (`docs/adr/NNNN-title.md`)
```
# NNNN — Title
Status: proposed | accepted | superseded by NNNN
Context: …
Decision: …
Consequences: …
Alternatives considered: …
```
Required for: new layer/service, four-concept boundary changes, public-contract changes, dependency swaps, schema migrations beyond pure-additive.

## 22. MVP Acceptance Criteria

1. A Facebook Apify payload can `POST /ingest`.
2. Raw payloads stored.
3. Normalized listings stored.
4. YMM extracted, or missing reason recorded.
5. Dedupe identity key generated.
6. Stale score calculated.
7. Lead score calculated.
8. Lead created or rejected with reason.
9. Failures go to DLQ.
10. `tav.v_active_inbox` returns buyer-ready leads.
11. ≥ 20 unit tests pass.
12. README explains deployment and local dev.
13. No secrets committed.

## 23. Enterprise Acceptance Criteria

1. Multiple platforms ingested.
2. Cross-source duplicate grouping works.
3. Nationwide regions supported.
4. 100+ buyers can use the dashboard.
5. Lead assignment and locking work.
6. Buyer actions audited.
7. Purchase outcomes captured.
8. 2026 purchase data powers buy-box rules.
9. Source/region/buyer performance reportable.
10. Stale listings suppressed effectively.
11. Excellent leads trigger priority alerts.
12. System has runbooks and monitoring.

## 24. Brutally Honest Direction
The most dangerous mistake is building a beautiful platform before proving the data creates purchases. The second most dangerous is building a quick Facebook scraper with a bad data model that cannot scale. **Build the MVP with the enterprise data model.**
