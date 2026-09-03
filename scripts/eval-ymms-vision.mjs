/**
 * Item 73 — offline eval: can a full-res listing photo + the legal Cox style
 * list pick the correct style, and how much of that is the photo versus text?
 *
 * Pulls recent confirmed MMR hits (ground truth = stored lookup_make/model/trim),
 * stratified ~half random / half hard cohort (F-150, Silverado, Sierra, Ram,
 * Tacoma, Yukon). Each listing is scored twice with the same prompt: text-only
 * (control) vs photo (1536px, ctp stripped). No production writes, no Cox calls.
 *
 * Per docs/NEXT_STEPS.md §73: do not ask "what car is this" — eliminate among
 * legal Cox styles for that (year, make, model). When the gold model has only
 * one style, expand to the nameplate family so there is something to eliminate.
 *
 * Usage:
 *   npm run eval:ymms-vision -- --sample-only
 *   npm run eval:ymms-vision -- --limit 1
 *   npm run eval:ymms-vision -- --limit 200
 *   npm run eval:ymms-vision -- --resume scripts/_eval-results/ymms-vision-eval-….json
 *
 * Requires `.dev.vars` (or env) with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * ANTHROPIC_API_KEY.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEV_VARS = path.join(ROOT, ".dev.vars");
const RESULTS_DIR = path.join(ROOT, "scripts", "_eval-results");

const DEFAULT_LIMIT = 200;
const DEFAULT_DAYS = 3;
const DEFAULT_HARD_FRACTION = 0.5;
const DEFAULT_CONCURRENCY = 2;
const SNAPSHOT_POOL = 2500;
const PHOTO_FETCH_TIMEOUT_MS = 12_000;
const ANTHROPIC_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 6;

/** Hard cohort from NEXT_STEPS.md §73. */
const HARD_NAMEPLATES = ["f150", "silverado", "sierra", "tacoma", "yukon"];

const ENGINE_TOKENS = new Set([
  "v6",
  "v8",
  "i4",
  "i6",
  "diesel",
  "tdsl",
  "ecoboost",
  "hemi",
  "hybrid",
  "ffv",
  "phev",
  "35l",
  "37l",
  "27l",
  "50l",
  "57l",
  "62l",
  "67l",
  "36l",
]);
const DRIVETRAIN_TOKENS = new Set([
  "2wd",
  "4wd",
  "awd",
  "fwd",
  "rwd",
  "4x4",
  "4x2",
  "sdrive",
  "xdrive",
]);
const CAB_TOKENS = new Set([
  "supercrew",
  "supercab",
  "crewmax",
  "crewcab",
  "doublecab",
  "regularcab",
  "regcab",
  "quadcab",
  "megacab",
  "accesscab",
  "kingcab",
  "extendedcab",
  "extcab",
  "crew",
  "double",
  "regular",
  "extended",
]);

function loadDevVars(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, idx)] = value;
  }
  return out;
}

