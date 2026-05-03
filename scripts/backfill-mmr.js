#!/usr/bin/env node
// backfill-mmr.js — fetch Manheim MMR for listings with mileage but no deal grade
// Usage: node scripts/backfill-mmr.js
// Requires env vars: MANHEIM_CLIENT_ID, MANHEIM_CLIENT_SECRET, MANHEIM_USERNAME,
//                    MANHEIM_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const MANHEIM_TOKEN_URL   = 'https://api.manheim.com/oauth2/token.oauth2';
const MANHEIM_BASE        = 'https://api.manheim.com';
const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_KEY        = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLIENT_ID           = process.env.MANHEIM_CLIENT_ID;
const CLIENT_SECRET       = process.env.MANHEIM_CLIENT_SECRET;
const USERNAME            = process.env.MANHEIM_USERNAME;
const PASSWORD            = process.env.MANHEIM_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_KEY || !CLIENT_ID || !CLIENT_SECRET || !USERNAME || !PASSWORD) {
  console.error('Missing required env vars. Set MANHEIM_CLIENT_ID, MANHEIM_CLIENT_SECRET, MANHEIM_USERNAME, MANHEIM_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function getToken() {
  const encoded = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(MANHEIM_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${encoded}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: USERNAME,
      password: PASSWORD,
      scope: 'inventory:customer'
    })
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`Token failed: ${JSON.stringify(j)}`);
  console.log('Manheim token obtained');
  return j.access_token;
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

function cleanModel(model) {
  if (!model) return model;
  const trimWords = /\b(LE|SE|XLE|XSE|TRD|SR|SR5|LT|LTZ|LT1|LS|SS|RS|ZL1|Z71|AT4|Denali|SLE|SLT|SL|SV|SR|Pro|Sport|Platinum|Limited|Premium|Base|XLT|XL|STX|FX4|Lariat|King Ranch|Raptor|EX|EX-L|LX|EX-T|Touring|Elite|Hybrid|AWD|4WD|4x4|4x2|RWD|FWD|Crew|Double|Extended|Regular|Cab|Max)\b/gi;
  return model.replace(trimWords, '').replace(/\s{2,}/g, ' ').trim() || model;
}

async function getMmr(token, { vin, year, make, model, miles, state }) {
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
  const region = stateToRegion(state);
  const regionParam = region ? `&region=${region}` : '';

  if (vin) {
    const url = `${MANHEIM_BASE}/valuations/vin/${encodeURIComponent(vin)}?odometer=${miles}${regionParam}`;
    const r = await fetch(url, { headers });
    if (r.ok) {
      const j = await r.json();
      const val = pickValue(j);
      if (val) return { value: val, source: 'vin' };
    }
  }

  if (year && make && model) {
    const url = `${MANHEIM_BASE}/valuations/search/years/${year}/makes/${encodeURIComponent(make)}/models/${encodeURIComponent(cleanModel(model))}?odometer=${miles}${regionParam}`;
    const r = await fetch(url, { headers });
    if (r.ok) {
      const j = await r.json();
      const val = pickValue(j);
      if (val) return { value: val, source: 'ymm' };
    }
  }

  return null;
}

function pickValue(j) {
  const best = j?.items?.find(i => i.bestMatch) || j?.items?.[0];
  const candidates = [
    best?.adjustedPricing?.wholesale?.average,
    best?.wholesale?.average,
    j?.wholesale?.average,
    j?.adjustedMmr,
    j?.mmr,
    j?.value
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

function gradeDeal(price, mmrAdjusted) {
  if (price == null || mmrAdjusted == null) return 'unknown';
  const delta = price - mmrAdjusted;
  if (delta <= -2000) return 'steal';
  if (delta <= -500)  return 'great';
  if (Math.abs(delta) < 500) return 'good';
  if (delta <= 1500)  return 'fair';
  return 'pass';
}

function adjustMmr(mmr, year, miles) {
  const age = Math.max(0, new Date().getFullYear() - (year || new Date().getFullYear()));
  const baseline = age * 12000;
  const excess = Math.max(0, (miles || 0) - baseline);
  const penalty = Math.min(0.15, (excess / 100000) * 0.08);
  return Math.round(mmr * (1 - penalty));
}

async function upsertMmr(listingId, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_mmr_async`, {
    method: 'POST',
    headers: {
      'apikey':          SUPABASE_KEY,
      'Authorization':   `Bearer ${SUPABASE_KEY}`,
      'Content-Type':    'application/json',
      'Content-Profile': 'tav',
      'Prefer':          'return=minimal'
    },
    body: JSON.stringify({ p_listing_id: listingId, p_payload: payload })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`upsert_mmr_async failed: ${res.status} ${text}`);
  }
}

async function getListings() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/listings?select=id,listing_id,title,year,make,model,mileage,price,vin,deal_grade,location_state&mileage=not.is.null&deal_grade=eq.unknown&limit=200`,
    {
      headers: {
        'apikey':          SUPABASE_KEY,
        'Authorization':   `Bearer ${SUPABASE_KEY}`,
        'Accept':          'application/json',
        'Accept-Profile':  'tav'
      }
    }
  );
  if (!res.ok) throw new Error(`Failed to fetch listings: ${res.status}`);
  return res.json();
}

async function main() {
  const token = await getToken();
  const listings = await getListings();
  console.log(`Found ${listings.length} listings with mileage to enrich`);

  let success = 0, miss = 0, errors = 0;

  for (const listing of listings) {
    try {
      const mmr = await getMmr(token, {
        vin:   listing.vin,
        year:  listing.year,
        make:  listing.make,
        model: listing.model,
        miles: listing.mileage,
        state: listing.location_state
      });

      if (mmr) {
        const adjusted   = adjustMmr(mmr.value, listing.year, listing.mileage);
        const deal_grade = gradeDeal(listing.price, adjusted);
        const confidence = mmr.source === 'vin' ? 'high' : 'low';

        await upsertMmr(listing.listing_id, {
          mmr:             mmr.value,
          mmr_adjusted:    adjusted,
          mmr_source:      mmr.source,
          mmr_confidence:  confidence,
          mmr_fetched_at:  new Date().toISOString(),
          deal_grade,
          mmr_outcome:     mmr.source === 'vin' ? 'vin_hit' : 'ymm_hit',
          mmr_lookup_ms:   0
        });

        console.log(`✓ ${listing.title} → MMR $${mmr.value} adj $${adjusted} → ${deal_grade}`);
        success++;
      } else {
        console.log(`– ${listing.title} → no MMR match`);
        miss++;
      }

      await new Promise(r => setTimeout(r, 250)); // 4 req/sec max
    } catch (err) {
      console.error(`✗ ${listing.listing_id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${success} enriched, ${miss} no match, ${errors} errors`);
}

main().catch(err => { console.error(err); process.exit(1); });
