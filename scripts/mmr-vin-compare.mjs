/**
 * Compare Cox MMR VIN lookup (intel worker) vs Manheim reference values.
 * Usage: node scripts/mmr-vin-compare.mjs [baseUrl]
 */
const baseUrl = process.argv[2] ?? "https://tav-intelligence-worker-staging.rami-1a9.workers.dev";

const CASES = [
  {
    vin: "1FTFW1E84MKE88649",
    manheim: {
      vehicle: "2021 FORD F150 4WD V6 CREW CAB 3.5L XLT",
      base: 25000,
      adjusted: 25100,
      rangeLow: 23700,
      rangeHigh: 26600,
      avgOdo: 97725,
      avgCond: 3.8,
      buildOptions: true,
      buildDelta: 170,
      retail: 30400,
    },
  },
  {
    vin: "ZFBHRFAB5N6W96891",
    manheim: {
      vehicle: "2022 RAM PROMASTER CITY WAGON PASSENGER WAGON",
      base: 10250,
      adjusted: 10300,
      rangeLow: 8350,
      rangeHigh: 12200,
      avgOdo: 119144,
      avgCond: 3.3,
      buildOptions: true,
      buildDelta: 20,
      retail: 14050,
    },
  },
  {
    vin: "1GTR1MEC3GZ204652",
    manheim: {
      vehicle: "2016 GMC 1500 SIERRA 2WD V8 FFV DOUBLE CAB 5.3L SLE",
      base: 10500,
      adjusted: 10550,
      rangeLow: 9750,
      rangeHigh: 11350,
      avgOdo: 141792,
      avgCond: 2.8,
      buildOptions: true,
      buildDelta: 50,
      retail: 16600,
    },
  },
  {
    vin: "JTJTBCDX7R5032246",
    manheim: {
      vehicle: "2024 LEXUS GX 4D SUV 550 OVERTRAIL+",
      base: 83300,
      adjusted: 83600,
      rangeLow: 81900,
      rangeHigh: 85300,
      avgOdo: 13547,
      avgCond: 4.9,
      buildOptions: true,
      buildDelta: 350,
      retail: 84700,
    },
  },
  {
    vin: "1C6SRFJT9PN613247",
    manheim: {
      vehicle: "2023 RAM 1500 4WD V8 CREW CAB 5.7L LARAMIE",
      base: 37700,
      adjusted: 38300,
      rangeLow: 37100,
      rangeHigh: 39500,
      avgOdo: 36748,
      avgCond: 4.1,
      buildOptions: true,
      buildDelta: 610,
      retail: 43900,
    },
  },
];

function readTrim(item) {
  const d =
    item.description && typeof item.description === "object" ? item.description : null;
  return (
    d?.trim ??
    item.trim ??
    item.bodyName ??
    item.style ??
    d?.subSeries ??
    item.subSeries ??
    null
  );
}

function readWholesale(item) {
  const ap = item.adjustedPricing;
  if (!ap || typeof ap !== "object") return null;
  const w = ap.wholesale;
  if (!w || typeof w !== "object") return null;
  return {
    average: typeof w.average === "number" ? Math.round(w.average) : null,
    below: typeof w.below === "number" ? Math.round(w.below) : null,
    above: typeof w.above === "number" ? Math.round(w.above) : null,
  };
}

function readRetail(item) {
  const ap = item.adjustedPricing;
  if (!ap || typeof ap !== "object") return null;
  const r = ap.retail;
  if (!r || typeof r !== "object") return null;
  return {
    average: typeof r.average === "number" ? Math.round(r.average) : null,
    below: typeof r.below === "number" ? Math.round(r.below) : null,
    above: typeof r.above === "number" ? Math.round(r.above) : null,
  };
}

