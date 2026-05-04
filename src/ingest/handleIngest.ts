import type { Env } from "../types/env";
import { verifyHmac } from "../auth/hmac";
import { IngestRequestSchema } from "../validate";

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleIngest(request: Request, env: Env): Promise<Response> {
  // 1. Fast-path size guard via Content-Length header (before reading body).
  //    Checked before HMAC to prevent buffering unbounded payloads.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "ingest.rejected", reason: "payload_too_large", declared_bytes: declaredLength }));
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  // 2. Read body once — reused for both HMAC and JSON parse.
  const bodyBytes = await request.arrayBuffer();

  // 3. Actual size guard (Content-Length may be absent or spoofed).
  if (bodyBytes.byteLength > MAX_BODY_BYTES) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "ingest.rejected", reason: "payload_too_large", actual_bytes: bodyBytes.byteLength }));
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  // 4. HMAC verification — timing-safe, before any data is parsed or written.
  const signature = request.headers.get("x-tav-signature") ?? "";
  const authorized = await verifyHmac(bodyBytes, signature, env.WEBHOOK_HMAC_SECRET);
  if (!authorized) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "ingest.rejected", reason: "unauthorized" }));
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // 5. JSON parse.
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  // 6. Wrapper schema validation.
  const parsed = IngestRequestSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_payload", details: parsed.error.flatten() }, 400);
  }

  const { source, run_id, region, items } = parsed.data;

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "ingest.started", source, run_id, region, item_count: items.length }));

  // Phase 3B: source_run upsert + idempotency gate + raw_listing writes go here.
  const summary = { ok: true, source, run_id, processed: 0, rejected: 0, created_leads: 0 };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "ingest.complete", source, run_id, processed: 0, rejected: 0, created_leads: 0 }));

  return json(summary, 200);
}
