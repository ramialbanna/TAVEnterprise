# TAV Scrapers — Standalone Repository Guide

**Use this file as the only document you need** to bootstrap a blank GitHub repo, build Craigslist/Cars.com scrapers, and POST listings into the TAV ingest pipeline.

**Last updated:** 2026-05-21  
**First source:** Craigslist (Dallas) → then Cars.com  
**Ingest consumer:** TAV Cloudflare Worker (`POST /ingest`)

---

## Table of contents

1. [What you are building](#1-what-you-are-building)
2. [Zero-access bootstrap (start here)](#2-zero-access-bootstrap-start-here)
3. [Credentials you will need later](#3-credentials-you-will-need-later)
4. [Repository layout and starter files](#4-repository-layout-and-starter-files)
5. [Ingest API contract](#5-ingest-api-contract)
6. [Complete ingest client (copy-paste)](#6-complete-ingest-client-copy-paste)
7. [Smoke test without a scraper](#7-smoke-test-without-a-scraper)
8. [Listing item schemas](#8-listing-item-schemas)
9. [Craigslist implementation guide](#9-craigslist-implementation-guide)
10. [Cars.com (phase 2)](#10-carscom-phase-2)
11. [What the remote worker does with your data](#11-what-the-remote-worker-does-with-your-data)
12. [How to verify success without the TAV web app](#12-how-to-verify-success-without-the-tav-web-app)
13. [Rollout checklist](#13-rollout-checklist)
14. [Out of scope](#14-out-of-scope)
15. [Appendix: validation rules](#appendix-validation-rules)

---

## 1. What you are building

A **separate scraper repository** that:

1. Scrapes vehicle listings from Craigslist (then Cars.com).
2. Formats each listing as JSON (schema in §8).
3. Batches listings and **POSTs them to TAV ingest** with HMAC auth.
4. Can run in **`dry-run` mode** (write JSON to disk) before you have any credentials.

You are **not** building normalization, MMR valuation, scoring, or a database layer in this repo. The remote TAV Worker does that after ingest.

**Why:** TAV already has an enrichment pipeline, but current Facebook/Apify volume is too low and too expensive. Own scrapers fix the **firehose** problem.

**Success for this repo:**

| Milestone | How you know |
|-----------|--------------|
| Scraper works offline | `out/` contains valid listing JSON matching §8 |
| Ingest auth works | POST returns `200` with `"ok": true` |
| Pipeline accepts data | Response shows `processed > 0` (requires TAV craigslist adapter — see §11) |
| Volume | Hundreds+ listings/day posted on a schedule |

---

## 2. Zero-access bootstrap (start here)

You can start **today** with no TAV credentials, no other repos, and no Supabase access.

### Step 1 — Create the repo

```bash
mkdir tav-scrapers && cd tav-scrapers
git init
```

Copy this README into the repo root as `README.md`.

### Step 2 — Initialize Node project

```bash
npm init -y
npm pkg set type=module
npm install cheerio playwright
npm install -D typescript @types/node tsx vitest
npx playwright install chromium
```

**Recommended stack:**

| Piece | Choice | Why |
|-------|--------|-----|
| Runtime | Node 20+ | Matches signing examples; easy `fetch` |
| HTML parsing | Cheerio | Fast for static CL HTML |
| Browser | Playwright | Fallback when CL serves JS-heavy pages |
| Language | TypeScript | Optional but recommended |

### Step 3 — Create config files

Create `.env.example` (copy from §4.2) and `.env` locally (gitignored).

Set:

```bash
DRY_RUN=true
OUTPUT_DIR=./out
SCRAPE_REGION=dallas_tx
```

With `DRY_RUN=true`, the scraper **never calls ingest** — it writes envelopes to `./out/`.

### Step 4 — Build Craigslist scraper first

Implement in this order:

1. **Search** — fetch search results page → extract detail URLs.
2. **Detail** — fetch each listing page → parse into §8.2 JSON.
3. **Envelope** — wrap items in ingest envelope (§5.2).
4. **Output** — write `out/{run_id}.json` when `DRY_RUN=true`.
5. **Ingest** — when credentials arrive, set `DRY_RUN=false` and POST (§6).

### Step 5 — Validate output locally

Before any network POST, verify:

- Every item has `url`, `title`, `year`, `make`, `model`.
- `year >= 2000` (remote adapter rejects older).
- `source_listing_id` matches the Craigslist post ID in the URL.
- Envelope has valid `source`, `region`, `scraped_at`, 1–500 `items`.

Use the checklist in §13 Phase A.

---

## 3. Credentials you will need later

Nothing in this list is in the repo. Request from whoever operates TAV Enterprise.

| Credential | Used for | Staging value location |
|------------|----------|------------------------|
| `WEBHOOK_HMAC_SECRET` | Sign `POST /ingest` | Cloudflare Worker secret on `tav-aip-staging` |
| `INGEST_URL` | Where to POST | Fixed URL — see §5.1 |

**Staging vs production:**

| Environment | `INGEST_URL` |
|-------------|--------------|
| Staging (use first) | `https://tav-aip-staging.rami-1a9.workers.dev/ingest` |
| Production (after soak) | `https://tav-aip-production.rami-1a9.workers.dev/ingest` |

**Health check (no auth required):**

```bash
curl -s https://tav-aip-staging.rami-1a9.workers.dev/health
```

Expected:

```json
{ "ok": true, "service": "tav-enterprise", "version": "0.1.0", "timestamp": "..." }
```

If health fails, the Worker is down — fix that before debugging HMAC.

---

## 4. Repository layout and starter files

### 4.1 Directory layout

```text
tav-scrapers/
├── README.md                 ← this file
├── .env.example
├── .env                      ← gitignored
├── .gitignore
├── package.json
├── tsconfig.json
├── scripts/
│   └── smoke-ingest.mjs      ← §7 — test ingest without scraping
├── src/
│   ├── cli.ts                ← npm run scrape
│   ├── config.ts             ← read env
│   ├── ingest/
│   │   ├── client.ts         ← §6
│   │   └── batch.ts          ← split >500 items
│   ├── output/
│   │   └── writeEnvelope.ts  ← dry-run writer
│   └── sources/
│       └── craigslist/
│           ├── search.ts
│           ├── detail.ts
│           └── parse.ts
├── out/                      ← gitignored dry-run output
└── tests/
    └── fixtures/
        ├── cl-search.html
        └── cl-detail.html
```

### 4.2 `.env.example`

```bash
# ── Mode ──────────────────────────────────────────────────────────────────────
# true  = write JSON to OUTPUT_DIR only (no network ingest)
# false = POST to INGEST_URL (requires WEBHOOK_HMAC_SECRET)
DRY_RUN=true
OUTPUT_DIR=./out

# ── Ingest (required when DRY_RUN=false) ────────────────────────────────────
INGEST_URL=https://tav-aip-staging.rami-1a9.workers.dev/ingest
WEBHOOK_HMAC_SECRET=

# ── Scraper ───────────────────────────────────────────────────────────────────
SCRAPE_SOURCE=craigslist
SCRAPE_REGION=dallas_tx
CRAWL_CONCURRENCY=2
REQUEST_DELAY_MS=2000
MAX_LISTINGS_PER_RUN=100

# Craigslist search URL (Dallas cars+trucks by owner, example — tune as needed)
CRAIGSLIST_SEARCH_URL=https://dallas.craigslist.org/search/cta?purveyor=owner&sort=date
```

### 4.3 `.gitignore`

```gitignore
node_modules/
.env
out/
*.log
.playwright/
dist/
```

### 4.4 Minimal `package.json` scripts

```json
{
  "name": "tav-scrapers",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "scrape": "tsx src/cli.ts",
    "smoke:ingest": "node scripts/smoke-ingest.mjs",
    "test": "vitest run"
  }
}
```

### 4.5 Minimal `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

---

## 5. Ingest API contract

### 5.1 Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/health` | None | Liveness check |
| `POST` | `/ingest` | HMAC | Submit scraped listings |

Base URLs:

- Staging: `https://tav-aip-staging.rami-1a9.workers.dev`
- Production: `https://tav-aip-production.rami-1a9.workers.dev`

### 5.2 Request envelope

Every ingest POST body:

```typescript
type IngestRequest = {
  source: "craigslist" | "cars_com" | "facebook" | "autotrader" | "offerup";
  run_id: string;       // 1–128 chars, unique per completed run
  region: "dallas_tx" | "houston_tx" | "austin_tx" | "san_antonio_tx";
  scraped_at: string;   // ISO 8601 UTC, e.g. "2026-05-21T14:30:00.000Z"
  items: unknown[];     // 1–500 listing objects (see §8)
};
```

| Field | Rules |
|-------|--------|
| `source` | `"craigslist"` for this repo's first scraper |
| `run_id` | Unique per run. Format: `craigslist-{region}-{timestamp}` or UUID. Re-posting the same `source`+`run_id` after completion is a no-op (idempotent). |
| `region` | Closest TAV market — start with `dallas_tx` |
| `scraped_at` | UTC time when batch was assembled |
| `items` | 1–500 per request; split larger runs into multiple POSTs with `-batch-1`, `-batch-2` suffixes on `run_id` |

**Full example envelope** (one item):

```json
{
  "source": "craigslist",
  "run_id": "craigslist-dallas_tx-20260521T143000Z",
  "region": "dallas_tx",
  "scraped_at": "2026-05-21T14:30:00.000Z",
  "items": [
    {
      "url": "https://dallas.craigslist.org/ftw/cto/d/dallas-2019-honda-accord-sport/1234567890.html",
      "title": "2019 Honda Accord Sport - low miles",
      "source_listing_id": "1234567890",
      "price": 18500,
      "year": 2019,
      "make": "honda",
      "model": "accord",
      "trim": "sport",
      "mileage": 62000,
      "city": "Dallas",
      "state": "TX"
    }
  ]
}
```

### 5.3 Authentication (HMAC)

Sign the **exact UTF-8 bytes** of the JSON string you send as the body.

| Header | Value |
|--------|--------|
| `Content-Type` | `application/json` |
| `x-tav-signature` | `sha256=<lowercase hex>` |

**Critical:** Build the body string once, sign that string, send that same string. If you sign pretty-printed JSON but send compact JSON (or vice versa), you get `401 unauthorized`.

Algorithm: `HMAC-SHA256(secret, body)` → lowercase hex → prefix with `sha256=`.

Max body size: **2 MB**. Max items: **500**.

### 5.4 Response

**Success (200):**

```json
{
  "ok": true,
  "source": "craigslist",
  "run_id": "craigslist-dallas_tx-20260521T143000Z",
  "processed": 42,
  "rejected": 3,
  "created_leads": 1
}
```

| Field | Meaning |
|-------|---------|
| `processed` | Items that passed the source adapter and entered the pipeline |
| `rejected` | Items rejected at adapter or early validation |
| `created_leads` | New scored leads created (grade ≠ pass) |

**When worker hits ~25s time limit:**

```json
{ "ok": true, "truncated": true, "items_skipped": 12, ... }
```

**Errors:**

| HTTP | `error` | Fix |
|------|---------|-----|
| 401 | `unauthorized` | Wrong `WEBHOOK_HMAC_SECRET` or body/signature mismatch |
| 400 | `invalid_payload` | Envelope failed validation — see Appendix |
| 413 | `payload_too_large` | Reduce batch size or item payload |
| 503 | `ingest_auth_not_configured` | Worker secret not set — ops issue |
| 503 | `service_unavailable` | Database down — ops issue |

---

## 6. Complete ingest client (copy-paste)

Save as `src/ingest/client.ts`:

```typescript
import crypto from "node:crypto";

export type IngestRequest = {
  source: "craigslist" | "cars_com" | "facebook" | "autotrader" | "offerup";
  run_id: string;
  region: "dallas_tx" | "houston_tx" | "austin_tx" | "san_antonio_tx";
  scraped_at: string;
  items: unknown[];
};

export type IngestResponse = {
  ok: boolean;
  source?: string;
  run_id?: string;
  processed?: number;
  rejected?: number;
  created_leads?: number;
  truncated?: boolean;
  items_skipped?: number;
  error?: string;
};

export function signIngestBody(body: string, secret: string): string {
  const digest = crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${digest}`;
}

export async function postIngest(
  envelope: IngestRequest,
  options: { ingestUrl: string; secret: string; fetchImpl?: typeof fetch },
): Promise<{ status: number; body: IngestResponse }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = JSON.stringify(envelope);
  const res = await fetchImpl(options.ingestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tav-signature": signIngestBody(body, options.secret),
    },
    body,
  });
  const parsed = (await res.json()) as IngestResponse;
  return { status: res.status, body: parsed };
}

/** Split items into chunks of at most 500. */
export function batchEnvelope(
  base: Omit<IngestRequest, "items" | "run_id">,
  items: unknown[],
  runIdBase: string,
): IngestRequest[] {
  const MAX = 500;
  if (items.length === 0) return [];
  const batches: IngestRequest[] = [];
  for (let i = 0; i < items.length; i += MAX) {
    const chunk = items.slice(i, i + MAX);
    const batchNum = Math.floor(i / MAX) + 1;
    const suffix = items.length <= MAX ? "" : `-batch-${batchNum}`;
    batches.push({
      ...base,
      run_id: `${runIdBase}${suffix}`.slice(0, 128),
      items: chunk,
    });
  }
  return batches;
}
```

Save as `src/output/writeEnvelope.ts`:

```typescript
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { IngestRequest } from "../ingest/client.js";

export async function writeEnvelopeDryRun(outputDir: string, envelope: IngestRequest): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const file = path.join(outputDir, `${envelope.run_id}.json`);
  await writeFile(file, JSON.stringify(envelope, null, 2), "utf8");
  return file;
}
```

**CLI pattern:**

```typescript
// src/cli.ts (pseudocode — implement scrape → items → envelope)
import { batchEnvelope, postIngest } from "./ingest/client.js";
import { writeEnvelopeDryRun } from "./output/writeEnvelope.js";

const dryRun = process.env.DRY_RUN !== "false";
const runIdBase = `craigslist-${region}-${new Date().toISOString().replace(/[:.]/g, "")}`;

const envelopes = batchEnvelope(
  { source: "craigslist", region, scraped_at: new Date().toISOString(), items: [] },
  items,
  runIdBase,
);

for (const envelope of envelopes) {
  envelope.items = /* your scraped items for this batch */;
  if (dryRun) {
    const file = await writeEnvelopeDryRun(process.env.OUTPUT_DIR ?? "./out", envelope);
    console.log(`Wrote ${file} (${envelope.items.length} items)`);
  } else {
    const { status, body } = await postIngest(envelope, {
      ingestUrl: process.env.INGEST_URL!,
      secret: process.env.WEBHOOK_HMAC_SECRET!,
    });
    console.log(status, body);
  }
}
```

---

## 7. Smoke test without a scraper

Save as `scripts/smoke-ingest.mjs` — tests ingest auth with one fake listing.

```javascript
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

// Load .env manually (or use dotenv)
try {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch { /* no .env */ }

const INGEST_URL = process.env.INGEST_URL ?? "https://tav-aip-staging.rami-1a9.workers.dev/ingest";
const SECRET = process.env.WEBHOOK_HMAC_SECRET ?? "";

if (!SECRET) {
  console.error("Set WEBHOOK_HMAC_SECRET in .env first.");
  process.exit(1);
}

const envelope = {
  source: "craigslist",
  run_id: `smoke-${Date.now()}`,
  region: "dallas_tx",
  scraped_at: new Date().toISOString(),
  items: [
    {
      url: "https://dallas.craigslist.org/ftw/cto/d/dallas-2020-toyota-camry-se/9999999999.html",
      title: "2020 Toyota Camry SE - smoke test",
      source_listing_id: "9999999999",
      price: 15000,
      year: 2020,
      make: "toyota",
      model: "camry",
      trim: "se",
      mileage: 55000,
      city: "Dallas",
      state: "TX",
    },
  ],
};

const body = JSON.stringify(envelope);
const sig =
  "sha256=" + crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("hex");

const res = await fetch(INGEST_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-tav-signature": sig },
  body,
});

console.log("HTTP", res.status);
console.log(await res.json());
```

Run:

```bash
npm run smoke:ingest
```

**Interpret results:**

| Response | Meaning |
|----------|---------|
| `200`, `ok: true`, `rejected: 1`, `processed: 0` | Auth works. Craigslist adapter not deployed yet on TAV side — expected until they ship it. |
| `200`, `ok: true`, `processed: 1` | Auth works + adapter accepted the item. |
| `401` | Wrong secret or signature/body mismatch. |
| `400` + `invalid_payload` | Envelope shape wrong — see Appendix. |

---

## 8. Listing item schemas

The ingest envelope treats each `items[]` entry as opaque JSON. **Your scraper owns this shape.** Send as many fields as the page provides.

### 8.1 Required fields (for downstream adapter)

| Field | Type | Notes |
|-------|------|-------|
| `url` | string | Canonical listing URL |
| `title` | string | Full title, min ~6 chars |
| `year` | integer | **Must be 2000–2035** or item will be rejected downstream |
| `make` | string | Lowercase, e.g. `honda` |
| `model` | string | Lowercase, e.g. `accord` |

Strongly recommended: `price`, `mileage`, `trim`, `vin`, `city`, `state`, `source_listing_id`, `images`, `posted_at`.

**Do not filter for "buyable" in the scraper.** Send all in-scope passenger vehicles; the remote worker applies buy-box and scoring.

### 8.2 Craigslist item (canonical schema)

```json
{
  "url": "https://dallas.craigslist.org/ftw/cto/d/dallas-2019-honda-accord-sport/1234567890.html",
  "title": "2019 Honda Accord Sport - low miles",
  "source_listing_id": "1234567890",

  "price": 18500,
  "price_raw": "$18,500",

  "year": 2019,
  "make": "honda",
  "model": "accord",
  "trim": "sport",

  "mileage": 62000,
  "mileage_raw": "62,000 mi",

  "vin": null,

  "city": "Dallas",
  "state": "TX",
  "location_raw": "Dallas, TX",

  "posted_at": "2026-05-20T10:15:00.000Z",
  "posted_at_raw": "2026-05-20 10:15",

  "seller_name": "private",
  "seller_type": "owner",

  "images": ["https://images.craigslist.org/00E0E..."],

  "body_text": "Full listing description...",

  "attributes": {
    "cylinders": "4 cylinders",
    "drive": "fwd",
    "fuel": "gas",
    "odometer": "62000",
    "paint_color": "white",
    "title_status": "clean",
    "transmission": "automatic",
    "type": "sedan"
  },

  "scrape_meta": {
    "search_url": "https://dallas.craigslist.org/search/cta?purveyor=owner&sort=date",
    "scraped_at": "2026-05-21T14:30:00.000Z",
    "scraper_version": "0.1.0"
  }
}
```

Extract `source_listing_id` from the URL — Craigslist posts end with `/1234567890.html`.

### 8.3 Cars.com item (phase 2)

```json
{
  "url": "https://www.cars.com/vehicledetail/detail/123456789/overview/",
  "title": "2020 Toyota Camry SE",
  "source_listing_id": "123456789",
  "price": 19998,
  "year": 2020,
  "make": "toyota",
  "model": "camry",
  "trim": "se",
  "mileage": 45000,
  "vin": "4T1B11HK1KU123456",
  "city": "Plano",
  "state": "TX",
  "dealer_name": "Example Motors",
  "seller_type": "dealer",
  "images": ["https://..."],
  "scrape_meta": { "scraped_at": "2026-05-21T14:30:00.000Z", "scraper_version": "0.1.0" }
}
```

Use `"source": "cars_com"` in the envelope when posting Cars.com data.

---

## 9. Craigslist implementation guide

### 9.1 Starter search URLs (Dallas)

Pick one to start; tune filters in the CL UI and copy the resulting URL.

| Search | Example URL |
|--------|-------------|
| All cars & trucks, owner | `https://dallas.craigslist.org/search/cta?purveyor=owner&sort=date` |
| All cars & trucks, all sellers | `https://dallas.craigslist.org/search/cta?sort=date` |
| Fort Worth sub-area | `https://fortworth.craigslist.org/search/cta?purveyor=owner&sort=date` |

Map sub-areas to TAV region:

| Craigslist area | TAV `region` |
|-----------------|--------------|
| dallas.craigslist.org | `dallas_tx` |
| fortworth.craigslist.org | `dallas_tx` |
| houston.craigslist.org | `houston_tx` |
| austin.craigslist.org | `austin_tx` |
| sanantonio.craigslist.org | `san_antonio_tx` |

### 9.2 Scrape flow

```text
1. GET search URL (respect REQUEST_DELAY_MS between requests)
2. Parse HTML → listing detail URLs (dedupe URLs in-memory per run)
3. For each URL (up to MAX_LISTINGS_PER_RUN):
   a. GET detail page
   b. Parse: title, price, attrs (odometer, VIN, etc.), images, body
   c. Parse YMM from title if not in attributes
   d. Emit §8.2 JSON object
4. Build envelope(s) → dry-run write OR ingest POST
```

### 9.3 Parsing tips

- **Title format** is usually `{year} {make} {model} {trim}...` — parse explicitly; don't rely on the remote worker to parse Craigslist titles.
- **Price** lives in `.priceinfo` or similar on detail pages — store both `price` (int) and `price_raw` (string).
- **Odometer** is often in the attribute table as `odometer:` — map to `mileage` integer.
- **VIN** appears on some posts in attributes — include when present.
- **Skip** obvious non-passenger listings (RVs, trailers, parts-only) in the scraper if you want cleaner volume, but log skipped URLs.

### 9.4 Rate limiting and blocking

| Signal | Action |
|--------|--------|
| HTTP 403/429 | Exponential backoff; increase `REQUEST_DELAY_MS` |
| Empty search results | Check if CL HTML structure changed — update selectors |
| Captcha | Switch detail fetch to Playwright; reduce concurrency |

Start with `CRAWL_CONCURRENCY=2` and `REQUEST_DELAY_MS=2000`.

### 9.5 Local dedup cache (optional)

Keep a JSON/SQLite file of `{ url, sent_at }` so re-runs don't re-post the same listings the same day. The remote worker dedupes too, but local dedup saves ingest load.

---

## 10. Cars.com (phase 2)

Ship after Craigslist ingest is proven end-to-end.

Cars.com usually exposes structured YMM/VIN/dealer fields (better MMR hit rate) but uses stronger bot protection. Plan on Playwright + slower crawl from day one.

Same ingest path — only `source` and item schema change.

---

## 11. What the remote worker does with your data

You don't implement this — but you need to know what to expect.

```text
POST /ingest
  │
  ├─ Store each item in raw_listings (your JSON preserved exactly)
  │
  ├─ Run source adapter (craigslist.ts on TAV side)
  │    ├─ fail → rejected++ (reason: unsupported_source, missing_ymm, etc.)
  │    └─ ok → normalized_listings
  │
  ├─ Dedupe → vehicle_candidates
  ├─ MMR valuation (Cox/Manheim)
  ├─ Score + buy-box
  └─ If grade ≠ "pass" → leads row created
```

### Adapter dependency (important)

As of this doc, TAV Enterprise may only have a **Facebook** adapter deployed. If craigslist adapter is not live yet:

- Your POST still returns **`200 ok`**
- Items are **stored as raw**
- **`rejected` = item count**, **`processed` = 0**
- Reason on TAV side: `unsupported_source`

**This is not your bug.** Keep scraping; coordinate with TAV team to deploy `craigslist` adapter. Your §8.2 schema is the contract they should parse against.

### Downstream product (not this repo)

TAV Enterprise will eventually build:

- Listings browser (raw vs normalized vs lead)
- Human "buyable" overrides on filtered listings (ML training labels)
- Deals / near-miss queue

Your job is **volume + field quality** so those tools have data.

---

## 12. How to verify success without the TAV web app

You do not need Ingest Monitor or Supabase access.

| Step | Command / action | Pass criteria |
|------|------------------|---------------|
| 1 | `curl staging /health` | `"ok": true` |
| 2 | `DRY_RUN=true npm run scrape` | Files in `out/*.json` validate against §8 |
| 3 | `npm run smoke:ingest` | HTTP 200, not 401 |
| 4 | `DRY_RUN=false npm run scrape` | 200 + log `processed` / `rejected` / `created_leads` |
| 5 | Re-run same `run_id` | Idempotent 200, same counts, no duplicate processing |

**Log every ingest response:**

```text
run_id=... items=42 status=200 processed=38 rejected=4 created_leads=1
```

When `processed > 0`, the adapter is live. When `created_leads > 0`, a listing scored high enough to become a lead.

---

## 13. Rollout checklist

### Phase A — Zero credentials (you are here)

- [ ] Blank repo with §4 starter files
- [ ] Craigslist search + detail parser
- [ ] Items match §8.2
- [ ] `DRY_RUN=true` writes valid envelopes to `out/`
- [ ] Unit tests with saved HTML fixtures

### Phase B — Ingest auth

- [ ] Obtain `WEBHOOK_HMAC_SECRET` for staging
- [ ] `npm run smoke:ingest` → 200
- [ ] First real scrape POST → 200

### Phase C — End-to-end pipeline

- [ ] TAV team deploys craigslist adapter (their repo — not yours)
- [ ] POST shows `processed > 0`
- [ ] Tune parser until reject rate is acceptable

### Phase D — Production

- [ ] Soak on staging several days
- [ ] Switch `INGEST_URL` to production + production secret
- [ ] Schedule cron (GitHub Actions, VPS, etc.)
- [ ] Target: hundreds+ listings/day from Craigslist alone

### Phase E — Cars.com

- [ ] Scraper + `"source": "cars_com"` envelope
- [ ] TAV cars_com adapter (coordinate with TAV team)
- [ ] Same staging → production path

---

## 14. Out of scope

Do **not** build in this repository:

- Supabase / database access
- MMR / Cox / Manheim API calls
- Buy-box rules or deal scoring
- TAV `/app/*` frontend API
- User auth, assignment, workflow, ML training UI
- Human override / bypass of the worker pipeline
- Facebook scraping (unless explicitly added later)

---

## Appendix: validation rules

The remote worker validates the envelope with these rules. Items are **not** schema-validated at the envelope level — only counted (1–500).

### Envelope (`IngestRequest`)

| Field | Validation |
|-------|------------|
| `source` | Must be one of: `facebook`, `craigslist`, `autotrader`, `cars_com`, `offerup` |
| `run_id` | String, length 1–128 |
| `region` | Must be one of: `dallas_tx`, `houston_tx`, `austin_tx`, `san_antonio_tx` |
| `scraped_at` | ISO 8601 datetime string |
| `items` | Array, length 1–500 |

### Common `400 invalid_payload` causes

- Empty `items: []`
- 501+ items in one request
- Invalid `region` (e.g. `"dallas"` instead of `"dallas_tx"`)
- Invalid `source` typo (e.g. `"craiglist"`)
- `scraped_at` not ISO format
- Missing required envelope keys

### Per-item failures (returned as `rejected`, not HTTP 400)

These happen **inside** the worker after envelope acceptance:

| Reason | Typical cause |
|--------|---------------|
| `unsupported_source` | No adapter deployed for your `source` yet |
| `missing_identifier` | No `url` |
| `missing_title` | No / empty title |
| `missing_ymm` | Can't determine year/make/model |
| `invalid_year` | Year &lt; 2000 or &gt; 2035 |
| `invalid_price` | Price present but unparseable |

Design your scraper to populate §8.1 required fields so downstream rejects are rare.
