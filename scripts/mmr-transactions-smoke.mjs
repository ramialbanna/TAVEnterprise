/**
 * Redacted Cox MMR transaction smoke — reports structure only, no licensed values.
 * Usage: node scripts/mmr-transactions-smoke.mjs [baseUrl] [vin]
 */
const baseUrl = process.argv[2] ?? "http://127.0.0.1:8789";
const vin = process.argv[3] ?? "1FT7W2BT4KED81759";

const TX_KEYS = [
  "transactions",
  "auctionTransactions",
  "recentTransactions",
  "sampleTransactions",
  "auctionSales",
  "sales",
  "samples",
];

function keysOf(obj) {
  return obj && typeof obj === "object" && !Array.isArray(obj)
    ? Object.keys(obj).sort()
    : [];
}

function analyzeItem(item) {
  if (!item || typeof item !== "object") return { itemKeys: [], transactionKeys: {} };
  const transactionKeys = {};
  for (const key of TX_KEYS) {
    const raw = item[key];
    if (Array.isArray(raw)) {
      transactionKeys[key] = {
        count: raw.length,
        rowKeys: raw[0] && typeof raw[0] === "object" ? keysOf(raw[0]) : [],
      };
    }
  }
  return {
    itemKeys: keysOf(item),
    transactionKeys,
    hasHistorical: item.historicalAverages != null,
    hasForecast: item.forecast != null,
  };
}

function analyzePayload(payload) {
  if (!payload || typeof payload !== "object") return { topKeys: [], items: [] };
  const root = payload;
  const items = Array.isArray(root.items) ? root.items : [root];
  return {
    topKeys: keysOf(root),
    itemCount: items.length,
    items: items.map(analyzeItem),
  };
}

async function postMmrVin(url, forceRefresh = true) {
  const res = await fetch(`${url}/mmr/vin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TAV-Authenticated-User-Email": "smoke@texasautovalue.com",
      ...(forceRefresh ? { "Cf-Access-Authenticated-User-Roles": "manager" } : {}),
    },
    body: JSON.stringify({
      vin,
      mileage: 70740,
      ...(forceRefresh ? { force_refresh: true } : {}),
    }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { parseError: true, rawLength: text.length, rawPreview: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

async function main() {
  console.log(JSON.stringify({ baseUrl, vin, step: "health" }, null, 2));
  const health = await fetch(`${baseUrl}/health`);
  console.log(JSON.stringify({ healthStatus: health.status }, null, 2));

  console.log(JSON.stringify({ step: "mmr_vin" }, null, 2));
  const { status, json } = await postMmrVin(baseUrl);

  const envelope = json?.data ?? json;
  const report = {
    httpStatus: status,
    ok: json?.ok ?? null,
    errorCode: json?.error?.code ?? envelope?.error_code ?? null,
    mmrValuePresent: envelope?.mmr_value != null,
    cacheHit: envelope?.cache_hit ?? null,
    payloadShape: analyzePayload(envelope?.mmr_payload),
    parsedTransactions: null,
  };

  if (envelope?.mmr_payload) {
    // Run same parser logic as production (dynamic import from compiled ts won't work — inline count)
    const items = report.payloadShape.items ?? [];
    const txFound = items.flatMap((i) =>
      Object.entries(i.transactionKeys ?? {}).map(([k, v]) => ({ key: k, ...v })),
    );
    report.transactionArraysFound = txFound;
    report.diagnosis =
      txFound.some((t) => t.count > 0)
        ? "cox_returns_transactions — parser should map rows"
        : items.some((i) => i.hasHistorical || i.hasForecast)
          ? "cox_historical_present_transactions_absent — likely API/account gap"
          : "no_market_context — check include flags or Cox response";
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ fatal: err.message }));
  process.exit(1);
});
