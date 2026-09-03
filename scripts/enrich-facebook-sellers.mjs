/**
 * Item 74 — Facebook seller enrichment via GoLogin (local Orbita or Cloud).
 *
 * Standalone Node process. Not the ingest Worker. No production writes
 * unless `--write` (and SELLER_ENRICH_ENABLED is not "false").
 *
 * Caps, Chicago hours, and inter-listing jitter are **off**. Seller lookup
 * runs as fast as the browser can so Facebook cards wait on a seller URL
 * before they appear on Opportunities. Halt still latches on checkpoint /
 * login wall.
 *
 * Usage:
 *   node scripts/enrich-facebook-sellers.mjs
 *   node scripts/enrich-facebook-sellers.mjs --queue-only --limit 20
 *   node scripts/enrich-facebook-sellers.mjs --write --limit 8
 *   node scripts/enrich-facebook-sellers.mjs --write --queue unprocessed --limit 8
 *   node scripts/enrich-facebook-sellers.mjs --write --loop --cloud
 *   node scripts/enrich-facebook-sellers.mjs --url "https://www.facebook.com/marketplace/item/…/"
 *   node scripts/enrich-facebook-sellers.mjs --clear-halt
 *
 * `--loop` polls **Needs-action-only** (would-be Needs action rows with no seller_url).
 * `--cloud` uses GoLogin Cloud instead of local Orbita and frees the slot
 * when idle. `--hours` restores Chicago 07–21. `--max-per-day N` restores a cap.
 *
 * Default queue is `needs_action`. Legacy `--queue unprocessed|dealer_*` for debug.
 *
 * Requires `.dev.vars`: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * GOLOGIN_API_TOKEN, GOLOGIN_PROFILE_ID.
 */
import "./lib/gologin-fs-patch.mjs";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { GologinApi } from "gologin";
import {
  extractSellerFromListingPage,
  isFacebookListingUrl,
  isFacebookMarketplaceProfileUrl,
  normalizeSellerName,
  normalizeSellerUrl,
  sleep,
  stripHeavyProxyAssets,
  warmupFacebookSession,
} from "./lib/facebook-seller-extract.mjs";
import {
  DEFAULT_MAX_PER_DAY,
  DEFAULT_MAX_PER_HOUR,
  FATAL_SKIP_REASONS,
  SessionHaltedError,
  assertCanRun,
  clearHalt,
  halt,
  isCloudUnavailableError,
  isDeadBrowserError,
  isWithinHours,
  loadState,
  recordVisit,
  remainingCapacity,
  saveState,
} from "./lib/gologin-antiban.mjs";
import {
  assertQueueName,
  buildNeedsActionEnrichContext,
  defaultQueue,
  matchesWouldBeNeedsAction,
} from "./lib/enrich-queues.mjs";
import { stopCloudProfile } from "./lib/gologin-cloud.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEV_VARS = path.join(ROOT, ".dev.vars");
const WAIT_MS = 25_000;
const LISTING_MAX_AGE_DAYS = 5;
const UNPROCESSED_CAP = 200;
const NEEDS_ACTION_CAP = 200;
/** PostgREST `.in()` URL length — Node 25 undici blows past ~16KB headers. */
const POSTGREST_IN_CHUNK = 40;
const DEFAULT_LIMIT = 40;
const DEFAULT_POLL_MS = 3_000;
const SESSION_DEAD_POLL_MS = 10_000;
const CLOUD_UNAVAILABLE_POLL_MS = 45_000;
const LISTING_SKIP_TTL_MS = 30 * 60_000;
const HALT_POLL_MS = 60_000;
const OFF_HOURS_POLL_MS = 15 * 60_000;
const CAP_POLL_MS = 10 * 60_000;
const DELAY_MIN_MS = 0;
const DELAY_MAX_MS = 0;
const SUPPRESSED = ["bad_lead", "passed", "purchased", "duplicate", "stale", "sold", "archived"];

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

function formatErr(err) {
  if (err instanceof Error) {
    const extra = err.cause instanceof Error ? ` (${err.cause.message})` : "";
    return `${err.name}: ${err.message}${extra}`;
  }
  if (err && typeof err === "object") {
    const rec = err;
    const parts = [rec.message, rec.code, rec.details, rec.hint].filter(Boolean);
    if (parts.length) return parts.join(" | ");
    try {
      return JSON.stringify(err);
    } catch {
      return "[unserializable error]";
    }
  }
  return String(err);
}

