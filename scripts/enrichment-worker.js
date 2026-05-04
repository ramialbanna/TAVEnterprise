import { createClient } from "@supabase/supabase-js";

const TOKEN_CACHE_KEY = "manheim:oauth_token";
const CIRCUIT_KEY = "manheim:circuit_breaker";

const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;
const MMR_CACHE_TTL_SECONDS = 24 * 60 * 60;
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 10;

let lastRequestAt = 0;

export default {
  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return json({ success: false, error: "Method not allowed" }, 405);
      }

      validateEnv(env);

      const body = await request.json();
      const { listing_id, vin } = body;

      if (!listing_id) {
        return json({ success: false, error: "listing_id is required" }, 400);
      }

      if (!vin || typeof vin !== "string" || vin.trim().length !== 17) {
        return json(
          {
            success: false,
            listing_id,
            vin,
            error: "Valid 17-character VIN is required"
          },
          400
        );
      }

      const normalizedVin = vin.trim().toUpperCase();

      const cached = await getCachedValuation(env, normalizedVin);
      if (cached) {
        return json({
          success: true,
          listing_id,
          vin: normalizedVin,
          cached: true,
          valuation: cached
        });
      }

      const circuitOpen = await isCircuitOpen(env);
      if (circuitOpen) {
        await insertValuation(env, {
          listing_id,
          vin: normalizedVin,
          valuation: null,
          status: "failed",
          error_message: "Manheim circuit breaker is open"
        });

        return json(
          {
            success: false,
            listing_id,
            vin: normalizedVin,
            error: "Manheim circuit breaker is open"
          },
          503
        );
      }

      /**
       * TEMP MOCK MODE
       * Keep this ON until you have real Manheim endpoint URLs.
       */
      const USE_MOCK_MANHEIM = false;

      let mmr;
      let marketReport;
      let conditionGrade;

      if (USE_MOCK_MANHEIM) {
        mmr = { mmr_value: 18500 };
        marketReport = { sample: true };
        conditionGrade = { grade: "average" };
      } else {
        const token = await getAccessToken(env);

        [mmr, marketReport, conditionGrade] = await Promise.all([
          getMmrByVin(env, token, normalizedVin),
          getMarketReport(env, token, normalizedVin),
          getConditionGrade(env, token, normalizedVin)
        ]);
      }

      const valuation = {
        mmr_value: extractMmrValue(mmr),
        market_report: marketReport,
        condition_grade: conditionGrade,
        raw_response: {
          mmr,
          market_report: marketReport,
          condition_grade: conditionGrade
        }
      };

      await cacheValuation(env, normalizedVin, valuation);

      await insertValuation(env, {
        listing_id,
        vin: normalizedVin,
        valuation,
        status: "success"
      });

      await resetCircuit(env);

      return json({
        success: true,
        listing_id,
        vin: normalizedVin,
        cached: false,
        valuation: {
          mmr_value: valuation.mmr_value,
          market_report: valuation.market_report,
          condition_grade: valuation.condition_grade
        }
      });
    } catch (error) {
      console.error("enrichment_worker_error", {
        message: error.message,
        name: error.name,
        stack: error.stack
      });

      return json(
        {
          success: false,
          error: error.message || "Unknown enrichment worker error"
        },
        500
      );
    }
  }
};

function validateEnv(env) {
  const required = [
    "MANHEIM_CLIENT_ID",
    "MANHEIM_CLIENT_SECRET",
    "MANHEIM_TOKEN_URL",
    "MANHEIM_API_BASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MANHEIM_KV"
  ];

  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing required environment variable or binding: ${key}`);
    }
  }
}

async function getAccessToken(env) {
  const cached = await env.MANHEIM_KV.get(TOKEN_CACHE_KEY, "json");

  if (cached?.access_token && cached?.expires_at) {
    const expiresAt = new Date(cached.expires_at).getTime();

    if (expiresAt - Date.now() > TOKEN_SAFETY_MARGIN_MS) {
      return cached.access_token;
    }
  }

  console.log("Refreshing Manheim OAuth token");

  const response = await fetch(env.MANHEIM_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.MANHEIM_CLIENT_ID,
      client_secret: env.MANHEIM_CLIENT_SECRET
    })
  });

  if (!response.ok) {
    throw new Error(`Manheim token request failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error("Manheim token response missing access_token");
  }

  const expiresInSeconds = Number(data.expires_in || 3600);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  await env.MANHEIM_KV.put(
    TOKEN_CACHE_KEY,
    JSON.stringify({
      access_token: data.access_token,
      expires_at: expiresAt
    }),
    {
      expirationTtl: Math.max(expiresInSeconds - 300, 60)
    }
  );

  return data.access_token;
}