function parseArgs(argv) {
  const args = {
    limit: DEFAULT_LIMIT,
    days: DEFAULT_DAYS,
    hardFraction: DEFAULT_HARD_FRACTION,
    concurrency: DEFAULT_CONCURRENCY,
    sampleOnly: false,
    resume: null,
    seed: 73,
    model: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--limit") args.limit = Number(argv[++i]);
    else if (token === "--days") args.days = Number(argv[++i]);
    else if (token === "--hard-fraction") args.hardFraction = Number(argv[++i]);
    else if (token === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (token === "--sample-only") args.sampleOnly = true;
    else if (token === "--resume") args.resume = argv[++i];
    else if (token === "--seed") args.seed = Number(argv[++i]);
    else if (token === "--model") args.model = argv[++i];
  }
  if (!Number.isFinite(args.limit) || args.limit < 1) throw new Error("--limit must be >= 1");
  if (!Number.isFinite(args.days) || args.days < 1) throw new Error("--days must be >= 1");
  if (!Number.isFinite(args.concurrency) || args.concurrency < 1) throw new Error("--concurrency must be >= 1");
  return args;
}

function squash(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Mirror src/apify/listingMedia.ts — strip thumbnail crop, keep signed stp. */
function upgradeFacebookListingPhotoUrl(url) {
  if (!url || !/[?&]ctp=/i.test(url)) return url;
  return url.replace(/([?&])ctp=[^&]*&/i, "$1").replace(/[?&]ctp=[^&]*$/i, "");
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rand) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function isHardCohort({ make, model, lookupModel }) {
  const hay = squash(`${make ?? ""} ${model ?? ""} ${lookupModel ?? ""}`);
  if (HARD_NAMEPLATES.some((token) => hay.includes(token))) return true;
  if (hay.includes("ram") && (hay.includes("1500") || hay.includes("2500") || hay.includes("3500"))) {
    return true;
  }
  return squash(make) === "ram";
}

function nameplateFamily(model) {
  const s = squash(model);
  if (!s) return "";
  if (s.startsWith("f150") || s.startsWith("f-150")) return "f150";
  for (const token of HARD_NAMEPLATES) {
    if (s.includes(token)) return token;
  }
  if (s.startsWith("ram") || /^[123]500/.test(s)) return "ram";
  return s.replace(/(2wd|4wd|awd|fwd|rwd|v6|v8|i4|ffv|tdsl|police.*)$/g, "") || s;
}

function tokensOf(value) {
  return squash(value)
    .replace(/(2wd|4wd|awd|4x4|4x2|crewcab|doublecab|regularcab|extcab|supercrew|supercab)/g, " $1 ")
    .match(/[a-z]+[0-9]*|[0-9]+l/g) ?? [];
}

function classifyAxisMismatch(goldStyle, proposedStyle) {
  const gold = new Set(tokensOf(goldStyle));
  const pred = new Set(tokensOf(proposedStyle));
  const axes = [];
  const check = (axis, tokenSet) => {
    const goldHit = [...gold].filter((t) => tokenSet.has(t));
    const predHit = [...pred].filter((t) => tokenSet.has(t));
    if (goldHit.join() !== predHit.join() && (goldHit.length > 0 || predHit.length > 0)) {
      axes.push(axis);
    }
  };
  check("engine", ENGINE_TOKENS);
  check("drivetrain", DRIVETRAIN_TOKENS);
  check("cab", CAB_TOKENS);
  const remainingGold = [...gold].filter(
    (t) => !ENGINE_TOKENS.has(t) && !DRIVETRAIN_TOKENS.has(t) && !CAB_TOKENS.has(t),
  );
  const remainingPred = [...pred].filter(
    (t) => !ENGINE_TOKENS.has(t) && !DRIVETRAIN_TOKENS.has(t) && !CAB_TOKENS.has(t),
  );
  if (remainingGold.join() !== remainingPred.join()) axes.push("trim");
  return axes;
}

function styleMatch(proposed, gold) {
  if (!proposed || !gold) return false;
  if (proposed.trim() === gold) return true;
  if (proposed.trim().toLowerCase() === gold.trim().toLowerCase()) return true;
  return squash(proposed) === squash(gold);
}

const VISION_TOOL_NAME = "propose_cox_style";

const VISION_TOOL = {
  name: VISION_TOOL_NAME,
  description:
    "Pick exactly one Cox catalog style (and its model) from the provided list. " +
    "Never invent, combine, or paraphrase a value that is not in that list.",
  input_schema: {
    type: "object",
    properties: {
      make: { type: "string" },
      model: { type: "string" },
      style: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reasoning: { type: "string" },
      fail_axis: {
        type: "string",
        enum: ["none", "engine", "drivetrain", "cab", "trim", "unknown"],
        description: "If unsure between siblings, which axis is the remaining ambiguity.",
      },
    },
    required: ["make", "model", "style", "confidence", "reasoning", "fail_axis"],
  },
};

const VISION_SYSTEM_PROMPT =
  "You are a vehicle-identity assistant for a used-car acquisition pipeline. " +
  "Your only job is to pick the correct Cox Automotive catalog model + style for a listing " +
  "from a closed list of legal options. Do not identify the vehicle from scratch — eliminate. " +
  "The correct answer is always in the list. Never invent a style. " +
  "Use listing title and description as evidence. When a photo is attached, use it to read " +
  "badges, door count / cab, bed, wheels, and trim — do not pick a style the photo contradicts. " +
  "Always call the propose_cox_style tool.";

function buildStyleListText(rows) {
  const byModel = new Map();
  for (const row of rows) {
    if (!byModel.has(row.model)) byModel.set(row.model, new Set());
    byModel.get(row.model).add(row.style);
  }
  return [...byModel.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((model) => {
      const styles = [...byModel.get(model)].sort((a, b) => a.localeCompare(b));
      return `${model}\n${styles.map((style) => `  - ${style}`).join("\n")}`;
    })
    .join("\n");
}

function buildCatalogText(input, rows) {
  return [
    `Year: ${input.year}`,
    `Make (already resolved, do not change): ${input.make}`,
    "",
    `Legal Cox models + styles for this ${input.year} ${input.make} (pick model and style verbatim):`,
    buildStyleListText(rows),
  ].join("\n");
}

function buildEvidenceText(input, { hasPhoto }) {
  const lines = [
    "Parser year/make/model/trim below are automated guesses (hypothesis only) —",
    "prefer listing title, seller description, and the photo (if attached).",
  ];
  if (input.listingModel) lines.push(`Parser-guessed model (hypothesis): ${input.listingModel}`);
  if (input.listingTrim) lines.push(`Parser-guessed trim (hypothesis): ${input.listingTrim}`);
  if (typeof input.price === "number") lines.push(`Listing price: $${input.price}`);
  lines.push("");
  lines.push("Listing title (evidence):");
  lines.push(input.title?.trim() || "(none)");
  lines.push("");
  lines.push("Listing description (evidence):");
  lines.push((input.description?.trim() || "(none)").slice(0, 1000));
  lines.push("");
  lines.push(
    hasPhoto
      ? "A photo of the listed vehicle is attached. Use it to eliminate among the legal styles."
      : "No photo is attached. Use only the listing text.",
  );
  return lines.join("\n");
}

function selectCatalogRows(treeRows, gold) {
  const goldModel = squash(gold.lookupModel);
  const exact = treeRows.filter(
    (row) => squash(row.make) === squash(gold.lookupMake) && squash(row.model) === goldModel,
  );
  const uniqueStyles = new Set(exact.map((r) => r.style));
  if (uniqueStyles.size >= 2) {
    return { rows: exact, scope: "exact_model" };
  }
  const family = nameplateFamily(gold.lookupModel);
  const familyRows = treeRows.filter((row) => nameplateFamily(row.model) === family);
  if (familyRows.length > exact.length) {
    return { rows: familyRows.length > 0 ? familyRows : exact, scope: "nameplate_family" };
  }
  return { rows: exact.length > 0 ? exact : familyRows, scope: exact.length > 0 ? "exact_model" : "nameplate_family" };
}

function firstHttpsImage(images) {
  if (!Array.isArray(images)) return null;
  for (const raw of images) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed.startsWith("https://")) continue;
    return upgradeFacebookListingPhotoUrl(trimmed);
  }
  return null;
}

function mediaTypeFrom(contentType, url) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("png")) return "image/png";
  if (ct.includes("webp")) return "image/webp";
  if (ct.includes("gif")) return "image/gif";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "image/jpeg";
  if (/\.png(\?|$)/i.test(url)) return "image/png";
  if (/\.webp(\?|$)/i.test(url)) return "image/webp";
  return "image/jpeg";
}

