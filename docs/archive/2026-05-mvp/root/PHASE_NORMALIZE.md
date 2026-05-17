# PHASE NORMALIZE — Data normalization & schema-drift defense

> **Status:** Insert as **Phase 5.5** in `claude_code_prompt.md`, between the (optional) Sheet view layer and Make scenario import. Modifies Phase 4.5 (Supabase) to add validation + a dead-letter table. Modifies Phase 6 (Make) to insert a normalization stage between the Iterator and the HTTP POST.

## The problem

The current pipeline does:

```
Apify Iterator → Filter (is_live, is_sold) → Compute fingerprint → POST raw payload to Postgres
```

This breaks under three real-world conditions:

| Failure mode | Symptom | Frequency |
|---|---|---|
| **Null where we expect a value** (e.g. `vehicle_odometer_data` missing on lazy-load listings) | Postgres rejects `NULL::integer` cast on `mileage`; Make scenario errors on every listing without odometer data | ~5–15% of listings |
| **Type drift** (Facebook returns `price.amount` as string `"7500"` instead of number `7500`, or vice-versa across listings) | RPC silently inserts NULL; you don't notice for weeks | Intermittent |
| **Schema rename** (actor v1.4 renames `marketplace_listing_title` → `listing_title`) | All rows insert with NULL title until you debug it | Every actor major version |
| **New nested shape** (`location.reverse_geocode.city` becomes `location.city`) | Same as above | Every actor major version |
| **Unicode / quote issues in seller names** (e.g. `O'Brien Auto`) | Make body becomes invalid JSON, RPC call 400s | ~1% of listings |

None of this is theoretical. Every long-running Apify-backed pipeline I've seen hits all five within 6 months.

## The fix — three layers

### Layer 1 — Make.com normalization stage (between Iterator and RPC POST)

A new Make module that runs a **JavaScript transform** on every iterated item. Its job:

1. **Coerce types** — anything that should be a number becomes a number or `null`
2. **Apply defaults** — missing fields get sane defaults (e.g. `is_live` defaults to `true`)
3. **Strip control characters** — sanitize strings before they hit JSON
4. **Resolve field aliases** — try `title` → `marketplace_listing_title` → `listing_title` in order; first non-null wins
5. **Compute derived fields** — fingerprint hash, normalized city/make/model
6. **Tag with a `payload_version`** — so Postgres can reject ancient shapes if you ever change the contract

Make supports `tools:setMultipleVariables` modules where you can write JS-style expressions. For richer logic we use a single **`http:Request` to a Cloudflare Worker** (or Supabase Edge Function) that takes the raw item, runs Node-grade JavaScript over it, and returns a clean payload. This pattern is bulletproof and trivially testable.

### Layer 2 — Postgres validation in `upsert_listing()`

The RPC function gains a strict-validation prologue. Bad payloads get **rejected to a dead-letter table** instead of silently writing NULLs.

### Layer 3 — Schema-drift watchdog

A nightly job (Supabase pg_cron, free) that:
- Counts rows ingested in the last 24 hours where any "should never be NULL" field is NULL
- Compares the set of top-level keys seen in `tav.listings.raw` today vs. yesterday
- Emails Rami if anything changed

This catches Facebook/actor changes within 24 hours of them starting.

---

## Implementation

### 1. Cloudflare Worker — `tav-normalizer`

Why a Worker: free tier (100K requests/day, way more than we need), <10ms cold start, deployable in 60 seconds, and it's the only place where the transform logic lives — single source of truth, version-controlled, unit-testable.

Generate `scripts/normalizer-worker.js`:

```javascript
// ============================================================================
// TAV Normalizer — Cloudflare Worker
// Deployment:  npx wrangler deploy scripts/normalizer-worker.js --name tav-normalizer
// Endpoint:    https://tav-normalizer.<your-subdomain>.workers.dev
// Auth:        shared secret in `Authorization: Bearer <NORMALIZER_SECRET>` header
//
// Input:  { raw: <full Apify item> }
// Output: { ok: true,  payload: <normalized object ready for upsert_listing> }
//      OR { ok: false, error: "...", reason_code: "...", original_keys: [...] }
// ============================================================================

const PAYLOAD_VERSION = 1;

// "Should never be NULL" — if any of these can't be derived, send to dead-letter
const REQUIRED_FIELDS = ['listing_id', 'listing_url', 'fingerprint'];

// Field-alias resolver: try keys in order, return first non-null/non-empty value
function pick(obj, ...paths) {
  for (const path of paths) {
    const val = path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), obj);
    if (val !== null && val !== undefined && val !== '') return val;
  }
  return null;
}

// Coerce to integer or null (handles strings, floats, currency strings, garbage)
function toInt(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Coerce to boolean or default
function toBool(v, def = false) {
  if (v === null || v === undefined) return def;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).toLowerCase();
  if (['true','1','yes','y','t'].includes(s)) return true;
  if (['false','0','no','n','f'].includes(s)) return false;
  return def;
}

// Strip control chars, normalize whitespace, trim, cap length
function clean(v, maxLen = 2000) {
  if (v === null || v === undefined) return null;
  return String(v)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')   // strip control chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen) || null;
}

// SHA-1 fingerprint (Web Crypto API)
async function sha1(s) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function normalize(raw) {
  // ── ID resolution (across actor versions) ──────────────────────────────
  const listing_id = pick(raw,
    'id',
    'listing_id',
    'marketplace_listing_id',
    'fb_listing_id'
  );
  const listing_url = pick(raw,
    'listingUrl',
    'listing_url',
    'url'
  );

  // ── Title ──────────────────────────────────────────────────────────────
  const title = clean(pick(raw,
    'marketplace_listing_title',
    'listing_title',
    'title',
    'custom_title'
  ));

  // ── Price ──────────────────────────────────────────────────────────────
  const price = toInt(pick(raw,
    'listing_price.amount',
    'listing_price.value',
    'price.amount',
    'price'
  ));

  // ── Vehicle attrs ──────────────────────────────────────────────────────
  const year     = toInt(pick(raw, 'vehicle_year', 'year'));
  const make     = clean(pick(raw, 'vehicle_make_display_name', 'vehicle_make', 'make'));
  const model    = clean(pick(raw, 'vehicle_model_display_name', 'vehicle_model', 'model'));
  const mileage  = toInt(pick(raw,
    'vehicle_odometer_data.value',
    'vehicle_odometer_data.amount',
    'odometer.value',
    'mileage'
  ));

  // ── Location ───────────────────────────────────────────────────────────
  const location_city  = clean(pick(raw,
    'location.reverse_geocode.city',
    'location.city',
    'location_city'
  ));
  const location_state = clean(pick(raw,
    'location.reverse_geocode.state',
    'location.state',
    'location_state'
  ));

  // ── Seller ─────────────────────────────────────────────────────────────
  const seller_name = clean(pick(raw,
    'marketplace_listing_seller.name',
    'seller.name',
    'seller_name'
  ));
  const seller_id = clean(pick(raw,
    'marketplace_listing_seller.id',
    'seller.id',
    'seller_id'
  ));

  // ── Photo ──────────────────────────────────────────────────────────────
  const photo_url = pick(raw,
    'primary_listing_photo.image.uri',
    'primary_listing_photo.uri',
    'photo_url'
  );

  // ── Status flags ───────────────────────────────────────────────────────
  const is_live    = toBool(pick(raw, 'is_live', 'isLive'), true);
  const is_sold    = toBool(pick(raw, 'is_sold', 'isSold'), false);
  const is_pending = toBool(pick(raw, 'is_pending', 'isPending'), false);

  // ── Misc ───────────────────────────────────────────────────────────────
  const description    = clean(pick(raw, 'description', 'redacted_description'), 5000);
  const transmission   = clean(pick(raw, 'vehicle_transmission_type', 'transmission'));
  const exterior_color = clean(pick(raw, 'vehicle_exterior_color', 'exterior_color'));
  const vehicle_type   = clean(pick(raw, 'vehicle_vehicle_type', 'vehicle_type'));
  const listed_at      = pick(raw, 'creation_time', 'created_at', 'listed_at');

  // ── Fingerprint (mileage and price bucketed for relist tolerance) ──────
  const fpInput = [
    (year || '').toString().toLowerCase(),
    (make || '').toLowerCase(),
    (model || '').toLowerCase(),
    Math.floor((mileage || 0) / 5000),
    (location_city || '').toLowerCase(),
    Math.floor((price || 0) / 500)
  ].join('|');
  const fingerprint = await sha1(fpInput);

  // ── Required-field validation ──────────────────────────────────────────
  const payload = {
    payload_version: PAYLOAD_VERSION,
    listing_id, fingerprint, title, price, year, make, model, mileage,
    location_city, location_state, seller_name, seller_id, listing_url,
    photo_url, description, transmission, exterior_color, vehicle_type,
    is_live, is_sold, is_pending, listed_at,
    raw  // keep full original for forensics
  };

  for (const field of REQUIRED_FIELDS) {
    if (payload[field] === null || payload[field] === undefined || payload[field] === '') {
      return {
        ok: false,
        reason_code: 'missing_required',
        error: `Required field "${field}" could not be resolved`,
        original_keys: Object.keys(raw || {}),
        partial: payload
      };
    }
  }

  return { ok: true, payload };
}

export default {
  async fetch(req, env) {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    // Auth
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${env.NORMALIZER_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, reason_code: 'bad_json' }),
        { status: 400, headers: { 'content-type': 'application/json' } });
    }

    const raw = body.raw;
    if (!raw || typeof raw !== 'object') {
      return new Response(JSON.stringify({ ok: false, reason_code: 'no_raw' }),
        { status: 400, headers: { 'content-type': 'application/json' } });
    }

    const result = await normalize(raw);
    return new Response(JSON.stringify(result),
      { status: 200, headers: { 'content-type': 'application/json' } });
  }
};
```

