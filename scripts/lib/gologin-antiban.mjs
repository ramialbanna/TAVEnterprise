/**
 * Item 74 run state for the Facebook seller enrich script.
 *
 * Caps and Chicago hours are off by default (0 = unlimited) so we can attach
 * seller URLs before a listing hits Opportunities. Halt on checkpoint / login
 * wall still latches — the session is dead, hammering will not help.
 */
import fs from "node:fs";
import path from "node:path";

export const STATE_PATH = process.env.ENRICH_STATE_PATH
  ? path.resolve(process.env.ENRICH_STATE_PATH)
  : path.resolve(import.meta.dirname, "..", ".enrich-run-state.json");
export const TIMEZONE = "America/Chicago";
export const HOUR_START = 7;
export const HOUR_END = 21;
/** 0 = unlimited. Restore 25/40 only with --max-per-hour / --max-per-day. */
export const DEFAULT_MAX_PER_HOUR = 0;
export const DEFAULT_MAX_PER_DAY = 0;
export const FATAL_SKIP_REASONS = new Set(["checkpoint", "login_wall"]);

/** Puppeteer / CDP failures that mean the GoLogin Cloud tab is gone, not the listing. */
const DEAD_BROWSER_RE =
  /target closed|session closed|protocol error|connection closed|connection reset|navigating frame was detached|frame was detached|browser (has been )?closed|page crashed|websocket is not open|not connected/i;

export function isDeadBrowserError(err) {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return DEAD_BROWSER_RE.test(msg);
}

/** GoLogin Cloud websocket / capacity failures — retry with backoff, do not halt. */
export function isCloudUnavailableError(err) {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return /unexpected server response:\s*50[234]|status code 50[234]|\b503\b|\b502\b|\b429\b/i.test(
    msg,
  );
}

export class SessionHaltedError extends Error {
  constructor(reason, message) {
    super(message || reason);
    this.name = "SessionHaltedError";
    this.reason = reason;
  }
}

export function chicagoParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

export function emptyState() {
  return { haltedAt: null, haltReason: null, days: {} };
}

export function loadState(filePath = STATE_PATH) {
  if (!fs.existsSync(filePath)) return emptyState();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      haltedAt: parsed.haltedAt ?? null,
      haltReason: parsed.haltReason ?? null,
      days: parsed.days && typeof parsed.days === "object" ? parsed.days : {},
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state, filePath = STATE_PATH) {
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function clearHalt(state) {
  state.haltedAt = null;
  state.haltReason = null;
  return state;
}

export function halt(state, reason) {
  state.haltedAt = new Date().toISOString();
  state.haltReason = reason;
  return state;
}

export function isWithinHours(date = new Date(), hourStart = HOUR_START, hourEnd = HOUR_END) {
  const { hour } = chicagoParts(date);
  return hour >= hourStart && hour < hourEnd;
}

export function usageOn(state, date = new Date()) {
  const { day, hour } = chicagoParts(date);
  const row = state.days[day] || { count: 0, hours: {} };
  return {
    day,
    hour,
    dayCount: Number(row.count) || 0,
    hourCount: Number(row.hours?.[String(hour)]) || 0,
  };
}

export function remainingCapacity(state, opts = {}, date = new Date()) {
  const maxPerDay = opts.maxPerDay ?? DEFAULT_MAX_PER_DAY;
  const maxPerHour = opts.maxPerHour ?? DEFAULT_MAX_PER_HOUR;
  const unlimitedDay = !maxPerDay;
  const unlimitedHour = !maxPerHour;
  if (unlimitedDay && unlimitedHour) return Number.POSITIVE_INFINITY;
  const used = usageOn(state, date);
  const dayLeft = unlimitedDay ? Number.POSITIVE_INFINITY : maxPerDay - used.dayCount;
  const hourLeft = unlimitedHour ? Number.POSITIVE_INFINITY : maxPerHour - used.hourCount;
  return Math.max(0, Math.min(dayLeft, hourLeft));
}

export function assertCanRun(state, opts = {}, date = new Date()) {
  if (state.haltedAt) {
    throw new SessionHaltedError(
      state.haltReason || "halted",
      `session halted (${state.haltReason || "unknown"}) at ${state.haltedAt} — pass --clear-halt after a human confirms Facebook is still logged in`,
    );
  }
  if (!opts.skipHours && !isWithinHours(date, opts.hourStart, opts.hourEnd)) {
    const { hour } = chicagoParts(date);
    throw new SessionHaltedError(
      "outside_hours",
      `outside ${TIMEZONE} window ${opts.hourStart ?? HOUR_START}:00–${opts.hourEnd ?? HOUR_END}:00 (now hour ${hour}). Use --skip-hours only for a one-off.`,
    );
  }
  const left = remainingCapacity(state, opts, date);
  if (left <= 0) {
    const used = usageOn(state, date);
    throw new SessionHaltedError(
      "cap_reached",
      `cap reached: ${used.dayCount}/day, ${used.hourCount}/hour on ${used.day}`,
    );
  }
  return left;
}

export function recordVisit(state, date = new Date()) {
  const { day, hour } = chicagoParts(date);
  if (!state.days[day]) state.days[day] = { count: 0, hours: {} };
  const row = state.days[day];
  row.count = (Number(row.count) || 0) + 1;
  const key = String(hour);
  row.hours[key] = (Number(row.hours[key]) || 0) + 1;
  return state;
}

export function jitter(minMs, maxMs) {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}