async function downloadPhoto(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PHOTO_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) return { kind: "http_error", status: res.status };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return { kind: "too_small", bytes: buf.length };
    return {
      kind: "ok",
      bytes: buf.length,
      mediaType: mediaTypeFrom(res.headers.get("content-type"), url),
      base64: buf.toString("base64"),
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { kind: "timeout" };
    return { kind: "fetch_failed", detail: err instanceof Error ? err.name : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function callAnthropic({ apiKey, model, catalogText, evidenceText, photo }) {
  const content = [];
  if (photo) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: photo.mediaType, data: photo.base64 },
    });
  }
  content.push({ type: "text", text: catalogText, cache_control: { type: "ephemeral" } });
  content.push({ type: "text", text: evidenceText });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        system: [{ type: "text", text: VISION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
        tools: [{ ...VISION_TOOL, cache_control: { type: "ephemeral" } }],
        tool_choice: { type: "tool", name: VISION_TOOL_NAME },
      }),
      signal: controller.signal,
    });
    if (res.status === 429) return { kind: "rate_limited" };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { kind: "http_error", status: res.status, detail: text.slice(0, 400) };
    }
    const data = await res.json();
    const toolUse = (data.content ?? []).find((b) => b.type === "tool_use" && b.name === VISION_TOOL_NAME);
    if (!toolUse) return { kind: "invalid_response", detail: "no tool_use block" };
    const p = toolUse.input ?? {};
    if (typeof p.make !== "string" || typeof p.model !== "string" || typeof p.style !== "string") {
      return { kind: "invalid_response", detail: "tool_use input missing make/model/style" };
    }
    const usage = data.usage ?? {};
    return {
      kind: "ok",
      proposal: {
        make: p.make,
        model: p.model,
        style: p.style,
        confidence: typeof p.confidence === "number" ? p.confidence : null,
        reasoning: typeof p.reasoning === "string" ? p.reasoning : "",
        fail_axis: typeof p.fail_axis === "string" ? p.fail_axis : "unknown",
      },
      usage: {
        cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
        uncachedInputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { kind: "timeout" };
    return { kind: "fetch_failed", detail: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropicWithRetry(args) {
  let last;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    last = await callAnthropic(args);
    if (last.kind === "http_error" && (last.status === 401 || last.status === 403)) {
      return last;
    }
    if (last.kind !== "rate_limited") return last;
    const waitMs = Math.min(30_000, 1000 * 2 ** attempt);
    console.log(`  rate limited, retry in ${waitMs}ms`);
    await sleep(waitMs);
  }
  return last;
}

function isValidPick(proposal, rows) {
  return rows.some(
    (row) =>
      squash(row.make) === squash(proposal.make) &&
      squash(row.model) === squash(proposal.model) &&
      squash(row.style) === squash(proposal.style),
  );
}

async function fetchHitSnapshots(db, days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .schema("tav")
    .from("valuation_snapshots")
    .select(
      "id, normalized_listing_id, year, make, model, lookup_make, lookup_model, lookup_trim, fetched_at",
    )
    .is("missing_reason", null)
    .not("normalized_listing_id", "is", null)
    .not("lookup_make", "is", null)
    .not("lookup_model", "is", null)
    .not("lookup_trim", "is", null)
    .gte("fetched_at", since)
    .order("fetched_at", { ascending: false })
    .limit(SNAPSHOT_POOL);
  if (error) throw error;
  return (data ?? []).filter((row) => {
    const trim = String(row.lookup_trim).trim();
    return trim.length > 0 && trim.toLowerCase() !== "base";
  });
}

async function fetchListingsById(db, ids) {
  const byId = new Map();
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await db
      .schema("tav")
      .from("normalized_listings")
      .select("id, title, trim, price, description, images, year, make, model")
      .in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) byId.set(row.id, row);
  }
  return byId;
}

