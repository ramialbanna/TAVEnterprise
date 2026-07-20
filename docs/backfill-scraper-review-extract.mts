/**
 * Item 56 — extract unique Apify listings for direct Scraper-review backfill.
 *
 * Reads docs/.env APIFY_TOKEN + docs/_apify_backfill_missed.json
 * Writes docs/_apify_backfill_listings.json (deduped by listing_url)
 *
 * Usage: npx tsx docs/backfill-scraper-review-extract.mts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapRaidrApiItem } from "../src/apify/payloadAdapter.ts";
import { parseFacebookItem } from "../src/sources/facebook.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, ".env");
const MISSED_PATH = path.join(__dirname, "_apify_backfill_missed.json");
const OUT_PATH = path.join(__dirname, "_apify_backfill_listings.json");

type MissedRun = {
  task: string;
  taskId: string;
  runId: string;
  datasetId: string;
  startedAt: string;
  finishedAt: string;
  status: string;
};

type ListingRow = {
  listing_url: string;
  title: string;
  price: number | null;
  mileage: number | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  vin: string | null;
  region: string;
  scraped_at: string;
  posted_at: string | null;
  seller_name: string | null;
  source_listing_id: string | null;
  run_id: string;
  task: string;
};

function loadEnv(filePath: string): Record<string, string> {
  const raw = fs.readFileSync(filePath, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

function regionForTask(task: string): string {
  return task === "oklahoma" ? "oklahoma_city_ok" : "dallas_tx";
}

async function fetchDatasetItems(datasetId: string, token: string): Promise<unknown[]> {
  const items: unknown[] = [];
  let offset = 0;
  const limit = 250;
  for (;;) {
    const url = `https://api.apify.com/v2/datasets/${datasetId}/items?format=json&clean=1&limit=${limit}&offset=${offset}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`dataset ${datasetId} items → HTTP ${r.status}`);
    const batch = (await r.json()) as unknown[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return items;
}

async function datasetItemCount(datasetId: string, token: string): Promise<number> {
  const r = await fetch(`https://api.apify.com/v2/datasets/${datasetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`dataset ${datasetId} → HTTP ${r.status}`);
  const body = (await r.json()) as { data?: { itemCount?: number } };
  return body.data?.itemCount ?? 0;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const env = loadEnv(ENV_PATH);
  const token = env.APIFY_TOKEN;
  if (!token) throw new Error("docs/.env missing APIFY_TOKEN");

  const missedRaw = fs.readFileSync(MISSED_PATH, "utf8").replace(/^\uFEFF/, "");
  const missed = JSON.parse(missedRaw) as MissedRun[];
  missed.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  const byUrl = new Map<string, ListingRow>();
  let runsChecked = 0;
  let runsEmpty = 0;
  let runsWithItems = 0;
  let rawItems = 0;
  let parseFail = 0;

  for (const run of missed) {
    runsChecked++;
    let count = 0;
    try {
      count = await datasetItemCount(run.datasetId, token);
    } catch (err) {
      console.error(JSON.stringify({ runId: run.runId, error: String(err) }));
      continue;
    }
    if (count === 0) {
      runsEmpty++;
      if (runsChecked % 50 === 0) {
        console.error(JSON.stringify({ progress: runsChecked, unique: byUrl.size, empty: runsEmpty }));
      }
      continue;
    }

    runsWithItems++;
    let items: unknown[];
    try {
      items = await fetchDatasetItems(run.datasetId, token);
    } catch (err) {
      console.error(JSON.stringify({ runId: run.runId, fetchError: String(err) }));
      continue;
    }
    rawItems += items.length;
    const region = regionForTask(run.task);
    const scrapedAt = run.finishedAt || run.startedAt;

    for (const raw of items) {
      const mapped = mapRaidrApiItem(raw);
      const parsed = parseFacebookItem(mapped, { region, scrapedAt });
      if (!parsed.ok) {
        parseFail++;
        continue;
      }
      const listing = parsed.listing;
      const url = listing.url;
      if (!url) {
        parseFail++;
        continue;
      }
      // Scraper review requires Y/M/M
      if (listing.year == null || !listing.make?.trim() || !listing.model?.trim()) {
        parseFail++;
        continue;
      }

      const row: ListingRow = {
        listing_url: url,
        title: listing.title,
        price: listing.price ?? null,
        mileage: listing.mileage ?? null,
        year: listing.year ?? null,
        make: listing.make ?? null,
        model: listing.model ?? null,
        trim: listing.trim ?? null,
        vin: listing.vin ?? null,
        region,
        scraped_at: scrapedAt,
        posted_at: listing.postedAt ?? null,
        seller_name: listing.sellerName ?? null,
        source_listing_id: listing.sourceListingId ?? null,
        run_id: run.runId,
        task: run.task,
      };

      const existing = byUrl.get(url);
      if (!existing) {
        byUrl.set(url, row);
      } else if (row.scraped_at < existing.scraped_at) {
        // Keep earliest Apify sighting for Received / first_seen_at
        byUrl.set(url, { ...row, scraped_at: row.scraped_at });
      }
    }

    if (runsChecked % 25 === 0) {
      console.error(
        JSON.stringify({
          progress: runsChecked,
          of: missed.length,
          unique: byUrl.size,
          with_items: runsWithItems,
          empty: runsEmpty,
          parse_fail: parseFail,
        }),
      );
    }
    await sleep(50);
  }

  const listings = [...byUrl.values()].sort((a, b) => a.scraped_at.localeCompare(b.scraped_at));
  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        runs_checked: runsChecked,
        runs_empty: runsEmpty,
        runs_with_items: runsWithItems,
        raw_items: rawItems,
        parse_fail: parseFail,
        unique_listings: listings.length,
        listings,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(
    JSON.stringify({
      wrote: OUT_PATH,
      unique_listings: listings.length,
      runs_checked: runsChecked,
      runs_empty: runsEmpty,
      runs_with_items: runsWithItems,
      parse_fail: parseFail,
    }),
  );
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
