# /mmr-lab Redesign — Manheim MMR Layout, Honest Shell (Issue #44)

Date: 2026-05-17
Status: **REVISED R1 (user, 2026-05-17)** — see "REVISION R1" below; it SUPERSEDES the interim-catalog sections.
GitHub: ramialbanna/TAVEnterprise#44
Scope: **frontend/product only.** No backend slice, no v2, no lead-scoring change.

## REVISION R1 — 2026-05-17 (no hardcoded catalog; selectors disabled)

The bounded interim catalog is **withdrawn**. We will NOT present Cadillac/Ford/Subaru
local constants as if they were real product data, and we will NOT scrape the Manheim
UI. Authoritative changes (these override anything below that conflicts):

1. **Delete `web/app/(app)/mmr-lab/_data/interim-catalog.ts` and its test.** Zero
   hardcoded vehicle catalog values anywhere in production code.
2. **Production Year/Make/Model/Style selectors render visible but DISABLED**, with no
   options, and the UI states clearly that the **live catalog / API access is not
   connected yet**. No cascade logic, no local vehicle constants imported.
3. **VIN is the only working valuation path** — existing `/api/app/mmr/vin` lean
   envelope → Base MMR; everything else honest `--` (unchanged from below).
4. Selecting/interacting with Y/M/M/S **cannot** call `/api/app/mmr/vin` or any YMM
   endpoint (it's inert/disabled). Money fields stay `--` unless populated by the real
   VIN path.
5. Official Manheim/Cox Valuations API integration is owned by **#45** (created +
   linked): server-side metadata endpoints (years/makes/models/trims), server-side YMM
   valuation requiring style/body + mileage, safe metadata caching, 401/596 treated as
   "not provisioned" (never fake fallback), removal of this disabled state on delivery,
   no scraping unless Cox/Manheim authorizes in writing.
6. Tests focus on revised behavior: selectors visible+disabled; UI explains "live
   catalog not connected"; Y/M/M/S interaction triggers no network; money `--` unless
   real VIN path. e2e screenshots = empty state + disabled-state (NO fake selected-YMM
   screenshot).

Everything below about layout faithfulness, the honest VIN result, disabled MMR
Adjustments, `--` everywhere, security boundary, and "no dummy prefill" still applies.
Wherever the text below describes a working interim catalog / cascade / identity title
from Y/M/M/S, treat it as REPLACED by items 1–4 above.

## Goal

Replace the current VIN/MMR diagnostic lab with a Manheim-MMR-faithful
workspace that is **honest about what data exists**. VIN valuation keeps
working through the existing proxy. Year/Make/Model/Style is presented
(Manheim layout requires it) but is **identity-only** — it must not imply
a valuation is available or coming, because no browser-reachable YMM
valuation endpoint exists and a real one would additionally require
body/style + mileage.

## Ground truth (verified in code, 2026-05-17)

- Web app `/app/*` surface = 7 endpoints; only MMR one is `POST /app/mmr/vin`.
- `POST /app/mmr/vin` response is **lean**: `{ ok:true, data:{ mmrValue:number|null, confidence?:"high"|"medium"|"low", method?:"vin"|"year_make_model"|null, missingReason?:code } }`. No YMM identity, no MMR range, no retail, no transactions, no historical.
- No `/app/mmr/years|makes|models|styles`, no browser-reachable YMM valuation endpoint. Intel worker's `POST /mmr/year-make-model` is **not** exposed to the browser and is a full-YMM valuation lookup, not enumeration.
- No static catalog anywhere. Manheim YMM search is account-blocked (596).
- Stack: Next.js App Router, shadcn/ui + Tailwind, `@/components/data-state` (`EmptyState`/`UnavailableState`/`PendingBackendState`/`ErrorState`), `@/lib/format`, `@tanstack/react-query`. Proxy: browser → same-origin `/api/app/[...path]` (server-only, injects `APP_API_SECRET`) → Worker → intel worker.

## Hard rules

