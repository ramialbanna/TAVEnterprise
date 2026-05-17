#!/usr/bin/env node
/**
 * Manheim MMR connection test.
 * Reads credentials from .dev.vars (same file wrangler dev uses).
 *
 * Usage:
 *   node scripts/test-mmr.js
 *   node scripts/test-mmr.js --vin 1HGBH41JXMN109186
 *   node scripts/test-mmr.js --year 2020 --make Toyota --model Camry --mileage 55000
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Parse .dev.vars ───────────────────────────────────────────────────────────

function loadDevVars() {
  const path = resolve(process.cwd(), ".dev.vars");
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.error("ERROR: .dev.vars not found. Run: cp .dev.vars.example .dev.vars");
    process.exit(1);
  }

  const vars = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    vars[key] = val;
  }
  return vars;
}

// ── Parse CLI args ────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      result[args[i].slice(2)] = args[i + 1] ?? true;
      i++;
    }
  }
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pp(label, data) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${label}`);
  console.log("─".repeat(60));
  console.log(JSON.stringify(data, null, 2));
}

function checkRequired(vars, keys) {
  const missing = keys.filter((k) => !vars[k] || vars[k] === "replace_me");
  if (missing.length) {
    console.error(`\nERROR: Missing or placeholder values in .dev.vars:\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }
}

// ── Step 1: Get token ─────────────────────────────────────────────────────────

async function getToken(vars) {
  console.log("\n[1] Fetching Manheim OAuth token...");
  console.log(`    Token URL : ${vars.MANHEIM_TOKEN_URL}`);
  console.log(`    Client ID : ${vars.MANHEIM_CLIENT_ID}`);
  console.log(`    Username  : ${vars.MANHEIM_USERNAME}`);

  const body = new URLSearchParams({
    grant_type: "password",
    username: vars.MANHEIM_USERNAME,
    password: vars.MANHEIM_PASSWORD,
    client_id: vars.MANHEIM_CLIENT_ID,
    client_secret: vars.MANHEIM_CLIENT_SECRET,
  });

  const res = await fetch(vars.MANHEIM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    pp(`FAIL — HTTP ${res.status}`, data);
    process.exit(1);
  }

  if (!data.access_token) {
    pp("FAIL — no access_token in response", data);
    process.exit(1);
  }

  console.log(`    OK — token received (${data.token_type ?? "Bearer"}, expires_in=${data.expires_in ?? "unknown"}s)`);
  return data.access_token;
}

// ── Step 2: VIN lookup ────────────────────────────────────────────────────────

async function testVin(token, vars, vin, mileage) {
  console.log(`\n[2] VIN lookup — /valuations/vin/${vin}`);
  const url = new URL(`/valuations/vin/${encodeURIComponent(vin)}`, vars.MANHEIM_MMR_URL);
  if (mileage) url.searchParams.set("odometer", String(mileage));
  console.log(`    URL: ${url}`);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (res.status === 404) {
    console.log(`    NOTE: 404 = VIN not in Manheim DB (expected for placeholder VINs).`);
    console.log(`          Re-run with --vin <real_vin> to get an actual value.`);
    return;
  }

  if (!res.ok) {
    pp(`FAIL — HTTP ${res.status}`, data);
    return;
  }

  pp(`OK — HTTP ${res.status}`, data);
  extractAndPrint(data, "VIN");
}

// ── Step 3: YMM search ────────────────────────────────────────────────────────

async function testYmm(token, vars, year, make, model, mileage) {
  console.log(`\n[3] YMM search — /valuations/search`);
  const url = new URL("/valuations/search", vars.MANHEIM_MMR_URL);
  url.searchParams.set("year", String(year));
  url.searchParams.set("make", make);
  url.searchParams.set("model", model);
  url.searchParams.set("odometer", String(mileage));
  url.searchParams.set("include", "ci");
  console.log(`    URL: ${url}`);

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    pp(`FAIL — HTTP ${res.status}`, data);
    return;
  }

  pp(`OK — HTTP ${res.status}`, data);
  extractAndPrint(data, "YMM");
}

// ── Value extraction (mirrors src/valuation/mmr.ts logic) ────────────────────

function extractAndPrint(data, label) {
  if (!data || typeof data !== "object") return;
  const candidate = Array.isArray(data.items) ? data.items[0] : data;
  if (!candidate) return;

  // adjustedPricing.wholesale.average — preferred (mileage+build adjusted)
  if (candidate.adjustedPricing?.wholesale?.average > 0) {
    console.log(`\n  => MMR value (${label}): $${candidate.adjustedPricing.wholesale.average.toLocaleString()} [adjustedPricing.wholesale.average]`);
    return;
  }

  // Flat fields
  const flatKeys = ["adjustedWholesaleAverage", "wholesaleMileageAdjusted", "wholesaleAverage", "mmrValue", "average", "value"];
  for (const key of flatKeys) {
    if (typeof candidate[key] === "number" && candidate[key] > 0) {
      console.log(`\n  => MMR value (${label}): $${candidate[key].toLocaleString()} [${key}]`);
      return;
    }
  }

  // Base wholesale.average fallback
  if (candidate.wholesale?.average > 0) {
    console.log(`\n  => MMR value (${label}): $${candidate.wholesale.average.toLocaleString()} [wholesale.average — unadjusted, no odometer passed]`);
    return;
  }

  console.log(`\n  => No recognized MMR value field found. Check raw output above.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const vars = loadDevVars();
  const args = parseArgs();

  checkRequired(vars, [
    "MANHEIM_CLIENT_ID",
    "MANHEIM_CLIENT_SECRET",
    "MANHEIM_USERNAME",
    "MANHEIM_PASSWORD",
    "MANHEIM_TOKEN_URL",
    "MANHEIM_MMR_URL",
  ]);

  console.log("=== Manheim MMR Connection Test ===");
  console.log(`MMR base URL: ${vars.MANHEIM_MMR_URL}`);

  const token = await getToken(vars);

  // VIN test
  const vin = args.vin ?? "1HGBH41JXMN109186"; // Honda Civic — override with --vin
  const mileage = args.mileage ? Number(args.mileage) : 55_000;
  await testVin(token, vars, vin, mileage);

  // YMM test
  const year = Number(args.year ?? 2020);
  const make = args.make ?? "Toyota";
  const model = args.model ?? "Camry";
  await testYmm(token, vars, year, make, model, mileage);

  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("\nUnhandled error:", err);
  process.exit(1);
});
