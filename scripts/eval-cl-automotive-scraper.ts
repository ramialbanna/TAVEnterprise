/**
 * Item 67 Phase 0 — offline eval for e-commerce/automotive-scraper → Craigslist adapter.
 *
 * Pulls Apify datasets for named runs (or the last N SUCCEEDED runs of the
 * Dallas CL automotive task), maps each item through mapAutomotiveScraperItem
 * + parseCraigslistItem, and reports:
 *   - adapter pass % + rejection reason breakdown
 *   - field fill rates (year/make/model/price/mileage/description/images/vin)
 *   - within-run duplicate counts (postingId / url)
 *   - cross-run overlap when ≥2 runs are evaluated
 *
 * Do NOT enable the Apify schedule or wire APIFY_TASK_REGION_MAP until Phase 0
 * go/no-go bars pass (see docs/NEXT_STEPS.md §67).
 *
 * Usage:
 *   npm run eval:cl-automotive-scraper
 *   npm run eval:cl-automotive-scraper -- --run-ids C1XKAcUiIQUKf0Ck4,tdxUXkdtPkaZ6nj7M,K3J8fzYvAgNfqOdIS
 *   npm run eval:cl-automotive-scraper -- --last-n 3
 *   npm run eval:cl-automotive-scraper -- --dataset-ids UnBjs2bZu1cxteRkx,dQPwUtpXmgsOzmmgc
 *
 * Requires APIFY_TOKEN in docs/.env or .dev.vars (or env).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapAutomotiveScraperItem } from "../src/apify/automotiveScraperAdapter";
import { parseCraigslistItem } from "../src/sources/craigslist";
import type { RegionKey } from "../src/types/domain";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RESULTS_DIR = path.join(ROOT, "scripts", "_eval-results");
const DEFAULT_TASK = "NMTFTt1C0aEnhEuY9"; // cl-dallas-automotive

const CTX = {
  region: "dallas_tx" as RegionKey,
  scrapedAt: new Date().toISOString(),
  sourceRunId: "eval-cl-automotive",
};

function loadEnvFile(filePath: string): Record<string, string> {
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

function resolveApifyToken(): string {
  const fromEnv = process.env.APIFY_TOKEN?.trim();
  if (fromEnv && fromEnv !== "replace_me") return fromEnv;
  const docs = loadEnvFile(path.join(ROOT, "docs", ".env"));
  if (docs.APIFY_TOKEN && docs.APIFY_TOKEN !== "replace_me") return docs.APIFY_TOKEN;
  const dev = loadEnvFile(path.join(ROOT, ".dev.vars"));
  if (dev.APIFY_TOKEN && dev.APIFY_TOKEN !== "replace_me") return dev.APIFY_TOKEN;
  throw new Error("Missing APIFY_TOKEN (docs/.env, .dev.vars, or env)");
}

function parseArgs(argv: string[]) {
  const args = {
    taskId: DEFAULT_TASK,
    lastN: 3,
    runIds: [] as string[],
    datasetIds: [] as string[],
    limitPerRun: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--task") args.taskId = argv[++i]!;
    else if (argv[i] === "--last-n") args.lastN = Number(argv[++i]);
    else if (argv[i] === "--run-ids") {
      args.runIds = argv[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (argv[i] === "--dataset-ids") {
      args.datasetIds = argv[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (argv[i] === "--limit-per-run") args.limitPerRun = Number(argv[++i]);
  }
  return args;
}

async function apifyGet(token: string, urlPath: string): Promise<unknown> {
  const r = await fetch(`https://api.apify.com/v2${urlPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await r.json()) as { data?: unknown; error?: unknown };
  if (!r.ok) {
    throw new Error(`${urlPath} → HTTP ${r.status}: ${JSON.stringify(body)}`);
  }
  return body.data;
}

async function fetchDatasetItems(token: string, datasetId: string, limit: number): Promise<unknown[]> {
  const items: unknown[] = [];
  let offset = 0;
  const pageSize = 250;
  while (true) {
    if (limit > 0 && items.length >= limit) break;
    const take = limit > 0 ? Math.min(pageSize, limit - items.length) : pageSize;
    const r = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&limit=${take}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) throw new Error(`dataset ${datasetId} items → HTTP ${r.status}`);
    const page = (await r.json()) as unknown[];
    if (!Array.isArray(page) || page.length === 0) break;
    items.push(...page);
    offset += page.length;
    if (page.length < take) break;
  }
  return items;
}

type RunBundle = {
  runId: string | null;
  datasetId: string;
  status: string | null;
  itemCount: number;
  items: unknown[];
};

function postingKey(item: Record<string, unknown>): string | null {
  const ap = item.additionalProperties;
  if (ap && typeof ap === "object" && !Array.isArray(ap)) {
    const postingId = (ap as Record<string, unknown>).postingId;
    if (typeof postingId === "number" || typeof postingId === "string") return `id:${postingId}`;
  }
  const url = typeof item.url === "string" ? item.url : null;
  return url ? `url:${url}` : null;
}

function countWithinRunDupes(items: unknown[]): { byPostingId: number; uniqueKeys: number; total: number } {
  const seen = new Map<string, number>();
  let dupes = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const key = postingKey(raw as Record<string, unknown>);
    if (!key) continue;
    const prev = seen.get(key) ?? 0;
    if (prev > 0) dupes += 1;
    seen.set(key, prev + 1);
  }
  return { byPostingId: dupes, uniqueKeys: seen.size, total: items.length };
}

function crossRunOverlap(bundles: RunBundle[]): {
  pairs: Array<{ a: string; b: string; overlap: number; aOnly: number; bOnly: number }>;
} {
  const keySets = bundles.map((b) => {
    const keys = new Set<string>();
    for (const raw of b.items) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const key = postingKey(raw as Record<string, unknown>);
      if (key) keys.add(key);
    }
    return { label: b.runId ?? b.datasetId, keys };
  });

  const pairs: Array<{ a: string; b: string; overlap: number; aOnly: number; bOnly: number }> = [];
  for (let i = 0; i < keySets.length; i += 1) {
    for (let j = i + 1; j < keySets.length; j += 1) {
      const a = keySets[i]!;
      const b = keySets[j]!;
      let overlap = 0;
      for (const k of a.keys) if (b.keys.has(k)) overlap += 1;
      pairs.push({
        a: a.label,
        b: b.label,
        overlap,
        aOnly: a.keys.size - overlap,
        bOnly: b.keys.size - overlap,
      });
    }
  }
  return { pairs };
}

type FieldFill = {
  year: number;
  make: number;
  model: number;
  price: number;
  mileage: number;
  description: number;
  images: number;
  vin: number;
  ymmAndPrice: number;
  passed: number;
};

function emptyFill(): FieldFill {
  return {
    year: 0,
    make: 0,
    model: 0,
    price: 0,
    mileage: 0,
    description: 0,
    images: 0,
    vin: 0,
    ymmAndPrice: 0,
    passed: 0,
  };
}

function evaluateItems(items: unknown[]) {
  const reasons: Record<string, number> = {};
  const fill = emptyFill();
  const sampleRejections: Array<{ reason: string; title?: string; url?: string }> = [];
  let passed = 0;

  for (const raw of items) {
    const mapped = mapAutomotiveScraperItem(raw);
    const result = parseCraigslistItem(mapped, {
      ...CTX,
      sourceRunId: `eval-${CTX.sourceRunId}`,
    });

    if (!result.ok) {
      reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
      if (sampleRejections.length < 15) {
        const rec = mapped && typeof mapped === "object" && !Array.isArray(mapped)
          ? (mapped as Record<string, unknown>)
          : {};
        sampleRejections.push({
          reason: result.reason,
          title: typeof rec.title === "string" ? rec.title : typeof rec.name === "string" ? rec.name : undefined,
          url: typeof rec.url === "string" ? rec.url : undefined,
        });
      }
      continue;
    }

    passed += 1;
    fill.passed += 1;
    const l = result.listing;
    if (l.year !== undefined) fill.year += 1;
    if (l.make) fill.make += 1;
    if (l.model) fill.model += 1;
    if (l.price !== undefined) fill.price += 1;
    if (l.mileage !== undefined) fill.mileage += 1;
    if (l.description) fill.description += 1;
    if (l.images && l.images.length > 0) fill.images += 1;
    if (l.vin) fill.vin += 1;
    if (l.year !== undefined && l.make && l.model && l.price !== undefined) fill.ymmAndPrice += 1;
  }

  const total = items.length;
  const pct = (n: number, denom = total) =>
    denom === 0 ? 0 : Math.round((n / denom) * 1000) / 10;
  const passedPct = (n: number) => pct(n, Math.max(passed, 1));

  return {
    total,
    passed,
    passRatePct: pct(passed),
    rejectionReasons: reasons,
    sampleRejections,
    fieldFillPct: {
      year: pct(fill.year),
      make: pct(fill.make),
      model: pct(fill.model),
      price: pct(fill.price),
      mileage: pct(fill.mileage),
      description: pct(fill.description),
      images: pct(fill.images),
      vin: pct(fill.vin),
      ymmAndPrice: pct(fill.ymmAndPrice),
    },
    /** Fill rates among adapter-passed rows (Phase 0 Y/M/M+price bar). */
    fieldFillPctAmongPassed: {
      year: passedPct(fill.year),
      make: passedPct(fill.make),
      model: passedPct(fill.model),
      price: passedPct(fill.price),
      mileage: passedPct(fill.mileage),
      description: passedPct(fill.description),
      images: passedPct(fill.images),
      vin: passedPct(fill.vin),
      ymmAndPrice: passedPct(fill.ymmAndPrice),
    },
    fieldFillCounts: fill,
  };
}

