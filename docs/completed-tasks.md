# Completed Tasks — MMR Lab

**Last updated:** 2026-06-16

Archived completed work items from `NEXT_STEPS.md`. Each entry preserves the original exit criteria and implementation notes.

---

## Item 14 — Mileage field cascade bug: can't clear the Miles input

**Completed:** 2026-06-15. Follow-up (2026-06-15): Miles input removed from the search panel entirely — odometer lives only in MMR Adjustments (`result-band.tsx`).

**Goal:** The "Miles" input in the search panel became permanently stuck at whatever value was last seeded. After a VIN lookup the field showed 8,000 (the inferred mileage) and the user could not delete it — deleting the last digit always restored the previous value.

### Root cause

In `web/app/(app)/mmr-lab/_components/apply-ymm-cascade.ts`:

```typescript
const mileage = next.mileage !== "" ? next.mileage : prev.mileage;
```

This fired on every call to `onSelectionChange`, including direct mileage edits. The moment the field became empty string (`""`), the cascade substituted the previous non-empty value.

### Fix

Removed the mileage-preservation line from `applyYmmCascadeChange`. Mileage is independent of Y/M/M/S cascade and must not be governed by it.

### Exit criteria

- [x] User can clear the Miles field to empty at any time
- [x] Changing the Year dropdown does not wipe the mileage the user already typed
- [x] Changing the Year dropdown does not restore a stale mileage if the field was manually cleared
- [x] `applyYmmCascadeChange` unit tests updated to cover the empty-mileage case

---

## Item 12 — VIN MMR: remove mileage inference, call Cox with VIN only

**Completed:** 2026-06-15.

**Goal:** VIN lookup sends no `?odometer` query param to Cox when the buyer has not entered mileage. Matches Manheim's native tool behaviour.

### Root cause

`getMmrMileageData` was called unconditionally on the VIN path in `mmrLookup.ts`, injecting a fabricated mileage `(currentYear − modelYear) × 15,000 + currentMonth × 1,250` for every VIN-only search.

### Fix

`resolveLookupMileage` in `mmrLookup.ts`: VIN path returns `{ clientValue: undefined, cacheValue: undefined, envelopeValue: null }` when `input.mileage` is absent. `manheimHttp.ts` only appends `?odometer=` when mileage is explicitly provided.

### Exit criteria

- [x] VIN lookup sends no `?odometer` query param to Cox when buyer has not entered mileage
- [x] `mileage_used` in the response envelope is `null` for a no-mileage VIN lookup
- [x] Adjustment odometer field in the result band starts empty (not "8000") after a VIN lookup
- [x] Search panel has no Miles field; odometer is entered only in MMR Adjustments
- [x] YMM path is unchanged — mileage is still inferred/required for YMMT calls

---

## Item 13 — MaxBuy: resolve VIN via YMM fallback when VIN not in TAV DB

**Completed:** 2026-06-16. Sequential VIN MaxBuy after MMR; `vehicleContextFromRequestFields` server fallback; Cox YMM passed from `mmrVinSessionFromResult`.

**Goal:** MaxBuy returns a verdict for VINs that have never been in TAV's DB by falling back to Cox year/make/model from the same MMR lookup.

### Root cause

- `runEvaluate` called `resolveVehicleContext(db, { vin, region: "" })` with no YMM fallback.
- `buildMmrLabMaxbuyRequest` sent `{ vin, year: "", make: "", model: "" }` for VIN sessions — server had no YMM to fall back on.
- MMR and MaxBuy fired in parallel, so Cox YMM wasn't available when MaxBuy was built.

### Fix (two-part)

**Server:** In VIN path of `evaluateRun.ts`, if `resolveVehicleContext` returns null but `request.year/make/model` are present, construct `vehicleCtx` from them.

**Client:** For VIN path, MaxBuy fires **after** MMR resolves (sequential). `mmrVinSessionFromResult` attaches Cox year/make/model to the session; `buildMmrLabMaxbuyRequest` includes them.

### Exit criteria

- [x] MaxBuy returns a verdict for a VIN that has never been in TAV's DB
- [x] The recommendation record still captures the VIN (not null)
- [x] MaxBuy still works correctly for VINs that ARE in TAV's DB
- [x] YMM-path MaxBuy is unchanged
- [x] If MMR itself fails, MaxBuy shows "evaluation could not run" — not a spurious VIN error

---

## Item 11 — MMR Range: promote to blue highlight card

**Completed:** 2026-06-16. Blue `bg-primary` card in `result-band.tsx`.

**Goal:** The MMR Range displayed in a prominent blue card matching Manheim MMR tool layout.

### Fix

`result-band.tsx`: MMR Range, Adjusted MMR, and Estimated Retail placed inside a `rounded-lg bg-primary p-4 text-primary-foreground` card as the right column of the three-column ResultBand grid.

### Exit criteria

- [x] MMR Range displayed in a visually prominent blue card matching Manheim MMR tool layout
- [x] Range remains visible in both loading and error states (shows `--` placeholders)
- [x] No regression on existing ResultBand tests

---

## Older completed work (pre-2026-06-12)

| Track | Doc |
|-------|-----|
| Opportunities UX rollout (Phases 0–7, Classic retired) | [`02-product/ux-rollout-shipped.md`](02-product/ux-rollout-shipped.md) |
| MMR Lab Phases 1–4 (UI, live MaxBuy, adjustments, Cox historical) | [`07-buybox/MMR-LAB-MAXBUY-PAGE.md`](07-buybox/MMR-LAB-MAXBUY-PAGE.md) |
| MaxBuy P0–P9 | [`07-buybox/STATUS.md`](07-buybox/STATUS.md) |
| **MMR Lab Item 1** — VIN autofill + YMM switch (DEC-MLB-1, DEC-MLB-6) | 2026-06-12 |
| **MMR Lab Item 3** — MaxBuy plain-language explanation (DEC-MLB-4, DEC-MLB-5) | 2026-06-12 |
| **MMR Lab Item 4** — YMM dependent dropdown cascade (DEC-MLB-7 through DEC-MLB-10) | 2026-06-15 |
