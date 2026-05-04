import type { Env } from "../types/env";
import type { SupabaseClient } from "./supabase";

export type DeadLetterParams = {
  source: string;
  region: string;
  run_id: string;
  item_index: number;
  reason_code: string;
  payload: unknown;
  error_message: string;
};

// Writes to tav.dead_letters. On failure, falls back to Cloudflare KV.
// Never throws — DLQ writes must not cascade into request failures.
export async function writeDeadLetter(
  db: SupabaseClient,
  env: Env,
  params: DeadLetterParams,
): Promise<void> {
  const fp = await fingerprint(params.source, params.run_id, params.item_index);

  try {
    const { error: dbErr } = await db.from("dead_letters").upsert(
      {
        source: params.source,
        region: params.region,
        fingerprint: fp,
        reason_code: params.reason_code,
        payload: params.payload,
        error_message: params.error_message,
      },
      { onConflict: "fingerprint" },
    );
    if (!dbErr) return;
    // dbErr present — fall through to KV fallback
  } catch {
    // network throw — fall through to KV fallback
  }

  // KV fallback — 7-day TTL, idempotent key.
  const key = `dlq:${params.source}:${fp}`;
  try {
    await env.TAV_KV.put(key, JSON.stringify(params), { expirationTtl: 604800 });
  } catch {
    // Last resort structured log — never silent.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      event: "dead_letter.all_fallbacks_failed",
      source: params.source,
      run_id: params.run_id,
      item_index: params.item_index,
      reason_code: params.reason_code,
      fingerprint: fp,
    }));
  }
}

async function fingerprint(source: string, run_id: string, item_index: number): Promise<string> {
  const input = `${source}|${run_id}|${item_index}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
