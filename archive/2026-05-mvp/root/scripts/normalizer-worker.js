// ============================================================================
// TAV Normalizer — Cloudflare Worker
// ----------------------------------------------------------------------------
// Single source of truth for transforming raw Apify Marketplace items into
// validated, type-coerced payloads ready for tav.upsert_listing().
//
// Deploy:    wrangler deploy
// Endpoint:  https://tav-normalizer.<your-subdomain>.workers.dev
// Auth:      shared secret in `Authorization: Bearer <NORMALIZER_SECRET>`
//
// Input:   { raw: <full Apify item> }
// Output:  { ok: true,  payload: <normalized object>, payload_version: 1 }
//       OR { ok: false, reason_code: "...", error: "...",
//            original_keys: [...], partial: <best-effort payload> }
// ============================================================================

const PAYLOAD_VERSION = 1;
const WORKER_VERSION = 'v1.5.0';   // v1.5.0: Manheim YMM uses search endpoint + cleanModel() for better partial matching
const REQUIRED_FIELDS = ['listing_id', 'listing_url', 'fingerprint'];
const MAX_DESCRIPTION_LEN = 5000;
const MAX_STRING_LEN = 2000;

// Manheim MMR — Mashery OAuth2 client_credentials
// Env (set via wrangler secret put):
//   MANHEIM_ENV          'prod' | 'uat'  (default: prod)
//   MANHEIM_CLIENT_ID    Mashery key (prod or uat depending on MANHEIM_ENV)
//   MANHEIM_CLIENT_SECRET
// Token + value caches live in Worker isolate memory; clear on cold start.
const MANHEIM_BASE_PROD = 'https://api.manheim.com';
const MANHEIM_BASE_UAT  = 'https://uat.api.manheim.com';
const MMR_VALUE_TTL_MS  = 24 * 60 * 60 * 1000;       // 24h cache
const MMR_FETCH_TIMEOUT_MS = 4000;                    // never block ingest >4s on MMR
const tokenCache = { token: null, expiresAt: 0 };
const mmrCache   = new Map();                         // key → { value, expiresAt }

function manheimBase(env) {
  return (env.MANHEIM_ENV === 'uat') ? MANHEIM_BASE_UAT : MANHEIM_BASE_PROD;
}

/** Get + cache a Mashery OAuth2 bearer token. */
async function getManheimToken(env) {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60_000) return tokenCache.token;
  if (!env.MANHEIM_CLIENT_ID || !env.MANHEIM_USERNAME || !env.MANHEIM_PASSWORD) return null;

  const encoded = btoa(`${env.MANHEIM_CLIENT_ID}:${env.MANHEIM_CLIENT_SECRET}`);
  const body = new URLSearchParams({
    grant_type: 'password',
    username: env.MANHEIM_USERNAME,
    password: env.MANHEIM_PASSWORD,
    scope: 'inventory:customer'
  });
  const res = await fetch(env.MANHEIM_TOKEN_URL || `${manheimBase(env)}/oauth2/token.oauth2`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${encoded}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!res.ok) return null;
  const j = await res.json();
  if (!j.access_token) return null;
  tokenCache.token = j.access_token;
  const expiresIn = Number(j.expires_in);
  tokenCache.expiresAt = now + ((expiresIn > 0 ? expiresIn : 3000) * 1000);
  return j.access_token;
}

/** Extract model year (1950–2035) from a title string. */
function extractYearFromTitle(t) {
  const m = (t || '').match(/\b(19[5-9]\d|20[0-3]\d)\b/);
  return m ? parseInt(m[0], 10) : null;
}

/** Extract a 17-char VIN from title/description. Excludes I, O, Q. */
function extractVin(title, description) {
  const re = /\b[A-HJ-NPR-Z0-9]{17}\b/;
  const sources = [title || '', description || ''];
  for (const s of sources) {
    const m = s.match(re);
    if (m) return m[0].toUpperCase();
  }
  return null;
}

/** Build the cache key used by both sync (cache-only) and async paths. */
function mmrCacheKey({ vin, year, make, model, miles }) {
  return vin
    ? `vin:${vin}:${Math.floor(miles / 1000)}`
    : `ymm:${year}|${(make||'').toLowerCase()}|${(model||'').toLowerCase()}:${Math.floor(miles / 1000)}`;
}

