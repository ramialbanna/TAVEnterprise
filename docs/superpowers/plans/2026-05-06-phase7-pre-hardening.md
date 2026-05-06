# Phase 7 Pre-Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five post-review findings before Phase 7 begins — two near-blockers in the I/O layer, one type gap, one data-parsing bug, and one infrastructure risk.

**Architecture:** All changes are surgical patches to existing modules. No new files. No new dependencies. Every change follows the existing `withRetry` / Zod / strict-type patterns already established in the codebase.

**Tech Stack:** TypeScript strict, Vitest, Cloudflare Workers, Supabase PostgREST (`src/persistence/retry.ts` provides `withRetry`)

---

## Files touched

| File | Change |
|------|--------|
| `src/types/domain.ts` | Add `closerId`, `cotCity`, `cotState` to `PurchaseOutcome` interface |
| `src/outcomes/import.ts` | Strip `$` / commas in `getNumber` before `Number()` parse |
| `src/persistence/purchaseOutcomes.ts` | Wrap fallback SELECT in `withRetry` |
| `src/admin/routes.ts` | Add `withRetry` + per-region try/catch to recompute loop |
| `wrangler.toml` | Provision + record separate KV namespace ID for staging |
| `test/outcome.import.test.ts` | New tests for currency-formatted price inputs |
| `docs/followups.md` | Append second-bucket items from review |

---

## Task 1: Add missing fields to `PurchaseOutcome` interface

**Files:**
- Modify: `src/types/domain.ts:181-209`

The `PurchaseOutcome` interface is missing `closerId`, `cotCity`, and `cotState`. Those fields are written to the DB in `purchaseOutcomes.ts:47-49` and present in `ParsedOutcomeRow`, but absent from `PurchaseOutcome`. Any code that reads a `PurchaseOutcome` from the DB and accesses those fields gets `undefined` with no type error.

- [ ] **Step 1: Edit `src/types/domain.ts`**

Find the `PurchaseOutcome` interface (around line 181). It currently ends with:

```typescript
  weekLabel?: string | null;
  buyerId?: string | null;
  importBatchId?: string | null;
  importFingerprint?: string | null;
  createdAt: string;
```

Replace that block with:

```typescript
  weekLabel?: string | null;
  buyerId?: string | null;
  closerId?: string | null;
  cotCity?: string | null;
  cotState?: string | null;
  importBatchId?: string | null;
  importFingerprint?: string | null;
  createdAt: string;
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/domain.ts
git commit -m "fix: add closerId, cotCity, cotState to PurchaseOutcome interface"
```

---

## Task 2: Strip currency formatting in `getNumber`

**Files:**
- Modify: `src/outcomes/import.ts:50-60`
- Test: `test/outcome.import.test.ts`

`getNumber` calls `Number(val)` directly on string inputs. `Number("$14,000")` and `Number("14,000")` both return `NaN`. Spreadsheet-exported CSVs commonly produce these formats. The result is a silent `missing_price_paid` rejection with no indication that a value was present but unparseable.

- [ ] **Step 1: Write failing tests in `test/outcome.import.test.ts`**

Add these three tests inside the existing `describe("parseOutcomeRow", ...)` block, after the existing price_paid tests:

```typescript
it("accepts currency-formatted price_paid: '$14,000'", async () => {
  const result = await parseOutcomeRow({ vin: "1HGCM82633A004352", price_paid: "$14,000" });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.data.pricePaid).toBe(14000);
});

it("accepts comma-formatted price_paid: '14,000'", async () => {
  const result = await parseOutcomeRow({ vin: "1HGCM82633A004352", price_paid: "14,000" });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.data.pricePaid).toBe(14000);
});

it("rejects non-numeric price_paid after stripping: '$abc'", async () => {
  const result = await parseOutcomeRow({ vin: "1HGCM82633A004352", price_paid: "$abc" });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reasonCode).toBe("missing_price_paid");
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --reporter=verbose outcome.import
```

Expected: the two `'$14,000'` / `'14,000'` tests FAIL with `received false` (ok is false instead of true). The `'$abc'` test should already pass.

- [ ] **Step 3: Fix `getNumber` in `src/outcomes/import.ts`**

Find the `getNumber` function (lines 50-60):

```typescript
function getNumber(row: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const val = row[key];
    if (typeof val === "number" && isFinite(val)) return val;
    if (typeof val === "string") {
      const parsed = Number(val);
      if (!isNaN(parsed) && isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}
```

Replace with:

```typescript
function getNumber(row: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const val = row[key];
    if (typeof val === "number" && isFinite(val)) return val;
    if (typeof val === "string") {
      // Strip currency formatting before parsing: "$14,000" → "14000"
      const cleaned = val.replace(/[$,]/g, "").trim();
      const parsed = Number(cleaned);
      if (!isNaN(parsed) && isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --reporter=verbose outcome.import
```

Expected: all three new tests PASS. Full suite still green.

- [ ] **Step 5: Full verification**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: 0 errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/outcomes/import.ts test/outcome.import.test.ts
git commit -m "fix: strip currency/comma formatting in getNumber before Number() parse"
```

---

## Task 3: Wrap fallback SELECT in `withRetry` (NB1)

**Files:**
- Modify: `src/persistence/purchaseOutcomes.ts`

When `upsertPurchaseOutcome` gets a conflict (row exists, `inserted` is null), it does a bare SELECT to fetch the existing row's id. That SELECT has no retry wrapper. A transient Supabase blip here throws out of `upsertPurchaseOutcome`, propagates uncaught through the import handler, and returns 500 with the batch stuck at `importing` status. The fix is to wrap the fallback SELECT in `withRetry`, consistent with every other DB call in `src/ingest/handleIngest.ts`.

- [ ] **Step 1: Add `withRetry` import to `src/persistence/purchaseOutcomes.ts`**

The file currently starts with:

```typescript
import type { SupabaseClient } from "./supabase";
import type { ParsedOutcomeRow, PurchaseOutcome } from "../types/domain";
```

Replace with:

```typescript
import type { SupabaseClient } from "./supabase";
import type { ParsedOutcomeRow, PurchaseOutcome } from "../types/domain";
import { withRetry } from "./retry";
```

- [ ] **Step 2: Wrap the fallback SELECT**

Find the `if (!inserted)` block (lines 60-69):

```typescript
  if (!inserted) {
    // Conflict was ignored — row already exists. Fetch its id for the caller.
    const { data: existing, error: fetchErr } = await db
      .from("purchase_outcomes")
      .select("id")
      .eq("import_fingerprint", data.importFingerprint)
      .single();
    if (fetchErr) throw fetchErr;
    return { id: existing!.id as string, isDuplicate: true };
  }
```

Replace with:

```typescript
  if (!inserted) {
    // Conflict was ignored — row already exists. Fetch its id for the caller.
    // Wrapped in withRetry: a transient Supabase blip here would otherwise
    // throw out of the import handler and leave the batch stuck at "importing".
    const existing = await withRetry(async () => {
      const { data: row, error: fetchErr } = await db
        .from("purchase_outcomes")
        .select("id")
        .eq("import_fingerprint", data.importFingerprint)
        .single();
      if (fetchErr) throw fetchErr;
      return row;
    });
    return { id: existing!.id as string, isDuplicate: true };
  }
```

- [ ] **Step 3: Verify**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: 0 errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/persistence/purchaseOutcomes.ts
git commit -m "fix: wrap fallback SELECT in upsertPurchaseOutcome with withRetry"
```

---

## Task 4: Per-region error boundary + `withRetry` in recompute loop (NB2)

**Files:**
- Modify: `src/admin/routes.ts`

The `POST /admin/market/demand/recompute` handler loops over regions with bare `await` calls — no retry, no per-region error isolation. A transient failure on any region throws out of the loop and 500s the entire endpoint, abandoning all remaining regions. The fix wraps both the per-region SELECT and the upsert in `withRetry`, and adds a try/catch around the per-region block so one region's failure doesn't abort the others.

- [ ] **Step 1: Add `withRetry` import to `src/admin/routes.ts`**

The file currently starts with:

```typescript
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
```

Replace with:

```typescript
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
```

- [ ] **Step 2: Replace the recompute loop body**

Find the block starting at `let recomputed = 0;` (around line 174) and ending just before `return json({ ok: true, recomputed });`:

```typescript
    let recomputed = 0;
    for (const region of uniqueRegions) {
      const { data: agg } = await db
        .from("purchase_outcomes")
        .select("hold_days, sale_price")
        .eq("region", region);
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

      await upsertMarketDemandIndex(db, {
        region,
        segmentKey: '',
        purchaseCount,
        avgHoldDays,
        sellThroughRate,
        demandScore,
        weekLabel,
      });
      recomputed++;
    }

    return json({ ok: true, recomputed });
```

Replace with:

```typescript
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
        console.error(JSON.stringify({
          event: "recompute.region_failed",
          region,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    }

    return json({ ok: true, recomputed, errors });
```