async function loadCatalogForMake(db, cache, year, make) {
  const key = `${year}|${squash(make)}`;
  if (cache.has(key)) return cache.get(key);
  const { data, error } = await db
    .schema("tav")
    .from("cox_catalog_tree")
    .select("year, make, model, style")
    .eq("year", year)
    .ilike("make", make);
  if (error) throw error;
  let rows = data ?? [];
  if (rows.length === 0) {
    const pattern = squash(make)
      .split("")
      .join("%");
    const retry = await db
      .schema("tav")
      .from("cox_catalog_tree")
      .select("year, make, model, style")
      .eq("year", year)
      .ilike("make", `%${pattern}%`);
    if (retry.error) throw retry.error;
    rows = (retry.data ?? []).filter((row) => squash(row.make) === squash(make));
  }
  cache.set(key, rows);
  return rows;
}

function emptyCounts() {
  return {
    total: 0,
    hard: 0,
    random: 0,
    skipped_no_photo: 0,
    skipped_photo_dead: 0,
    skipped_catalog: 0,
    text_exact: 0,
    photo_exact: 0,
    both_exact: 0,
    photo_only_exact: 0,
    text_only_exact: 0,
    neither_exact: 0,
    invalid_text: 0,
    invalid_photo: 0,
    llm_error_text: 0,
    llm_error_photo: 0,
  };
}

