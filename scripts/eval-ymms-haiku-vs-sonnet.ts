/**
 * Haiku vs Sonnet for Y/M/M/S identity — side by side, read-only.
 *
 * Takes recent listings where production asked Sonnet for a Cox model+style,
 * rebuilds the exact production Claude input from the stored raw payload
 * (same parser, same input builder, same resolver, same prompt), asks Haiku,
 * and compares:
 *   - agreement with Sonnet's production pick (all picks, and the subset Cox
 *     actually priced — the closest thing to ground truth we have)
 *   - Haiku confident picks that disagree with a Cox-priced Sonnet pick
 *     (a confident wrong price — the outcome the project rules forbid)
 *   - not-sure / unusable answer rates
 *   - whether each pick has booked before (`cox_proven_bookable`)
 *
 * Writes nothing to the database. Never calls Cox.
 *
 * Usage:
 *   npm run eval:ymms-haiku
 *   npm run eval:ymms-haiku -- --limit 300 --hours 72 --concurrency 4
 *   npm run eval:ymms-haiku -- --rerun-sonnet     # also re-ask Sonnet today (~1¢ per listing)
 *
 * Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY from
 * `.dev.vars` (or env). Never prints them. Results go to scripts/_eval-results/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Env } from "../src/types/env";
import type { RegionKey } from "../src/types/domain";
import { getSupabaseClient, type SupabaseClient } from "../src/persistence/supabase";
import { parseFacebookItem } from "../src/sources/facebook";
import { parseCraigslistItem } from "../src/sources/craigslist";
import { buildLlmYmmsResolutionInput } from "../src/ingest/llmYmmsPrefetchInputs";
import {
  buildLlmYmmsDeps,
  resolveListingWithLLM,
  type LlmYmmsResolution,
} from "../src/valuation/resolveListingWithLLM";
import { loadProvenBookableForMake } from "../src/persistence/coxProvenBookable";
import { isProvenBookableCombo, type ProvenBookableCombo } from "../src/valuation/provenBookable";
import { squashCatalogToken } from "../src/valuation/matchCatalogOption";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEV_VARS = path.join(ROOT, ".dev.vars");
const RESULTS_DIR = path.join(ROOT, "scripts", "_eval-results");

/** Go/no-go bar agreed 2026-10-12: Haiku must match ≥95% of Cox-priced Sonnet picks. */
const AGREEMENT_BAR = 0.95;

/** USD per million tokens. Check against current Anthropic pricing before quoting. */
const PRICE_PER_MTOK: Record<string, { input: number; cacheWrite: number; cacheRead: number; output: number }> = {
  haiku: { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 },
  sonnet: { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
};

type Args = {
  limit: number;
  hours: number;
  concurrency: number;
  rerunSonnet: boolean;
  haikuModel: string;
  sonnetModel: string;
};

type Pick = { make: string; model: string; style: string };

type SonnetDecision = {
  normalized_listing_id: string;
  outcome: string;
  proposed_make: string | null;
  proposed_model: string | null;
  proposed_style: string | null;
  confidence: number | null;
  created_at: string;
};

type ModelAnswer = {
  outcome: string;
  pick: Pick | null;
  confidence: number | null;
  bookable: boolean | null;
  tokens?: { uncached: number; cacheWrite: number; cacheRead: number; output: number };
};

type ResultRow = {
  listingId: string;
  year: number;
  make: string;
  title: string | null;
  description: string | null;
  sonnetProd: ModelAnswer;
  sonnetCoxPriced: boolean;
  haiku: ModelAnswer;
  sonnetRerun?: ModelAnswer;
  agree: boolean | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    limit: 300,
    hours: 72,
    concurrency: 4,
    rerunSonnet: false,
    haikuModel: "claude-haiku-5-5",
    sonnetModel: "claude-sonnet-5",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--limit") args.limit = Number(argv[++i]);
    else if (token === "--hours") args.hours = Number(argv[++i]);
    else if (token === "--concurrency") args.concurrency = Number(argv[++i]);
    else if (token === "--rerun-sonnet") args.rerunSonnet = true;
    else if (token === "--haiku-model") args.haikuModel = String(argv[++i]);
    else if (token === "--sonnet-model") args.sonnetModel = String(argv[++i]);
  }
  return args;
}