1. **No browser → Supabase / Cox / Manheim.** No secret in client. VIN stays: browser → `/api/app/mmr/vin` → Worker → intel worker. Unchanged.
2. **No fabricated data.** Every value with no backing API value renders `--` (or honest `PendingBackendState`/`UnavailableState`). Never invent MMR, range, retail, transactions, similar vehicles, historical/projected, avg odo/condition.
3. **No dummy prefill.** Initial state fully empty. `Fill example` removed as a visible/primary production control (a non-production test affordance may exist only if not presented as a primary control).
4. **Y/M/M/S = identity only.** Selecting Year→Make→Model→Style forms the vehicle title string ONLY. It triggers **no** valuation, calls **no** endpoint (`/api/app/mmr/vin` or otherwise), and must not render or imply any MMR/range/retail/etc. There is **no** "get MMR by YMM" action in this redesign.
5. **YMM valuation readiness (user correction):** a real YMM valuation needs at least body/style + mileage/odometer. The UI must never present Y/M/M/S selection as "ready to value." If a future YMM endpoint is added, the UI must require a valid body/style **and** mileage before enabling any YMM lookup. Encode this expectation in the follow-up issue.
6. **`Style`** is the 4th selector label (Manheim term), never `Trim`.
7. **Mileage explicit.** ODO field always present; when unavailable, show `--`/clear state, never silently omit.
8. Interim catalog is a **clearly labeled, bounded, validated sample — NOT the live Manheim catalog.** Source-cited in code. Isolated module. Values limited to exactly what the 2026-05-17 screenshots / Issue #44 contain (enumerated below).

## Layout (Manheim-faithful; existing shadcn/Tailwind tokens)

Top → bottom (the page content; the app's own shell/nav stays — do NOT replicate Manheim's marketing footer):

1. **Blue `MMR` bar** — full-width navy, white "MMR".
2. **Search panel** (gray): `Enter VIN` input + search button (active/gold when VIN present, gray empty, `×` clear). Below: 4 selects inline — `Year`, `Make`, `Model`, `Style`. Cascade enable: Year → then Make → then Model → then Style. Placeholder text = the label. Disabled until its predecessor is chosen.
3. **Identity row** (only when a vehicle is resolved by VIN result *or* full Y/M/M/S): vehicle title (blue bold) + VIN line; `Learn More`/`Print` rendered but inert/secondary; blue divider rule.
4. **Three-zone band:**
   - Left **Base MMR**: heading + value (`--` or VIN `mmrValue`); stat rows `Avg Odometer (mi)`, `Avg Condition`, `Avg EV Battery Score` — all `--` (lean envelope has none).
   - Center **MMR Adjustments** card: header + inert blue `CLEAR`. Controls rendered **disabled, visibly present** (per user): `Enter ODO (mi)`, `Region`, `Grade**`, `Exterior Color`, `Build Options?` toggle, Express-grade toggle + "Only eligible from 75 to 100", footer `Numbers may not add exactly due to rounding / ** AutoGrade™ or Manheim Express Grade`. No recompute (no endpoint) — disabled with honest state, not interactive, no fake deltas.
   - Right **navy panel**: `MMR Range`, `Adjusted MMR` (white inset), `Estimated Retail Value` + "Based on Cox Automotive Retail Transactions", `Typical Range` — all `--` unless a real API value exists (only Base MMR ever gets one, from the VIN envelope).
5. **Similar vehicles** / **Transactions** (exact columns: `Date Price Odo(mi) Grade EVBH Eng/T Ext Color Type Region Auction`) / **Historical Average** (`Past 30 Days`/`6 Months Ago`/`Last Year`) + **Projected Average** (`Next Month`): render the section frames; bodies are honest `--`/empty (no backend supplies these). Transactions empty body shows centered `--` like the screenshot.

## State behaviors

- **Empty (default):** every value `--`. No title. No prefill. Selectors at placeholder.
- **VIN lookup** (only valuation path): submit VIN → `/api/app/mmr/vin`.
  - `mmrValue` number → **Base MMR = formatted mmrValue** + confidence badge + method. All other zones stay `--`/`PendingBackendState` (lean envelope carries nothing else). This sparse result is intentional & honest.
  - `mmrValue:null` + `missingReason` → honest `UnavailableState` mapped from the reason code (reuse current mapping). Not an error UI for business-unavailability.
  - validation/network error → `ErrorState`.
- **Y/M/M/S selection:** builds title only (e.g. `2026 CADILLAC ESCALADE IQ 4D SUV SPORT`). Persistent honest banner near the result band: *"Year/Make/Model/Style is a limited validated sample, not the live Manheim catalog. YMM valuation is not available — enter a VIN for a value."* All money zones remain `--`. No request fired.

