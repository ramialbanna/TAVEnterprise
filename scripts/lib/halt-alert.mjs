import { saveState } from "./gologin-antiban.mjs";

/**
 * One text when the seller lookup latches a Facebook lock.
 * A failed send stays unmarked so the next loop tries again.
 * A success is stored on the run state so the wait loop does not text every minute.
 */
export async function notifyHaltOnce(state, env) {
  if (!state?.haltedAt || state.haltNotifiedAt) return state;

  const url = String(env?.HALT_ALERT_URL || "").trim();
  const secret = String(env?.HALT_ALERT_SECRET || "").trim();
  if (!url || !secret || secret === "replace_me") {
    console.error("halt alert skipped: HALT_ALERT_URL or HALT_ALERT_SECRET unset");
    return state;
  }

  const reason = state.haltReason === "login_wall" ? "login_wall" : "checkpoint";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`halt alert failed: ${res.status}`);
      return state;
    }
    state.haltNotifiedAt = new Date().toISOString();
    saveState(state);
    console.error("halt alert sent");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`halt alert failed: ${message}`);
  }
  return state;
}
