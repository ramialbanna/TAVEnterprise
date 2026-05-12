/**
 * Null-safe display formatters for the dashboard UI.
 *
 * Every formatter returns the em-dash sentinel `"—"` for `null` / `undefined` /
 * non-finite numbers / unparseable dates — never `"0"`, `"NaN"`, or `"Invalid Date"`.
 * All numeric/date work goes through the built-in `Intl.*` APIs; no `date-fns` or other
 * date library is needed for v1. Pure functions, no I/O.
 *
 * Option objects use `Intl`-native key names (`maximumFractionDigits`, etc.) so callers
 * can lean on familiar semantics.
 */

/** The universal "no value" marker. Centralised so the UI can match on it if needed. */
export const EMPTY_VALUE = "—";

const LOCALE = "en-US";
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

type ParsedDate = { date: Date; dateOnly: boolean };

/**
 * Coerce an ISO string (`"2026-05-01"` or `"2026-05-01T12:00:00Z"`), epoch ms, or `Date`
 * into a `{ date, dateOnly }`. A bare `YYYY-MM-DD` is anchored to UTC midnight and flagged
 * `dateOnly` so callers can format it in UTC and avoid an off-by-one-day shift in the
 * runner's local timezone. Returns `null` for nullish / unparseable input.
 */
function parseDateInput(value: string | number | Date | null | undefined): ParsedDate | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && DATE_ONLY_RE.test(value)) {
    const d = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : { date: d, dateOnly: true };
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : { date: d, dateOnly: false };
}

// ── money ──────────────────────────────────────────────────────────────────────
export type MoneyOptions = {
  /** Show `.00` cents. Dashboard cards default to whole dollars. */
  cents?: boolean;
  /** ISO 4217 code. Defaults to USD. */
  currency?: string;
};

/** `formatMoney(1500) === "$1,500"`; `formatMoney(-1500) === "-$1,500"`; `formatMoney(null) === "—"`. */
export function formatMoney(value: number | null | undefined, options: MoneyOptions = {}): string {
  if (!isFiniteNumber(value)) return EMPTY_VALUE;
  const { cents = false, currency = "USD" } = options;
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
}

// ── plain numbers ────────────────────────────────────────────────────────────────
export type NumberOptions = {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
};

/** `formatNumber(21.5, { maximumFractionDigits: 1 }) === "21.5"`; `formatNumber(NaN) === "—"`. */
export function formatNumber(value: number | null | undefined, options: NumberOptions = {}): string {
  if (!isFiniteNumber(value)) return EMPTY_VALUE;
  const { maximumFractionDigits = 0, minimumFractionDigits } = options;
  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: Math.max(maximumFractionDigits, minimumFractionDigits ?? 0),
    ...(minimumFractionDigits !== undefined ? { minimumFractionDigits } : {}),
  }).format(value);
}

/** Compact form for big counts: `compactNumber(1500) === "1.5K"`; `compactNumber(null) === "—"`. */
export function compactNumber(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

// ── percentages ──────────────────────────────────────────────────────────────────
export type PercentOptions = {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
};

/**
 * Expects a *decimal* ratio. `formatPercent(0.123) === "12.3%"`; `formatPercent(0.42) === "42%"`;
 * `formatPercent(null) === "—"`. (Pass `value / 100` if you have an already-scaled percent.)
 */
export function formatPercent(value: number | null | undefined, options: PercentOptions = {}): string {
  if (!isFiniteNumber(value)) return EMPTY_VALUE;
  const { maximumFractionDigits = 1, minimumFractionDigits = 0 } = options;
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    maximumFractionDigits: Math.max(maximumFractionDigits, minimumFractionDigits),
    minimumFractionDigits,
  }).format(value);
}

// ── dates / times ────────────────────────────────────────────────────────────────
const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };

/** `formatDate("2026-05-01") === "May 1, 2026"`; `formatDate("nope") === "—"`; `formatDate(null) === "—"`. */
export function formatDate(
  value: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  const parsed = parseDateInput(value);
  if (!parsed) return EMPTY_VALUE;
  const opts: Intl.DateTimeFormatOptions = { ...(options ?? DEFAULT_DATE_OPTS) };
  if (parsed.dateOnly && opts.timeZone === undefined) opts.timeZone = "UTC";
  return new Intl.DateTimeFormat(LOCALE, opts).format(parsed.date);
}

/** Date + clock time: `formatDateTime("2026-05-01T14:30:00Z")` → e.g. `"May 1, 2026, 2:30 PM"` (local tz). */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const parsed = parseDateInput(value);
  if (!parsed) return EMPTY_VALUE;
  if (parsed.dateOnly) return formatDate(value);
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" }).format(parsed.date);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
  ["second", 1],
];

/**
 * Human "time since/until": `formatRelativeTime(<iso 5 min ago>)` → `"5 minutes ago"`;
 * `formatRelativeTime(<iso now>)` → `"just now"`; future → `"in 3 days"`; bad input → `"—"`.
 * `now` defaults to `Date.now()` and is injectable for tests.
 */
export function formatRelativeTime(
  value: string | number | Date | null | undefined,
  now: number | Date = Date.now(),
): string {
  const parsed = parseDateInput(value);
  if (!parsed) return EMPTY_VALUE;
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (Number.isNaN(nowMs)) return EMPTY_VALUE;
  const deltaSec = Math.round((parsed.date.getTime() - nowMs) / 1000);
  if (Math.abs(deltaSec) < 30) return "just now";
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  for (const [unit, secs] of RELATIVE_UNITS) {
    if (Math.abs(deltaSec) >= secs || unit === "second") {
      return rtf.format(Math.round(deltaSec / secs), unit);
    }
  }
  return "just now";
}
