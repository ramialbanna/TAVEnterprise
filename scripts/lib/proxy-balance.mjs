/**
 * Item 74 — GoLogin residential balance poller (Fly seller enrich).
 *
 * Reads the workspace traffic API and upserts `tav.gologin_proxy_status`.
 * Polls every minute while the balance moves; once it has sat unchanged for
 * 15 minutes (empty, or nothing using it) it slows to every 15 minutes, and
 * returns to every minute on the next change.
 *
 * Never logs the token. Failures are recorded on the row and never thrown
 * into the enrich loop.
 */

export const PROXY_POLL_FAST_MS = 60_000;
export const PROXY_POLL_SLOW_MS = 15 * 60_000;
export const PROXY_UNCHANGED_BACKOFF_MS = 15 * 60_000;
export const DEFAULT_GOLOGIN_WORKSPACE_ID = "6a3439c37b918d79b8ed7d3a";

const API = "https://api.gologin.com";
const REQUEST_TIMEOUT_MS = 20_000;

function bytesToGb(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round((n / 1024 ** 3) * 1000) / 1000;
}

/** Residential used / limit / remaining in GB (3 decimals) from a traffic API body. */
export function residentialBalanceFromTraffic(body) {
  const resident = body?.residentialTrafficData ?? body?.residentTrafficData ?? {};
  const usedGb = bytesToGb(resident.trafficUsedBytes ?? resident.usedBytes);
  const limitGb = bytesToGb(resident.trafficLimitBytes ?? resident.limitBytes);
  const remainingGb =
    usedGb != null && limitGb != null ? Math.max(0, Math.round((limitGb - usedGb) * 1000) / 1000) : null;
  return { usedGb, limitGb, remainingGb };
}

/**
 * Pure. Given the previous poll state and a fresh reading, return the next
 * state: when the balance last changed and how long to wait before polling again.
 */
export function nextProxyPollState(prev, remainingGb, nowMs) {
  if (!prev || prev.lastRemainingGb !== remainingGb) {
    return { lastRemainingGb: remainingGb, changedAtMs: nowMs, intervalMs: PROXY_POLL_FAST_MS };
  }
  const unchangedFor = nowMs - prev.changedAtMs;
  return {
    lastRemainingGb: prev.lastRemainingGb,
    changedAtMs: prev.changedAtMs,
    intervalMs: unchangedFor >= PROXY_UNCHANGED_BACKOFF_MS ? PROXY_POLL_SLOW_MS : PROXY_POLL_FAST_MS,
  };
}

async function fetchResidentialBalance(token, workspaceId) {
  const res = await fetch(
    `${API}/users-proxies/geolocation/traffic?currentWorkspace=${encodeURIComponent(workspaceId)}`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`gologin traffic ${res.status}`);
  const balance = residentialBalanceFromTraffic(await res.json());
  if (balance.remainingGb == null) throw new Error("gologin traffic: no residential numbers in response");
  return balance;
}

/**
 * Start the poller on its own timer so it keeps running while the enrich loop
 * is halted on a checkpoint. Returns a stop function.
 */
export function startProxyBalancePoller({ db, token, workspaceId, logError = console.error }) {
  let state = null;
  let timer = null;
  let stopped = false;

  const tick = async () => {
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    let intervalMs = state?.intervalMs ?? PROXY_POLL_FAST_MS;
    try {
      const balance = await fetchResidentialBalance(token, workspaceId);
      state = nextProxyPollState(state, balance.remainingGb, nowMs);
      intervalMs = state.intervalMs;
      const { error } = await db.from("gologin_proxy_status").upsert({
        pool: "residential",
        remaining_gb: balance.remainingGb,
        used_gb: balance.usedGb,
        limit_gb: balance.limitGb,
        checked_at: now,
        changed_at: new Date(state.changedAtMs).toISOString(),
        poll_interval_s: Math.round(intervalMs / 1000),
        updated_at: now,
      });
      if (error) logError(`proxy balance write failed: ${error.message}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError(`proxy balance check failed: ${message}`);
      const { error } = await db.from("gologin_proxy_status").upsert({
        pool: "residential",
        poll_interval_s: Math.round(intervalMs / 1000),
        last_error: message.slice(0, 300),
        last_error_at: now,
        updated_at: now,
      });
      if (error) logError(`proxy balance error write failed: ${error.message}`);
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  };

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