async function getMmrByVin(env, token, vin) {
  return manheimRequest(env, token, `/mmr/vin/${encodeURIComponent(vin)}`);
}

async function getMarketReport(env, token, vin) {
  return manheimRequest(env, token, `/market-report/vin/${encodeURIComponent(vin)}`);
}

async function getConditionGrade(env, token, vin) {
  return manheimRequest(env, token, `/condition-grade/vin/${encodeURIComponent(vin)}`);
}

async function manheimRequest(env, token, path) {
  await throttle();

  const url = `${env.MANHEIM_API_BASE_URL.replace(/\/$/, "")}${path}`;

  return retry(async () => {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    if (response.status === 429 || response.status >= 500) {
      throw new RetryableHttpError(response.status);
    }

    if (!response.ok) {
      await recordFailure(env);
      throw new Error(`Manheim request failed: ${response.status}`);
    }

    return response.json();
  }, env);
}

async function retry(fn, env) {
  const delays = [0, 500, 1000, 2000, 4000];

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      await sleep(delays[attempt]);
    }

    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof RetryableHttpError;

      if (!retryable || attempt === delays.length - 1) {
        await recordFailure(env);
        throw error;
      }

      console.warn("Retrying Manheim request", {
        attempt: attempt + 1,
        status: error.status
      });
    }
  }
}

async function throttle() {
  const minSpacingMs = 200;
  const now = Date.now();
  const waitMs = Math.max(0, minSpacingMs - (now - lastRequestAt));

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastRequestAt = Date.now();
}

async function getCachedValuation(env, vin) {
  const key = `mmr:${vin}`;
  const cached = await env.MANHEIM_KV.get(key, "json");

  if (cached) {
    console.log("MMR cache hit", { vin });
    return cached;
  }

  console.log("MMR cache miss", { vin });
  return null;
}

async function cacheValuation(env, vin, valuation) {
  const key = `mmr:${vin}`;

  await env.MANHEIM_KV.put(key, JSON.stringify(valuation), {
    expirationTtl: MMR_CACHE_TTL_SECONDS
  });
}

async function insertValuation(env, payload) {
  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  const row = {
    listing_id: payload.listing_id,
    vin: payload.vin,
    source: "manheim",
    mmr_value: payload.valuation?.mmr_value ?? null,
    market_report: payload.valuation?.market_report ?? null,
    condition_grade: payload.valuation?.condition_grade ?? null,
    raw_response: payload.valuation?.raw_response ?? payload.valuation ?? null,
    valuation_status: payload.status || "success",
    error_message: payload.error_message || null
  };

  const { error } = await supabase
    .schema("tav")
    .from("listings_valuation")
    .insert(row);

  if (error) {
    throw new Error(`Failed to insert valuation: ${error.message}`);
  }

  console.log("Valuation inserted", {
    listing_id: payload.listing_id,
    vin: payload.vin,
    status: payload.status
  });
}

async function isCircuitOpen(env) {
  const circuit = await env.MANHEIM_KV.get(CIRCUIT_KEY, "json");

  if (!circuit?.opened_at) {
    return false;
  }

  const openedAt = new Date(circuit.opened_at).getTime();
  return Date.now() - openedAt < CIRCUIT_COOLDOWN_MS;
}

async function recordFailure(env) {
  const circuit = await env.MANHEIM_KV.get(CIRCUIT_KEY, "json");

  const failures = Number(circuit?.consecutive_failures || 0) + 1;

  const nextState = {
    consecutive_failures: failures,
    opened_at:
      failures >= MAX_CONSECUTIVE_FAILURES
        ? new Date().toISOString()
        : circuit?.opened_at || null
  };

  await env.MANHEIM_KV.put(CIRCUIT_KEY, JSON.stringify(nextState), {
    expirationTtl: 3600
  });

  if (failures >= MAX_CONSECUTIVE_FAILURES) {
    console.error("Manheim circuit breaker opened", nextState);
  }
}

async function resetCircuit(env) {
  await env.MANHEIM_KV.delete(CIRCUIT_KEY);
}

function extractMmrValue(mmrResponse) {
  return (
    mmrResponse?.mmr_value ??
    mmrResponse?.average ??
    mmrResponse?.value ??
    mmrResponse?.adjustedPricing?.wholesale ??
    null
  );
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class RetryableHttpError extends Error {
  constructor(status) {
    super(`Retryable Manheim HTTP error: ${status}`);
    this.status = status;
  }
}