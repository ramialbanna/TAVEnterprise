import type { Env } from "../types/env";

/**
 * Which code path performs Manheim MMR valuation lookups.
 *
 *   "direct" — main worker calls Manheim directly (legacy; default).
 *   "worker" — route through tav-intelligence-worker (not yet implemented).
 *
 * New valuation fields and Cox/Manheim integration work should go into the
 * intelligence worker and the shared ValuationResult domain type, not into
 * the legacy "direct" path.
 */
export type ValuationLookupMode = "direct" | "worker";

/**
 * Read MANHEIM_LOOKUP_MODE from the environment with a safe default.
 * Any value other than "worker" is treated as "direct" so existing
 * deployments without the variable behave identically to before.
 */
export function getValuationLookupMode(env: Env): ValuationLookupMode {
  return env.MANHEIM_LOOKUP_MODE === "worker" ? "worker" : "direct";
}