**Deploy steps** (print these for Rami):

> 1. `cd ~/tav-marketplace/claude && npm i -g wrangler`
> 2. `wrangler login` (one-time browser auth to Cloudflare)
> 3. Create `wrangler.toml` (auto-generated by Phase 5.5):
>    ```toml
>    name = "tav-normalizer"
>    main = "scripts/normalizer-worker.js"
>    compatibility_date = "2026-04-01"
>    [vars]
>    # NORMALIZER_SECRET set via:  wrangler secret put NORMALIZER_SECRET
>    ```
> 4. Generate a secret: `openssl rand -hex 32` → save to `~/.tav-marketplace.env` as `NORMALIZER_SECRET`
> 5. `wrangler secret put NORMALIZER_SECRET` (paste the value)
> 6. `wrangler deploy` → note the worker URL, save to `~/.tav-marketplace.env` as `NORMALIZER_URL`

### 2. Make.com scenario — revised module list

Module count goes from 6 to 7. The new architecture:

| # | Module | Purpose |
|---|---|---|
| 1 | apify:WatchActorRuns | trigger on SUCCEEDED |
| 2 | apify:GetDatasetItems | fetch items |
| 3 | builtin:Iterator | per-item loop |
| 4 | builtin:BasicFilter | `is_live=true AND is_sold=false` |
| 5 | **http:Request → Cloudflare Worker (NEW)** | normalize + validate |
| 6 | builtin:Router | `{{5.ok}} = true` → continue; `false` → log to `dead_letter` |
| 7 | http:Request → Supabase RPC | POST `{{5.payload}}` to `upsert_listing` |

**Module 5 — Worker call:**
- **URL:** `{{env.NORMALIZER_URL}}`
- **Method:** POST
- **Headers:**
  - `Authorization: Bearer {{connection.NORMALIZER_SECRET}}`
  - `Content-Type: application/json`
