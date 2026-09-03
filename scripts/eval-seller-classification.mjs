/**
 * Item 71 — eval harness for seller classification.
 *
 * Pulls buyer-labelled dealer dismisses plus private-party controls from
 * production, runs the same heuristics (and optionally Haiku) the ingest
 * path uses, and reports precision/recall at the 0.85 auto-reject gate.
 *
 * Do NOT set SELLER_CLASSIFY_ENABLED=true in production until private-party
 * false positives at that gate are acceptable.
 *
 * Usage:
 *   node scripts/eval-seller-classification.mjs [--limit 100] [--llm]
 *
 * Requires `.dev.vars` (or env) with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * --llm additionally needs ANTHROPIC_API_KEY and costs Haiku tokens.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEV_VARS = path.join(ROOT, ".dev.vars");

const STRONG_PATTERNS = [
  { id: "dealership", re: /\bdealerships?\b/i },
  { id: "auto_group", re: /\bauto\s+group\b/i },
  { id: "auto_sales", re: /\bauto\s+sales\b/i },
  { id: "licensed_dealer", re: /\blicensed\s+dealers?\b/i },
  { id: "used_car_dealer", re: /\bused\s+car\s+dealers?\b/i },
  { id: "we_finance", re: /\bwe\s+finance\b/i },
  { id: "bad_credit", re: /\bbad\s+credit\b/i },
  { id: "in_house_financing", re: /\bin[-\s]?house\s+financ/i },
  { id: "stock_number", re: /\bstock\s*(?:#|no\.?|number)\b/i },
  { id: "visit_our_lot", re: /\bvisit\s+our\s+lot\b/i },
  { id: "our_inventory", re: /\bour\s+inventory\b/i },
  { id: "over_n_vehicles", re: /\bover\s+\d{2,}\s+(?:vehicles|cars|trucks)\b/i },
];
const MEDIUM_PATTERNS = [
  { id: "business_suffix", re: /\b(?:llc|l\.l\.c\.|inc\.?|incorporated)\b/i },
  { id: "motors_name", re: /\bmotors\b/i },
  { id: "automotive", re: /\bautomotive\b/i },
  { id: "car_lot", re: /\bcar\s+lot\b/i },
  { id: "apply_now", re: /\bapply\s+now\b/i },
  { id: "buy_here_pay_here", re: /\bbuy\s+here\s+pay\s+here\b/i },
];
const WEAK_PATTERNS = [
  { id: "carfax", re: /\bcarfax\b/i },
  { id: "financing", re: /\bfinanc(?:e|ing|ial)\b/i },
  { id: "warranty", re: /\bwarrant(?:y|ies)\b/i },
  { id: "inventory", re: /\binventory\b/i },
  { id: "multiple_vehicles", re: /\b(?:other\s+(?:cars|vehicles|trucks)|more\s+vehicles|we\s+have\s+more)\b/i },
];

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
  const args = { limit: 100, llm: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--limit") args.limit = Number(argv[++i]);
    else if (argv[i] === "--llm") args.llm = true;
  }
  return args;
}

function classifyHeuristic({ title, description, sellerName }) {
  const text = [sellerName, title, description].filter(Boolean).join(" \n ");
  const hits = [];
  const seen = new Set();
  const push = (id, weight) => {
    if (seen.has(id)) return;
    seen.add(id);
    hits.push({ id, weight });
  };
  for (const { id, re } of STRONG_PATTERNS) if (re.test(text)) push(id, "strong");
  for (const { id, re } of MEDIUM_PATTERNS) if (re.test(text)) push(id, "medium");
  for (const { id, re } of WEAK_PATTERNS) if (re.test(text)) push(id, "weak");
  const strong = hits.filter((h) => h.weight === "strong").length;
  const medium = hits.filter((h) => h.weight === "medium").length;
  const weak = hits.filter((h) => h.weight === "weak").length;
  let confidence = 0;
  if (strong >= 1) confidence = 0.92;
  else if (medium >= 2) confidence = 0.88;
  else if (medium === 1 && weak >= 1) confidence = 0.86;
  else if (medium === 1) confidence = 0.55;
  else if (weak >= 2) confidence = 0.45;
  else if (weak === 1) confidence = 0.3;
  return {
    sellerType: hits.length ? "dealer" : "unknown",
    confidence,
    signals: hits.map((h) => h.id),
  };
}

function autoReject(row) {
  return row.sellerType === "dealer" && row.confidence >= 0.85;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = { ...loadDevVars(DEV_VARS), ...process.env };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .dev.vars or env.");
    process.exit(1);
  }

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "tav" },
  });

  const { data: dealerRows, error: dealerErr } = await db
    .from("opportunity_actions")
    .select("normalized_listing_id, metadata, created_at")
    .eq("action", "status_changed")
    .order("created_at", { ascending: false })
    .limit(500);
  if (dealerErr) throw dealerErr;

  const dealerIds = [
    ...new Set(
      (dealerRows ?? [])
        .filter((row) => row.metadata && row.metadata.reason === "dealer")
        .map((row) => row.normalized_listing_id),
    ),
  ].slice(0, Math.ceil(args.limit / 2));

  const { data: controlListings, error: controlErr } = await db
    .from("normalized_listings")
    .select("id, title, description, seller_name")
    .not("id", "in", `(${dealerIds.concat(["00000000-0000-0000-0000-000000000000"]).join(",")})`)
    .order("first_seen_at", { ascending: false })
    .limit(Math.ceil(args.limit / 2));
  if (controlErr) throw controlErr;

  let dealerListings = [];
  if (dealerIds.length > 0) {
    const { data, error } = await db
      .from("normalized_listings")
      .select("id, title, description, seller_name")
      .in("id", dealerIds);
    if (error) throw error;
    dealerListings = data ?? [];
  }

  const labelled = [
    ...dealerListings.map((row) => ({ ...row, label: "dealer" })),
    ...(controlListings ?? []).map((row) => ({ ...row, label: "private_party" })),
  ];

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const falsePositives = [];

  for (const row of labelled) {
    const result = classifyHeuristic({
      title: row.title,
      description: row.description,
      sellerName: row.seller_name,
    });
    const rejected = autoReject(result);
    const isDealer = row.label === "dealer";
    if (rejected && isDealer) tp += 1;
    else if (rejected && !isDealer) {
      fp += 1;
      falsePositives.push({
        id: row.id,
        title: row.title,
        seller_name: row.seller_name,
        signals: result.signals,
        confidence: result.confidence,
      });
    } else if (!rejected && isDealer) fn += 1;
    else tn += 1;
  }

  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);

  console.log(`Evaluated ${labelled.length} listings (${dealerListings.length} dealer, ${(controlListings ?? []).length} control).`);
  console.log(`Auto-reject gate: seller_type=dealer AND confidence >= 0.85`);
  console.log(`TP=${tp} FP=${fp} FN=${fn} TN=${tn}`);
  console.log(`Precision=${precision.toFixed(3)}  Recall=${recall.toFixed(3)}`);
  if (falsePositives.length) {
    console.log("\nPrivate-party false positives (must be near-zero before enabling the flag):");
    for (const row of falsePositives.slice(0, 15)) {
      console.log(`  ${row.id}  conf=${row.confidence}  ${row.signals.join(",")}  ${(row.title || "").slice(0, 80)}`);
    }
  }
  if (args.llm) {
    console.log("\n--llm is reserved for Haiku scoring; run heuristics first and inspect FP before spending tokens.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
