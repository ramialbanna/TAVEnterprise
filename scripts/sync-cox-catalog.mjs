/**
 * Sync Cox Y/M/M/S catalog tree from tav-intelligence-worker into Supabase.
 *
 * Usage:
 *   node scripts/sync-cox-catalog.mjs [intelBaseUrl]
 *
 * Requires `.dev.vars` with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INTEL_WORKER_SECRET.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEV_VARS = path.join(ROOT, ".dev.vars");

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

function buildSearchText(year, make, model, style) {
  return `${year} ${make} ${model} ${style}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferVariantKind(model) {
  const normalized = model.toLowerCase();
  if (/\b(awd|fwd|rwd|4wd|2wd|4x4)\b/.test(normalized)) return "drivetrain";
  if (/\b(crew|double|regular|supercab|supercrew)\b/.test(normalized)) return "cab_bed";
  return "base";
}

const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCatalog(baseUrl, secret, catalogPath) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(`${baseUrl}${catalogPath}`, {
        headers: {
          Accept: "application/json",
          "x-tav-service-secret": secret,
        },
      });
      if (!res.ok) {
        if (RETRY_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS) {
          await sleep(500 * attempt);
          continue;
        }
        throw new Error(`Catalog fetch failed ${catalogPath}: HTTP ${res.status}`);
      }
      const raw = await res.json();
      if (!raw?.success || !raw?.data?.items) {
        throw new Error(`Invalid catalog envelope for ${catalogPath}`);
      }
      return raw.data.items;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(500 * attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error(`Catalog fetch failed ${catalogPath}`);
}

async function main() {
  const vars = loadDevVars(DEV_VARS);
  const supabaseUrl = vars.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = vars.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const intelSecret = vars.INTEL_WORKER_SECRET ?? process.env.INTEL_WORKER_SECRET;
  const baseUrl =
    process.argv[2] ??
    "https://tav-intelligence-worker-production.rami-1a9.workers.dev";

  if (!supabaseUrl || !supabaseKey || !intelSecret) {
    throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or INTEL_WORKER_SECRET");
  }

  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const currentYear = new Date().getFullYear();
  const years = [];
  for (let year = currentYear - 10; year <= currentYear + 1; year += 1) {
    years.push(year);
  }

  const { data: runRow, error: runErr } = await db
    .schema("tav")
    .from("cox_catalog_sync_runs")
    .insert({ status: "running", years_synced: years })
    .select("id")
    .single();
  if (runErr) throw runErr;

  let rowCount = 0;
  const syncedYears = [];
  let skippedModels = 0;

  try {
    for (const year of years) {
      const makes = await fetchCatalog(
        baseUrl,
        intelSecret,
        `/catalog/years/${encodeURIComponent(String(year))}/makes`,
      );

      const batch = [];
      for (const make of makes) {
        const models = await fetchCatalog(
          baseUrl,
          intelSecret,
          `/catalog/years/${encodeURIComponent(String(year))}/makes/${encodeURIComponent(make)}/models`,
        );
        for (const model of models) {
          try {
            const styles = await fetchCatalog(
              baseUrl,
              intelSecret,
              `/catalog/years/${encodeURIComponent(String(year))}/makes/${encodeURIComponent(make)}/models/${encodeURIComponent(model)}/styles`,
            );
            for (const style of styles) {
              batch.push({
                year,
                make,
                model,
                style,
                search_text: buildSearchText(year, make, model, style),
                variant_kind: inferVariantKind(model),
                synced_at: new Date().toISOString(),
              });
            }
          } catch (err) {
            skippedModels += 1;
            console.warn(
              `Skipped ${year} ${make} ${model}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }

      for (let i = 0; i < batch.length; i += 500) {
        const chunk = batch.slice(i, i + 500);
        const { error } = await db.schema("tav").from("cox_catalog_tree").upsert(chunk, {
          onConflict: "year,make,model,style",
        });
        if (error) throw error;
        rowCount += chunk.length;
      }

      syncedYears.push(year);
      console.log(`Synced ${year}: ${batch.length} styles (${rowCount} total)`);
    }

    const status = skippedModels > 0 ? "partial" : "completed";
    await db
      .schema("tav")
      .from("cox_catalog_sync_runs")
      .update({
        status,
        years_synced: syncedYears,
        row_count: rowCount,
        finished_at: new Date().toISOString(),
        error_message:
          skippedModels > 0 ? `${skippedModels} model(s) skipped after fetch retries` : null,
      })
      .eq("id", runRow.id);

    console.log(
      `Done (${status}). ${rowCount} rows across ${syncedYears.length} years; ${skippedModels} model(s) skipped.`,
    );
  } catch (err) {
    await db
      .schema("tav")
      .from("cox_catalog_sync_runs")
      .update({
        status: "failed",
        years_synced: syncedYears,
        row_count: rowCount,
        finished_at: new Date().toISOString(),
        error_message: err instanceof Error ? err.message : String(err),
      })
      .eq("id", runRow.id);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