async function resolveBundles(
  token: string,
  args: ReturnType<typeof parseArgs>,
): Promise<RunBundle[]> {
  if (args.datasetIds.length > 0) {
    const bundles: RunBundle[] = [];
    for (const datasetId of args.datasetIds) {
      const items = await fetchDatasetItems(token, datasetId, args.limitPerRun);
      bundles.push({
        runId: null,
        datasetId,
        status: null,
        itemCount: items.length,
        items,
      });
    }
    return bundles;
  }

  const runIds =
    args.runIds.length > 0
      ? args.runIds
      : await (async () => {
          const runs = (await apifyGet(
            token,
            `/actor-tasks/${args.taskId}/runs?limit=${Math.max(args.lastN * 3, 15)}&desc=1`,
          )) as { items?: Array<{ id: string; status: string }> };
          const succeeded = (runs.items ?? []).filter((r) => r.status === "SUCCEEDED");
          return succeeded.slice(0, args.lastN).map((r) => r.id);
        })();

  if (runIds.length === 0) {
    throw new Error(`No SUCCEEDED runs found for task ${args.taskId}`);
  }

  const bundles: RunBundle[] = [];
  for (const runId of runIds) {
    const run = (await apifyGet(token, `/actor-runs/${runId}`)) as {
      id: string;
      status: string;
      defaultDatasetId: string;
    };
    const items = await fetchDatasetItems(token, run.defaultDatasetId, args.limitPerRun);
    bundles.push({
      runId: run.id,
      datasetId: run.defaultDatasetId,
      status: run.status,
      itemCount: items.length,
      items,
    });
  }
  return bundles;
}