function parseItems(payload) {
  if (!payload || typeof payload !== "object") return [];
  const items = Array.isArray(payload.items) ? payload.items : [payload];
  return items.map((item, index) => {
    if (!item || typeof item !== "object") return { index, error: "bad_item" };
    const wholesale = readWholesale(item);
    const retail = readRetail(item);
    const rawWholesale = item.wholesale;
    const baseWholesale =
      rawWholesale && typeof rawWholesale === "object"
        ? {
            average: typeof rawWholesale.average === "number" ? Math.round(rawWholesale.average) : null,
            below: typeof rawWholesale.below === "number" ? Math.round(rawWholesale.below) : null,
            above: typeof rawWholesale.above === "number" ? Math.round(rawWholesale.above) : null,
          }
        : null;
    return {
      index,
      bestMatch: item.bestMatch === true,
      trim: readTrim(item),
      year: item.year ?? item.description?.year ?? null,
      make: item.make ?? item.description?.make ?? null,
      model: item.model ?? item.description?.model ?? null,
      avgOdometer: item.averageOdometer ?? null,
      avgGrade: item.averageGrade != null ? Number(item.averageGrade) / 10 : null,
      wholesale,
      baseWholesale,
      buildOptionsAdjusted: item.adjustedBy?.buildOptions ?? item.adjustedPricing?.adjustedBy?.buildOptions ?? null,
      retail,
    };
  });
}

async function postVin(vin, opts = {}) {
  const body = { vin, ...(opts.forceRefresh ? { force_refresh: true } : {}) };
  const headers = {
    "Content-Type": "application/json",
    "X-TAV-Authenticated-User-Email": "mmr-compare@texasautovalue.com",
    ...(opts.forceRefresh ? { "Cf-Access-Authenticated-User-Roles": "manager" } : {}),
  };
  const res = await fetch(`${baseUrl}/mmr/vin`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { httpStatus: res.status, parseError: true, preview: text.slice(0, 300) };
  }
  return { httpStatus: res.status, json };
}

function diff(a, b) {
  if (a == null || b == null) return null;
  return a - b;
}