function scoreArm(arm, gold) {
  if (!arm || arm.outcome !== "ok") return { exact: false, valid: false };
  return {
    exact: styleMatch(arm.proposal.style, gold.lookup_trim) && squash(arm.proposal.model) === squash(gold.lookup_model),
    styleOnly: styleMatch(arm.proposal.style, gold.lookup_trim),
    valid: arm.validCoxPick,
  };
}

function addUsage(into, usage) {
  if (!usage) return;
  into.cacheCreationInputTokens += usage.cacheCreationInputTokens;
  into.cacheReadInputTokens += usage.cacheReadInputTokens;
  into.uncachedInputTokens += usage.uncachedInputTokens;
  into.outputTokens += usage.outputTokens;
  into.calls += 1;
}

function estimateUsd(usage) {
  // Sonnet 4.5 / 4 published-ish: input $3 / MTok, output $15 / MTok,
  // cache write $3.75, cache read $0.30. Image tokens land in uncached/cache-write.
  const inCost =
    (usage.uncachedInputTokens / 1_000_000) * 3 +
    (usage.cacheCreationInputTokens / 1_000_000) * 3.75 +
    (usage.cacheReadInputTokens / 1_000_000) * 0.3;
  const outCost = (usage.outputTokens / 1_000_000) * 15;
  return Number((inCost + outCost).toFixed(4));
}

function summarize(results) {
  const counts = emptyCounts();
  const usage = {
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    uncachedInputTokens: 0,
    outputTokens: 0,
    calls: 0,
  };
  const failAxes = { engine: 0, drivetrain: 0, cab: 0, trim: 0 };
  const hard = { n: 0, text_exact: 0, photo_exact: 0 };
  const random = { n: 0, text_exact: 0, photo_exact: 0 };

  for (const row of results) {
    if (row.skipped) {
      if (row.skipped === "no_photo") counts.skipped_no_photo += 1;
      else if (row.skipped === "photo_dead") counts.skipped_photo_dead += 1;
      else if (row.skipped === "catalog") counts.skipped_catalog += 1;
      continue;
    }
    counts.total += 1;
    const slice = row.hard ? hard : random;
    if (row.hard) counts.hard += 1;
    else counts.random += 1;
    slice.n += 1;

    const text = scoreArm(row.text, row.gold);
    const photo = scoreArm(row.photo, row.gold);
    if (row.text?.outcome === "ok") addUsage(usage, row.text.usage);
    else counts.llm_error_text += 1;
    if (row.photo?.outcome === "ok") addUsage(usage, row.photo.usage);
    else counts.llm_error_photo += 1;
    if (row.text?.outcome === "ok" && !row.text.validCoxPick) counts.invalid_text += 1;
    if (row.photo?.outcome === "ok" && !row.photo.validCoxPick) counts.invalid_photo += 1;

    if (text.exact) {
      counts.text_exact += 1;
      slice.text_exact += 1;
    }
    if (photo.exact) {
      counts.photo_exact += 1;
      slice.photo_exact += 1;
    }
    if (text.exact && photo.exact) counts.both_exact += 1;
    else if (photo.exact && !text.exact) counts.photo_only_exact += 1;
    else if (text.exact && !photo.exact) counts.text_only_exact += 1;
    else if (!text.exact && !photo.exact) counts.neither_exact += 1;

    if (row.photo?.outcome === "ok" && !photo.exact) {
      const axes = classifyAxisMismatch(row.gold.lookup_trim, row.photo.proposal.style);
      if (axes.length === 0) failAxes.trim += 1;
      for (const axis of axes) failAxes[axis] += 1;
    }
  }

  const rate = (n, d) => (d > 0 ? Number((n / d).toFixed(4)) : 0);
  return {
    listings_scored: counts.total,
    hard: counts.hard,
    random: counts.random,
    skipped: {
      no_photo: counts.skipped_no_photo,
      photo_dead: counts.skipped_photo_dead,
      catalog: counts.skipped_catalog,
    },
    accuracy: {
      text_only: rate(counts.text_exact, counts.total),
      photo: rate(counts.photo_exact, counts.total),
      photo_lift: rate(counts.photo_exact - counts.text_exact, counts.total),
      both: rate(counts.both_exact, counts.total),
      photo_only_wins: counts.photo_only_exact,
      text_only_wins: counts.text_only_exact,
      neither: counts.neither_exact,
    },
    hard_slice: {
      n: hard.n,
      text_only: rate(hard.text_exact, hard.n),
      photo: rate(hard.photo_exact, hard.n),
    },
    random_slice: {
      n: random.n,
      text_only: rate(random.text_exact, random.n),
      photo: rate(random.photo_exact, random.n),
    },
    invalid_picks: { text: counts.invalid_text, photo: counts.invalid_photo },
    llm_errors: { text: counts.llm_error_text, photo: counts.llm_error_photo },
    photo_fail_axes: failAxes,
    tokens: usage,
    estimated_usd_sonnet: estimateUsd(usage),
    ingest_volume_note:
      "Per-listing photo-arm token cost × daily ingest (~3–4k listings) is the production ceiling if vision ran on every listing. §73 should run only on the ambiguous subset.",
  };
}