function proposeGoNoGo(summary: {
  passRatePct: number;
  fieldFillPctAmongPassed: { ymmAndPrice: number; description: number; images: number };
  crossRun: ReturnType<typeof crossRunOverlap>;
}): { verdict: "go" | "no-go" | "needs_review"; notes: string[] } {
  const notes: string[] = [];
  let fail = false;
  let soft = false;

  if (summary.passRatePct < 90) {
    fail = true;
    notes.push(`Adapter pass rate ${summary.passRatePct}% < 90% bar`);
  } else {
    notes.push(`Adapter pass rate ${summary.passRatePct}% meets ≥90% bar`);
  }

  if (summary.fieldFillPctAmongPassed.ymmAndPrice < 95) {
    soft = true;
    notes.push(
      `Y/M/M + price among passed ${summary.fieldFillPctAmongPassed.ymmAndPrice}% (want ≥95%)`,
    );
  } else {
    notes.push(`Y/M/M + price among passed ${summary.fieldFillPctAmongPassed.ymmAndPrice}%`);
  }

  if (
    summary.fieldFillPctAmongPassed.description < 50 ||
    summary.fieldFillPctAmongPassed.images < 50
  ) {
    soft = true;
    notes.push(
      `Description ${summary.fieldFillPctAmongPassed.description}% / images ${summary.fieldFillPctAmongPassed.images}% among passed (want most rows)`,
    );
  }

  if (summary.crossRun.pairs.length > 0) {
    const anyOverlap = summary.crossRun.pairs.some((p) => p.overlap > 0);
    const allZeroNew = summary.crossRun.pairs.every((p) => p.aOnly === 0 && p.bOnly === 0);
    if (allZeroNew && anyOverlap) {
      notes.push("Cross-run sets identical (high overlap; OK for short cadence if expected)");
    } else if (!anyOverlap && summary.crossRun.pairs.every((p) => p.aOnly + p.bOnly > 0)) {
      soft = true;
      notes.push("Cross-run overlap is zero — verify search URL / cadence before trusting inventory freshness");
    }
  } else {
    notes.push("Cross-run overlap not computed (need ≥2 runs)");
    soft = true;
  }

  if (fail) return { verdict: "no-go", notes };
  if (soft) return { verdict: "needs_review", notes };
  return { verdict: "go", notes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = resolveApifyToken();
  const bundles = await resolveBundles(token, args);

  const perRun = bundles.map((b) => {
    const evalResult = evaluateItems(b.items);
    const within = countWithinRunDupes(b.items);
    return {
      runId: b.runId,
      datasetId: b.datasetId,
      status: b.status,
      withinRunDupes: within,
      ...evalResult,
    };
  });

  const allItems = bundles.flatMap((b) => b.items);
  const overall = evaluateItems(allItems);
  const crossRun = crossRunOverlap(bundles);
  const goNoGo = proposeGoNoGo({
    passRatePct: overall.passRatePct,
    fieldFillPctAmongPassed: overall.fieldFillPctAmongPassed,
    crossRun,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    taskId: args.taskId,
    runCount: bundles.length,
    overall: {
      ...overall,
      withinRunDupes: countWithinRunDupes(allItems),
      crossRun,
      goNoGo,
    },
    perRun,
  };

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(RESULTS_DIR, `cl-automotive-scraper-eval-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`\nItem 67 Phase 0 eval — ${bundles.length} run(s), ${overall.total} items`);
  console.log(`Adapter pass: ${overall.passed}/${overall.total} (${overall.passRatePct}%)`);
  console.log(`Field fill % (all): ${JSON.stringify(overall.fieldFillPct)}`);
  console.log(`Field fill % (passed): ${JSON.stringify(overall.fieldFillPctAmongPassed)}`);
  console.log(`Rejection reasons: ${JSON.stringify(overall.rejectionReasons)}`);
  if (crossRun.pairs.length) {
    console.log("Cross-run overlap:");
    for (const p of crossRun.pairs) {
      console.log(`  ${p.a} ∩ ${p.b}: overlap=${p.overlap} aOnly=${p.aOnly} bOnly=${p.bOnly}`);
    }
  }
  console.log(`\nGo/no-go: ${goNoGo.verdict}`);
  for (const n of goNoGo.notes) console.log(`  - ${n}`);
  console.log(`\nWrote ${outPath}`);
  console.log("Do not enable schedule HIb0Pg9Gg3Pn7RNfD until Phase 0 passes.\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
