/**
 * Item 56 — replay Apify SUCCEEDED runs skipped during unmapped_task outage.
 *
 * Reads:
 *   docs/.env                      — APIFY_TOKEN, APIFY_WEBHOOK_SECRET
 *   docs/_apify_backfill_missed.json
 *
 * Usage (from repo root):
 *   node docs/backfill-apify-missed-runs.mjs --dry-run
 *   node docs/backfill-apify-missed-runs.mjs --limit 5
 *   node docs/backfill-apify-missed-runs.mjs --skip-empty --delay-ms 1500
 *
 * Does not print secrets. Writes progress to docs/_apify_backfill_progress.jsonl
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, ".env");
const MISSED_PATH = path.join(__dirname, "_apify_backfill_missed.json");
const PROGRESS_PATH = path.join(__dirname, "_apify_backfill_progress.jsonl");
const WORKER_URL =
  process.env.TAV_APIFY_WEBHOOK_URL ??
  "https://tav-aip-production.rami-1a9.workers.dev/apify-webhook";

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    skipEmpty: true,
    delayMs: 1500,
    limit: Infinity,
    offset: 0,
    task: null, // "dallas" | "oklahoma" | null
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--no-skip-empty") opts.skipEmpty = false;
    else if (a === "--skip-empty") opts.skipEmpty = true;
    else if (a === "--delay-ms") opts.delayMs = Number(argv[++i]);
    else if (a === "--limit") opts.limit = Number(argv[++i]);
    else if (a === "--offset") opts.offset = Number(argv[++i]);
    else if (a === "--task") opts.task = argv[++i];
    else throw new Error(`Unknown arg: ${a}`);
  }
  return opts;
}

function loadEnv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim();
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function datasetItemCount(datasetId, token) {
  const r = await fetch(`https://api.apify.com/v2/datasets/${datasetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`dataset ${datasetId} → HTTP ${r.status}`);
  const body = await r.json();
  return body?.data?.itemCount ?? 0;
}

function alreadyDone(runId) {
  if (!fs.existsSync(PROGRESS_PATH)) return false;
  const text = fs.readFileSync(PROGRESS_PATH, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.runId === runId && (row.ok === true || row.skipped === "empty_dataset" || row.skipped === "idempotent")) {
        return true;
      }
    } catch {
      /* ignore bad lines */
    }
  }
  return false;
}

function appendProgress(row) {
  fs.appendFileSync(PROGRESS_PATH, JSON.stringify(row) + "\n", "utf8");
}

async function replayRun(run, secret) {
  const payload = {
    eventType: "ACTOR.RUN.SUCCEEDED",
    resource: {
      id: run.runId,
      actorTaskId: run.taskId,
      defaultDatasetId: run.datasetId,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      status: "SUCCEEDED",
    },
  };
  const r = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { status: r.status, body };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = loadEnv(ENV_PATH);
  const token = env.APIFY_TOKEN;
  const secret = env.APIFY_WEBHOOK_SECRET;
  if (!token) throw new Error("docs/.env missing APIFY_TOKEN");
  if (!secret) throw new Error("docs/.env missing APIFY_WEBHOOK_SECRET");

  let missed = JSON.parse(fs.readFileSync(MISSED_PATH, "utf8"));
  missed = missed.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  if (opts.task) missed = missed.filter((r) => r.task === opts.task);
  missed = missed.slice(opts.offset);

  console.log(
    JSON.stringify({
      worker: WORKER_URL,
      total_candidates: missed.length,
      dry_run: opts.dryRun,
      skip_empty: opts.skipEmpty,
      delay_ms: opts.delayMs,
      limit: opts.limit === Infinity ? null : opts.limit,
      offset: opts.offset,
      task: opts.task,
    }),
  );

  let processed = 0;
  let replayed = 0;
  let emptySkipped = 0;
  let already = 0;
  let errors = 0;

  for (const run of missed) {
    if (processed >= opts.limit) break;
    processed++;

    if (alreadyDone(run.runId)) {
      already++;
      console.log(JSON.stringify({ n: processed, runId: run.runId, skipped: "already_done" }));
      continue;
    }

    let itemCount = null;
    if (opts.skipEmpty) {
      try {
        itemCount = await datasetItemCount(run.datasetId, token);
      } catch (err) {
        errors++;
        const row = {
          at: new Date().toISOString(),
          runId: run.runId,
          task: run.task,
          ok: false,
          error: String(err),
        };
        appendProgress(row);
        console.log(JSON.stringify({ n: processed, ...row }));
        continue;
      }
      if (itemCount === 0) {
        emptySkipped++;
        const row = {
          at: new Date().toISOString(),
          runId: run.runId,
          task: run.task,
          ok: true,
          skipped: "empty_dataset",
          itemCount: 0,
        };
        appendProgress(row);
        console.log(JSON.stringify({ n: processed, runId: run.runId, skipped: "empty_dataset" }));
        continue;
      }
    }

    if (opts.dryRun) {
      console.log(
        JSON.stringify({
          n: processed,
          dry_run: true,
          runId: run.runId,
          task: run.task,
          itemCount,
          startedAt: run.startedAt,
        }),
      );
      continue;
    }

    try {
      const { status, body } = await replayRun(run, secret);
      const ok = status >= 200 && status < 300 && body?.ok !== false;
      const row = {
        at: new Date().toISOString(),
        runId: run.runId,
        task: run.task,
        datasetId: run.datasetId,
        itemCount,
        httpStatus: status,
        ok,
        body,
      };
      appendProgress(row);
      if (ok) replayed++;
      else errors++;
      console.log(
        JSON.stringify({
          n: processed,
          runId: run.runId,
          task: run.task,
          itemCount,
          httpStatus: status,
          ok,
          skipped: body?.skipped,
          processed: body?.processed,
          created_leads: body?.created_leads,
          error: body?.error,
        }),
      );
    } catch (err) {
      errors++;
      const row = {
        at: new Date().toISOString(),
        runId: run.runId,
        task: run.task,
        ok: false,
        error: String(err),
      };
      appendProgress(row);
      console.log(JSON.stringify({ n: processed, ...row }));
    }

    if (opts.delayMs > 0) await sleep(opts.delayMs);
  }

  console.log(
    JSON.stringify({
      done: true,
      processed,
      replayed,
      empty_skipped: emptySkipped,
      already_done: already,
      errors,
    }),
  );
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
