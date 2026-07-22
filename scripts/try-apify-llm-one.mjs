/**
 * Pull one real listing from the latest SUCCEEDED Dallas Apify task run,
 * parse it the same way as POST /apify-webhook → ingest, then run item-57
 * Claude Y/M/M/S resolution (--one).
 *
 * Usage (repo root):
 *   node scripts/try-apify-llm-one.mjs
 *   node scripts/try-apify-llm-one.mjs --run-id <apifyRunId>
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEV_VARS = path.join(ROOT, ".dev.vars");
const DALLAS_TASK = "ZQEsd3nHcLAs5kLwL";

function loadDevVars(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return out;
}

function parseArgs(argv) {
  const args = { runId: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--run-id") args.runId = argv[++i];
  }
  return args;
}

async function apifyGet(token, urlPath) {
  const r = await fetch(`https://api.apify.com/v2${urlPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`${urlPath} → HTTP ${r.status}: ${JSON.stringify(body)}`);
  return body.data;
}

async function pickRun(token, runId) {
  if (runId) return apifyGet(token, `/actor-runs/${runId}`);
  const runs = await apifyGet(token, `/actor-tasks/${DALLAS_TASK}/runs?limit=15&desc=1`);
  const ok = runs.items.find((r) => r.status === "SUCCEEDED");
  if (!ok) throw new Error("No SUCCEEDED Dallas task run found");
  return apifyGet(token, `/actor-runs/${ok.id}`);
}

async function fetchFirstListingItem(token, datasetId) {
  const r = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?limit=40&clean=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`dataset items HTTP ${r.status}`);
  const items = await r.json();
  for (const it of items) {
    const title = (it.marketplace_listing_title ?? it.title ?? "").trim();
    if (title.length >= 8) return it;
  }
  throw new Error("Dataset has no usable listing titles");
}

function parseListingViaIngestAdapter(itemPath) {
  const out = execFileSync("npx", ["vitest", "run", "test/manual-apify-parse.test.ts"], {
      cwd: ROOT,
      env: { ...process.env, APIFY_ITEM_PATH: itemPath },
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
  const line = out
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.startsWith("{") && l.includes('"source"'));
  if (!line) throw new Error("parse test did not emit listing JSON\n" + out.slice(-800));
  return JSON.parse(line);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const vars = loadDevVars(DEV_VARS);
  const token = vars.APIFY_TOKEN ?? process.env.APIFY_TOKEN;
  const itemPath = path.join(ROOT, "scripts", "_tmp-apify-item.json");

  let rawItem;
  if (token) {
    try {
      const run = await pickRun(token, args.runId);
      console.log(`Apify run ${run.id} (${run.status}) dataset ${run.defaultDatasetId}`);
      rawItem = await fetchFirstListingItem(token, run.defaultDatasetId);
      fs.writeFileSync(itemPath, JSON.stringify(rawItem));
    } catch (err) {
      console.warn("Apify fetch failed — using cached scripts/_tmp-apify-item.json if present:", err.message);
      if (!fs.existsSync(itemPath)) throw err;
      rawItem = JSON.parse(fs.readFileSync(itemPath, "utf8"));
    }
  } else if (fs.existsSync(itemPath)) {
    rawItem = JSON.parse(fs.readFileSync(itemPath, "utf8"));
  } else {
    throw new Error("Missing APIFY_TOKEN in docs/.env and no scripts/_tmp-apify-item.json cache");
  }

  const listing = parseListingViaIngestAdapter(itemPath);
  console.log("\nParsed like ingest:");
  console.log(
    JSON.stringify(
      {
        url: listing.url,
        title: listing.title,
        year: listing.year,
        make: listing.make,
        model: listing.model,
        trim: listing.trim,
        price: listing.price,
      },
      null,
      2,
    ),
  );

  const desc =
    rawItem.extraListingData &&
    typeof rawItem.extraListingData === "object" &&
    typeof rawItem.extraListingData.description === "string"
      ? rawItem.extraListingData.description.trim()
      : "";

  const evalArgs = [
    "scripts/eval-llm-ymms.mjs",
    "--one",
    "--year",
    String(listing.year),
    "--make",
    listing.make,
    "--title",
    listing.title,
  ];
  if (listing.model) evalArgs.push("--model", listing.model);
  if (listing.trim) evalArgs.push("--trim", listing.trim);
  if (typeof listing.price === "number") evalArgs.push("--price", String(listing.price));
  if (desc) evalArgs.push("--description", desc.slice(0, 2000));

  console.log("\n--- Claude Y/M/M/S (--one) ---\n");
  execFileSync(process.execPath, evalArgs, { cwd: ROOT, stdio: "inherit" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
