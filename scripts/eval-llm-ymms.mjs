/**
 * Item 57 Phase 0 — offline eval harness for the LLM Y/M/M/S resolver.
 *
 * Pulls historical listings that missed MMR under the current rules/offline
 * matcher, builds the exact same full-catalog context the production
 * resolver will use (src/valuation/resolveListingWithLLM.ts), calls Claude,
 * and scores:
 *   - valid Cox token rate  (proposal exists verbatim in the given subtree)
 *   - outcome breakdown     (hit / needs_review / invalid_pick / catalog_not_synced / error)
 *   - optionally, real would-have-hit-MMR rate via --verify-mmr (see below)
 *
 * Per docs/LLM-YMMS-Normalization.md §9 Phase 0: do NOT wire this to
 * production ingest until this shows a real lift over the current path.
 *
 * NOTE: this script intentionally duplicates the small pure pieces of
 * src/llm/ymmsPrompt.ts and src/llm/anthropicClient.ts rather than importing
 * them, the same way scripts/sync-cox-catalog.mjs duplicates
 * buildSearchText/inferVariantKind — this repo's Worker code is TypeScript
 * with no build step for standalone Node scripts. If you change the prompt,
 * tool schema, or validation gate in src/llm/, mirror the change here.
 *
 * Usage:
 *   node scripts/eval-llm-ymms.mjs [--limit 200] [--missing-reason model_variant_missing] [--verify-mmr]
 *
 * Single listing (debug one ad-hoc row through Claude + Cox gate):
 *   node scripts/eval-llm-ymms.mjs --one --year 2022 --make Toyota --title "2022 Toyota RAV4 XLE AWD"
 *   node scripts/eval-llm-ymms.mjs --one --listing-id <normalized_listings.uuid> [--verify-mmr]
 *
 * Requires `.dev.vars` (or env) with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * ANTHROPIC_API_KEY. --verify-mmr additionally requires INTEL_WORKER_URL +
 * INTEL_WORKER_SECRET and calls the real Cox-backed MMR endpoint — costs
 * real Cox API quota, so it defaults OFF.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEV_VARS = path.join(ROOT, ".dev.vars");
const RESULTS_DIR = path.join(ROOT, "scripts", "_eval-results");

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
  const args = {
    limit: 100,
    missingReason: "model_variant_missing",
    verifyMmr: false,
    one: false,
    listingId: null,
    year: null,
    make: null,
    model: null,
    trim: null,
    title: null,
    price: null,
    description: null,
    priorMissReason: "model_variant_missing",
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--limit") args.limit = Number(argv[++i]);
    else if (argv[i] === "--missing-reason") args.missingReason = argv[++i];
    else if (argv[i] === "--verify-mmr") args.verifyMmr = true;
    else if (argv[i] === "--one") args.one = true;
    else if (argv[i] === "--listing-id") args.listingId = argv[++i];
    else if (argv[i] === "--year") args.year = Number(argv[++i]);
    else if (argv[i] === "--make") args.make = argv[++i];
    else if (argv[i] === "--model") args.model = argv[++i];
    else if (argv[i] === "--trim") args.trim = argv[++i];
    else if (argv[i] === "--title") args.title = argv[++i];
    else if (argv[i] === "--price") args.price = Number(argv[++i]);
    else if (argv[i] === "--description") args.description = argv[++i];
    else if (argv[i] === "--prior-miss-reason") args.priorMissReason = argv[++i];
  }
  return args;
}

// ── Mirrors src/llm/ymmsPrompt.ts — keep in sync ────────────────────────────

const YMMS_TOOL_NAME = "propose_cox_ymms";

const YMMS_TOOL = {
  name: YMMS_TOOL_NAME,
  description:
    "Propose the correct Cox catalog Y/M/M/S (model + style) for this vehicle listing. " +
    "You MUST pick model and style values that appear verbatim in the provided Cox catalog list — " +
    "never invent, combine, or paraphrase a value that is not in that list.",
  input_schema: {
    type: "object",
    properties: {
      make: { type: "string" },
      model: { type: "string" },
      style: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reasoning: { type: "string" },
      needsReview: { type: "boolean" },
    },
    required: ["make", "model", "style", "confidence", "reasoning", "needsReview"],
  },
};

const YMMS_SYSTEM_PROMPT =
  "You are a vehicle-identity normalization assistant for a used-car acquisition pipeline. " +
  "Your only job is to map a scraped marketplace listing to the correct Cox Automotive catalog " +
  "model + style for a given year/make, so the pipeline can request a wholesale valuation (MMR). " +
  "You are given the FULL list of Cox models and styles that exist for this exact year+make — the " +
  "correct answer is always somewhere in that list. Never propose a model or style that is not in " +
  "the provided list. Never invent mileage, trim, or other details not present in the listing. " +
  "Always call the propose_cox_ymms tool with your answer — never respond with plain text.";

function buildCatalogSubtreeText(rows) {
  const byModel = new Map();
  for (const row of rows) {
    if (!byModel.has(row.model)) byModel.set(row.model, new Set());
    byModel.get(row.model).add(row.style);
  }
  const models = [...byModel.keys()].sort((a, b) => a.localeCompare(b));
  return models
    .map((model) => {
      const styles = [...byModel.get(model)].sort((a, b) => a.localeCompare(b));
      return `${model}\n${styles.map((style) => `  - ${style}`).join("\n")}`;
    })
    .join("\n");
}

function buildYmmsUserPrompt(input, rows) {
  const lines = [];
  lines.push(`Year: ${input.year}`);
  lines.push(`Make (already resolved, do not change): ${input.make}`);
  if (input.model) lines.push(`Parser-guessed model (may be wrong/incomplete): ${input.model}`);
  if (input.trim) lines.push(`Parser-guessed trim (may be wrong/missing): ${input.trim}`);
  if (typeof input.price === "number") lines.push(`Listing price: $${input.price}`);
  if (input.priorMissReason) lines.push(`Why rules-based matching failed before: ${input.priorMissReason}`);
  lines.push("");
  lines.push("Listing title:");
  lines.push(input.title?.trim() || "(none)");
  lines.push("");
  lines.push("Listing description:");
  lines.push(input.description?.trim() || "(none)");
  lines.push("");
  lines.push(
    `All Cox models + styles that exist for ${input.year} ${input.make} (pick model and style verbatim from this list):`,
  );
  lines.push(buildCatalogSubtreeText(rows));
  return lines.join("\n");
}

function isValidCoxPick(proposal, rows) {
  const make = proposal.make.trim().toLowerCase();
  const model = proposal.model.trim().toLowerCase();
  const style = proposal.style.trim().toLowerCase();
  return rows.some(
    (row) => row.make.toLowerCase() === make && row.model.toLowerCase() === model && row.style.toLowerCase() === style,
  );
}

// ── Mirrors src/llm/anthropicClient.ts — keep in sync ───────────────────────

async function callAnthropicForYmms(apiKey, model, userPrompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: YMMS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      tools: [YMMS_TOOL],
      tool_choice: { type: "tool", name: YMMS_TOOL_NAME },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { kind: "http_error", status: res.status, detail: text.slice(0, 300) };
  }

  const data = await res.json();
  const toolUse = (data.content ?? []).find((b) => b.type === "tool_use" && b.name === YMMS_TOOL_NAME);
  if (!toolUse) return { kind: "invalid_response", detail: "no tool_use block" };

  const p = toolUse.input ?? {};
  if (
    typeof p.make !== "string" ||
    typeof p.model !== "string" ||
    typeof p.style !== "string" ||
    typeof p.confidence !== "number" ||
    typeof p.reasoning !== "string" ||
    typeof p.needsReview !== "boolean"
  ) {
    return { kind: "invalid_response", detail: "tool_use input missing required fields" };
  }
  return { kind: "ok", proposal: p };
}

// ── Eval harness ─────────────────────────────────────────────────────────────

async function fetchMissRows(db, missingReason, limit) {
  const { data, error } = await db
    .schema("tav")
    .from("valuation_snapshots")
    .select("id, normalized_listing_id, year, make, model, missing_reason, fetched_at")
    .eq("missing_reason", missingReason)
    .not("normalized_listing_id", "is", null)
    .not("year", "is", null)
    .not("make", "is", null)
    .order("fetched_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

async function fetchListingById(db, id) {
  const { data, error } = await db
    .schema("tav")
    .from("normalized_listings")
    .select("id, year, make, model, trim, title, price, listing_url")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchListingsById(db, ids) {
  const byId = new Map();
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await db
      .schema("tav")
      .from("normalized_listings")
      .select("id, title, trim, price")
      .in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) byId.set(row.id, row);
  }
  return byId;
}

async function loadCatalogSubtree(db, cache, year, make) {
  const key = `${year}|${make.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);
  const { data, error } = await db
    .schema("tav")
    .from("cox_catalog_tree")
    .select("year, make, model, style")
    .eq("year", year)
    .ilike("make", make);
  if (error) throw error;
  cache.set(key, data ?? []);
  return data ?? [];
}

async function verifyMmrHit(intelBaseUrl, intelSecret, { year, make, model, style }) {
  try {
    const res = await fetch(`${intelBaseUrl}/mmr/year-make-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tav-service-secret": intelSecret },
      body: JSON.stringify({ year, make, model, trim: style }),
    });
    if (!res.ok) return false;
    const raw = await res.json();
    return Boolean(raw?.success && raw?.data?.ok && raw?.data?.mmr_value != null);
  } catch {
    return false;
  }
}

async function runOneListing(db, anthropicKey, model, intelBaseUrl, intelSecret, args) {
  let input;
  if (args.listingId) {
    const listing = await fetchListingById(db, args.listingId);
    if (!listing) throw new Error(`No normalized_listings row for id ${args.listingId}`);
    if (listing.year == null || !listing.make) {
      throw new Error("Listing missing year/make — cannot build Cox catalog context");
    }
    input = {
      year: listing.year,
      make: listing.make,
      model: listing.model,
      trim: listing.trim,
      title: listing.title,
      price: listing.price,
      priorMissReason: args.priorMissReason,
      listingUrl: listing.listing_url,
      listingId: listing.id,
    };
  } else {
    if (!args.year || !args.make || !args.title) {
      throw new Error("--one requires --listing-id OR (--year, --make, --title)");
    }
    input = {
      year: args.year,
      make: args.make,
      model: args.model,
      trim: args.trim,
      title: args.title,
      price: args.price,
      description: args.description,
      priorMissReason: args.priorMissReason,
    };
  }

  const catalogCache = new Map();
  const rows = await loadCatalogSubtree(db, catalogCache, input.year, input.make);
  if (rows.length === 0) {
    const out = { outcome: "catalog_not_synced", input, catalogRowCount: 0 };
    console.log(JSON.stringify(out, null, 2));
    return out;
  }

  const userPrompt = buildYmmsUserPrompt(
    {
      year: input.year,
      make: input.make,
      model: input.model,
      trim: input.trim,
      title: input.title,
      price: input.price,
      description: input.description,
      priorMissReason: input.priorMissReason,
    },
    rows,
  );

  console.log(`Catalog rows for ${input.year} ${input.make}: ${rows.length}`);
  console.log("Calling Anthropic...\n");

  const callResult = await callAnthropicForYmms(anthropicKey, model, userPrompt);
  if (callResult.kind !== "ok") {
    const out = { outcome: "llm_error", input, detail: callResult, catalogRowCount: rows.length };
    console.log(JSON.stringify(out, null, 2));
    return out;
  }

  const { proposal } = callResult;
  const valid = isValidCoxPick(proposal, rows);
  let outcome;
  if (!valid) outcome = "llm_invalid_pick";
  else if (proposal.needsReview) outcome = "llm_needs_review";
  else outcome = "llm_hit";

  let mmrVerifiedHit;
  if (args.verifyMmr && valid) {
    mmrVerifiedHit = await verifyMmrHit(intelBaseUrl, intelSecret, {
      year: input.year,
      make: proposal.make,
      model: proposal.model,
      style: proposal.style,
    });
  }

  const out = {
    outcome,
    input,
    proposal,
    validCoxPick: valid,
    catalogRowCount: rows.length,
    productionWouldTrust: outcome === "llm_hit",
    ...(mmrVerifiedHit !== undefined && { mmrVerifiedHit }),
  };
  console.log(JSON.stringify(out, null, 2));
  if (outcome === "llm_hit") {
    console.log("\nProduction ingest would use this Y/M/M/S for MMR when LLM_YMMS_ENABLED=true.");
  } else if (outcome === "llm_needs_review" || outcome === "llm_invalid_pick") {
    console.log("\nProduction would ignore Claude and fall back to offline matcher (same as today).");
  }
  return out;
}

async function main() {
  const vars = loadDevVars(DEV_VARS);
  const supabaseUrl = vars.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = vars.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = vars.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  const model = vars.LLM_YMMS_MODEL ?? process.env.LLM_YMMS_MODEL ?? "claude-sonnet-4-5";
  const intelBaseUrl =
    vars.INTEL_WORKER_URL ?? process.env.INTEL_WORKER_URL ?? "https://tav-intelligence-worker-production.rami-1a9.workers.dev";
  const intelSecret = vars.INTEL_WORKER_SECRET ?? process.env.INTEL_WORKER_SECRET;

  const args = parseArgs(process.argv.slice(2));

  if (!supabaseUrl || !supabaseKey) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  if (!anthropicKey || anthropicKey === "replace_me") throw new Error("Missing ANTHROPIC_API_KEY — see docs/LLM-YMMS-Normalization.md §13 Blockers");
  if (args.verifyMmr && (!intelSecret || intelSecret === "replace_me")) {
    throw new Error("--verify-mmr requires INTEL_WORKER_SECRET");
  }

  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (args.one) {
    await runOneListing(db, anthropicKey, model, intelBaseUrl, intelSecret, args);
    return;
  }

  console.log(`Pulling up to ${args.limit} listings with missing_reason='${args.missingReason}'...`);
  const missRows = await fetchMissRows(db, args.missingReason, args.limit);
  console.log(`Found ${missRows.length} candidate rows.`);

  const listingIds = [...new Set(missRows.map((r) => r.normalized_listing_id))];
  const listingsById = await fetchListingsById(db, listingIds);

  const catalogCache = new Map();
  const results = [];
  const counts = {
    total: missRows.length,
    catalog_not_synced: 0,
    llm_calls: 0,
    llm_hit: 0,
    llm_needs_review: 0,
    llm_invalid_pick: 0,
    llm_error: 0,
    mmr_verified_hit: 0,
  };

  for (const [i, row] of missRows.entries()) {
    const listing = listingsById.get(row.normalized_listing_id);
    const rows = await loadCatalogSubtree(db, catalogCache, row.year, row.make);
    if (rows.length === 0) {
      counts.catalog_not_synced += 1;
      results.push({ id: row.id, outcome: "catalog_not_synced", year: row.year, make: row.make, model: row.model });
      continue;
    }

    const userPrompt = buildYmmsUserPrompt(
      {
        year: row.year,
        make: row.make,
        model: row.model,
        trim: listing?.trim ?? null,
        title: listing?.title ?? null,
        price: listing?.price ?? null,
        priorMissReason: row.missing_reason,
      },
      rows,
    );

    counts.llm_calls += 1;
    const callResult = await callAnthropicForYmms(anthropicKey, model, userPrompt);

    if (callResult.kind !== "ok") {
      counts.llm_error += 1;
      results.push({
        id: row.id,
        outcome: "llm_error",
        detail: callResult,
        year: row.year,
        make: row.make,
        model: row.model,
      });
      console.log(`[${i + 1}/${missRows.length}] ${row.year} ${row.make} ${row.model} -> ERROR (${callResult.kind})`);
      continue;
    }

    const { proposal } = callResult;
    const valid = isValidCoxPick(proposal, rows);
    let outcome;
    if (!valid) outcome = "llm_invalid_pick";
    else if (proposal.needsReview) outcome = "llm_needs_review";
    else outcome = "llm_hit";
    counts[outcome] += 1;

    let mmrVerifiedHit;
    if (args.verifyMmr && valid) {
      mmrVerifiedHit = await verifyMmrHit(intelBaseUrl, intelSecret, {
        year: row.year,
        make: proposal.make,
        model: proposal.model,
        style: proposal.style,
      });
      if (mmrVerifiedHit) counts.mmr_verified_hit += 1;
    }

    results.push({
      id: row.id,
      outcome,
      year: row.year,
      inputMake: row.make,
      inputModel: row.model,
      inputTrim: listing?.trim ?? null,
      title: listing?.title ?? null,
      proposal,
      catalogRowCount: rows.length,
      ...(mmrVerifiedHit !== undefined && { mmrVerifiedHit }),
    });

    console.log(
      `[${i + 1}/${missRows.length}] ${row.year} ${row.make} ${row.model} -> ${outcome}` +
        (valid ? ` (${proposal.model} / ${proposal.style}, conf ${proposal.confidence})` : ""),
    );
  }

  const validPickRate = counts.llm_calls > 0 ? (counts.llm_hit + counts.llm_needs_review) / counts.llm_calls : 0;
  const summary = {
    ...counts,
    valid_cox_token_rate: Number(validPickRate.toFixed(4)),
    ...(args.verifyMmr && {
      would_have_hit_mmr_rate: counts.llm_calls > 0 ? Number((counts.mmr_verified_hit / counts.llm_calls).toFixed(4)) : 0,
    }),
  };

  console.log("\n=== Summary ===");
  console.table(summary);
  console.log(
    `Valid Cox token rate: ${(validPickRate * 100).toFixed(1)}% (target >= 99% per docs/LLM-YMMS-Normalization.md §9 Phase 0)`,
  );

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outFile = path.join(RESULTS_DIR, `llm-ymms-eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ args, summary, results }, null, 2));
  console.log(`\nFull results written to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