function writeState(outFile, payload) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

async function main() {
  const vars = loadDevVars(DEV_VARS);
  const supabaseUrl = vars.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = vars.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = vars.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  const args = parseArgs(process.argv.slice(2));
  const model = args.model ?? vars.LLM_YMMS_MODEL ?? process.env.LLM_YMMS_MODEL ?? "claude-sonnet-5";

  if (!supabaseUrl || !supabaseKey) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  if (!args.sampleOnly && (!anthropicKey || anthropicKey === "replace_me")) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let prior = null;
  if (args.resume) {
    prior = JSON.parse(fs.readFileSync(args.resume, "utf8"));
    console.log(`Resuming ${args.resume} (${(prior.results ?? []).filter((r) => !r.skipped && r.text && r.photo).length} scored)`);
  }

  console.log(`Pulling up to ${SNAPSHOT_POOL} MMR hits from the last ${args.days} days...`);
  const snapshots = await fetchHitSnapshots(db, args.days);
  const listingIds = [...new Set(snapshots.map((r) => r.normalized_listing_id))];
  const listingsById = await fetchListingsById(db, listingIds);

  const candidates = [];
  const seenListing = new Set();
  for (const snap of snapshots) {
    if (seenListing.has(snap.normalized_listing_id)) continue;
    const listing = listingsById.get(snap.normalized_listing_id);
    if (!listing) continue;
    const photoUrl = firstHttpsImage(listing.images);
    if (!photoUrl) continue;
    seenListing.add(snap.normalized_listing_id);
    candidates.push({
      snapshotId: snap.id,
      listingId: snap.normalized_listing_id,
      year: snap.year ?? listing.year,
      listingMake: listing.make ?? snap.make,
      listingModel: listing.model ?? snap.model,
      listingTrim: listing.trim,
      title: listing.title,
      description: listing.description,
      price: listing.price,
      photoUrl,
      gold: {
        lookup_make: snap.lookup_make,
        lookup_model: snap.lookup_model,
        lookup_trim: snap.lookup_trim,
      },
      hard: isHardCohort({
        make: snap.lookup_make,
        model: listing.model,
        lookupModel: snap.lookup_model,
      }),
      fetched_at: snap.fetched_at,
    });
  }

  const rand = mulberry32(args.seed);
  const hardPool = shuffle(
    candidates.filter((c) => c.hard),
    rand,
  );
  const randomPool = shuffle(
    candidates.filter((c) => !c.hard),
    rand,
  );
  const hardN = Math.min(hardPool.length, Math.round(args.limit * args.hardFraction));
  const randomN = Math.min(randomPool.length, args.limit - hardN);
  const sample = [...hardPool.slice(0, hardN), ...randomPool.slice(0, randomN)];

  console.log(
    `Pool with live-looking photo URLs: ${candidates.length} (${hardPool.length} hard, ${randomPool.length} other). ` +
      `Sample ${sample.length}: ${hardN} hard / ${randomN} random.`,
  );

  if (args.sampleOnly) {
    const preview = sample.map((c) => ({
      listingId: c.listingId,
      year: c.year,
      gold: `${c.gold.lookup_make} / ${c.gold.lookup_model} / ${c.gold.lookup_trim}`,
      hard: c.hard,
      title: (c.title || "").slice(0, 80),
    }));
    console.table(preview.slice(0, 15));
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const outFile = path.join(RESULTS_DIR, `ymms-vision-sample-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(outFile, JSON.stringify({ args, sample }, null, 2));
    console.log(`Sample written to ${outFile}`);
    return;
  }

  const scoredIds = new Set(
    (prior?.results ?? []).filter((r) => r.text && r.photo && !r.skipped).map((r) => r.listingId),
  );
  const toRun = sample.filter((c) => !scoredIds.has(c.listingId));
  const catalogCache = new Map();
  const results = [...(prior?.results ?? [])];
  const outFile =
    args.resume ??
    path.join(RESULTS_DIR, `ymms-vision-eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  let persistChain = Promise.resolve();
  const persist = () => {
    persistChain = persistChain.then(() => {
      writeState(outFile, {
        args: { ...args, model },
        summary: summarize(results),
        results,
      });
    });
    return persistChain.then(
      () => results.filter((r) => r.text && r.photo && !r.skipped).length,
    );
  };

  console.log(`Scoring ${toRun.length} listings × 2 arms on ${model} (concurrency ${args.concurrency})...`);

  await mapPool(toRun, args.concurrency, async (candidate, index) => {
    const tree = await loadCatalogForMake(db, catalogCache, candidate.year, candidate.gold.lookup_make);
    const { rows, scope } = selectCatalogRows(tree, {
      lookupMake: candidate.gold.lookup_make,
      lookupModel: candidate.gold.lookup_model,
    });
    const label = `[${index + 1}/${toRun.length}] ${candidate.year} ${candidate.gold.lookup_model}`;

    if (rows.length === 0) {
      results.push({ ...candidate, skipped: "catalog", catalogRowCount: 0, scope });
      console.log(`${label} -> skip catalog`);
      await persist();
      return;
    }

    const photo = await downloadPhoto(candidate.photoUrl);
    if (photo.kind !== "ok") {
      results.push({ ...candidate, skipped: "photo_dead", photoError: photo, catalogRowCount: rows.length, scope });
      console.log(`${label} -> skip photo (${photo.kind})`);
      await persist();
      return;
    }

    const promptInput = {
      year: candidate.year,
      make: candidate.gold.lookup_make,
      listingModel: candidate.listingModel,
      listingTrim: candidate.listingTrim,
      title: candidate.title,
      description: candidate.description,
      price: candidate.price,
    };
    const catalogText = buildCatalogText({ year: candidate.year, make: candidate.gold.lookup_make }, rows);

    const textCall = await callAnthropicWithRetry({
      apiKey: anthropicKey,
      model,
      catalogText,
      evidenceText: buildEvidenceText(promptInput, { hasPhoto: false }),
      photo: null,
    });
    if (textCall.kind === "http_error" && (textCall.status === 401 || textCall.status === 403)) {
      throw new Error(
        `Anthropic ${textCall.status}: credits are out (or the key cannot bill). Reload Anthropic credits on this account, then re-run. Sample-only still works without a live call.`,
      );
    }
    const photoCall = await callAnthropicWithRetry({
      apiKey: anthropicKey,
      model,
      catalogText,
      evidenceText: buildEvidenceText(promptInput, { hasPhoto: true }),
      photo,
    });

    const pack = (call) => {
      if (call.kind !== "ok") return { outcome: call.kind, detail: call };
      return {
        outcome: "ok",
        proposal: call.proposal,
        validCoxPick: isValidPick(call.proposal, rows),
        exact: styleMatch(call.proposal.style, candidate.gold.lookup_trim) &&
          squash(call.proposal.model) === squash(candidate.gold.lookup_model),
        usage: call.usage,
      };
    };

    const text = pack(textCall);
    const photoArm = pack(photoCall);
    results.push({
      listingId: candidate.listingId,
      snapshotId: candidate.snapshotId,
      year: candidate.year,
      hard: candidate.hard,
      title: candidate.title,
      gold: candidate.gold,
      photoBytes: photo.bytes,
      catalogRowCount: rows.length,
      scope,
      text,
      photo: photoArm,
    });

    const n = await persist();
    const t = text.exact ? "hit" : text.outcome;
    const p = photoArm.exact ? "hit" : photoArm.outcome;
    console.log(`${label} (${candidate.hard ? "hard" : "rand"}, ${scope}, ${rows.length} styles) text=${t} photo=${p}  scored=${n}`);
  });

  const summary = summarize(results);
  await persist();
  console.log("\n=== Item 73 vision eval ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nFull results: ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