/**
 * Cache-only MMR lookup. Returns { value, source, cached:true } or null.
 * Synchronous (no network) — safe to call on the hot path.
 */
function tryMmrFromCache({ vin, year, make, model, miles }) {
  if (miles == null || !Number.isFinite(miles)) return null;
  const key = mmrCacheKey({ vin, year, make, model, miles });
  const hit = mmrCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return { ...hit.value, cached: true };
  return null;
}

const STATE_REGION = {
  ME:'ne',NH:'ne',VT:'ne',MA:'ne',RI:'ne',CT:'ne',NY:'ne',NJ:'ne',PA:'ne',DE:'ne',MD:'ne',DC:'ne',
  VA:'se',WV:'se',NC:'se',SC:'se',GA:'se',FL:'se',TN:'se',AL:'se',MS:'se',KY:'se',
  TX:'sw',OK:'sw',AR:'sw',LA:'sw',NM:'sw',AZ:'sw',
  OH:'mw',IN:'mw',IL:'mw',MI:'mw',WI:'mw',MN:'mw',IA:'mw',MO:'mw',ND:'mw',SD:'mw',NE:'mw',KS:'mw',
  CA:'w',OR:'w',WA:'w',NV:'w',UT:'w',CO:'w',ID:'w',MT:'w',WY:'w',AK:'w',HI:'w'
};

function stateToRegion(state) {
  if (!state) return null;
  return STATE_REGION[(state || '').toUpperCase().trim()] || null;
}

/** Strip trim designators so partial search matches the base model. */
function cleanModel(model) {
  if (!model) return model;
  const trimWords = /\b(LE|SE|XLE|XSE|TRD|SR|SR5|LT|LTZ|LT1|LS|SS|RS|ZL1|Z71|AT4|Denali|SLE|SLT|SL|SV|SR|Pro|Sport|Platinum|Limited|Premium|Base|XLT|XL|STX|FX4|Lariat|King Ranch|Raptor|EX|EX-L|LX|EX-T|Touring|Elite|Hybrid|AWD|4WD|4x4|4x2|RWD|FWD|Crew|Double|Extended|Regular|Cab|Max)\b/gi;
  return model.replace(trimWords, '').replace(/\s{2,}/g, ' ').trim() || model;
}

/**
 * Fetch MMR from Manheim. Returns { value, source, raw } or null.
 * source ∈ 'vin' | 'ymm'. Always passes odometer when miles is known.
 */
async function fetchMmr(env, { vin, year, make, model, miles, state }) {
  if (miles == null || !Number.isFinite(miles)) return null;   // no miles → skip
  const token = await getManheimToken(env);
  if (!token) return null;

  const cacheKey = mmrCacheKey({ vin, year, make, model, miles });
  const hit = mmrCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return { ...hit.value, cached: true };

  const base = manheimBase(env);
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MMR_FETCH_TIMEOUT_MS);

  try {
    const region = stateToRegion(state);
    const regionParam = region ? `&region=${region}` : '';

    // 1. VIN-first
    if (vin) {
      const url = `${base}/valuations/vin/${encodeURIComponent(vin)}?odometer=${miles}${regionParam}`;
      const r = await fetch(url, { headers, signal: ctrl.signal });
      if (r.ok) {
        const j = await r.json();
        const value = pickMmrValue(j);
        if (value != null) {
          const out = { value, source: 'vin', raw: j };
          mmrCache.set(cacheKey, { value: out, expiresAt: Date.now() + MMR_VALUE_TTL_MS });
          return out;
        }
      }
    }

    // 2. YMM fallback — search endpoint accepts partial model names
    if (year && make && model) {
      const url = `${base}/valuations/search/years/${year}/makes/${encodeURIComponent(make)}/models/${encodeURIComponent(cleanModel(model))}?odometer=${miles}${regionParam}`;
      const r = await fetch(url, { headers, signal: ctrl.signal });
      if (r.ok) {
        const j = await r.json();
        const value = pickMmrValue(j);
        if (value != null) {
          const out = { value, source: 'ymm', raw: j };
          mmrCache.set(cacheKey, { value: out, expiresAt: Date.now() + MMR_VALUE_TTL_MS });
          return out;
        }
      }
    }
  } catch {
    // network error / timeout / abort — caller handles miss
  } finally {
    clearTimeout(timer);
  }
  return null;
}