function loadDevVars(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return out;
}

function isPlaceholder(value: string | undefined): boolean {
  const raw = (value ?? "").trim();
  return !raw || raw === "replace_me";
}

function samePick(a: Pick | null, b: Pick | null): boolean | null {
  if (!a || !b) return null;
  return (
    squashCatalogToken(a.model) === squashCatalogToken(b.model) &&
    squashCatalogToken(a.style) === squashCatalogToken(b.style)
  );
}

function pickFromResolution(resolution: LlmYmmsResolution): Pick | null {
  switch (resolution.kind) {
    case "llm_hit":
      return { make: resolution.make, model: resolution.model, style: resolution.style };
    case "llm_needs_review":
      return resolution.canonical ?? null;
    default:
      return null;
  }
}

function outcomeLabel(resolution: LlmYmmsResolution): string {
  return resolution.kind === "fallback" ? `fallback:${resolution.reason}` : resolution.kind;
}

async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function fetchInChunks<T>(
  ids: string[],
  size: number,
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const { data, error } = await run(ids.slice(i, i + size));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

/** First Sonnet call per listing in the window — the ingest prefetch, not a cox_no_data retry. */
async function loadSonnetDecisions(db: SupabaseClient, args: Args): Promise<SonnetDecision[]> {
  const since = new Date(Date.now() - args.hours * 3600_000).toISOString();
  const rows = await fetchAllPages<SonnetDecision>((from, to) =>
    db
      .from("llm_ymms_decisions")
      .select("normalized_listing_id, outcome, proposed_make, proposed_model, proposed_style, confidence, created_at")
      .gte("created_at", since)
      .in("outcome", ["llm_hit", "llm_needs_review", "llm_invalid_pick"])
      .ilike("model", "%sonnet%")
      .not("normalized_listing_id", "is", null)
      .order("created_at", { ascending: true })
      .range(from, to),
  );
  const firstByListing = new Map<string, SonnetDecision>();
  for (const row of rows) {
    if (!firstByListing.has(row.normalized_listing_id)) firstByListing.set(row.normalized_listing_id, row);
  }
  return [...firstByListing.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, args.limit);
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]!, index);
    }
  });
  await Promise.all(lanes);
}