- [ ] **Step 3: Verify**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: 0 errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/admin/routes.ts
git commit -m "fix: withRetry + per-region error boundary in demand recompute loop"
```

---

## Task 5: Provision separate KV namespace for staging

**Files:**
- Modify: `wrangler.toml`

`[env.staging]` and `[env.production]` both bind to KV namespace `e61e291003f647a5ad0ffce778ac6631`. A staging test run will overwrite production Manheim token cache and MMR value cache entries.

- [ ] **Step 1: Create a staging KV namespace**

```bash
wrangler kv namespace create TAV_KV --env staging
```

Copy the `id` value from the output. It will look like: `id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`.

If this fails (authentication error), run `wrangler login` first, then retry.

- [ ] **Step 2: Update `wrangler.toml`**

Find the staging block:

```toml
[env.staging]
name = "tav-aip-staging"
[[env.staging.kv_namespaces]]
binding = "TAV_KV"
id = "e61e291003f647a5ad0ffce778ac6631"
```

Replace with (substituting the actual ID from Step 1):

```toml
[env.staging]
name = "tav-aip-staging"
[[env.staging.kv_namespaces]]
binding = "TAV_KV"
# Staging-specific namespace — MUST NOT share with production.
# Created with: wrangler kv namespace create TAV_KV --env staging
id = "<STAGING_NAMESPACE_ID_FROM_STEP_1>"
```

- [ ] **Step 3: Verify wrangler config parses**

```bash
wrangler deploy --dry-run --env staging 2>&1 | head -20
```

Expected: no "namespace not found" or "invalid TOML" errors. A dry-run will not deploy.

- [ ] **Step 4: Commit**

```bash
git add wrangler.toml
git commit -m "chore: provision dedicated KV namespace for staging environment"
```

---

## Task 6: Append second-bucket items to `docs/followups.md`

**Files:**
- Modify: `docs/followups.md`

- [ ] **Step 1: Append items to `docs/followups.md`**

Add the following lines at the end of the existing `docs/followups.md` file:

```markdown
- [ ] 2026-05-06 src/persistence/purchaseOutcomes — add DLQ write (dead_letters or KV key) for final-failure on upsertPurchaseOutcome / bulkInsertImportRows after RetryExhaustedError (noticed by: reviewer)
- [ ] 2026-05-06 src/admin/routes — add Zod schema for PUT /admin/market/expenses request body; replace manual `as` casts (noticed by: reviewer)
- [ ] 2026-05-06 src/admin/routes — replace N+1 per-region SELECT in recompute with a single GROUP BY aggregate query to avoid unbounded Worker memory usage (noticed by: reviewer)
- [ ] 2026-05-06 src/admin/routes — clamp ?limit to max 100 in GET /admin/import-batches (noticed by: reviewer)
- [ ] 2026-05-06 src/valuation/mmr — log HTTP status on !res.ok in getMmrByVin and getMmrByYmm error branches (noticed by: reviewer)
- [ ] 2026-05-06 src/admin/routes — refactor demand recompute logic out of routes.ts into src/scoring/demandRecompute.ts (noticed by: reviewer)
- [ ] 2026-05-06 src/types/domain — consolidate ParsedOutcomeRow: remove duplicate definition from src/outcomes/import.ts and import from domain.ts (noticed by: reviewer)
- [ ] 2026-05-06 src/types/domain — pick one source of truth for ConditionGradeNormalized (currently in conditionGrade.ts and domain.ts) (noticed by: reviewer)
- [ ] 2026-05-06 supabase/migrations — add NOT NULL to purchase_outcomes.import_fingerprint in a future migration 0022 (noticed by: reviewer)
- [ ] 2026-05-06 supabase — promote repair-functions.sql to migration 0022 or delete after confirming all environments applied it (noticed by: reviewer)
- [ ] 2026-05-06 supabase — audit IS NULL queries against market_expenses.city and market_demand_index.segment_key — silently break after 0021 NOT NULL DEFAULT '' change (noticed by: reviewer)
- [ ] 2026-05-06 supabase/migrations — wrap multi-step DDL migrations in explicit BEGIN/COMMIT for safer manual psql replay (noticed by: reviewer)
```

- [ ] **Step 2: Verify**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: still green — this was a docs-only change.

- [ ] **Step 3: Commit**

```bash
git add docs/followups.md
git commit -m "chore: log post-review follow-up items to followups.md"
```

---

## Final verification

- [ ] **Run full verification loop**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: 0 lint errors, 0 type errors, all tests pass (236+3 = 239 or more).

- [ ] **Confirm clean working tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean`