/** Manheim payload shape varies; prefer bestMatch item with adjustedPricing. */
function pickMmrValue(j) {
  const best = j?.items?.find(i => i.bestMatch) || j?.items?.[0];
  const candidates = [
    best?.adjustedPricing?.wholesale?.average,
    best?.wholesale?.average,
    j?.wholesale?.average,
    j?.items?.[0]?.wholesale?.average,
    j?.adjustedMmr,
    j?.mmr,
    j?.value,
    j?.items?.[0]?.adjustedMmr
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

/** Mileage-adjusted target + confidence flag. Worker computes both so RPC stays simple. */
function mileageBaseline(year) {
  const currentYear = new Date().getUTCFullYear();
  const age = Math.max(0, currentYear - (year || currentYear));
  return age * 12000;   // 12K mi/yr conventional baseline
}

function computeAdjusted(mmr, year, miles) {
  if (mmr == null) return null;
  const baseline = mileageBaseline(year);
  const excess = Math.max(0, (miles || 0) - baseline);
  const penalty = Math.min(0.15, (excess / 100000) * 0.08);
  return Math.round(mmr * (1 - penalty));
}

function computeConfidence({ source, miles, year }) {
  if (source !== 'vin' && source !== 'ymm') return 'none';
  const baseline = mileageBaseline(year);
  const overBy = Math.max(0, (miles || 0) - baseline);
  if (source === 'ymm') return 'low';
  if (overBy > 100000) return 'low';
  if (overBy > 50000)  return 'medium';
  return 'high';
}

/** Dollar-spread tiers. Default thresholds; can be overridden per call. */
function gradeDeal(price, mmrAdjusted, thresholds = {}) {
  if (price == null || mmrAdjusted == null) return 'unknown';
  const stealUnder = thresholds.stealUnder ?? 2000;   // price ≤ adj − $2000
  const greatBand  = thresholds.greatBand  ?? 500;    // adj−2000 < price ≤ adj−500
  const goodBand   = thresholds.goodBand   ?? 500;    // |price − adj| < 500
  const fairBand   = thresholds.fairBand   ?? 1500;   // adj+500 < price ≤ adj+1500
  const delta = price - mmrAdjusted;
  if (delta <= -stealUnder)        return 'steal';
  if (delta <= -greatBand)         return 'great';
  if (Math.abs(delta) < goodBand)  return 'good';
  if (delta <= fairBand)           return 'fair';
  return 'pass';
}

/**
 * Background MMR enrichment. Fires the Manheim call and writes the result
 * back via the `tav.upsert_mmr_async(listing_id, payload)` Postgres RPC.
 * Never throws — caller invokes via ctx.waitUntil() and forgets.
 *
 * Result payload shape (jsonb arg to RPC):
 *   { mmr, mmr_adjusted, mmr_source, mmr_confidence, mmr_fetched_at,
 *     deal_grade, mmr_outcome, mmr_lookup_ms }
 * On miss/error, mmr is null and mmr_outcome='miss' (or 'error').
 */
async function enqueueMmrAsync(env, listing_id, params) {
  const t0 = Date.now();
  let result;
  try {
    const m = await fetchMmr(env, params);
    if (m && m.value != null) {
      const adjusted   = computeAdjusted(m.value, params.year, params.miles);
      const confidence = computeConfidence({ source: m.source, miles: params.miles, year: params.year });
      const grade      = gradeDeal(params.price, adjusted);
      result = {
        mmr:             m.value,
        mmr_adjusted:    adjusted,
        mmr_source:      m.source,
        mmr_confidence:  confidence,
        mmr_fetched_at:  new Date().toISOString(),
        deal_grade:      grade,
        mmr_outcome:     m.source === 'vin' ? 'vin_hit' : 'ymm_hit',
        mmr_lookup_ms:   Date.now() - t0
      };
    } else {
      result = {
        mmr:             null,
        mmr_adjusted:    null,
        mmr_source:      null,
        mmr_confidence:  'none',
        mmr_fetched_at:  new Date().toISOString(),
        deal_grade:      'unknown',
        mmr_outcome:     'miss',
        mmr_lookup_ms:   Date.now() - t0
      };
    }
  } catch (err) {
    result = {
      mmr:             null,
      mmr_adjusted:    null,
      mmr_source:      null,
      mmr_confidence:  'none',
      mmr_fetched_at:  new Date().toISOString(),
      deal_grade:      'unknown',
      mmr_outcome:     'error',
      mmr_lookup_ms:   Date.now() - t0,
      error:           String(err && err.message || err).slice(0, 500)
    };
  }

  // Write back via Supabase RPC. PostgREST exposes /rest/v1/rpc/<func>.
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    try {
      await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/upsert_mmr_async`, {
        method: 'POST',
        headers: {
          'apikey':          env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization':   `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type':    'application/json',
          'Content-Profile': 'tav',
          'Prefer':          'return=minimal'
        },
        body: JSON.stringify({ p_listing_id: listing_id, p_payload: result }),
        signal: ac.signal
      });
    } finally {
      clearTimeout(t);
    }
  } catch {
    // Background write failure: tav-retry-mmr cron will pick up rows still
    // marked 'pending' beyond the retry threshold and re-attempt.
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve a value by trying multiple dot-notation paths in order.
 * Returns the first non-null/non-empty value, or null.
 */
function pick(obj, ...paths) {
  for (const path of paths) {
    const val = path.split('.').reduce(
      (o, k) => (o != null && o[k] !== undefined ? o[k] : null),
      obj
    );
    if (val !== null && val !== undefined && val !== '') return val;
  }
  return null;
}

/** Coerce to integer or null. Handles strings, currency, garbage. */
function toInt(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Coerce to boolean with default. */
function toBool(v, def = false) {
  if (v === null || v === undefined) return def;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).toLowerCase().trim();
  if (['true', '1', 'yes', 'y', 't'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'f'].includes(s)) return false;
  return def;
}

/** Sanitize string: strip control chars, collapse whitespace, cap length. */
function clean(v, maxLen = MAX_STRING_LEN) {
  if (v === null || v === undefined) return null;
  const s = String(v)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return s || null;
}

/** SHA-1 via Web Crypto. */
async function sha1(s) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** ISO 8601 normalizer. Accepts Unix seconds, ms, or string. */
function toIso(v) {
  if (v === null || v === undefined || v === '') return null;
  let d;
  if (typeof v === 'number') {
    // Unix seconds vs ms heuristic
    d = new Date(v < 1e12 ? v * 1000 : v);
  } else {
    d = new Date(v);
  }
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// ─── Core normalize logic ───────────────────────────────────────────────────

async function normalize(raw) {
  // ── ID resolution (across actor versions) ─────────────────────────────
  const listing_id = pick(raw,
    'id', 'listing_id', 'marketplace_listing_id', 'fb_listing_id'
  );
  const listing_url = pick(raw,
    'extraListingData.share_uri', 'listingUrl', 'listing_url', 'url'
  );

  // ── Title ─────────────────────────────────────────────────────────────
  const title = clean(pick(raw,
    'marketplace_listing_title', 'listing_title', 'title', 'custom_title'
  ));

  // ── Price ─────────────────────────────────────────────────────────────
  const price = toInt(pick(raw,
    'listing_price.amount', 'listing_price.value',
    'price.amount', 'price'
  ));

  // ── Vehicle attrs ─────────────────────────────────────────────────────
  const year    = toInt(pick(raw, 'extraListingData.vehicle_year', 'vehicle_year', 'year'))
    ?? extractYearFromTitle(title);
  const make    = clean(pick(raw, 'extraListingData.vehicle_make_display_name', 'vehicle_make_display_name', 'vehicle_make', 'make'));
  const model   = clean(pick(raw, 'extraListingData.vehicle_model_display_name', 'vehicle_model_display_name', 'vehicle_model', 'model'));
  const mileage = toInt(pick(raw,
    'extraListingData.vehicle_odometer_data.value', 'extraListingData.vehicle_odometer_data.amount',
    'vehicle_odometer_data.value', 'vehicle_odometer_data.amount',
    'odometer.value', 'mileage'
  ));

  // ── Location ──────────────────────────────────────────────────────────
  const location_city = clean(pick(raw,
    'location.reverse_geocode.city', 'location.city', 'location_city'
  ));
  const location_state = clean(pick(raw,
    'location.reverse_geocode.state', 'location.state', 'location_state'
  ));

  // ── Seller ────────────────────────────────────────────────────────────
  const seller_name = clean(pick(raw,
    'marketplace_listing_seller.name', 'seller.name', 'seller_name'
  ));
  const seller_id = clean(pick(raw,
    'marketplace_listing_seller.id', 'seller.id', 'seller_id'
  ));

  // ── Photo ─────────────────────────────────────────────────────────────
  const photo_url = pick(raw,
    'primary_listing_photo.image.uri', 'primary_listing_photo.uri', 'photo_url'
  );

  // ── Status flags ──────────────────────────────────────────────────────
  const is_live    = toBool(pick(raw, 'is_live', 'isLive'), true);
  const is_sold    = toBool(pick(raw, 'is_sold', 'isSold'), false);
  const is_pending = toBool(pick(raw, 'is_pending', 'isPending'), false);

  // ── Misc ──────────────────────────────────────────────────────────────
  const description    = clean(pick(raw, 'extraListingData.description', 'extraListingData.redacted_description', 'description', 'redacted_description'), MAX_DESCRIPTION_LEN);
  const transmission   = clean(pick(raw, 'extraListingData.vehicle_transmission_type', 'vehicle_transmission_type', 'transmission'));
  const exterior_color = clean(pick(raw, 'extraListingData.vehicle_exterior_color', 'vehicle_exterior_color', 'exterior_color'));
  const vehicle_type   = clean(pick(raw, 'extraListingData.vehicle_vehicle_type', 'vehicle_vehicle_type', 'vehicle_type'));
  const listed_at      = toIso(pick(raw, 'creation_time', 'created_at', 'listed_at'));

  // ── Fingerprint (mileage 5K bucket, price $500 bucket → relist tolerant) ──
  const fpInput = [
    String(year || '').toLowerCase(),
    (make || '').toLowerCase(),
    (model || '').toLowerCase(),
    Math.floor((mileage || 0) / 5000),
    (location_city || '').toLowerCase(),
    Math.floor((price || 0) / 500)
  ].join('|');
  const fingerprint = await sha1(fpInput);

  // ── VIN (best-effort) ────────────────────────────────────────────────
  const vin = extractVin(title, description);

  const payload = {
    payload_version: PAYLOAD_VERSION,
    listing_id, fingerprint, title, price, year, make, model, mileage,
    location_city, location_state, seller_name, seller_id, listing_url,
    photo_url, description, transmission, exterior_color, vehicle_type,
    is_live, is_sold, is_pending, listed_at, vin,
    raw   // keep full original for forensics
  };

  // ── Required-field validation ─────────────────────────────────────────
  const missing_fields = [];
  for (const field of REQUIRED_FIELDS) {
    const v = payload[field];
    if (v === null || v === undefined || v === '') missing_fields.push(field);
  }
  if (missing_fields.length) {
    return {
      ok: false,
      reason: 'missing_required',
      missing_fields,
      error: `Required field(s) could not be resolved: ${missing_fields.join(', ')}`,
      original_keys: Object.keys(raw || {}),
      partial: payload
    };
  }

  return { ok: true, payload };
}

/** Constant-time bearer token comparison — prevents timing-based secret enumeration. */
async function authOk(header, secret) {
  const expected = `Bearer ${secret}`;
  const a = new TextEncoder().encode(header);
  const b = new TextEncoder().encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

// ─── HTTP entry ─────────────────────────────────────────────────────────────

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({
        ok: true,
        service: 'tav-normalizer',
        payload_version: PAYLOAD_VERSION,
        worker_version: WORKER_VERSION
      }, 200);
    }

    if (req.method !== 'POST' || url.pathname !== '/normalize') {
      return new Response('Not Found', { status: 404 });
    }

    const auth = req.headers.get('authorization') || '';
    if (!await authOk(auth, env.NORMALIZER_SECRET)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const t0 = Date.now();
    const received_at = new Date(t0).toISOString();

    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, reason: 'bad_json',
        error: 'Request body is not valid JSON',
        normalizer_received_at: received_at,
        normalizer_duration_ms: Date.now() - t0,
        worker_version: WORKER_VERSION }, 400);
    }

    const raw = body && body.raw;
    if (!raw || typeof raw !== 'object') {
      return jsonResponse({ ok: false, reason: 'no_raw',
        error: 'Request body must be { raw: <object> }',
        normalizer_received_at: received_at,
        normalizer_duration_ms: Date.now() - t0,
        worker_version: WORKER_VERSION }, 400);
    }

    try {
      const result = await normalize(raw);
      const duration_ms = Date.now() - t0;
      // Stamp every response with metrics envelope; downstream RPC reads these.
      if (result.ok) {
        // ── Manheim MMR enrichment (v1.3.0: sync on cache hit, async on miss) ──
        // On cache HIT: enrich inline (sub-millisecond, no network).
        // On cache MISS: ship payload immediately with mmr_outcome='pending'
        // and fire the Manheim call via ctx.waitUntil(). Background handler
        // writes the result back through tav.upsert_mmr_async() RPC.
        const mmrT0 = Date.now();
        let mmr_outcome;
        if (result.payload.mileage == null) {
          // No miles → MMR is meaningless. Stamp skip and move on.
          result.payload.mmr_confidence = 'none';
          result.payload.deal_grade     = 'unknown';
          mmr_outcome                   = 'skip_no_miles';
        } else {
          const params = {
            vin:   result.payload.vin,
            year:  result.payload.year,
            make:  result.payload.make,
            model: result.payload.model,
            miles: result.payload.mileage,
            price: result.payload.price,
            state: result.payload.location_state
          };
          const cached = tryMmrFromCache(params);
          if (cached && cached.value != null) {
            const adjusted   = computeAdjusted(cached.value, params.year, params.miles);
            const confidence = computeConfidence({ source: cached.source, miles: params.miles, year: params.year });
            const grade      = gradeDeal(params.price, adjusted);
            result.payload.mmr             = cached.value;
            result.payload.mmr_adjusted    = adjusted;
            result.payload.mmr_source      = cached.source;
            result.payload.mmr_confidence  = confidence;
            result.payload.mmr_fetched_at  = new Date().toISOString();
            result.payload.deal_grade      = grade;
            mmr_outcome = cached.source === 'vin' ? 'vin_hit' : 'ymm_hit';
          } else {
            // Cache miss → ship 'pending' now, enrich in background.
            result.payload.mmr             = null;
            result.payload.mmr_adjusted    = null;
            result.payload.mmr_source      = null;
            result.payload.mmr_confidence  = 'none';
            result.payload.mmr_fetched_at  = null;
            result.payload.deal_grade      = 'unknown';
            mmr_outcome                    = 'pending';
            if (ctx && typeof ctx.waitUntil === 'function') {
              ctx.waitUntil(enqueueMmrAsync(env, result.payload.listing_id, params));
            }
          }
        }
        result.payload.mmr_lookup_ms = Date.now() - mmrT0;
        result.payload.mmr_outcome   = mmr_outcome;

        result.payload.normalizer_received_at = received_at;
        result.payload.normalizer_duration_ms = duration_ms;
        result.payload.worker_version = WORKER_VERSION;
      } else {
        result.normalizer_received_at = received_at;
        result.normalizer_duration_ms = duration_ms;
        result.worker_version = WORKER_VERSION;
      }
      return jsonResponse(result, 200);
    } catch (err) {
      return jsonResponse({
        ok: false,
        reason: 'normalize_exception',
        error: String(err && err.message || err),
        original_keys: Object.keys(raw),
        normalizer_received_at: received_at,
        normalizer_duration_ms: Date.now() - t0,
        worker_version: WORKER_VERSION
      }, 500);
    }
  }
};

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
