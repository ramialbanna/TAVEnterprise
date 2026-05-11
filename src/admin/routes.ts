import type { Env } from "../types/env";
import { getSupabaseClient } from "../persistence/supabase";
import { parseOutcomeRow } from "../outcomes/import";
import { upsertPurchaseOutcome } from "../persistence/purchaseOutcomes";
import {
  createImportBatch,
  updateImportBatchCounts,
  listImportBatches,
} from "../persistence/importBatches";
import { bulkInsertImportRows } from "../persistence/importRows";
import type { ImportRowInput } from "../persistence/importRows";
import { upsertMarketExpense, getMarketExpensesByRegion } from "../persistence/marketExpenses";
import { upsertMarketDemandIndex } from "../persistence/marketDemandIndex";
import { withRetry } from "../persistence/retry";
import { isConfiguredSecret } from "../types/envValidation";
import { log, serializeError } from "../logging/logger";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function verifyAdminAuth(request: Request, env: Env): boolean {
  const auth = request.headers.get("Authorization") ?? "";
  if (!isConfiguredSecret(env.ADMIN_API_SECRET)) return false;
  return auth === `Bearer ${env.ADMIN_API_SECRET}`;
}

export async function handleAdmin(request: Request, env: Env): Promise<Response> {
  if (!isConfiguredSecret(env.ADMIN_API_SECRET)) {
    return json({ ok: false, error: "admin_auth_not_configured" }, 503);
  }

  if (!verifyAdminAuth(request, env)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  let db: ReturnType<typeof getSupabaseClient>;
  try {
    db = getSupabaseClient(env);
  } catch (err) {
    log("admin.error", {
      method: request.method,
      pathname,
      stage: "client_init",
      error: serializeError(err),
    });
    return json({ ok: false, error: "db_error" }, 503);
  }

  try {

  // POST /admin/import-outcomes
  if (request.method === "POST" && pathname === "/admin/import-outcomes") {
    let rows: unknown[];
    try {
      const body = (await request.json()) as unknown;
      if (!Array.isArray(body)) return json({ ok: false, error: "expected_array" }, 400);
      rows = body;
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400);
    }

    const batch = await createImportBatch(db, { rowCount: rows.length });

    let imported = 0;
    let duplicates = 0;
    let rejected = 0;
    const importRows: ImportRowInput[] = [];

    for (let i = 0; i < rows.length; i++) {
      const parsed = await parseOutcomeRow(rows[i]);
      if (!parsed.ok) {
        rejected++;
        importRows.push({
          importBatchId: batch.id,
          rowIndex: i,
          status: "rejected",
          reasonCode: parsed.reasonCode,
          rawRow: rows[i],
        });
        continue;
      }
      const result = await upsertPurchaseOutcome(db, {
        data: parsed.data,
        importBatchId: batch.id,
      });
      if (result.isDuplicate) {
        duplicates++;
        importRows.push({
          importBatchId: batch.id,
          rowIndex: i,
          status: "duplicate",
          rawRow: rows[i],
          outcomeId: result.id,
        });
      } else {
        imported++;
        importRows.push({
          importBatchId: batch.id,
          rowIndex: i,
          status: "imported",
          rawRow: rows[i],
          outcomeId: result.id,
        });
      }
    }

    await bulkInsertImportRows(db, importRows);
    await updateImportBatchCounts(db, batch.id, {
      importedCount: imported,
      duplicateCount: duplicates,
      rejectedCount: rejected,
      status: "complete",
    });

    return json({ ok: true, batchId: batch.id, imported, duplicates, rejected });
  }

  // GET /admin/outcomes/dashboard
  if (request.method === "GET" && pathname === "/admin/outcomes/dashboard") {
    const { data, error } = await db.from("v_outcome_summary").select("*");
    if (error) return json({ ok: false, error: "db_error" }, 503);
    return json({ ok: true, data });
  }

  // GET /admin/market/expenses?region=xxx
  if (request.method === "GET" && pathname === "/admin/market/expenses") {
    const region = url.searchParams.get("region");
    if (!region) return json({ ok: false, error: "region_required" }, 400);
    const expenses = await getMarketExpensesByRegion(db, region);
    return json({ ok: true, data: expenses });
  }

  // PUT /admin/market/expenses
  if (request.method === "PUT" && pathname === "/admin/market/expenses") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    if (typeof body !== "object" || body === null) {
      return json({ ok: false, error: "invalid_body" }, 400);
    }
    const b = body as Record<string, unknown>;
    if (!b.region || !b.expense_type || b.amount_cents == null || !b.effective_date) {
      return json({ ok: false, error: "missing_fields" }, 400);
    }
    const expense = await upsertMarketExpense(db, {
      region: b.region as string,
      city: (b.city as string | null) ?? null,
      expenseType: b.expense_type as "transport" | "auction_fee" | "misc_overhead",
      amountCents: b.amount_cents as number,
      effectiveDate: b.effective_date as string,
    });
    return json({ ok: true, data: expense });
  }

  // GET /admin/market/demand
  if (request.method === "GET" && pathname === "/admin/market/demand") {
    const { data, error } = await db
      .from("market_demand_index")
      .select("*")
      .order("computed_at", { ascending: false })
      .limit(50);
    if (error) return json({ ok: false, error: "db_error" }, 503);
    return json({ ok: true, data });
  }

  // POST /admin/market/demand/recompute
  if (request.method === "POST" && pathname === "/admin/market/demand/recompute") {
    // Recompute demand score for each region from purchase_outcomes aggregates.
    // Synchronous for now — no background jobs.
    const { data: regions, error: regionErr } = await db
      .from("purchase_outcomes")
      .select("region")
      .not("region", "is", null);
    if (regionErr) return json({ ok: false, error: "db_error" }, 503);

    const uniqueRegions = [
      ...new Set(
        (regions ?? [])
          .map((r: { region: string }) => r.region)
          .filter(Boolean),
      ),
    ];
    // Use ISO date as week_label so the upsert conflict key is stable per-day.
    const weekLabel = new Date().toISOString().slice(0, 10);

    let recomputed = 0;
    let errors = 0;
    for (const region of uniqueRegions) {
      // Per-region try/catch: one region failure must not abort the remaining regions.
      try {
        const agg = await withRetry(async () => {
          const { data, error } = await db
            .from("purchase_outcomes")
            .select("hold_days, sale_price")
            .eq("region", region);
          if (error) throw error;
          return data;
        });
        if (!agg || agg.length === 0) continue;

        const purchaseCount = agg.length;
        const holdDaysList = (agg as Array<{ hold_days: number | null }>)
          .map((r) => r.hold_days)
          .filter((d): d is number => d != null);
        const avgHoldDays =
          holdDaysList.length > 0
            ? holdDaysList.reduce((a, b) => a + b, 0) / holdDaysList.length
            : null;
        const soldCount = (agg as Array<{ sale_price: number | null }>).filter(
          (r) => r.sale_price != null,
        ).length;
        const sellThroughRate = purchaseCount > 0 ? soldCount / purchaseCount : null;

        // Higher sell-through raises score; shorter hold days add a small bonus.
        let demandScore = 50;
        if (sellThroughRate != null) {
          demandScore = Math.round(sellThroughRate * 100);
        }
        if (avgHoldDays != null && avgHoldDays < 30) {
          demandScore = Math.min(100, demandScore + 10);
        } else if (avgHoldDays != null && avgHoldDays > 90) {
          demandScore = Math.max(0, demandScore - 10);
        }

        await withRetry(() =>
          upsertMarketDemandIndex(db, {
            region,
            segmentKey: '',
            purchaseCount,
            avgHoldDays,
            sellThroughRate,
            demandScore,
            weekLabel,
          })
        );
        recomputed++;
      } catch (err) {
        errors++;
        log("recompute.region_failed", {
          region,
          reason_code: "recompute_error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return json({ ok: true, recomputed, errors });
  }

  // GET /admin/buy-box/attributions?lead_id=xxx
  if (request.method === "GET" && pathname === "/admin/buy-box/attributions") {
    const leadId = url.searchParams.get("lead_id");
    if (!leadId) return json({ ok: false, error: "lead_id_required" }, 400);
    const { data, error } = await db
      .from("buy_box_score_attributions")
      .select("*")
      .eq("lead_id", leadId);
    if (error) return json({ ok: false, error: "db_error" }, 503);
    return json({ ok: true, data });
  }

  // GET /admin/import-batches
  if (request.method === "GET" && pathname === "/admin/import-batches") {
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(limitParam ? parseInt(limitParam, 10) : 20, 100);
    const batches = await listImportBatches(db, limit);
    return json({ ok: true, data: batches });
  }

  return json({ ok: false, error: "not_found" }, 404);
  } catch (err) {
    log("admin.error", {
      method: request.method,
      pathname,
      stage: "route_handler",
      error: serializeError(err),
    });
    return json({ ok: false, error: "db_error" }, 503);
  }
}