function isPlaceholder(value) {
  const raw = (value || "").trim();
  return !raw || raw === "replace_me";
}

function parseArgs(argv) {
  const args = {
    write: false,
    queueOnly: false,
    clearHalt: false,
    skipHours: true,
    skipWarmup: false,
    limit: DEFAULT_LIMIT,
    maxPerDay: DEFAULT_MAX_PER_DAY,
    maxPerHour: DEFAULT_MAX_PER_HOUR,
    delayMs: 0,
    url: null,
    queue: null,
    loop: false,
    pollMs: DEFAULT_POLL_MS,
    cloud: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--write") args.write = true;
    else if (token === "--queue-only") args.queueOnly = true;
    else if (token === "--clear-halt") args.clearHalt = true;
    else if (token === "--skip-hours") args.skipHours = true;
    else if (token === "--hours") args.skipHours = false;
    else if (token === "--skip-warmup") args.skipWarmup = true;
    else if (token === "--loop") args.loop = true;
    else if (token === "--cloud") args.cloud = true;
    else if (token === "--limit") args.limit = Number(argv[++i]);
    else if (token === "--max-per-day") args.maxPerDay = Number(argv[++i]);
    else if (token === "--max-per-hour") args.maxPerHour = Number(argv[++i]);
    else if (token === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (token === "--poll-ms") args.pollMs = Number(argv[++i]);
    else if (token === "--url") args.url = String(argv[++i] || "").trim();
    else if (token === "--queue") args.queue = String(argv[++i] || "").trim();
    else if (!token.startsWith("-") && !args.url) args.url = token;
  }
  args.queue = assertQueueName(defaultQueue({ queue: args.queue }));
  if (!Number.isFinite(args.limit) || args.limit < 1) args.limit = DEFAULT_LIMIT;
  if (!Number.isFinite(args.maxPerDay) || args.maxPerDay < 0) args.maxPerDay = DEFAULT_MAX_PER_DAY;
  if (!Number.isFinite(args.maxPerHour) || args.maxPerHour < 0) args.maxPerHour = DEFAULT_MAX_PER_HOUR;
  if (!Number.isFinite(args.pollMs) || args.pollMs < 1_000) args.pollMs = DEFAULT_POLL_MS;
  if (args.loop && args.url) {
    throw new Error("--loop cannot be combined with --url");
  }
  if (args.loop && !args.write) {
    throw new Error("--loop requires --write");
  }
  return args;
}

function randomDelayMs(override) {
  if (override === 0) return 0;
  if (Number.isFinite(override) && override >= 0) return override;
  return DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1));
}

function buildSellerKey(sellerUrl, sellerName) {
  const url = sellerUrl ? normalizeSellerUrl(sellerUrl) : "";
  if (url) return `url:${url}`;
  const name = sellerName ? normalizeSellerName(sellerName) : "";
  if (name) return `name:${name}`;
  return null;
}

async function fetchInChunks(ids, fetchSlice) {
  const out = [];
  for (let i = 0; i < ids.length; i += POSTGREST_IN_CHUNK) {
    const slice = ids.slice(i, i + POSTGREST_IN_CHUNK);
    const rows = await fetchSlice(slice);
    out.push(...rows);
  }
  return out;
}

function tooOld(iso) {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms > LISTING_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function mergeQueue(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const url = String(row.listing_url || "").split("?")[0].replace(/\/+$/, "") + "/";
    if (!isFacebookListingUrl(row.listing_url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ ...row, listing_url: row.listing_url });
  }
  return out;
}

