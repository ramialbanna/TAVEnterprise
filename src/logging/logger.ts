export type ErrorCategory =
  | "auth"
  | "validation"
  | "adapter"
  | "persistence"
  | "timeout"
  | "budget"
  | "dedupe"
  | "scoring"
  | "lead"
  | "valuation";

export interface LogContext {
  runId?: string;
  source?: string;
  region?: string;
  itemIndex?: number;
  listingUrl?: string;
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const e = err as Error & Record<string, unknown>;
    const out: Record<string, unknown> = { name: e.name, message: e.message };
    if (e["stack"]     !== undefined) out["stack"]     = e["stack"];
    if (e["code"]      !== undefined) out["code"]      = e["code"];
    if (e["details"]   !== undefined) out["details"]   = e["details"];
    if (e["hint"]      !== undefined) out["hint"]      = e["hint"];
    if (e["status"]    !== undefined) out["status"]    = e["status"];
    if (e["cause"]     !== undefined) out["cause"]     = serializeError(e["cause"]);
    if (e["attempts"]  !== undefined) out["attempts"]  = e["attempts"];
    // RetryExhaustedError carries the underlying PostgREST/Supabase error here.
    if (e["lastError"] !== undefined) out["lastError"] = serializeError(e["lastError"]);
    return out;
  }
  if (err !== null && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if (e["code"]    !== undefined) out["code"]    = e["code"];
    if (e["message"] !== undefined) out["message"] = e["message"];
    if (e["details"] !== undefined) out["details"] = e["details"];
    if (e["hint"]    !== undefined) out["hint"]    = e["hint"];
    if (e["status"]  !== undefined) out["status"]  = e["status"];
    if (e["cause"]   !== undefined) out["cause"]   = serializeError(e["cause"]);
    if (Object.keys(out).length > 0) return out;
    try { return { raw: JSON.stringify(err) }; } catch { return { raw: String(err) }; }
  }
  try { return { raw: JSON.stringify(err) }; } catch { return { raw: String(err) }; }
}

export function log(
  event: string,
  data?: Record<string, unknown>,
  ctx?: LogContext,
): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event, ...ctx, ...data }));
}

export function logError(
  category: ErrorCategory,
  event: string,
  error: unknown,
  ctx?: LogContext,
): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event, error_category: category, error: serializeError(error), ...ctx }));
}
