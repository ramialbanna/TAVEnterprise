#!/usr/bin/env node
/**
 * §74 Fly soak monitor — exit 1 on red flags.
 * Usage: node scripts/monitor-fly-soak.mjs
 */
import { execFileSync } from "node:child_process";

const SOAK_START = Date.parse("2026-09-03T13:56:00Z");
const SOAK_HOURS = 48;
const RED_FLAG =
  /503|checkpoint|login wall|missing ws_url|halted|HALT|extract error|Proxy Error/i;

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", timeout: 60_000 }).trim();
  } catch (err) {
    const stdout = err.stdout?.toString?.() ?? "";
    const stderr = err.stderr?.toString?.() ?? "";
    return `${stdout}\n${stderr}`.trim();
  }
}

const now = Date.now();
const elapsedH = ((now - SOAK_START) / 3_600_000).toFixed(1);
const remainingH = Math.max(0, SOAK_HOURS - (now - SOAK_START) / 3_600_000).toFixed(1);

let health = "fail";
try {
  const res = await fetch("https://tav-seller-enrich.fly.dev/", { signal: AbortSignal.timeout(15_000) });
  health = res.ok ? "ok" : `http_${res.status}`;
} catch {
  health = "unreachable";
}

const status = run("fly", ["status", "-a", "tav-seller-enrich"]);
const machineStarted = /started/i.test(status);
const logs = run("fly", ["logs", "-a", "tav-seller-enrich", "--no-tail"]);
const recentLines = logs.split("\n").slice(-120);
const recentText = recentLines.join("\n");
const redMatches = [...recentText.matchAll(new RegExp(RED_FLAG.source, "gi"))].map((m) => m[0]);
const okWrites = (recentText.match(/ok wrote needs_action/gi) ?? []).length;
const lastWrite = [...recentText.matchAll(/ok wrote needs_action[^\n]*/gi)].pop()?.[0] ?? null;
const lastLogTs = recentLines.filter(Boolean).pop()?.match(/^[^\d]*(\d{4}-\d{2}-\d{2}T[\d:]+Z)/)?.[1] ?? null;

const alerts = [];
if (health !== "ok") alerts.push(`health:${health}`);
if (!machineStarted) alerts.push("machine_not_started");
if (redMatches.length) alerts.push(`log_red_flags:${[...new Set(redMatches)].join(",")}`);
if (okWrites === 0 && machineStarted) alerts.push("no_recent_writes");

const report = {
  at: new Date().toISOString(),
  soak: { elapsed_h: Number(elapsedH), remaining_h: Number(remainingH), ends_at: "2026-09-05T13:56:00Z" },
  health,
  machine_started: machineStarted,
  recent_ok_writes: okWrites,
  last_write: lastWrite,
  last_log_ts: lastLogTs,
  alerts,
  healthy: alerts.length === 0,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.healthy ? 0 : 1);