async function loadDealerDismissQueue(db) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: actions, error: actionsErr } = await db
    .from("opportunity_actions")
    .select("normalized_listing_id, created_at, metadata")
    .eq("action", "status_changed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  if (actionsErr) throw actionsErr;

  const listingIds = [];
  const seenIds = new Set();
  for (const row of actions ?? []) {
    if ((row.metadata || {}).reason !== "dealer") continue;
    const id = row.normalized_listing_id;
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    listingIds.push(id);
  }
  if (listingIds.length === 0) return [];

  const listings = await fetchInChunks(listingIds, async (slice) => {
    const { data, error } = await db
      .from("normalized_listings")
      .select("id, listing_url, region, source, seller_url, first_seen_at")
      .in("id", slice)
      .eq("source", "facebook")
      .is("seller_url", null);
    if (error) throw error;
    return data ?? [];
  });

  const rows = [];
  for (const listing of listings ?? []) {
    if (tooOld(listing.first_seen_at)) continue;
    rows.push({
      queue: "dealer_dismiss",
      dealerSignal: true,
      normalized_listing_id: listing.id,
      listing_url: listing.listing_url,
      region: listing.region,
      filtered_out_id: null,
      details: null,
    });
  }
  return rows;
}

async function loadDealerListingQueue(db) {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("filtered_out")
    .select("id, listing_url, details, created_at, source")
    .eq("source", "facebook")
    .eq("reason_code", "dealer_listing")
    .gte("created_at", since)
    .not("listing_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = [];
  for (const row of data ?? []) {
    const details = row.details && typeof row.details === "object" ? row.details : {};
    if (details.seller_url) continue;
    if (tooOld(row.created_at)) continue;
    rows.push({
      queue: "dealer_listing",
      dealerSignal: true,
      normalized_listing_id: null,
      listing_url: row.listing_url,
      region: null,
      filtered_out_id: row.id,
      details,
    });
  }
  return rows;
}

async function loadNeedsActionQueue(db) {
  const since = new Date(Date.now() - LISTING_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: listings, error } = await db
    .from("normalized_listings")
    .select("id, listing_url, region, first_seen_at, last_seen_at")
    .eq("source", "facebook")
    .is("seller_url", null)
    .is("vin", null)
    .gte("first_seen_at", since)
    .order("first_seen_at", { ascending: false })
    .limit(NEEDS_ACTION_CAP * 3);
  if (error) throw error;
  if (!listings?.length) return [];

  const ids = listings.map((row) => row.id);

  const [leads, workflows, manuals, valuations] = await Promise.all([
    fetchInChunks(ids, async (slice) => {
      const { data, error: leadErr } = await db
        .from("leads")
        .select("normalized_listing_id, created_at, status, assigned_to")
        .in("normalized_listing_id", slice);
      if (leadErr) throw leadErr;
      return data ?? [];
    }),
    fetchInChunks(ids, async (slice) => {
      const { data, error: wfErr } = await db
        .from("opportunity_workflow")
        .select(
          "normalized_listing_id, status, assigned_to_user_id, claimed_by_user_id, claim_expires_at",
        )
        .in("normalized_listing_id", slice);
      if (wfErr) throw wfErr;
      return data ?? [];
    }),
    fetchInChunks(ids, async (slice) => {
      const { data, error: manualErr } = await db
        .from("manual_opportunity_submissions")
        .select("normalized_listing_id, created_at, assigned_to_user_id")
        .in("normalized_listing_id", slice)
        .order("created_at", { ascending: false });
      if (manualErr) throw manualErr;
      return data ?? [];
    }),
    fetchInChunks(ids, async (slice) => {
      const { data, error: valErr } = await db
        .from("valuation_snapshots")
        .select("normalized_listing_id, mmr_value, fetched_at")
        .in("normalized_listing_id", slice)
        .order("fetched_at", { ascending: false });
      if (valErr) throw valErr;
      return data ?? [];
    }),
  ]);

  const leadById = new Map(
    (leads ?? []).map((row) => [row.normalized_listing_id, row]),
  );
  const workflowById = new Map(
    (workflows ?? []).map((row) => [
      row.normalized_listing_id,
      {
        status: row.status,
        assignedToUserId: row.assigned_to_user_id ?? null,
        claimedByUserId: row.claimed_by_user_id ?? null,
        claimExpiresAt: row.claim_expires_at ?? null,
      },
    ]),
  );
  const manualById = new Map();
  for (const row of manuals ?? []) {
    if (!manualById.has(row.normalized_listing_id)) {
      manualById.set(row.normalized_listing_id, {
        submittedAt: row.created_at,
        assignedToUserId: row.assigned_to_user_id ?? null,
      });
    }
  }
  const hasMmrHitById = new Map();
  for (const row of valuations ?? []) {
    if (hasMmrHitById.has(row.normalized_listing_id)) continue;
    hasMmrHitById.set(row.normalized_listing_id, row.mmr_value != null);
  }

  const now = new Date();
  const rows = [];
  for (const listing of listings) {
    const lead = leadById.get(listing.id) ?? null;
    const workflow = workflowById.get(listing.id) ?? null;
    const manual = manualById.get(listing.id) ?? null;
    const hasMmrHit = hasMmrHitById.get(listing.id) === true;
    const ctx = buildNeedsActionEnrichContext({
      listing,
      lead,
      workflow,
      manual,
      hasMmrHit,
    });
    if (!matchesWouldBeNeedsAction(ctx, now)) continue;
    rows.push({
      queue: "needs_action",
      dealerSignal: false,
      normalized_listing_id: listing.id,
      listing_url: listing.listing_url,
      region: listing.region,
      filtered_out_id: null,
      details: null,
    });
    if (rows.length >= NEEDS_ACTION_CAP) break;
  }
  return rows;
}

async function loadUnprocessedQueue(db) {
  const since = new Date(Date.now() - LISTING_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: listings, error } = await db
    .from("normalized_listings")
    .select("id, listing_url, region, first_seen_at")
    .eq("source", "facebook")
    .is("seller_url", null)
    .is("vin", null)
    .gte("first_seen_at", since)
    .order("first_seen_at", { ascending: false })
    .limit(UNPROCESSED_CAP * 3);
  if (error) throw error;
  if (!listings?.length) return [];

  const ids = listings.map((row) => row.id);
  const workflows = await fetchInChunks(ids, async (slice) => {
    const { data, error } = await db
      .from("opportunity_workflow")
      .select("normalized_listing_id, status")
      .in("normalized_listing_id", slice);
    if (error) throw error;
    return data ?? [];
  });

  const statusById = new Map(
    (workflows ?? []).map((row) => [row.normalized_listing_id, row.status]),
  );

  const rows = [];
  for (const listing of listings) {
    const status = statusById.get(listing.id) ?? null;
    if (status && SUPPRESSED.includes(status)) continue;
    rows.push({
      queue: "unprocessed",
      dealerSignal: false,
      normalized_listing_id: listing.id,
      listing_url: listing.listing_url,
      region: listing.region,
      filtered_out_id: null,
      details: null,
    });
    if (rows.length >= UNPROCESSED_CAP) break;
  }
  return rows;
}

async function loadQueue(db, limit, queue) {
  // Default: Needs-action-only — listings that would land on Needs action once Fly
  // attaches seller_url. Legacy `--queue unprocessed|dealer_*` for debugging.
  if (!queue || queue === "needs_action") {
    return mergeQueue(await loadNeedsActionQueue(db)).slice(0, limit);
  }

  const slices = [];
  if (queue === "unprocessed") slices.push(...(await loadUnprocessedQueue(db)));
  if (queue === "dealer_dismiss" || queue === "dealer_signal") {
    slices.push(...(await loadDealerDismissQueue(db)));
  }
  if (queue === "dealer_listing" || queue === "dealer_signal") {
    slices.push(...(await loadDealerListingQueue(db)));
  }
  return mergeQueue(slices).slice(0, limit);
}

async function sellerKeyIsBlocked(db, sellerKey) {
  const { data, error } = await db
    .from("blocked_sellers")
    .select("id")
    .eq("source", "facebook")
    .eq("seller_key", sellerKey)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function persistBlockedSeller(db, row, sellerUrl, sellerName, sellerKey) {
  const region = row.region || "dallas_tx";
  const name = sellerName ? normalizeSellerName(sellerName) : null;
  const keys = [sellerKey];
  if (name) {
    const nameKey = `name:${name}`;
    if (nameKey !== sellerKey) keys.push(nameKey);
  }

  let insertedAny = false;
  let alreadyBlocked = false;
  for (const key of keys) {
    const isUrlKey = key.startsWith("url:");
    const result = await persistBlockedSellerKey(db, {
      region,
      sellerKey: key,
      sellerUrl: isUrlKey ? sellerUrl : null,
      sellerName: name,
    });
    if (result.inserted) insertedAny = true;
    if (result.alreadyBlocked) alreadyBlocked = true;
  }
  return { inserted: insertedAny, alreadyBlocked };
}

async function persistBlockedSellerKey(db, { region, sellerKey, sellerUrl, sellerName }) {
  const { data: existing, error: existingErr } = await db
    .from("blocked_sellers")
    .select("id, region")
    .eq("source", "facebook")
    .eq("seller_key", sellerKey)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const payload = {
    source: "facebook",
    region: existing?.region || region,
    seller_key: sellerKey,
    seller_url: sellerUrl,
    seller_name: sellerName,
    reason: "dealer",
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await db
      .from("blocked_sellers")
      .update({
        seller_key: sellerKey,
        seller_url: sellerUrl,
        seller_name: sellerName,
        reason: "dealer",
        updated_at: payload.updated_at,
      })
      .eq("id", existing.id);
    if (error) throw error;
    return { inserted: false, alreadyBlocked: true };
  }

  const { error } = await db.from("blocked_sellers").insert(payload);
  if (error) throw error;
  return { inserted: true, alreadyBlocked: false };
}

async function persistListingSeller(db, row, sellerUrl, sellerName) {
  if (row.normalized_listing_id) {
    const { error } = await db
      .from("normalized_listings")
      .update({ seller_url: sellerUrl, seller_name: sellerName })
      .eq("id", row.normalized_listing_id);
    if (error) throw error;
  }
  if (row.filtered_out_id) {
    const details = { ...(row.details || {}), seller_url: sellerUrl, seller_name: sellerName };
    const { error } = await db.from("filtered_out").update({ details }).eq("id", row.filtered_out_id);
    if (error) throw error;
  }
}

async function suppressBlockedOpportunity(db, normalizedListingId) {
  if (!normalizedListingId) return false;
  const now = new Date().toISOString();
  const { data: existing, error: existingErr } = await db
    .from("opportunity_workflow")
    .select("status")
    .eq("normalized_listing_id", normalizedListingId)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing?.status && SUPPRESSED.includes(existing.status)) return false;

  if (existing) {
    const { error } = await db
      .from("opportunity_workflow")
      .update({ status: "bad_lead", updated_at: now })
      .eq("normalized_listing_id", normalizedListingId);
    if (error) throw error;
  } else {
    const { error } = await db.from("opportunity_workflow").insert({
      normalized_listing_id: normalizedListingId,
      status: "bad_lead",
      created_at: now,
      updated_at: now,
    });
    if (error) throw error;
  }
  return true;
}

async function launchBrowser(token, profileId, cloud) {
  const GL = GologinApi({ token });
  const launched = cloud
    ? await GL.launch({ profileId, cloud: true })
    : await GL.launch({ profileId });
  return { browser: launched.browser, GL };
}

async function sessionAlive(session) {
  if (!session?.page) return false;
  try {
    if (typeof session.page.isClosed === "function" && session.page.isClosed()) return false;
    if (session.browser && session.browser.connected === false) return false;
    await session.page.evaluate(() => true);
    return true;
  } catch {
    return false;
  }
}

async function closeSession(session) {
  if (!session) return;
  try {
    if (session.page && !session.page.isClosed()) await session.page.close();
  } catch {
    // ignore
  }
  try {
    await session.browser?.close();
  } catch {
    // ignore
  }
  if (session.cloud) {
    try {
      await stopCloudProfile(session.token, session.profileId);
    } catch (err) {
      console.error(`cloud slot free failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }
  try {
    if (session.GL && typeof session.GL.exit === "function") await session.GL.exit();
  } catch {
    // Local Orbita: ignore Invalid profile folder path.
  }
}

async function processJobs({ page, jobs, args, db, writeEnabled, runState }) {
  const results = [];
  let halted = false;
  let sessionDead = false;

  for (let i = 0; i < jobs.length; i += 1) {
    const row = jobs[i];
    if (i > 0) {
      const wait = randomDelayMs(args.delayMs);
      if (wait > 0) {
        console.error(`delay ${wait}ms before ${row.listing_url}`);
        await sleep(wait);
      }
    }

    const startedAt = Date.now();
    let extracted;
    try {
      extracted = await extractSellerFromListingPage(page, row.listing_url, WAIT_MS);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const dead = isDeadBrowserError(err);
      results.push({
        listingUrl: row.listing_url,
        queue: row.queue,
        ok: false,
        skipReason: "extract_error",
        error,
        sessionDead: dead,
        elapsedMs: Date.now() - startedAt,
      });
      console.error(`extract_error ${row.queue} ${error} ${row.listing_url}`);
      if (dead) {
        sessionDead = true;
        console.error("GoLogin Cloud tab is dead — aborting batch and relaunching");
        break;
      }
      continue;
    }

    recordVisit(runState);
    saveState(runState);

    const sellerUrl = extracted.sellerUrl ?? null;
    const sellerName = extracted.sellerName ?? null;
    const sellerKey = sellerUrl && isFacebookMarketplaceProfileUrl(sellerUrl)
      ? buildSellerKey(sellerUrl, sellerName)
      : null;

    const result = {
      listingUrl: row.listing_url,
      queue: row.queue,
      ok: Boolean(sellerKey) && !extracted.skipReason,
      skipReason: extracted.skipReason,
      sellerUrl,
      sellerName,
      sellerKey,
      loginWall: Boolean(extracted.snapshot?.loginWall),
      checkpoint: Boolean(extracted.snapshot?.checkpoint),
      elapsedMs: Date.now() - startedAt,
      wrote: false,
      blocked: false,
      suppressed: false,
    };

    if (FATAL_SKIP_REASONS.has(extracted.skipReason)) {
      halt(runState, extracted.skipReason);
      saveState(runState);
      halted = true;
      results.push(result);
      console.error(`halted: ${extracted.skipReason} — remaining listings skipped`);
      break;
    }

    if (writeEnabled && sellerKey && sellerUrl) {
      await persistListingSeller(db, row, sellerUrl, sellerName);
      result.wrote = true;

      const nameKey = sellerName ? `name:${normalizeSellerName(sellerName)}` : null;
      const alreadyBlocked =
        (await sellerKeyIsBlocked(db, sellerKey)) ||
        (nameKey ? await sellerKeyIsBlocked(db, nameKey) : false);
      if (alreadyBlocked || row.dealerSignal) {
        const blocked = await persistBlockedSeller(db, row, sellerUrl, sellerName, sellerKey);
        result.blocked = true;
        result.blockedInserted = blocked.inserted;
        result.suppressed = await suppressBlockedOpportunity(db, row.normalized_listing_id);
      }
    }

    results.push(result);
    console.error(
      `${result.ok ? "ok" : result.skipReason || "miss"}${result.wrote ? " wrote" : ""} ${row.queue} ${sellerName || ""} ${sellerUrl || ""}`.trim(),
    );
  }

  return { results, halted, sessionDead };
}

function gologinCreds(env) {
  const token = (env.GOLOGIN_API_TOKEN || env.GL_API_TOKEN || "").trim();
  const profileId = (env.GOLOGIN_PROFILE_ID || "").trim();
  if (isPlaceholder(token) || isPlaceholder(profileId)) {
    console.error("Need GOLOGIN_API_TOKEN and GOLOGIN_PROFILE_ID in .dev.vars");
    process.exit(1);
  }
  return { token, profileId };
}

async function openWarmedSession(args, env) {
  const { token, profileId } = gologinCreds(env);
  const mode = args.cloud ? "GoLogin Cloud" : "local Orbita";
  if (args.cloud) {
    try {
      await stopCloudProfile(token, profileId);
    } catch (err) {
      console.error(`pre-launch cloud slot free failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(2_000);
  }
  console.error(`launching profile ${profileId} (${mode})…`);
  const { browser, GL } = await launchBrowser(token, profileId, args.cloud);
  const page = await browser.newPage();
  await stripHeavyProxyAssets(page);
  page.setDefaultTimeout(WAIT_MS);
  console.error("proxy savings: aborting image/media/font");
  const session = { browser, GL, page, cloud: args.cloud, token, profileId };

  if (args.skipWarmup) return session;

  console.error("warmup facebook.com…");
  const warmed = await warmupFacebookSession(page, WAIT_MS);
  if (!warmed.ok) {
    await closeSession(session);
    const runState = loadState();
    halt(runState, warmed.skipReason);
    saveState(runState);
    throw new SessionHaltedError(warmed.skipReason, `halted on warmup: ${warmed.skipReason}`);
  }
  return session;
}

async function runOneShot(args, env, db, writeEnabled, capOpts) {
  let jobs;
  if (args.url) {
    if (!isFacebookListingUrl(args.url)) {
      console.error("URL must be a facebook.com/marketplace/item/… link");
      process.exit(1);
    }
    jobs = [
      {
        queue: "manual",
        dealerSignal: false,
        normalized_listing_id: null,
        listing_url: args.url,
        region: null,
        filtered_out_id: null,
        details: null,
      },
    ];
  } else {
    jobs = await loadQueue(db, args.limit, args.queue);
  }

  const runState = loadState();
  let capLeft = 0;
  try {
    capLeft = assertCanRun(runState, capOpts);
  } catch (err) {
    if (err instanceof SessionHaltedError && args.queueOnly) {
      capLeft = 0;
      console.error(err.message);
    } else {
      throw err;
    }
  }
  if (!args.queueOnly && Number.isFinite(capLeft) && jobs.length > capLeft) {
    jobs = jobs.slice(0, capLeft);
  }

  const summary = {
    ok: true,
    write: writeEnabled,
    queue: args.queue || "needs_action",
    queueOnly: args.queueOnly,
    loop: false,
    cloud: args.cloud,
    halted: Boolean(runState.haltedAt),
    haltReason: runState.haltReason,
    capLeft,
    count: jobs.length,
    jobs: jobs.map((row) => ({
      queue: row.queue,
      dealerSignal: row.dealerSignal,
      listingUrl: row.listing_url,
      normalizedListingId: row.normalized_listing_id,
    })),
    results: [],
  };

  if (args.queueOnly || jobs.length === 0) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const session = await openWarmedSession(args, env);
  try {
    const processed = await processJobs({
      page: session.page,
      jobs,
      args,
      db,
      writeEnabled,
      runState,
    });
    summary.results = processed.results;
    if (processed.halted) {
      summary.ok = false;
      summary.halted = true;
      summary.haltReason = runState.haltReason;
    }
  } finally {
    await closeSession(session);
  }

  console.log(JSON.stringify(summary, null, 2));
}

function startHealthServer() {
  const port = Number(process.env.PORT);
  if (!Number.isFinite(port) || port < 1) return;
  http
    .createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok\n");
    })
    .listen(port, "0.0.0.0", () => {
      console.error(`health listening on :${port}`);
    });
}

function rememberListingSkip(listingSkipUntil, listingUrl, reason) {
  if (!listingUrl || reason === "extract_error") return;
  listingSkipUntil.set(listingUrl, Date.now() + LISTING_SKIP_TTL_MS);
}

function dropCooledDown(jobs, listingSkipUntil) {
  const now = Date.now();
  for (const [url, until] of listingSkipUntil) {
    if (until <= now) listingSkipUntil.delete(url);
  }
  if (listingSkipUntil.size === 0) return jobs;
  return jobs.filter((row) => {
    const until = listingSkipUntil.get(row.listing_url);
    return !until || until <= now;
  });
}

async function runDaemon(args, env, db, writeEnabled, capOpts) {
  gologinCreds(env);
  startHealthServer();
  let session = null;
  let stopping = false;
  const listingSkipUntil = new Map();

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.error("daemon stopping…");
    await closeSession(session);
    session = null;
  };

  process.on("SIGINT", () => {
    stop().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    stop().finally(() => process.exit(0));
  });
  process.on("uncaughtException", (err) => {
    console.error(`uncaughtException: ${err instanceof Error ? err.message : String(err)}`);
  });
  process.on("unhandledRejection", (err) => {
    console.error(`unhandledRejection: ${err instanceof Error ? err.message : String(err)}`);
  });

  console.error(
    `seller enrich daemon up — queue=${args.queue || "needs_action"} poll=${args.pollMs}ms write=${writeEnabled} cloud=${args.cloud} caps=${args.maxPerDay || args.maxPerHour ? `${args.maxPerHour}/h ${args.maxPerDay}/d` : "off"} hours=${args.skipHours ? "off" : "chicago"}`,
  );

  while (!stopping) {
    const runState = loadState();
    if (runState.haltedAt) {
      if (session) {
        await closeSession(session);
        session = null;
      }
      console.error(
        `halted (${runState.haltReason}) at ${runState.haltedAt} — sleeping ${HALT_POLL_MS}ms until --clear-halt`,
      );
      await sleep(HALT_POLL_MS);
      continue;
    }

    if (!args.skipHours && !isWithinHours()) {
      if (session) {
        await closeSession(session);
        session = null;
      }
      console.error("outside Chicago hours — sleeping 15m");
      await sleep(OFF_HOURS_POLL_MS);
      continue;
    }

    const capLeft = remainingCapacity(runState, capOpts);
    if (Number.isFinite(capLeft) && capLeft <= 0) {
      console.error("cap reached — sleeping 10m");
      await sleep(CAP_POLL_MS);
      continue;
    }

    const batchLimit = Number.isFinite(capLeft) ? Math.min(args.limit, capLeft) : args.limit;
    try {
      const pooled = await loadQueue(db, NEEDS_ACTION_CAP, args.queue);
      const jobs = dropCooledDown(pooled, listingSkipUntil).slice(0, batchLimit);
      if (jobs.length === 0) {
        if (pooled.length) {
          console.error(`all ${pooled.length} queued listings are in cooldown — sleeping`);
        }
        if (session?.cloud) {
          await closeSession(session);
          session = null;
        }
        await sleep(args.pollMs);
        continue;
      }

      if (!(await sessionAlive(session))) {
        if (session) {
          console.error("GoLogin session is dead — relaunching");
          await closeSession(session);
          session = null;
        }
        session = await openWarmedSession(args, env);
      }

      console.error(`daemon picked ${jobs.length} listing(s) waiting on seller URL`);
      const processed = await processJobs({
        page: session.page,
        jobs,
        args,
        db,
        writeEnabled,
        runState,
      });
      for (const result of processed.results) {
        rememberListingSkip(listingSkipUntil, result.listingUrl, result.skipReason);
      }
      if (processed.halted || processed.sessionDead) {
        await closeSession(session);
        session = null;
      }
      if (processed.sessionDead) {
        await sleep(SESSION_DEAD_POLL_MS);
      }
    } catch (err) {
      console.error(formatErr(err));
      await closeSession(session);
      session = null;
      if (err instanceof SessionHaltedError) {
        await sleep(HALT_POLL_MS);
        continue;
      }
      // Cloud 503 is often logged by the SDK, then thrown as a different Error.
      // Any cloud launch/session failure should back off — 3s retries keep 503ing.
      const wait = args.cloud || isCloudUnavailableError(err)
        ? CLOUD_UNAVAILABLE_POLL_MS
        : args.pollMs;
      if (wait === CLOUD_UNAVAILABLE_POLL_MS) {
        console.error(`GoLogin Cloud unavailable — retrying in ${wait}ms`);
      }
      await sleep(wait);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = { ...loadDevVars(DEV_VARS), ...process.env };
  const writeEnabled = args.write && env.SELLER_ENRICH_ENABLED !== "false";
  const capOpts = {
    maxPerDay: args.maxPerDay,
    maxPerHour: args.maxPerHour,
    skipHours: args.skipHours,
  };

  if (args.write && env.SELLER_ENRICH_ENABLED === "false") {
    console.error("SELLER_ENRICH_ENABLED=false — refusing --write");
    process.exit(1);
  }

  const runState = loadState();
  if (args.clearHalt) {
    clearHalt(runState);
    saveState(runState);
    console.error("cleared halt latch");
    if (!args.loop && !args.queueOnly && !args.url && !args.write) return;
  }

  const supabaseUrl = (env.SUPABASE_URL || "").trim();
  const supabaseKey = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (isPlaceholder(supabaseUrl) || isPlaceholder(supabaseKey)) {
    console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .dev.vars");
    process.exit(1);
  }

  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    db: { schema: "tav" },
  });

  if (args.loop) {
    await runDaemon(args, env, db, writeEnabled, capOpts);
    return;
  }

  await runOneShot(args, env, db, writeEnabled, capOpts);
}

main().catch((err) => {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err?.message || err);
  console.error(msg);
  process.exit(err instanceof SessionHaltedError ? 2 : 1);
});