async function compareOne(testCase) {
  const { vin, manheim } = testCase;
  const { httpStatus, json, parseError, preview } = await postVin(vin, { forceRefresh: true });

  if (parseError) {
    return { vin, error: "parse_error", httpStatus, preview };
  }

  const envelope = json?.data ?? json;
  if (!envelope?.ok || envelope.mmr_value == null) {
    return {
      vin,
      error: envelope?.error_code ?? json?.error?.code ?? "no_mmr",
      httpStatus,
      message: envelope?.error_message ?? json?.error?.message ?? null,
    };
  }

  const items = parseItems(envelope.mmr_payload);
  const item0 = items[0] ?? null;
  const bestMatch = items.find((i) => i.bestMatch) ?? null;
  const w0 = item0?.wholesale ?? {};
  const wBest = bestMatch?.wholesale ?? {};
  const baseBest = bestMatch?.baseWholesale ?? {};

  const row = {
    vin,
    httpStatus,
    cacheHit: envelope.cache_hit ?? null,
    mileageUsed: envelope.mileage_used,
    itemCount: items.length,
    items: items.map((i) => ({
      index: i.index,
      bestMatch: i.bestMatch,
      trim: i.trim,
      wholesaleAvg: i.wholesale?.average ?? null,
      baseWholesaleAvg: i.baseWholesale?.average ?? null,
      wholesaleBelow: i.wholesale?.below ?? null,
      wholesaleAbove: i.wholesale?.above ?? null,
      avgOdo: i.avgOdometer,
      avgGrade: i.avgGrade,
      buildOptionsAdjusted: i.buildOptionsAdjusted,
      retailAvg: i.retail?.average ?? null,
    })),
    our: {
      mmrValue: envelope.mmr_value,
      items0Trim: item0?.trim ?? null,
      bestMatchTrim: bestMatch?.trim ?? null,
      bestMatchAdjusted: wBest.average ?? null,
      bestMatchBase: baseBest.average ?? null,
      rangeLow: w0.below ?? null,
      rangeHigh: w0.above ?? null,
      bestRangeLow: wBest.below ?? null,
      bestRangeHigh: wBest.above ?? null,
      avgOdo: item0?.avgOdometer ?? null,
      avgCond: item0?.avgGrade ?? null,
      bestAvgOdo: bestMatch?.avgOdometer ?? null,
      bestAvgCond: bestMatch?.avgGrade ?? null,
      trim: item0?.trim ?? null,
      retail: item0?.retail?.average ?? null,
    },
    manheim,
    delta: {
      items0VsManheimBase: diff(envelope.mmr_value, manheim.base),
      items0VsManheimAdjusted: diff(envelope.mmr_value, manheim.adjusted),
      bestMatchBaseVsManheimBase: diff(baseBest.average ?? null, manheim.base),
      bestMatchAdjVsManheimAdjusted: diff(wBest.average ?? null, manheim.adjusted),
      rangeLow: diff(w0.below ?? null, manheim.rangeLow),
      rangeHigh: diff(w0.above ?? null, manheim.rangeHigh),
      bestRangeLow: diff(wBest.below ?? null, manheim.rangeLow),
      bestRangeHigh: diff(wBest.above ?? null, manheim.rangeHigh),
      avgOdo: diff(item0?.avgOdometer ?? null, manheim.avgOdo),
      bestAvgOdo: diff(bestMatch?.avgOdometer ?? null, manheim.avgOdo),
      avgCond: item0?.avgGrade != null && manheim.avgCond != null
        ? Number((item0.avgGrade - manheim.avgCond).toFixed(1))
        : null,
      bestAvgCond: bestMatch?.avgGrade != null && manheim.avgCond != null
        ? Number((bestMatch.avgGrade - manheim.avgCond).toFixed(1))
        : null,
    },
    match: {
      items0BaseExact: envelope.mmr_value === manheim.base,
      items0AdjustedExact: envelope.mmr_value === manheim.adjusted,
      bestMatchBaseExact: baseBest.average === manheim.base,
      bestMatchAdjustedExact: wBest.average === manheim.adjusted,
      bestAvgOdoExact: bestMatch?.avgOdometer === manheim.avgOdo,
      bestAvgCondExact: bestMatch?.avgGrade === manheim.avgCond,
    },
  };

  // Find item whose wholesale average closest to Manheim base or adjusted
  let bestBase = null;
  let bestAdjusted = null;
  for (const item of items) {
    const avg = item.wholesale?.average;
    if (avg == null) continue;
    const dBase = Math.abs(avg - manheim.base);
    const dAdj = Math.abs(avg - manheim.adjusted);
    if (!bestBase || dBase < bestBase.delta) bestBase = { index: item.index, trim: item.trim, avg, delta: dBase };
    if (!bestAdjusted || dAdj < bestAdjusted.delta) bestAdjusted = { index: item.index, trim: item.trim, avg, delta: dAdj };
  }
  row.bestItemMatch = { toManheimBase: bestBase, toManheimAdjusted: bestAdjusted };

  return row;
}

async function main() {
  console.log(`Comparing ${CASES.length} VINs against ${baseUrl}\n`);
  const health = await fetch(`${baseUrl}/health`);
  console.log(`Health: ${health.status}\n`);

  const results = [];
  for (const testCase of CASES) {
    const row = await compareOne(testCase);
    results.push(row);
    console.log(JSON.stringify(row, null, 2));
    console.log("\n---\n");
  }

  const summary = results.map((r) => {
    if (r.error) return { vin: r.vin, error: r.error };
    return {
      vin: r.vin,
      error: r.error,
      ourItems0: r.our?.mmrValue ?? null,
      ourBestMatchBase: r.our?.bestMatchBase ?? null,
      ourBestMatchAdj: r.our?.bestMatchAdjusted ?? null,
      manheimBase: r.manheim?.base ?? null,
      manheimAdjusted: r.manheim?.adjusted ?? null,
      items0Delta: r.delta?.items0VsManheimBase ?? null,
      bestMatchBaseDelta: r.delta?.bestMatchBaseVsManheimBase ?? null,
      bestMatchAdjDelta: r.delta?.bestMatchAdjVsManheimAdjusted ?? null,
      itemCount: r.itemCount ?? null,
      items0Trim: r.our?.items0Trim ?? null,
      bestMatchTrim: r.our?.bestMatchTrim ?? null,
      bestAvgOdoMatch: r.match?.bestAvgOdoExact ?? null,
      bestAvgCondMatch: r.match?.bestAvgCondExact ?? null,
    };
  });
  console.log("SUMMARY");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
