/**
 * Item 56 — emit SQL batch files for Scraper-review backfill inserts.
 * Usage: node docs/backfill-scraper-review-sql.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IN_PATH = path.join(__dirname, "_apify_backfill_listings.json");
const OUT_DIR = path.join(__dirname, "_apify_backfill_sql");
const BATCH = 100;

function esc(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function text(value) {
  if (value === null || value === undefined || value === "") return "NULL::text";
  return `'${esc(value)}'::text`;
}

function intOrNull(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "NULL::integer";
  return `${Math.trunc(Number(value))}::integer`;
}

function smallOrNull(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "NULL::smallint";
  return `${Math.trunc(Number(value))}::smallint`;
}

function timestamptz(value) {
  if (!value) return "NULL::timestamptz";
  return `'${esc(value)}'::timestamptz`;
}

function main() {
  const data = JSON.parse(fs.readFileSync(IN_PATH, "utf8").replace(/^\uFEFF/, ""));
  const listings = data.listings;
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let batchNo = 0;
  for (let i = 0; i < listings.length; i += BATCH) {
    const chunk = listings.slice(i, i + BATCH);
    const values = chunk
      .map((r) => {
        const scraped = r.scraped_at;
        return `(${[
          text("facebook"),
          text(r.listing_url),
          text(r.source_listing_id),
          text(r.title),
          intOrNull(r.price),
          intOrNull(r.mileage),
          smallOrNull(r.year),
          text(r.make),
          text(r.model),
          text(r.trim),
          text(r.vin),
          text(r.region),
          timestamptz(scraped),
          timestamptz(scraped),
          timestamptz(scraped),
          timestamptz(r.posted_at),
          text(r.seller_name),
          text("new"),
          "1::integer",
          text("scraper"),
          "FALSE",
          "FALSE",
          "FALSE",
          "FALSE",
        ].join(", ")})`;
      })
      .join(",\n");

    const sql = `INSERT INTO tav.normalized_listings (
  source, listing_url, source_listing_id, title, price, mileage, year, make, model, trim, vin,
  region, scraped_at, first_seen_at, last_seen_at, posted_at, seller_name,
  freshness_status, scrape_count, entry_method,
  price_changed, mileage_changed, description_changed, image_changed
)
SELECT * FROM (VALUES
${values}
) AS v(
  source, listing_url, source_listing_id, title, price, mileage, year, make, model, trim, vin,
  region, scraped_at, first_seen_at, last_seen_at, posted_at, seller_name,
  freshness_status, scrape_count, entry_method,
  price_changed, mileage_changed, description_changed, image_changed
)
WHERE NOT EXISTS (
  SELECT 1 FROM tav.normalized_listings nl
  WHERE nl.source = v.source
    AND (
      nl.listing_url = v.listing_url
      OR (v.source_listing_id IS NOT NULL AND nl.source_listing_id = v.source_listing_id)
    )
);`;

    batchNo++;
    fs.writeFileSync(
      path.join(OUT_DIR, `batch_${String(batchNo).padStart(3, "0")}.sql`),
      sql,
      "utf8",
    );
  }

  console.log(JSON.stringify({ listings: listings.length, batches: batchNo, out_dir: OUT_DIR }));
}

main();