## Interim catalog (bounded, validated — `_data/interim-catalog.ts`)

Module-level comment must state: limited validated sample sourced from Issue #44 + 2026-05-17 Manheim screenshots; NOT the live Manheim catalog; tracked for removal by the follow-up issue. Contents (only these):

- **Years:** 2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014.
- **Makes (validated slice):** BUICK, CADILLAC, CHEVROLET, CHRYSLER, DODGE, FERRARI, FIAT, FORD, GENESIS, GMC, HONDA, HYUNDAI, INEOS, INFINITI, JAGUAR, SUBARU.
- **Models — 2026 CADILLAC:** ESCALADE 4WD, ESCALADE AWD, ESCALADE ESV 2WD, ESCALADE ESV 4WD, ESCALADE ESV AWD, ESCALADE IQ, ESCALADE IQL, LYRIQ 2WD, LYRIQ AWD, OPTIQ, VISTIQ, XT5 AWD 4C, XT5 AWD V6, XT5 FWD 4C, XT5 FWD V6.
- **Styles — 2026 CADILLAC ESCALADE IQ:** 4D SUV LUXURY, 4D SUV PREMIUM LUXURY, 4D SUV PREMIUM SPORT, 4D SUV SPORT.
- **Validated extra example paths:** 2019 FORD → model `F250 4WD V8 TDSL` → style `CREW CAB 6.7L PLATINUM`; 2016 SUBARU → model `BRZ` → style `2D COUPE LIMITED`.
- Any Year/Make/Model with no validated children → empty list + honest "no validated options — use VIN" note. No invented entries, ever.

## Tests (required)

Unit/RTL (`vitest`) + e2e (`playwright`):
- **Empty state:** all money/identity fields render `--`; no title; selectors at placeholder.
- **Y/M/M/S selection (explicit, per user):** selecting full Year/Make/Model/Style (a) renders the title, (b) every money field stays `--` — assert no fabricated number anywhere, (c) **never calls `/api/app/mmr/vin`** (assert the route mock / fetch spy is not hit), (d) **never calls any other/network endpoint** (assert zero outbound requests; no `/app/mmr/years|makes|models|styles` etc.).
- **VIN path still works:** mocked `page.route("**/api/app/mmr/vin")` → Base MMR shows the mocked value + confidence; other zones `--`.
- **VIN unavailable:** `mmrValue:null`+reason → honest `UnavailableState`, not error.
- Remove the existing `Fill example` e2e expectation; remove asserts depending on the old layout.
- Playwright **screenshots**: configure `screenshot`/`outputDir`; capture (1) empty `/mmr-lab`, (2) one selected YMM/style path (2026 Cadillac Escalade IQ → 4D SUV SPORT) showing title + `--` valuation + honest banner. Commit screenshots.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` green.

## Follow-up GitHub issue (create BEFORE closing #44)

Title ~ "MMR Lab v-next: live YMM metadata + browser-safe YMM valuation + adjustment recompute; remove interim catalog". Body must enumerate:
1. Live metadata source for full Year/Make/Model/Style (replace the interim catalog; delete `_data/interim-catalog.ts`).
2. Browser-safe YMM valuation endpoint exposed via `/app/*`, that **requires valid body/style + mileage/odometer** before it will value (UI must gate the lookup on those).
3. Adjustment recompute endpoint (ODO/Region/Grade/Color/Build) to power the now-disabled MMR Adjustments controls.
4. Explicit acceptance: remove the interim catalog + its "limited sample" labeling once live metadata lands.
Link it from #44 and reference #44 from it.

## Out of scope

- Any backend/Worker endpoint work; v2; lead scoring; Phase 4c Cox YMM/bodyname mapping; the unrelated branch `feat/issue-41-*` work; the repo's pre-existing uncommitted scaffolding/AGENTS.md (leave untouched).

## Verification

`pnpm typecheck` + `pnpm lint` + `pnpm test` + `pnpm test:e2e` green; 2 screenshots committed; follow-up issue created and cross-linked; no new `/app/*` endpoint added; grep shows no browser call to Supabase/Cox/Manheim/`mmr/year*` from `web/`.