function rate(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}% (${n}/${d})`;
}

function costUsd(rows: ModelAnswer[], tier: "haiku" | "sonnet"): number {
  const price = PRICE_PER_MTOK[tier]!;
  let usd = 0;
  for (const row of rows) {
    if (!row.tokens) continue;
    usd +=
      (row.tokens.uncached * price.input +
        row.tokens.cacheWrite * price.cacheWrite +
        row.tokens.cacheRead * price.cacheRead +
        row.tokens.output * price.output) /
      1_000_000;
  }
  return Math.round(usd * 1000) / 1000;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const vars = { ...loadDevVars(DEV_VARS), ...process.env } as Record<string, string | undefined>;
  if (isPlaceholder(vars.SUPABASE_URL) || isPlaceholder(vars.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .dev.vars");
  }
  if (isPlaceholder(vars.ANTHROPIC_API_KEY)) throw new Error("Set ANTHROPIC_API_KEY in .dev.vars");

  const db = getSupabaseClient({
    SUPABASE_URL: vars.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: vars.SUPABASE_SERVICE_ROLE_KEY!,
  });

  // Only these three fields are read on the resolver + Anthropic path.
  const depsFor = (model: string) =>
    buildLlmYmmsDeps(
      db,
      { LLM_YMMS_ENABLED: "true", LLM_YMMS_MODEL: model, ANTHROPIC_API_KEY: vars.ANTHROPIC_API_KEY } as unknown as Env,
    );
  const haikuDeps = depsFor(args.haikuModel);
  const sonnetDeps = depsFor(args.sonnetModel);

  // The resolver's structured per-call logs go to stdout and would bury the summary.
  // Keep only Anthropic HTTP failures so the summary can say why calls failed.
  const httpErrors: Record<string, { count: number; sample: string }> = {};
  console.log = (line?: unknown) => {
    if (typeof line !== "string" || !line.includes("llm_ymms.anthropic_http_error")) return;
    try {
      const event = JSON.parse(line) as { model?: string; status?: number; response_text?: string };
      const key = `${event.model ?? "?"} ${event.status ?? "?"}`;
      httpErrors[key] ??= { count: 0, sample: (event.response_text ?? "").slice(0, 300) };
      httpErrors[key].count += 1;
    } catch {
      /* not a structured log line */
    }
  };

  console.error(`Loading Sonnet decisions from the last ${args.hours}h (limit ${args.limit})...`);
  const decisions = await loadSonnetDecisions(db, args);
  const listingIds = decisions.map((d) => d.normalized_listing_id);

  const listings = await fetchInChunks<{ id: string; source: string; region: string; raw_listing_id: string | null }>(
    listingIds,
    200,
    (chunk) => db.from("normalized_listings").select("id, source, region, raw_listing_id").in("id", chunk),
  );
  const listingById = new Map(listings.map((l) => [l.id, l]));
  const rawIds = listings.map((l) => l.raw_listing_id).filter((id): id is string => Boolean(id));
  const raws = await fetchInChunks<{ id: string; raw_item: unknown }>(rawIds, 50, (chunk) =>
    db.from("raw_listings").select("id, raw_item").in("id", chunk),
  );
  const rawById = new Map(raws.map((r) => [r.id, r.raw_item]));

  const snapshots = await fetchInChunks<{
    normalized_listing_id: string;
    mmr_value: number | null;
    lookup_model: string | null;
    lookup_trim: string | null;
    fetched_at: string;
  }>(listingIds, 200, (chunk) =>
    db
      .from("valuation_snapshots")
      .select("normalized_listing_id, mmr_value, lookup_model, lookup_trim, fetched_at")
      .in("normalized_listing_id", chunk),
  );
  const pricedPicksByListing = new Map<string, Pick[]>();
  for (const s of snapshots) {
    if (s.mmr_value == null || !s.lookup_model || !s.lookup_trim) continue;
    const list = pricedPicksByListing.get(s.normalized_listing_id) ?? [];
    list.push({ make: "", model: s.lookup_model, style: s.lookup_trim });
    pricedPicksByListing.set(s.normalized_listing_id, list);
  }

  const provenCache = new Map<string, Promise<ProvenBookableCombo[]>>();
  const provenFor = (year: number, make: string) => {
    const key = `${year}|${make.toLowerCase()}`;
    if (!provenCache.has(key)) provenCache.set(key, loadProvenBookableForMake(db, year, make));
    return provenCache.get(key)!;
  };
  const bookable = async (year: number, pick: Pick | null) =>
    pick ? isProvenBookableCombo(await provenFor(year, pick.make), pick) : null;

  const answerFrom = async (year: number, resolution: LlmYmmsResolution): Promise<ModelAnswer> => {
    const pick = pickFromResolution(resolution);
    const usage = "tokenUsage" in resolution ? resolution.tokenUsage : undefined;
    return {
      outcome: outcomeLabel(resolution),
      pick,
      confidence:
        resolution.kind === "llm_hit"
          ? resolution.confidence
          : resolution.kind === "llm_needs_review" || resolution.kind === "llm_invalid_pick"
            ? resolution.proposal.confidence
            : null,
      bookable: await bookable(year, pick),
      ...(usage && {
        tokens: {
          uncached: usage.uncachedInputTokens,
          cacheWrite: usage.cacheCreationInputTokens,
          cacheRead: usage.cacheReadInputTokens,
          output: usage.outputTokens,
        },
      }),
    };
  };

  const skipped: Record<string, number> = {};
  const skip = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  const results: ResultRow[] = [];

  console.error(`Asking ${args.haikuModel} about ${decisions.length} listings (concurrency ${args.concurrency})...`);
  await runPool(decisions, args.concurrency, async (decision, index) => {
    const listingRow = listingById.get(decision.normalized_listing_id);
    const rawItem = listingRow?.raw_listing_id ? rawById.get(listingRow.raw_listing_id) : undefined;
    if (!listingRow || rawItem === undefined) return skip("raw_payload_missing");

    const ctx = { region: listingRow.region as RegionKey, scrapedAt: new Date().toISOString(), sourceRunId: "eval-ymms-haiku" };
    const parsed = listingRow.source === "craigslist" ? parseCraigslistItem(rawItem, ctx) : parseFacebookItem(rawItem, ctx);
    if (!parsed.ok) return skip("parse_failed");
    const { listing } = parsed;
    if (listing.year === undefined || !listing.make || !listing.model) return skip("missing_ymm");

    const input = { ...buildLlmYmmsResolutionInput(rawItem, listing), skipShortcuts: true };
    const haikuResolution = await resolveListingWithLLM(input, haikuDeps);
    const sonnetRerun = args.rerunSonnet ? await answerFrom(input.year, await resolveListingWithLLM(input, sonnetDeps)) : undefined;

    const sonnetPick: Pick | null =
      decision.outcome !== "llm_invalid_pick" && decision.proposed_model && decision.proposed_style
        ? { make: decision.proposed_make ?? input.make, model: decision.proposed_model, style: decision.proposed_style }
        : null;
    const sonnetCoxPriced = Boolean(
      sonnetPick && (pricedPicksByListing.get(decision.normalized_listing_id) ?? []).some((p) => samePick(p, sonnetPick)),
    );
    const haiku = await answerFrom(input.year, haikuResolution);

    results.push({
      listingId: decision.normalized_listing_id,
      year: input.year,
      make: input.make,
      title: input.title ?? null,
      description: input.description ? input.description.slice(0, 400) : null,
      sonnetProd: {
        outcome: decision.outcome,
        pick: sonnetPick,
        confidence: decision.confidence,
        bookable: await bookable(input.year, sonnetPick),
      },
      sonnetCoxPriced,
      haiku,
      ...(sonnetRerun && { sonnetRerun }),
      agree: samePick(haiku.pick, sonnetPick),
    });
    if ((index + 1) % 25 === 0) console.error(`  ${index + 1}/${decisions.length}`);
  });

  const compared = results.length;
  const haikuOutcomes: Record<string, number> = {};
  for (const r of results) haikuOutcomes[r.haiku.outcome] = (haikuOutcomes[r.haiku.outcome] ?? 0) + 1;

  const withBothPicks = results.filter((r) => r.agree !== null);
  const sonnetConfident = results.filter((r) => r.sonnetProd.outcome === "llm_hit" && r.sonnetProd.pick);
  const coxVerified = results.filter((r) => r.sonnetCoxPriced);
  const coxVerifiedAgree = coxVerified.filter((r) => r.agree === true).length;
  const confidentWrong = coxVerified.filter((r) => r.haiku.outcome === "llm_hit" && r.agree === false);
  const haikuUnusable = results.filter((r) => r.haiku.outcome === "llm_invalid_pick" || r.haiku.outcome.startsWith("fallback")).length;
  const sonnetUnusable = results.filter((r) => r.sonnetProd.outcome === "llm_invalid_pick").length;
  const haikuPicks = results.filter((r) => r.haiku.pick);
  const sonnetPicks = results.filter((r) => r.sonnetProd.pick);

  const coxVerifiedAgreement = coxVerified.length > 0 ? coxVerifiedAgree / coxVerified.length : 0;
  const passes = coxVerified.length >= 50 && coxVerifiedAgreement >= AGREEMENT_BAR;

  const summary = {
    models: { haiku: args.haikuModel, sonnet: args.sonnetModel },
    window_hours: args.hours,
    listings_compared: compared,
    skipped,
    haiku_outcomes: haikuOutcomes,
    agreement_all_picks: rate(withBothPicks.filter((r) => r.agree).length, withBothPicks.length),
    agreement_on_sonnet_confident: rate(sonnetConfident.filter((r) => r.agree === true).length, sonnetConfident.length),
    agreement_on_cox_priced_sonnet: rate(coxVerifiedAgree, coxVerified.length),
    haiku_confident_but_differs_from_cox_priced_sonnet: rate(confidentWrong.length, coxVerified.length),
    haiku_not_sure: rate(results.filter((r) => r.haiku.outcome === "llm_needs_review").length, compared),
    sonnet_not_sure: rate(results.filter((r) => r.sonnetProd.outcome === "llm_needs_review").length, compared),
    haiku_unusable: rate(haikuUnusable, compared),
    sonnet_unusable: rate(sonnetUnusable, compared),
    haiku_pick_booked_before: rate(haikuPicks.filter((r) => r.haiku.bookable).length, haikuPicks.length),
    sonnet_pick_booked_before: rate(sonnetPicks.filter((r) => r.sonnetProd.bookable).length, sonnetPicks.length),
    ...(args.rerunSonnet && {
      sonnet_rerun_agrees_with_sonnet_prod: rate(
        results.filter((r) => samePick(r.sonnetRerun?.pick ?? null, r.sonnetProd.pick) === true).length,
        results.filter((r) => r.sonnetRerun?.pick && r.sonnetProd.pick).length,
      ),
      sonnet_rerun_cost_usd: costUsd(results.flatMap((r) => (r.sonnetRerun ? [r.sonnetRerun] : [])), "sonnet"),
    }),
    haiku_cost_usd: costUsd(results.map((r) => r.haiku), "haiku"),
    anthropic_http_errors: httpErrors,
    verdict:
      haikuPicks.length === 0
        ? "INCONCLUSIVE — Haiku returned no usable answers. See anthropic_http_errors."
        : passes
          ? `PASS — Haiku matches ≥${AGREEMENT_BAR * 100}% of Cox-priced Sonnet picks. Review disagreements before switching.`
          : coxVerified.length < 50
            ? "INCONCLUSIVE — fewer than 50 Cox-priced Sonnet picks in the sample. Raise --limit or --hours."
            : `FAIL — stay on Sonnet (bar is ${AGREEMENT_BAR * 100}% agreement on Cox-priced picks).`,
  };

  const disagreements = results
    .filter((r) => r.agree === false)
    .sort((a, b) => Number(b.sonnetCoxPriced) - Number(a.sonnetCoxPriced))
    .slice(0, 40)
    .map((r) => ({
      listingId: r.listingId,
      vehicle: `${r.year} ${r.make}`,
      title: r.title,
      description: r.description,
      sonnet: { ...r.sonnetProd.pick, outcome: r.sonnetProd.outcome, confidence: r.sonnetProd.confidence, coxPriced: r.sonnetCoxPriced },
      haiku: { ...r.haiku.pick, outcome: r.haiku.outcome, confidence: r.haiku.confidence, bookedBefore: r.haiku.bookable },
    }));

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(RESULTS_DIR, `ymms-haiku-vs-sonnet-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ args, summary, disagreements, results }, null, 2));

  console.error("\n=== Haiku vs Sonnet ===");
  console.error(JSON.stringify(summary, null, 2));
  console.error(`\nFull results: ${outFile}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