- **Body:** `{ "raw": {{3}} }` (entire iterated item)
- **Parse response:** Yes
- **Evaluate non-2xx as error:** Yes

**Module 6 — Router:**

Route A (success): `{{5.ok}} = true` → Module 7 (Supabase RPC)
Route B (failure): `{{5.ok}} = false` → HTTP POST to Supabase RPC `tav.log_dead_letter()`:
  ```json
  {
    "payload": {
      "reason_code":   "{{5.reason_code}}",
      "error_message": "{{5.error}}",
      "original_keys": "{{5.original_keys}}",
      "partial":       "{{5.partial}}",
      "raw":           "{{3}}",
      "source_task":   "{{1.actorTaskId}}"
    }
  }
  ```

**Module 7 — Supabase RPC:** unchanged from Phase 6, but body is now `{ "payload": {{5.payload}} }` (already normalized).

**Op count:** 7 per listing (still well within Make Core's 10K/mo at expected volume).

### 3. Postgres — dead-letter table + log function

Add to `state/supabase-schema.sql`:

```sql
-- ============================================================================
-- Dead-letter table — payloads that couldn't be normalized
-- ============================================================================
CREATE TABLE IF NOT EXISTS tav.dead_letter (
  id              bigserial PRIMARY KEY,
  reason_code     text NOT NULL,
  error_message   text,
  original_keys   jsonb,
  partial         jsonb,
  raw             jsonb,
  source_task     text,
  received_at     timestamptz NOT NULL DEFAULT now(),
  resolved        boolean NOT NULL DEFAULT false,
  resolved_at     timestamptz,
  resolved_notes  text
);
CREATE INDEX IF NOT EXISTS idx_dead_letter_unresolved
  ON tav.dead_letter (received_at DESC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_dead_letter_reason
  ON tav.dead_letter (reason_code, received_at DESC);

CREATE OR REPLACE FUNCTION tav.log_dead_letter(payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO tav.dead_letter (reason_code, error_message, original_keys, partial, raw, source_task)
  VALUES (
    payload->>'reason_code',
    payload->>'error_message',
    payload->'original_keys',
    payload->'partial',
    payload->'raw',
    payload->>'source_task'
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION tav.log_dead_letter(jsonb) TO service_role;
```

### 4. Postgres — strict validation in `upsert_listing()`

Modify the existing function to reject malformed payloads at the DB layer (defense in depth — even if the Worker is bypassed somehow):

```sql
CREATE OR REPLACE FUNCTION tav.upsert_listing(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_listing_id   text := payload->>'listing_id';
  v_fingerprint  text := payload->>'fingerprint';
  v_listing_url  text := payload->>'listing_url';
  v_payload_ver  integer := COALESCE((payload->>'payload_version')::integer, 0);
  -- ... (rest of declarations as before)
BEGIN
  -- ── Validation prologue ────────────────────────────────────────────────
  IF v_payload_ver < 1 THEN
    PERFORM tav.log_dead_letter(jsonb_build_object(
      'reason_code', 'unversioned_payload',
      'error_message', 'payload_version missing or < 1',
      'raw', payload
    ));
    RETURN jsonb_build_object('ok', false, 'reason', 'unversioned_payload');
  END IF;

  IF v_listing_id IS NULL OR v_listing_id = ''
     OR v_fingerprint IS NULL OR v_fingerprint = ''
     OR v_listing_url IS NULL OR v_listing_url = '' THEN
    PERFORM tav.log_dead_letter(jsonb_build_object(
      'reason_code', 'missing_required_db',
      'error_message', 'required field null at DB layer',
      'raw', payload
    ));
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_required_db');
  END IF;

  -- ── ... (rest of upsert logic from Phase 4.5) ──────────────────────────
END;
$$;
```

### 5. Schema-drift watchdog (pg_cron, runs nightly)

Add to `state/supabase-schema.sql`:

```sql
-- ============================================================================
-- Watchdog tables + nightly job
-- ============================================================================
CREATE TABLE IF NOT EXISTS tav.drift_snapshots (
  id            bigserial PRIMARY KEY,
  snapshot_date date NOT NULL UNIQUE,
  top_keys      jsonb NOT NULL,                  -- distinct top-level keys seen in raw
  total_rows    integer NOT NULL,
  null_counts   jsonb NOT NULL,                  -- {field: nullcount} for monitored fields
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION tav.run_drift_check()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_today       date := current_date;
  v_yesterday   date := current_date - 1;
  v_top_keys    jsonb;
  v_null_counts jsonb;
  v_total       integer;
  v_prev_keys   jsonb;
  v_added       jsonb;
  v_removed     jsonb;
  v_dead_count  integer;
BEGIN
  -- 1. Top-level keys observed in raw payloads ingested in last 24h
  SELECT jsonb_agg(DISTINCT k ORDER BY k), count(*)
  INTO v_top_keys, v_total
  FROM tav.listings, jsonb_object_keys(raw) k
  WHERE first_seen_at >= v_today - 1;

  -- 2. NULL counts on fields that should rarely be NULL
  SELECT jsonb_build_object(
    'price',         count(*) FILTER (WHERE price IS NULL),
    'year',          count(*) FILTER (WHERE year IS NULL),
    'make',          count(*) FILTER (WHERE make IS NULL),
    'model',         count(*) FILTER (WHERE model IS NULL),
    'mileage',       count(*) FILTER (WHERE mileage IS NULL),
    'location_city', count(*) FILTER (WHERE location_city IS NULL),
    'photo_url',     count(*) FILTER (WHERE photo_url IS NULL)
  )
  INTO v_null_counts
  FROM tav.listings WHERE first_seen_at >= v_today - 1;

  -- 3. Dead-letter count in last 24h
  SELECT count(*) INTO v_dead_count
  FROM tav.dead_letter WHERE received_at >= v_today - 1;

  -- 4. Save today's snapshot
  INSERT INTO tav.drift_snapshots (snapshot_date, top_keys, total_rows, null_counts)
  VALUES (v_today, v_top_keys, v_total, v_null_counts)
  ON CONFLICT (snapshot_date) DO UPDATE
    SET top_keys = EXCLUDED.top_keys,
        total_rows = EXCLUDED.total_rows,
        null_counts = EXCLUDED.null_counts;

  -- 5. Diff vs yesterday
  SELECT top_keys INTO v_prev_keys
  FROM tav.drift_snapshots WHERE snapshot_date = v_yesterday;

  IF v_prev_keys IS NOT NULL THEN
    SELECT jsonb_agg(k) INTO v_added
    FROM jsonb_array_elements_text(v_top_keys) k
    WHERE NOT v_prev_keys @> to_jsonb(k::text);

    SELECT jsonb_agg(k) INTO v_removed
    FROM jsonb_array_elements_text(v_prev_keys) k
    WHERE NOT v_top_keys @> to_jsonb(k::text);
  END IF;

  RETURN jsonb_build_object(
    'date',         v_today,
    'total_rows',   v_total,
    'null_counts',  v_null_counts,
    'dead_letters', v_dead_count,
    'keys_added',   v_added,
    'keys_removed', v_removed
  );
END;
$$;

-- Schedule via pg_cron (Supabase has it pre-installed)
-- Note: pg_cron runs in UTC; 09:00 UTC = 04:00 America/Chicago (CDT) / 03:00 (CST)
SELECT cron.schedule(
  'tav-drift-check',
  '0 9 * * *',
  $$ SELECT tav.run_drift_check(); $$
);
```

**Email alerts** are wired via a simple Supabase Edge Function `drift-alert` triggered by an `AFTER INSERT` on `tav.drift_snapshots` that POSTs to Resend or SendGrid if `keys_added`, `keys_removed`, or any null_count is materially worse than yesterday. (Spec for the alert function lives in Phase 9.)

---

## Updated Make scenario blueprint summary

| Old (Phase 6) | New (Phase 6 with Phase 5.5 normalize) |
|---|---|
| 6 modules | 7 modules + 1 router branch |
| Raw payload → RPC | Worker normalization → router → RPC or dead-letter |
| Schema-fragile | Schema-drift-tolerant; alerts within 24h |
| 1 failure mode (RPC reject) | 3 explicit failure paths (Worker validation, RPC validation, dead-letter logging) |

---

## Updated CLAUDE.md additions

Add to the architecture diagram:

```
                           ▼
            ┌──────────────────────────┐
            │  Cloudflare Worker:      │
            │  tav-normalizer          │
            │   • Type coerce          │
            │   • Field-alias resolve  │
            │   • Sanitize strings     │
            │   • Compute fingerprint  │
            │   • Validate required    │
            └──────────┬───────────────┘
                       │ ok=true   ok=false
                       ▼              ▼
              upsert_listing()   tav.dead_letter
```

Add to "Done vs. pending":
- **Done:** Cloudflare Worker normalizer with type coercion, field aliasing, validation, fingerprint hashing
- **Done:** Postgres dead-letter table + nightly drift watchdog (pg_cron)

Add to env vars:
- `NORMALIZER_URL` — Cloudflare Worker endpoint
- `NORMALIZER_SECRET` — shared secret for Worker auth (stored in Make Connections vault and Cloudflare Workers secrets)

---

## Updated cost

| Component | Old | New |
|---|---|---|
| Apify | $70–100 | $70–100 |
| Make.com Core | $11 | $11 (still well under op cap) |
| Supabase free | $0 | $0 |
| **Cloudflare Workers** | — | **$0** (free tier: 100K req/day; we use ~10K/day) |
| **Total** | **$81–111/mo** | **$81–111/mo** |

Net cost impact: **$0**. The Worker is free at our volume.

---

## Updated deliverables checklist

Add to Phase 5.5 of the build prompt:
- [ ] Cloudflare account, `wrangler` CLI installed, logged in
- [ ] `scripts/normalizer-worker.js` deployed
- [ ] `wrangler.toml` generated and stored in `claude/`
- [ ] `NORMALIZER_URL` and `NORMALIZER_SECRET` added to `~/.tav-marketplace.env`
- [ ] `tav.dead_letter` table + `tav.log_dead_letter()` function applied
- [ ] `tav.upsert_listing()` updated with validation prologue
- [ ] `tav.run_drift_check()` + pg_cron schedule applied
- [ ] Make scenario re-imported with normalize stage (modules 5, 6, 7)
- [ ] Worker smoke test: send a known-good Apify item, get `{ok: true, payload: {...}}`
- [ ] Drift smoke test: `SELECT tav.run_drift_check();` returns sensible JSON
- [ ] Dead-letter smoke test: send malformed payload, verify row in `tav.dead_letter`

---

## Decision required from Rami

Before I fold this into the main build prompt:

1. **Cloudflare Worker (recommended) vs. Supabase Edge Function?** Both are free at this volume. I recommend Cloudflare because:
   - Cold-start is ~5ms vs ~150ms for Edge Functions
   - Wrangler tooling is more mature (TypeScript, local dev with `wrangler dev`)
   - Decouples normalization from your DB region (Worker is global; reduces Make → normalizer latency by 50ms+)
   - You already have a Cloudflare presence (most likely — you mentioned `texasautovalue.com`)
2. **Email channel for drift alerts: Resend, SendGrid, or just plain SMTP?** Resend free tier (3K/mo) is the cleanest; SendGrid free is 100/day; SMTP from Gmail works but is brittle.

Once you answer, I'll integrate this as Phase 5.5 in `claude_code_prompt.md`, update the Make blueprint generator, expand the Supabase schema in Phase 4.5 to include the dead-letter and drift tables, and update `setup.sh --init` to capture `NORMALIZER_URL`/`NORMALIZER_SECRET`.
