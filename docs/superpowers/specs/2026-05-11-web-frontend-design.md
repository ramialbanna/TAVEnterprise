# TAV Acquisition Intelligence — Web Frontend (`/web`) Design

Status: **approved 2026-05-11** (implementation pending the `writing-plans` cycle) · Date: 2026-05-11 · Owner: Claude Code (implementation) / Codex (review)

> Product surface: a TAV-owned production frontend/dashboard for **TAV-AIP** ("TAV Acquisition Intelligence"), built on the existing Cloudflare Worker `/app/*` product API. **No code yet** — this doc is the plan. Base44 was prototyping only and is not production.

---

## 1. Decisions locked (from planning Q&A)

| # | Decision | Choice |
|---|---|---|
| 1 | Framework / host / repo location | **Next.js (App Router)** in an in-repo subdir **`/web`**, deployed to **Vercel** with project root `/web`. Co-versioned with the backend + API docs in this repo. |
| 2 | Browser → server boundary | Browser talks only to Next.js Route Handlers / Server Actions. Next.js server holds `APP_API_SECRET` (server-only env). Next.js proxies the Worker `/app/*`. Secret never reaches browser JS. |
| 3 | Auth | **Auth.js (NextAuth)** + **Google Workspace OIDC**, restricted to email domain `texasautovalue.com`. v1 = gate the whole app for TAV staff; **no per-user roles, no lead ownership** yet. Encrypted/session cookies. Identity = dashboard session only in v1. |
| 4 | v1 build scope | **Hybrid (Option D).** v1 ships 4 live-data pages: **KPI Dashboard, VIN / MMR Lookup Lab, TAV Historical Data, Admin / Integrations**. v1.5 = Ingest Monitor + Import-Batches view (after small new read endpoints). v2 = Acquisition Workflow, Weekly Sales Upload, Lead Review, Vehicle Detail (need larger `/app/*` surfaces incl. mutations). |
| 5 | Sequencing | Layer-by-layer first, then page-by-page. Phase 1 = `/web` scaffold + auth gate + API proxy/client + app shell + nav + env badge + error/loading/empty system + shared table/card/chart components. Phases 2–5 = the 4 v1 pages in order. |
| 6 | Frontend toolkit | **shadcn/ui** (Radix primitives + Tailwind, components vendored as owned source — *not* a generic off-the-shelf look), **TanStack Table**, **Recharts** (v1 charts), **TanStack Query** (client refresh/polling), **next-themes**, **Tailwind v4** with **CSS-variable semantic tokens**, **lucide-react** icons. **Dark mode ships in v1**; light is the default and primary design target. |
| 7 | API adapter | **Generic catch-all proxy route** `web/app/api/app/[...path]/route.ts` — forwards method/path/query/body to `${APP_API_BASE_URL}/app/...`, injects `Authorization: Bearer ${APP_API_SECRET}` server-side, returns the Worker JSON + status verbatim. Thin typed client `web/lib/app-api.ts`. UI components never know the Worker secret or URL. Adapter layer kept separate from UI components. |
| 8 | Environment config | **Bound to the Vercel environment** (Option A). Production env → prod Worker; Preview env → staging Worker; local dev → staging Worker by default, overridable via `web/.env.local`. **`APP_API_BASE_URL` = Worker origin only** (proxy appends `/app`). No runtime environment switching, no admin dropdown to flip envs. Env badge derives from `APP_API_BASE_URL` host. Auth.js env vars also set per Vercel environment. |
| 9 | Demo Mode | **Deferred to v2** (Option A1). v1 is real-only — no demo toggle, no fixture client in the shipped app, no mock operational numbers. Fixtures live only in tests / dev-only examples. Unavailable metrics show pending/unavailable states. |
| 10 | Responsive / a11y bar | **Desktop-first**, optimized for 1280px+. Tablet 768–1280px fully usable (collapsible sidebar, scrollable tables). Mobile <768px usable but not optimized (single-column, horizontal table scroll, no dense-table parity promise). A11y: correct shadcn/Radix usage, keyboard-navigable, focus-visible, labelled controls, semantic buttons/links, **AA contrast in both themes**; no tiny tap targets, no unlabeled icon buttons. |
| 11 | `/web` build/CI | `/web` is its own npm project: own `package.json`, `pnpm-lock.yaml`, `tsconfig`, lint config, scripts. **`pnpm`** for `/web` (root stays `npm` — it's the Worker). Dedicated **`web-ci` GitHub Actions job**, path-filtered, runs `pnpm install --frozen-lockfile` → `lint` → `typecheck` → `test` → `build`, separate from Worker CI. |
| 12 | Testing | Vitest + React Testing Library (components, `app-api.ts`, `missingReason`/`{ok:false}` → UI-state mapping). **MSW** mocks `/api/app/*` with fixtures mirroring `docs/APP_API.md`. **Playwright** E2E depth **(ii)** for v1 (smoke + key flows — see §13). `pnpm test:contract` = manual/pre-release-only script against the real staging Worker, asserts envelope shapes; not in CI. Auth.js sessions mocked in all automated tests; one real OAuth round-trip verified manually on a Preview deploy before launch. |
| 13 | Page 1 gross-trend chart (was D1) | **Resolved: derive a monthly gross trend client-side from `/app/historical-sales`** (sum/avg `grossProfit` by `saleDate` month) — real TAV data, no new endpoint, shared helper with Page 4. **Caveat:** it reflects only the *returned* historical-sales sample (the endpoint's `limit`/filter slice), not a full-database aggregate — the chart is labelled accordingly. A proper aggregated historical-sales trend endpoint is added to the API-gap register for later. |
| 14 | Production domain | **v1 = the Vercel-assigned domain** (fastest path to ship; avoids blocking on custom DNS/OAuth domain setup). A custom production domain is a **launch-readiness follow-up** (§14/§16). Google OAuth callback URLs must include the Vercel production domain plus the preview/dev URLs as configured. |

---

## 2. Backend the frontend stands on (as-built, do not re-derive)

The main Cloudflare Worker `tav-aip` (`src/index.ts`) exposes four HTTP surfaces. Only **`/app/*`** is the frontend product API.

| Surface | Auth | Frontend uses it? |
|---|---|---|
| `POST /ingest` | HMAC (`WEBHOOK_HMAC_SECRET`) | **No** — scraper intake only. |
| `/admin/*` | Bearer `ADMIN_API_SECRET` | **No in v1.** Never route the browser through `/admin/*` unless we explicitly design a narrowed server-side proxy later (out of scope here). |
| `GET /health` | none | Optional liveness ping only. |
| **`/app/*`** | Bearer `APP_API_SECRET` (server-side only) | **Yes — the product API.** |

`/app/*` endpoints (live on `tav-aip-staging` and `tav-aip-production` since 2026-05-11; contract = `docs/APP_API.md`, decision = `docs/adr/0002-frontend-app-api-layer.md`):

| Method | Path | Returns (success `{ok:true,data}`) | Notes |
|---|---|---|---|
| GET | `/app/system-status` | `{ service, version, timestamp, db:{ok}|{ok:false,missingReason:"db_error"}, intelWorker:{mode:"worker"\|"direct", binding:bool, url:string\|null}, sources:[v_source_health rows], staleSweep:{lastRunAt,status,updated}|{lastRunAt:null,missingReason:"never_run"\|"db_error"} }` | **Always 200** — a health *report*, never a probe failure. Safe to poll. |
| GET | `/app/kpis` | `{ generatedAt, outcomes:{value:{totalOutcomes, avgGrossProfit:n\|null, avgHoldDays:n\|null, lastOutcomeAt:iso\|null, byRegion:[v_outcome_summary rows]}|null, missingReason}, leads:{value:{total}|null, missingReason}, listings:{value:{normalizedTotal}|null, missingReason} }` | Blocks degrade independently. `503 {error:"db_error"}` only if the Supabase client can't be constructed. **No top-level `sellThroughRate`** — intentionally removed (tautologically 1.0 until acquisition-time outcome rows exist). |
| GET | `/app/import-batches?limit=` | `ImportBatch[]` = `{id, createdAt, weekLabel:string\|null, rowCount, importedCount, duplicateCount, rejectedCount, status:"pending"\|"importing"\|"complete"\|"failed", notes:string\|null}` | These are **outcome-import** batches (not historical-sales upload batches). `limit` default 20 / clamp 100 / invalid→20. `503 db_error` on client/query failure. |
| GET | `/app/historical-sales?limit=&year=&make=&model=&since=` | `HistoricalSale[]` = `{id, vin:string\|null, year, make, model, trim:string\|null, buyer:string\|null, buyerUserId:string\|null, acquisitionDate:isoDate\|null, saleDate:isoDate, acquisitionCost:n\|null, salePrice:n, transportCost:n\|null, reconCost:n\|null, auctionFees:n\|null, grossProfit:n\|null (STORED), sourceFileName:string\|null, uploadBatchId:uuid\|null, createdAt}` | Ordered `sale_date DESC`. `year` exact-match if finite; `make`/`model` exact-match verbatim (v1); `since` → `sale_date >= since`. `limit` same rule. `503 db_error` on client/query failure. ~18 weeks of real TAV data. |
| POST | `/app/mmr/vin` | `{mmrValue:number, confidence:"high"\|"medium"\|"low", method:"vin"\|"year_make_model"\|null}` **or** `{mmrValue:null, missingReason:"<code>"}` | Body `{vin:string 11–17, year?:int 1900–2100, mileage?:int 0–2_000_000}` (Zod). Malformed JSON → `400 invalid_json`; bad body → `400 invalid_body {issues:[…]}`. **Otherwise always 200** — unavailable/timeout/rate-limited/unconfigured intel worker → `{mmrValue:null, missingReason}`. `missingReason` ∈ `intel_worker_not_configured` \| `no_mmr_value` \| `intel_worker_timeout` \| `intel_worker_rate_limited` \| `intel_worker_unavailable`. Unexpected error → `503 internal_error`. **Cox MMR production credentials live as of 2026-05-13** — prod returns live wholesale figures; the prior sandbox caveat has been removed from the dashboard. |

Auth failure modes (mirror `/admin/*`): `APP_API_SECRET` unconfigured → `503 {ok:false,error:"app_auth_not_configured"}`; missing/wrong Bearer → `401 {ok:false,error:"unauthorized"}`. Unknown path/method under `/app/*` → `404 {ok:false,error:"not_found"}`. Every response is `application/json`.

**Hard backend constraints the frontend honours.** Browser never holds `APP_API_SECRET`, `ADMIN_API_SECRET`, `WEBHOOK_HMAC_SECRET`, `INTEL_WORKER_SECRET`, Cox credentials, Supabase service role key, or any HMAC secret. Browser never calls Cox/Manheim directly. Browser never calls Supabase directly (no public/RLS client in v1). VIN lookup goes only through `POST /api/app/mmr/vin` → Worker. Environment badge always visible. Secret *values* are never displayed — only checklist/status names. No fabricated numbers — `null` + `missingReason` is rendered as an explicit "unavailable" state. There is **no user/auth system in the backend**; `/app/*` is one shared Bearer, `leads` rows expose no owner. (ADR-0002 anticipates a future migration to Cloudflare Access for per-user authZ — v1 is designed to survive that without an API reshape.)

---

## 3. System architecture

```
                              Vercel (project root = /web)
 Browser (TAV staff)  ─────►  Next.js App Router app  ─────►  Cloudflare Worker `tav-aip`
   - React UI                   - middleware: Auth.js gate         /app/*  (Bearer APP_API_SECRET)
   - TanStack Query             - RSC pages (initial loads)            │
   - never sees secrets         - /api/app/[...path] proxy            ├─► Supabase Postgres (service role, in-Worker only)
                                  · injects Bearer APP_API_SECRET     │     - v_outcome_summary_global / v_outcome_summary
                                  · APP_API_BASE_URL per Vercel env   │     - leads, normalized_listings, historical_sales,
                                  · returns Worker JSON + status      │       import_batches, v_source_health, cron_runs, …
                                - /api/auth/* (Auth.js handlers)      │
                                - server-only env: APP_API_SECRET,    └─► tav-intelligence-worker  (Service Binding / public fetch)
                                  AUTH_SECRET, AUTH_GOOGLE_*                 - Cox/Manheim MMR  (Cox production live 2026-05-13)
```

Data flow per request type:
- **Initial page load** → RSC fetches via `web/lib/server/worker-fetch.ts` (server-side, can call the Worker directly with the secret, or call its own `/api/app/*` — we call the Worker directly server-side to skip a hop) → renders HTML with data already present.
- **Client refresh / polling / interactive lookups** → React component → TanStack Query → `fetch('/api/app/<path>')` → catch-all proxy → Worker. (Used for: `system-status` header badge poll; `historical-sales` filter changes; `mmr/vin` form submit.)
- **Mutations** — none in v1 (all v1 endpoints are reads except `mmr/vin`, which is a read-style POST). v2 mutations will add Server Actions or POST/PATCH route handlers behind the same proxy + a CSRF-safe pattern.

---

## 4. Repo layout (`/web`)

```
web/
  package.json              # own deps; pnpm; scripts: dev, build, start, lint, typecheck, test, test:e2e, test:contract
  pnpm-lock.yaml
  tsconfig.json             # strict
  next.config.ts
  tailwind.config.ts        # Tailwind v4
  .eslintrc.* / eslint.config.*
  .env.example              # documents every required env var (no values)
  .env.local                # gitignored; local overrides (e.g. APP_API_BASE_URL=http://localhost:8787)
  playwright.config.ts
  vitest.config.ts
  middleware.ts             # Auth.js gate — redirect unauthenticated to /signin; allow /api/auth/*, /signin, static
  app/
    layout.tsx              # html/body, theme provider (next-themes), QueryClientProvider, Toaster
    globals.css             # Tailwind layers + CSS-variable semantic tokens (light + dark)
    (auth)/
      signin/page.tsx       # unauthenticated state — "Sign in with Google" + domain notice + denied state
    (app)/                  # authenticated shell group
      layout.tsx            # AppShell: sidebar nav + topbar (global search stub, env badge, theme toggle, user menu)
      page.tsx              # → redirect to /dashboard
      dashboard/page.tsx            # Page 1 — KPI Dashboard (RSC: /app/kpis + /app/system-status)
      mmr-lab/page.tsx              # Page 3 — VIN / MMR Lookup Lab
      historical/page.tsx           # Page 4 — TAV Historical Data
      admin/page.tsx                # Page 9 — Admin / Integrations (RSC: /app/system-status)
      # v1.5 (added later, gated on new endpoints):
      # ingest/page.tsx              # Page 6 — Ingest Monitor
      # import-batches/page.tsx      # Import-Batches operational view
      # v2 stubs intentionally NOT created in v1 (no faked pages).
    api/
      app/[...path]/route.ts        # the catch-all Worker proxy (GET/POST/…); injects Bearer
      auth/[...nextauth]/route.ts    # Auth.js
  lib/
    app-api.ts              # thin typed client: getKpis(), getSystemStatus(), listHistoricalSales(filter), listImportBatches(limit), postMmrVin(body) — all hit /api/app/* ; return discriminated unions
    server/
      worker-fetch.ts       # server-only: fetch(`${APP_API_BASE_URL}/app/...`, {headers:{Authorization:`Bearer ${APP_API_SECRET}`}}) ; used by RSC + the proxy route ; never imported by a client component
    env.ts                  # parse + validate process.env at boot (zod): APP_API_BASE_URL, APP_API_SECRET, AUTH_*; derive ENV_LABEL from APP_API_BASE_URL host
    auth.ts                 # Auth.js config: Google provider, signIn callback enforcing email domain, session strategy
    query.ts                # QueryClient factory + shared query keys + default staleTime/refetch settings
    format.ts               # money/number/date/percent formatters; null-safe (renders "—" / "Unavailable" for null)
  components/
    ui/                     # vendored shadcn components (button, card, table, tabs, dialog/drawer, dropdown-menu, badge, skeleton, input, select, sonner toaster, …)
    app-shell/              # Sidebar, Topbar, EnvBadge, ThemeToggle, UserMenu, GlobalSearch (stub in v1)
    data-state/             # Loading (Skeleton variants), Empty, ErrorPanel (with retry), Unavailable (missingReason → human copy), PendingBackend (for not-yet-built metrics)
    data-table/             # DataTable<T> wrapping TanStack Table: sorting, column filters, pagination, row selection (v2), sticky header, empty/error/loading slots, density toggle
    kpi/                    # KpiCard, KpiGrid, StatPill, TrendBadge
    charts/                 # Recharts wrappers: BarChartCard, LineChartCard, AreaChartCard, HistogramCard — all consume a typed series + handle empty/insufficient-data
    status/                 # StatusPill (healthy/review/error/neutral semantic), HealthDot, CaveatBanner
  test/
    msw/                    # handlers + fixtures mirroring docs/APP_API.md (incl. null+missingReason, 503, 401)
    unit/ …
    e2e/ …                  # Playwright specs (§13)
    contract/ …             # test:contract — real staging Worker via the proxy
  .github/                  # (workflow lives at repo root .github/workflows/web-ci.yml — see §11/§14)
```

`/web` has **no dependency on the Worker's `package.json`** and vice-versa. The only contract between them is HTTP (`docs/APP_API.md`). Keeping `docs/APP_API.md` and `web/test/msw/` / `web/lib/app-api.ts` in sync is a documented maintenance task (any `/app/*` change updates all three).

---

## 5. Auth (Auth.js + Google, domain-locked)

- **Provider:** Google OIDC. `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` per Vercel env. `AUTH_SECRET` per env (used to encrypt the session cookie/JWT).
- **Domain restriction:** `signIn` callback rejects any account whose verified email domain ≠ `ALLOWED_EMAIL_DOMAIN` (`texasautovalue.com`). Rejected sign-in → bounced to `/signin?error=AccessDenied` which renders an explicit "Your account isn't authorised for this dashboard — sign in with your Texas Auto Value Google account" message. (Optionally also pass Google's `hd=texasautovalue.com` hint to pre-filter the account chooser; the server-side domain check is the real gate.)
- **Session:** encrypted cookie session (Auth.js default JWT strategy; no DB needed since there's no user store in v1). Session carries `{ email, name, picture }` only.
- **Gate:** `middleware.ts` runs on all routes except `/api/auth/*`, `/signin`, `/_next/*`, static assets, and `/api/app/*` *only when already authenticated* (unauthenticated `/api/app/*` → 401 JSON, never a redirect, so client fetches fail cleanly). Unauthenticated page request → redirect to `/signin?callbackUrl=…`.
- **Unauthenticated state:** `/signin` — centred card, TAV wordmark, "Sign in with Google" button, the domain notice, and (when `error=AccessDenied`) the denied message. No app chrome leaks behind it.
- **In-app identity surfacing:** Topbar `UserMenu` shows name + email + avatar + "Sign out". **Admin / Integrations page shows the signed-in user's email** (per acceptance criteria) — and nothing more about the user. No roles, no admin/non-admin distinction in v1 (every authenticated TAV user sees everything).
- **Secrets:** all Auth.js secrets are server-only Vercel env vars; never in the client bundle, never logged.
- **v2 forward path:** roles, `profiles`/`users` table, lead ownership, per-user audit. If `/app/*` moves to Cloudflare Access, the Next.js server can forward the verified identity (CF Access JWT or the Auth.js session email) as an additional header; the catch-all proxy is the single place that changes.

---

## 6. API proxy & typed client

### 6.1 Catch-all proxy — `web/app/api/app/[...path]/route.ts`
- Exports `GET`, `POST` (and `PUT`/`PATCH`/`DELETE` reserved for v2; in v1 only `GET` + `POST /app/mmr/vin` are reachable, but the handler is generic).
- For an incoming request to `/api/app/<segments...>?<query>`:
  1. Confirm the caller has an authenticated Auth.js session (else `401 {ok:false,error:"unauthorized"}` — same shape the Worker uses).
  2. Build `target = `${env.APP_API_BASE_URL}/app/${segments.join('/')}${search}``.
  3. Forward the method, the JSON body (if any), and a minimal header allowlist; **add** `Authorization: Bearer ${env.APP_API_SECRET}` and `Content-Type: application/json`. Do **not** forward the browser's cookies or `Authorization` to the Worker.
  4. `fetch(target)` with a sane timeout (e.g. 8s for reads, 10s for `mmr/vin` since the Worker itself caps the intel call at 5s) and no retry at the proxy layer (the Worker already classifies retryability; the client decides whether to retry).
  5. Stream the Worker's body back with the **same status code** and `Content-Type: application/json`. On a network/timeout failure reaching the Worker, return `502 {ok:false,error:"upstream_unreachable",retryable:true}` (a shape the client treats like a transient `503`).
- The proxy does **no** response validation or transformation — it's a dumb, secure pass-through. (Validation/normalisation lives in `lib/app-api.ts`, see below — this keeps the proxy tiny and the contract logic in one typed place.)
- Logs: request method/path/status/duration only. **Never** logs the body, the `Authorization` header, or any env value.

### 6.2 Typed client — `web/lib/app-api.ts`
- Pure functions the React layer calls (via TanStack Query in client components, or directly in RSC through `lib/server/worker-fetch.ts` which shares the same parsing):
  - `getSystemStatus(): Promise<SystemStatus>`
  - `getKpis(): Promise<Kpis>`
  - `listHistoricalSales(filter: HistoricalSalesFilter): Promise<HistoricalSale[]>`
  - `listImportBatches(limit?: number): Promise<ImportBatch[]>`
  - `postMmrVin(body: MmrVinRequest): Promise<MmrVinResult>`
- Each: `fetch('/api/app/<path>')`, parse JSON, then **validate against a Zod schema mirroring `docs/APP_API.md`** and **normalise into a discriminated union** the UI consumes uniformly:
  - `{ status: 'ok'; data: T }`
  - `{ status: 'unavailable'; reason: string }` — for `{value:null,missingReason}` blocks and for `mmr/vin`'s `{mmrValue:null,missingReason}`
  - `{ status: 'error'; code: string; retryable: boolean }` — for `{ok:false,error}` / non-2xx (`503`, `502 upstream_unreachable`, `401`); `400 invalid_body`/`invalid_json` map to `retryable:false`
- `system-status` is special: it's always `200` and is itself a health report — the client returns `{status:'ok', data}` and the UI inspects `data.db.ok` / `data.staleSweep` / `data.intelWorker` to decide the badge colour. There's no "unavailable" status for it.
- A small `missingReasonCopy(reason): string` map turns codes into human strings ("MMR worker timed out — try again", "MMR not configured for this environment", "No data yet", …) used by `<Unavailable/>`.
- TanStack Query keys + defaults live in `lib/query.ts`: e.g. `['system-status']` with `refetchInterval: 30_000`, `['kpis']` `staleTime: 60_000`, `['historical-sales', filter]`, `['mmr-vin']` mutation (no caching of lookups in v1).

### 6.3 Server-side fetch — `web/lib/server/worker-fetch.ts`
- Server-only module (guarded so importing it from a client component is a build error). RSC pages use it for initial loads to avoid the browser→Next→Worker round-trip on first paint. It calls `${APP_API_BASE_URL}/app/...` directly with the Bearer header, then runs the *same* Zod-parse + discriminated-union normalisation as `app-api.ts` (shared parser module).

---

## 7. Environment config & deployment targets

### 7.1 Vercel env var matrix

| Var | Production | Preview | Development (local) | Scope |
|---|---|---|---|---|
| `APP_API_BASE_URL` | `https://tav-aip-production.rami-1a9.workers.dev` | `https://tav-aip-staging.rami-1a9.workers.dev` | `https://tav-aip-staging.rami-1a9.workers.dev` (override in `web/.env.local`, e.g. `http://localhost:8787`) | server-only |
| `APP_API_SECRET` | prod Worker's `APP_API_SECRET` | staging Worker's `APP_API_SECRET` | staging Worker's `APP_API_SECRET` | **server-only secret** |
| `AUTH_SECRET` | (prod) | (preview) | (dev) | server-only secret |
| `AUTH_GOOGLE_ID` | prod OAuth client | preview/staging OAuth client (or same client with extra redirect URI) | dev OAuth client | server-only |
| `AUTH_GOOGLE_SECRET` | … | … | … | server-only secret |
| `AUTH_URL` / `NEXTAUTH_URL` | `https://<prod-domain>` | Vercel preview URL pattern | `http://localhost:3000` | server-only |
| `ALLOWED_EMAIL_DOMAIN` | `texasautovalue.com` | `texasautovalue.com` | `texasautovalue.com` | server-only (or non-secret) |

Notes: **`APP_API_BASE_URL` is the Worker origin only** — the proxy appends `/app`. Never include `/app` in the value. There is **no `NEXT_PUBLIC_*` variant of any of these** — nothing here is allowed in the browser bundle. `web/lib/env.ts` validates them at boot and fails fast if any required var is missing or malformed.

### 7.2 Branch → environment mapping (Vercel)
- `main` → **Production** deployment (→ prod Worker).
- Any PR / non-`main` branch → **Preview** deployment (→ staging Worker).
- Local `pnpm dev` → **Development** (→ staging Worker by default; `.env.local` may point at a locally-running `wrangler dev` of the Worker at `http://localhost:8787`, with that local Worker's `APP_API_SECRET` in its `.dev.vars`).
- **No runtime environment switching. No admin dropdown to flip staging/prod.** A given deployment talks to exactly one Worker, fixed by its env vars.

### 7.3 Environment badge
- `web/lib/env.ts` derives `ENV_LABEL` from the `APP_API_BASE_URL` host:
  - host contains `tav-aip-production` → **`PRODUCTION`** (high-contrast accent — amber/red ring per the palette; clearly the "you are touching the real system" badge)
  - host contains `tav-aip-staging` → **`STAGING`** (blue/neutral accent)
  - `localhost` / `127.0.0.1` / anything else → **`LOCAL`** (muted accent)
- Rendered in the topbar, always visible, on every page. (This is also the signal that backs the v2 "production actions need confirmation states" rule — a confirm modal in v2 will read `ENV_LABEL` and harden its copy when `PRODUCTION`.)

---

## 8. Design system, theming, shared components

### 8.1 Aesthetic
Production-like **internal command center / dealership deal desk** — high-end CRM × inventory-valuation cockpit. Dense but polished: compact cards, tables, filters, tabs, drawers, status pills, charts. **No marketing landing page** — the first authenticated screen is the operational dashboard at `/dashboard`. No hero sections, no cartoon visuals, no playful consumer styling, no purple-heavy gradients. Desktop-first. Light theme is the primary identity; dark mode is polished-enough-to-ship but does not drive the look. The `frontend-design` skill guides the build; the `emil-design-eng` skill is the polish/animation/spacing/interaction-detail pass on top (subtle motion only — focus transitions, drawer slides, skeleton shimmer; nothing flashy).

### 8.2 Semantic color tokens (CSS variables in `globals.css`, light + dark)
Defined once as semantic names — components never reference raw hex/Tailwind palette colours directly:
- Surfaces: `--surface-base` (white / near-black-charcoal), `--surface-raised` (light-gray card / one step up), `--surface-sunken`, `--border-subtle`, `--border-strong`.
- Text: `--text-primary` (deep navy / near-white), `--text-secondary` (slate), `--text-muted`.
- Status (the operational semantics): `--status-healthy` (green — healthy state, strong opportunities, "Strong Buy"), `--status-review` (amber — review/warnings), `--status-error` (red — errors and **"Pass"** decisions), `--status-neutral` / `--accent-action` (blue — neutral system actions, links, primary buttons). Each with a `-bg` (subtle tint for pills) and `-fg` pair, contrast-checked AA in both themes.
- Env-badge accents reuse `--status-*` (PRODUCTION = amber/red ring, STAGING = blue, LOCAL = muted).
Tailwind v4 maps these to utility classes (`bg-surface-raised`, `text-primary`, `text-status-healthy`, …). `next-themes` toggles a `dark` class on `<html>`; the variables swap.

### 8.3 Shared components built in Phase 1
- **App shell** — `Sidebar` (icon + label nav; collapses to icons on tablet; off-canvas on mobile), `Topbar` (left: page title / breadcrumb; centre: `GlobalSearch` *stub* in v1 — a disabled-with-tooltip "Search coming soon" input, or omitted; right: `EnvBadge`, `ThemeToggle`, `UserMenu`).
- **Data-state primitives** — every data region renders exactly one of: `<Loading/>` (Skeleton matching the region's shape — card grid, table rows, chart box), `<Empty/>` ("No data yet" with optional hint/action), `<ErrorPanel/>` (message from the discriminated union + a Retry button when `retryable`), `<Unavailable reason=/>` (for `missingReason` — human copy + "this metric isn't computed yet" tone), `<PendingBackend/>` (for v1's many not-yet-built KPI tiles — a clearly-styled "Pending backend" placeholder, never a number). No region is ever blank, and **no fake numbers appear in normal mode**.
- **`DataTable<T>`** — TanStack Table wrapper: column sorting, per-column filters (text/select/range), pagination (page-size selector), sticky header, density toggle (comfortable/compact), row selection scaffolding (used in v2), and the data-state slots above for empty/error/loading. Production-grade by default — every table page just supplies columns + a fetcher.
- **KPI** — `KpiCard` (label, value with null-safe formatter, optional trend badge, optional sparkline, optional `Unavailable`/`PendingBackend` state), `KpiGrid` (responsive 2/3/4-col), `StatPill`, `TrendBadge`.
- **Charts** — Recharts wrappers (`BarChartCard`, `LineChartCard`, `AreaChartCard`, `HistogramCard`): typed series in, themed styling (uses the semantic tokens), built-in empty / insufficient-data states (e.g. "needs ≥ N points"), responsive container, accessible (titled, with a data-table fallback toggle for screen readers where practical).
- **Status** — `StatusPill` (maps a semantic status → token colours + label), `HealthDot`, `CaveatBanner` (the persistent Cox-sandbox notice on Admin; reusable for other standing caveats).
- **Drawer** (shadcn dialog/drawer) — right-side detail panel pattern (used heavily in v1.5/v2; in v1 used for e.g. the "byRegion breakdown" detail on the dashboard, and the raw-MMR-payload viewer on the MMR Lab result panel).
- **Toaster** (sonner) — transient success/error toasts; error banners for page-level failures.
- **Confirmation modal** — generic confirm dialog; in v1 there are no destructive/production mutations, so it's only scaffolding, but it's built so v2 inherits the "production actions need confirmation" pattern (modal copy hardens when `ENV_LABEL === 'PRODUCTION'`).

---

## 9. v1 pages — detailed specs

All four v1 pages: RSC fetches initial data server-side; client components use TanStack Query for refresh; every data region uses the data-state primitives; nothing is faked.

### Page 1 — KPI Dashboard (`/dashboard`) — the landing page after login
**Data sources (live):** `GET /app/kpis`, `GET /app/system-status`.

**Top row — live KPI cards** (each null-safe; `Unavailable` if `missingReason`):
- Total outcomes — `kpis.outcomes.value.totalOutcomes`
- Avg gross profit — `kpis.outcomes.value.avgGrossProfit` (currency; `—`/Unavailable if null)
- Avg hold days — `kpis.outcomes.value.avgHoldDays`
- Last outcome at — `kpis.outcomes.value.lastOutcomeAt` (relative + absolute)
- Leads (total) — `kpis.leads.value.total`
- Normalized listings (total) — `kpis.listings.value.normalizedTotal`
- System health — derived from `system-status` (`db.ok`, `intelWorker.mode`/`binding`, `staleSweep`) → a single `StatusPill` (Healthy / Degraded / Down) with a popover detailing each subsystem; "Last stale sweep: <relative> (<status>, <updated> rows)" or "never run".

**Charts (built from live data):**
- **Gross by region** — bar chart from `kpis.outcomes.value.byRegion` (each row carries region + avg gross + counts; rows passed through verbatim from `v_outcome_summary`). Empty/Unavailable if `byRegion` empty or `outcomes` unavailable.
- **Avg hold days by region** — bar chart from the same `byRegion` rows.
- **Outcomes / gross trend** — `/app/kpis` gives only a single global rollup (no per-period history), so this chart is **derived client-side from `/app/historical-sales`** (sum/avg `grossProfit` bucketed by `saleDate` month) — real TAV data, no new endpoint, and the bucketing helper is shared with Page 4's "Gross by month" chart. **Important caveat (rendered on the chart):** it reflects only the historical-sales rows actually returned — i.e. the endpoint's `limit`/filter slice — **not** a full-database aggregate; the chart label reads "from the returned TAV historical-sales sample" and the active `limit`/filters are visible. A proper aggregated historical-sales trend endpoint (server-side bucketing over the whole table) is in the API-gap register (§11) for later; until then this is the honest, useful v1 version. Empty/insufficient-data state if too few rows/months.

**"Future metrics" section — explicitly labelled "Pending backend"**, rendered as a clearly-styled grid of `PendingBackend` tiles (titles only, no numbers), so stakeholders see what's coming without anything looking real: listings ingested today/this week, listings processed, rejected listings, leads created, Strong Buy / Review / Pass counts, avg spread vs MMR, avg TAV historical gross, avg front/back gross, total expected opportunity value, MMR lookup success rate, MMR cache hit rate, Cox/Manheim worker status (this one *can* show real state from `system-status.intelWorker` — promote it out of Pending), Apify ingest status (partly derivable from `system-status.sources`), Supabase/API health (live from `system-status.db`), latest weekly sales upload status, top regions/makes/models by opportunity, aging leads, contacted vs uncontacted, bought/passed units, win rate, avg days listing-seen→decision, avg days-to-sell. (The few that *are* derivable from `system-status` get promoted to live tiles; the rest stay `PendingBackend`.)

**Explicitly NOT shown:** any top-level `sellThroughRate` (intentionally removed from `/app/kpis`).

**States:** each card/chart has its own loading/empty/error/unavailable state; the page never shows a global spinner-of-doom — it streams in.

**D1 — resolved (2026-05-11):** option (b) — the "Outcomes / gross trend" chart is the client-side monthly `grossProfit` trend derived from `/app/historical-sales`, labelled as based on the returned historical-sales sample (bounded by the endpoint's `limit`/filter behaviour), with a follow-up API gap logged for a real aggregated trend endpoint.

### Page 3 — VIN / MMR Lookup Lab (`/mmr-lab`)
**Data source (live):** `POST /app/mmr/vin` (body `{vin, year?, mileage?}`). Cox MMR production credentials went live 2026-05-13 — the inline sandbox notice that mirrored the Admin caveat was removed. The heuristic "not the production buy-box score" recommendation label remains.

**Form (left / top):**
- VIN — required, 11–17 chars, trimmed; client-side length + charset hint before submit (the Worker re-validates with Zod and returns `400 invalid_body` with issues if it's bad — surface those inline).
- Mileage — optional, integer 0–2,000,000.
- (Year — optional, integer 1900–2100; the Worker accepts it but the documented body is `{vin, year?, mileage?}` — include it.)
- Asking price — optional, **client-side only** (the endpoint doesn't take it; we use it locally to compute the spread/recommendation). Currency input.
- Optional source / optional notes — **client-side only**, not sent (the endpoint doesn't accept them). Kept for the user's own scratch context; not persisted in v1 (no persistence endpoint).
- Submit → TanStack Query mutation → `/api/app/mmr/vin`.

**Result panel (right / below):**
- VIN (echoed), and Year / Make / Model / Trim **only if returned** — the lean `/app/mmr/vin` response is `{mmrValue, confidence, method}` and does **not** include YMM/trim today. So in v1 those fields show "—" / "not returned by lookup" unless we extend the endpoint (the contract notes distribution/extra fields *can* be added later via `valuation/valuationResult.fromMmrResult`). Treat YMM/trim display as **`PendingBackend`** within the result panel for now.
- MMR value — currency; `confidence` pill (high/medium/low → semantic colours); `method` ("vin" / "year_make_model" / "—"); timestamp (client receipt time); if `{mmrValue:null,missingReason}` → `<Unavailable reason=>` with the human copy (timeout / rate-limited / unavailable / not-configured / no-value) and a Retry.
- **Deal spread** — if asking price entered and `mmrValue` present: `asking − mmr` (and `mmr − asking` framed as "headroom") with a clear sign + colour (positive headroom green, overpriced red).
- **Acquisition recommendation** — **Strong Buy / Review / Pass**, computed client-side in v1 from a transparent rule over (spread, confidence). The exact thresholds are a small `lib/recommendation.ts` documented in the code; v1's recommendation is explicitly labelled "heuristic — not the production buy-box score" (the real buy-box scoring lives in the backend `scoring/` layer and isn't exposed via `/app/*` yet). When asking price isn't entered, the recommendation reads "Enter an asking price for a recommendation".
- **Raw MMR payload viewer** — collapsed by default; in v1 it just shows the lean `{mmrValue, confidence, method}` JSON (there's no richer payload to show until the endpoint is extended).
- **Known preview VIN** — `1FT8W3BT1SEC27066` (2025 Ford F-350 Lariat, mileage 50000, latest smoke MMR ~68600, confidence high, method vin) is offered as a one-click "Fill example" button — **clearly labelled "example / test input"**, never presented as production data, never hardcoded as a result.

**TAV Historical Data comparison panel** (on this page, below the result): UI for similar historical sales by year/make/model/trim, avg/median sold price, avg acquisition cost, avg front/back/total gross, days-to-sell, similar-units-sold count, last sold date, regional performance, confidence-by-sample-size. **Reality:** `/app/historical-sales` supports exact-match `year`/`make`/`model` filters but returns thin rows (`salePrice`, `acquisitionCost`, cost components, `grossProfit` — **no front/back split, no days-to-sell, no region/store, no mileage, no stock#**) and **no server-side aggregates**. So in v1 this panel: queries `/app/historical-sales?year=&make=&model=` (no trim filter server-side — filter trim client-side from results), computes the *available* aggregates client-side (count, last sold date, avg/median sale price, avg acquisition cost, avg grossProfit), shows them, and renders the rest (front/back gross split, days-to-sell, regional performance) as **`PendingBackend`** with a note pointing at the API-gap register (§11). It is honest about sample size (n shown; "low confidence — n<5" style note).

### Page 4 — TAV Historical Data (`/historical`)
**Data source (live):** `GET /app/historical-sales?limit=&year=&make=&model=&since=`. ~18 weeks of real TAV sales.

**Filters (server-side where the endpoint supports it; client-side for the rest):**
- Sale date / since — `since` (date picker → `sale_date >= since`). (No "to" bound server-side; apply an upper bound client-side if needed.)
- Year / Make / Model — exact-match `year`/`make`/`model` query params. (For a friendlier UX, populate Make/Model select options from the distinct values present in a first unfiltered page, or accept free text — exact-match means typos return nothing, so a select is safer.)
- Trim / VIN / mileage range / gross range / days-to-sell / region / store / source — **client-side only** filters over the returned rows for the ones the row shape supports (trim, vin presence, gross range from `grossProfit`); the rest (mileage, days-to-sell, region, store, source) are **not in the row shape** → those filter controls are shown disabled with a "not available — see API gaps" tooltip (or omitted in v1; recommendation: omit, list them in the gap register, keep the v1 filter bar honest).
- `limit` is best-effort (server clamps to 100); v1 uses a "Load more / page size" control that bumps `limit`; true server-side pagination (offset/cursor) is an API gap — note it.

**Table columns (v1 = what the row shape actually has):**
Sale date · VIN (or "—") · Year · Make · Model · Trim (or "—") · Acquisition cost · Sale price · Transport cost · Recon cost · Auction fees · **Gross profit** (STORED) · Acquisition date · Buyer · Source file · Upload batch (id, linkable once an import-batches view exists).
Columns the brief asked for that **don't exist in the data** → not shown, listed in the gap register: Stock number · Mileage · Front gross · Back gross · Total gross (we only have a single `grossProfit`) · Days to sell · Region/store · Source (channel). A small "Columns: showing what TAV's data currently includes — more after schema work" note sits above the table.

**Charts (v1 = derivable from the rows):**
- **Gross by month** — `grossProfit` summed/avg by `saleDate` month (this is the helper Page 1's D1(b) trend chart would reuse).
- **Gross by make/model** — bar chart, top N segments by `grossProfit`.
- **Volume by month** — count of sales by `saleDate` month.
- **Sale-price trend** — avg `salePrice` by month (retail-ish proxy; labelled honestly — it's TAV's sale price, not market retail).
- **Gross distribution histogram** — `grossProfit` buckets.
Charts the brief listed that **need data we don't have** → `PendingBackend`: days-to-sell by segment, aging/velocity trend, wholesale-to-retail spread (no wholesale figure in the row), best/worst segments *by days-to-sell* (we can do best/worst by gross). Each absent chart shows a one-line "needs <field> — pending schema/API work".

**Drill-in:** clicking a row opens a `Drawer` with the full `HistoricalSale` record (all fields, formatted) — no extra fetch needed (we already have the row).

**States:** table + each chart get loading/empty/error states; if `/app/historical-sales` returns `503 db_error`, the page shows `ErrorPanel` with Retry.

### Page 9 — Admin / Integrations (`/admin`)
**Data source (live):** `GET /app/system-status` (always 200).

**Sections:**
- **Signed-in user** — the Auth.js session email (and name). Nothing else about the user.
- **Environment** — the `ENV_LABEL` badge, large and explicit ("You are connected to **PRODUCTION** / **STAGING** / **LOCAL**"), plus the `APP_API_BASE_URL` host it derives from (the *host*, not the secret).
- **API health** — `system-status.db.ok` → Healthy / `db_error`. `service`, `version`, `timestamp`.
- **Intelligence worker** — `system-status.intelWorker`: `mode` ("worker" / "direct"), `binding` (Service Binding present? yes/no), `url` (the configured intel-worker URL, or "none"). A `StatusPill` summarising "MMR routed via worker, service binding active" vs degraded.
- **Cox / Manheim status** — derived from `intelWorker`. The persistent sandbox `CaveatBanner` was removed on 2026-05-13 (Cox production MMR credentials live). No banner is rendered for Cox vendor status today; if Cox capacity ever rolls back to sandbox, restore a caveat then.
- **Cox environment** — explicit label: **Production-enabled** (current, as of 2026-05-13). v1 still has no machine-readable Cox-environment flag in `system-status`; the label is operator-managed configuration state rendered as static copy. Backend gap: add a `system-status.cox.environment` field so this can become a runtime signal.
- **Source-run health** — a small table from `system-status.sources` (rows of `v_source_health`): per-source last run, counts, status. Empty state if `db.ok` is false (the Worker returns `sources:[]` then).
- **Stale sweep** — `system-status.staleSweep`: "Last run <relative> — <status> — <updated> rows touched", or "Never run" (`missingReason:"never_run"` — expected right after the migration until the first daily cron fires) or "Unavailable" (`db_error`).
- **Secrets checklist (names only, never values)** — a static-but-honest list of the secrets the *backend* depends on (`APP_API_SECRET`, `ADMIN_API_SECRET`, `WEBHOOK_HMAC_SECRET`, `INTEL_WORKER_SECRET`, Manheim creds, Twilio creds, Supabase service role key) shown as a checklist of *names* with a "configured server-side" affordance. v1 can only *prove* `APP_API_SECRET` is set (because a 401/503 from `/app/*` would mean it isn't — and we got here, so it is) and infer intel-worker wiring from `system-status`; the rest are listed as "managed as Cloudflare Worker secrets — not visible here" (we never echo values, and the frontend has no way to read backend secrets — that's correct and intentional).
- **Feature flags** — `HYBRID_BUYBOX_ENABLED` and `MANHEIM_LOOKUP_MODE` are backend `[vars]`, not exposed via `/app/*`. v1: show `MANHEIM_LOOKUP_MODE` (it *is* surfaced as `system-status.intelWorker.mode`); `HYBRID_BUYBOX_ENABLED` is `PendingBackend` (or add it to `system-status` as a tiny gap-closing change — noted in §11).
- **"Test connection" buttons** — v1: a single safe "Refresh system status" button (re-fetches `/app/system-status`). No other test buttons in v1 (anything that would hit Cox/Manheim or write anything is out of scope — the brief says "if safe", and only the status refetch is unambiguously safe).
- **Last successful MMR lookup / last ingest / last sales upload / error-log summary** — not exposed via `/app/*` today → `PendingBackend` (noted in §11; `system-status.sources` gives *some* of the "last ingest" picture per source).

---

## 10. Full 9-page product vision (designed; v1 builds only pages 1/3/4/9)

The design doc documents all nine so the implementation phases and the API-gap register are complete. Pages 2/5/6/7/8 are **not built and not faked in v1** — no nav entries, no stub pages — but their layouts and data needs are specified here so v1.5/v2 plans can pick them up directly.

- **Page 2 — Acquisition Workflow** (`/acquisition`, v2): an operational control-room checklist, 5 steps — (1) Ingest listings (source, latest run id, processed/rejected counts, status), (2) Normalize & dedupe (normalized title, YMM/trim, VIN-when-available, duplicate group, identity key), (3) Value vehicle (Cox/Manheim MMR, TAV historical average, asking price, spread, confidence), (4) Score opportunity (Strong Buy/Review/Pass, score breakdown, reason codes, expected front/back/total gross, days-to-sell expectation), (5) Review lead (assign owner, notes, mark contacted/bought/passed). **Needs new `/app/*`:** ingest-run reads, normalized-listing reads, candidate/valuation reads, **buy-box score reads** (currently `scoring/` is backend-internal), and **lead mutations** (assign/notes/status) — none exist under `/app/*`. Big v2 backend effort. No lead-ownership concept exists in the backend at all.
- **Page 5 — Weekly Sales Upload** (`/sales-upload`, v2): drag-drop CSV/XLSX, file-metadata preview, first-rows preview, column auto-detect, column-mapping UI, required-field validation, warnings/errors-before-import, import progress, import summary; batch history. Required fields: sale date, VIN or stock#, year, make, model, mileage, sale price, acquisition cost/cost basis, front gross, back gross, total gross, region/store. **Reality:** *there is no historical-sales upload endpoint.* `/admin/import-outcomes` imports **purchase outcomes**, a different concept; `/app/import-batches` lists **outcome-import** batches. A real `tav.historical_sales` ingestion endpoint (plus a `sales_upload_batches` table — the brief lists `sales_upload_batches` as a separate entity from `import_batches`) does not exist. **Needs:** a new upload/ingest endpoint for historical sales (likely under `/admin/*` for the write, with a narrowed server-side proxy in `/web`, or a new `/app/*` write — to be decided in the v2 plan), schema for `sales_upload_batches`, and a richer `historical_sales` row (front/back gross split, days-to-sell, mileage, stock#, region/store, source). Substantial backend work.
- **Page 6 — Ingest Monitor** (`/ingest`, **v1.5**): table of ingest runs — run id, source, region, started-at, item/processed/rejected counts, leads created, MMR lookups, MMR failures, status, error count; run-detail drawer — raw payload summary, normalized listings, rejected rows, schema-drift warnings, MMR lookup events, created leads, event timeline, worker transport, error details, retry events. **Needs new `/app/*`:** the data exists (`source_runs`, `raw_listings`, `schema_drift_events`, etc.) but isn't exposed. v1.5 ships this after we add **`GET /app/ingest-runs`** (list, with the summary fields) and **`GET /app/ingest-runs/:id`** (detail). These are read-only thin wrappers in the spirit of the existing `/app/*` endpoints — small, well-scoped, planned in the v1.5 backend slice.
- **Page 7 — Lead Review** (`/leads`, v2): the acquisition lead queue — table/grid with vehicle title, VIN, YMM/trim, mileage, asking price, Cox/Manheim MMR, TAV historical average, spread vs MMR, expected front/back/total gross, days-to-sell estimate, confidence, region, source, first/last seen, lead status, assigned user; row actions — mark reviewed/contacted/bought/passed, archive, assign owner, open listing URL, add note, export CSV, bulk update status. **Needs new `/app/*`:** lead list + detail reads, and **lead mutations** (status, assignment, notes) — none exist; no owner/assignment model in the backend. v2.
- **Page 8 — Vehicle Detail** (`/vehicles/:id`, v2): vehicle identity header, VIN card, price card, MMR valuation card, TAV historical data card, spread analysis, recommended max bid, expected front/back/total gross, days-to-sell prediction, source listing card, market comparison, sightings timeline, notes & activity, raw MMR payload (collapsed), duplicate group / matching listings, lead-scoring breakdown, decision history. **Needs new `/app/*`:** a composite vehicle-candidate/lead read joining `vehicle_candidates`, `valuation_snapshots`, `vehicle_enrichments`, `raw_listings`, `duplicate_groups`, `buy_box_score_attributions`, and the lead activity/decision history (which doesn't exist as a stored concept yet). v2.

---

## 11. API-gap register (what new backend work each unbuilt page implies)

| Need | Used by | Status today | Proposed shape |
|---|---|---|---|
| Aggregated historical-sales trend (server-side `grossProfit`/volume bucketed by month over the *whole* table) | Page 1 (gross-trend chart), Page 4 ("Gross by month"/"Volume by month") | **v1 ships a client-side derivation over the returned `/app/historical-sales` sample** (bounded by `limit`/filters — labelled as a sample, not a full aggregate). The full-table aggregate isn't exposed. | later: `GET /app/historical-sales/trend?bucket=month` (or fold into the aggregates endpoint below) — server computes the trend over the entire `tav.historical_sales` table so the chart stops being limit-bounded |
| `GET /app/ingest-runs` (list) + `GET /app/ingest-runs/:id` (detail) | Page 6 (Ingest Monitor) — **v1.5** | data exists (`source_runs`, `raw_listings`, `schema_drift_events`), not exposed | thin read wrappers under `/app/*`, same conventions as existing endpoints; **planned in the v1.5 backend slice** |
| Import-batches detail / link target | Import-Batches view — **v1.5** | `GET /app/import-batches` lists; no per-batch detail | optional `GET /app/import-batches/:id` (or just deep-link to the list, filtered) — small |
| Richer `historical_sales` row: front gross, back gross, total gross (vs single `grossProfit`), days-to-sell, mileage, stock number, region/store, source channel | Page 4 (columns/filters/charts), Page 3 (historical comparison panel) | not in the table / not in the row shape | schema migration on `tav.historical_sales` + extend `listHistoricalSales` mapping + extend `/app/historical-sales` query params (range filters, server-side pagination) |
| Server-side pagination on list endpoints | Pages 4, 6, 7 | `limit`-only, clamp 100, best-effort | add `offset`/`cursor` to `/app/historical-sales` (and the new ingest-runs endpoint) |
| Historical-sales aggregates endpoint | Page 3 (comparison), Page 1, Page 4 | none — frontend computes from rows in v1 | later: `GET /app/historical-sales/aggregate?year=&make=&model=&trim=` returning count/avg/median sale price, avg acquisition cost, avg front/back/total gross, avg days-to-sell, last sold date, regional breakdown, sample-size confidence |
| MMR result enrichment: YMM/trim, distribution fields (`wholesaleClean`, etc.) | Page 3 (result panel, raw payload) | `/app/mmr/vin` returns lean `{mmrValue, confidence, method}` | extend the response via `valuation/valuationResult.fromMmrResult` (already noted as a planned option in the contract) |
| Lead list/detail reads + lead mutations (status, assignment, notes) + an owner/assignment model | Pages 2, 7, 8 | none under `/app/*`; no owner concept in the backend at all | v2: new `/app/*` lead endpoints (reads) + mutation endpoints (likely needing per-user identity → ties to the ADR-0002 Cloudflare-Access path) + a `lead_assignments` / `users`/`profiles` schema |
| Buy-box score reads (Strong Buy/Review/Pass + breakdown + reason codes + expected gross) | Pages 1, 2, 7, 8 | `scoring/` is backend-internal; `buy_box_score_attributions` exists but isn't exposed | v2: `GET /app/leads/:id/score` (or include on the lead read) |
| Vehicle-candidate composite read (candidate + valuation snapshots + enrichments + raw listings + duplicate group + scoring + sightings/decision history) | Page 8 | none; sightings/decision-history not a stored concept | v2: `GET /app/vehicles/:id` composite |
| Historical-sales **upload** endpoint + `sales_upload_batches` table | Page 5 (Weekly Sales Upload) | does not exist (`/admin/import-outcomes` is a different concept) | v2: a write endpoint for `tav.historical_sales` ingestion (decide `/admin/*`+narrow-proxy vs new `/app/*` write) + `sales_upload_batches` schema + column-mapping/validation server logic |
| Machine-readable Cox-environment flag, `HYBRID_BUYBOX_ENABLED`, last-MMR-lookup / last-ingest / last-sales-upload / error-log summary on `system-status` | Page 9 (Admin) | not in `system-status` | small additive fields on `GET /app/system-status` — low-effort gap-closers, can land in the v1.5 slice |

---

## 12. Implementation phases

### v1 — the 4 live-data pages (this is the scope to build first)
- **Phase 1 — Platform & shell.** Scaffold `web/` (Next.js App Router, Tailwind v4, TS strict, pnpm, eslint, vitest, playwright). Auth.js Google OIDC + domain gate + `middleware.ts` + `/signin` page. `env.ts` (validate + derive `ENV_LABEL`). The catch-all proxy `app/api/app/[...path]/route.ts` + `lib/server/worker-fetch.ts` + the shared Zod-parse/discriminated-union module + `lib/app-api.ts` typed client + `lib/query.ts`. App shell (`Sidebar`, `Topbar`, `EnvBadge`, `ThemeToggle`, `UserMenu`, search stub) + `globals.css` semantic tokens (light+dark) + `next-themes`. Data-state primitives (`Loading/Empty/ErrorPanel/Unavailable/PendingBackend`). `DataTable<T>`. KPI components. Recharts wrappers. Status components, Drawer, Toaster, ConfirmModal scaffold. MSW handlers + fixtures. `web-ci` workflow. Vercel project set up (root `/web`, env vars per environment, branch→env mapping, OAuth callback URLs). Playwright skeleton (auth-gate + shell smoke).
- **Phase 2 — KPI Dashboard** (`/dashboard`). Live cards from `/app/kpis` + `/app/system-status`; gross-by-region + hold-days-by-region charts; "Pending backend" future-metrics grid; promote the few `system-status`-derivable tiles to live; D1 decision on the trend chart. Tests + Playwright page-render flow.
- **Phase 3 — VIN / MMR Lookup Lab** (`/mmr-lab`). Form + mutation + result panel + spread + heuristic recommendation + raw-payload viewer + example-VIN "fill example" + the historical-comparison panel (client-side aggregates over `/app/historical-sales`, rest `PendingBackend`). Tests + Playwright VIN-lookup key flow (mocked `/api/app/mmr/vin`). (The Cox-sandbox inline caveat that shipped with this phase was removed 2026-05-13 — Cox production credentials live.)
- **Phase 4 — TAV Historical Data** (`/historical`). Filter bar (server-side `year/make/model/since` + client-side trim/vin/gross) + `DataTable` with the real columns + the derivable charts + row-detail drawer + load-more. Tests + Playwright filter key flow (mocked data).
- **Phase 5 — Admin / Integrations** (`/admin`). All sections from §9 Page 9 — signed-in email, env section, API health, intel-worker, the Cox-sandbox `CaveatBanner`, source-run health table, stale-sweep, secrets checklist (names only), `MANHEIM_LOOKUP_MODE`, "Refresh system status" button. Tests + Playwright "caveat string present" assertion.
- **v1 done** when the §15 acceptance criteria all hold.

### v1.5 — Ingest Monitor + Import-Batches view (after a small backend slice)
- **Backend slice (Worker):** add `GET /app/ingest-runs` (list, summary fields) + `GET /app/ingest-runs/:id` (detail), following the existing `/app/*` conventions; optionally `GET /app/import-batches/:id`; optionally the additive `system-status` fields (Cox-env flag, `HYBRID_BUYBOX_ENABLED`, last-ingest/last-upload). Update `docs/APP_API.md` + ADR + MSW fixtures + `app-api.ts`.
- **Frontend:** Ingest Monitor page (table + run-detail drawer) and an Import-Batches operational view (table over `/app/import-batches`, linkable from the historical "upload batch" column). Add their nav entries.

### v2 — the mutation-heavy pages (each needs real new backend surface)
- **Acquisition Workflow, Lead Review, Vehicle Detail** — need lead reads, lead mutations, an owner/assignment model, buy-box score reads, the vehicle-candidate composite read; this is also where per-user identity (and likely the ADR-0002 Cloudflare-Access migration / forwarding the Auth.js identity) gets wired. **Weekly Sales Upload** — needs the historical-sales upload endpoint + `sales_upload_batches` schema + a richer `historical_sales` row + column-mapping/validation server logic. Demo Mode (off-by-default fixture client + `DEMO DATA` badge + data-source badges) is built here, since this is where designed-but-not-yet-backed surfaces exist. Each v2 page gets its own spec → plan → implementation cycle.

---

## 13. Testing & CI

- **Unit / component (Vitest + React Testing Library).** The `lib/app-api.ts` parsing → discriminated-union mapping (every branch: `ok`, `value:null,missingReason`, `{ok:false,error}`, `503`, `502 upstream_unreachable`, `400 invalid_body`, `401`). The data-state primitives. `DataTable` (sort/filter/paginate/empty/error/loading). KPI cards' null-safety. The env-label derivation. The heuristic recommendation function. The historical-aggregates helper.
- **API mocking (MSW).** `web/test/msw/` handlers + fixtures mirroring `docs/APP_API.md` shapes exactly — including the `null`+`missingReason` blocks, `mmr/vin` null/`missingReason` variants, `503 db_error`, `401`. Used by component + integration tests and by Playwright (the app under test points at MSW for the proxy, or the proxy points at an MSW-backed mock Worker).
- **E2E (Playwright) — v1 depth (ii):**
  - unauthenticated user → redirected to `/signin`;
  - mocked authenticated session → app shell renders;
  - the 4 v1 pages render (KPI Dashboard, VIN/MMR Lab, TAV Historical Data, Admin/Integrations) — each shows its shell + at least one real data region;
  - environment badge renders the correct label for the test env;
  - dark-mode toggle flips the theme;
  - VIN/MMR Lab: enter the preview VIN against a mocked `/api/app/mmr/vin` → result panel + spread/recommendation area appear;
  - TAV Historical Data: apply a year/make filter → table updates with mocked data;
  - Admin/Integrations: the Cox vendor-environment label is present (post-2026-05-13 it reads "Production-enabled"; the previous "Sandbox-backed" caveat banner is gone).
- **Contract test (`pnpm test:contract`) — manual / pre-release only, not in CI:** hits the **real staging Worker** through the Next.js proxy and asserts `/app/*` envelope shapes match `docs/APP_API.md` (`{ok:true,data}` / `{ok:false,error}` / `null`+`missingReason` / `system-status` always-200 / `mmr/vin` non-blocking). Depends on real staging secrets + network, so it's not a PR gate.
- **Auth in tests:** Auth.js sessions are mocked in all automated tests (unit/component/e2e). CI never hits Google OAuth. **One real Google OAuth round-trip is verified manually on a Vercel Preview deployment before the production launch.**
- **`web-ci` GitHub Actions job** (repo root `.github/workflows/web-ci.yml`): triggers only when `web/**`, `.github/workflows/web-ci.yml`, or `/web`'s lock/config files change. Steps: `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`. Runs separately from / in parallel with the existing Worker CI; **no mixing of Worker runtime/deps with `/web`.** (Playwright E2E can run in `web-ci` if fast enough, or as a separate job — to be decided when wiring CI; the v1 suite is small.)

---

## 14. Deployment

- **Vercel project:** new project, **root directory `/web`**, framework preset Next.js, package manager pnpm. Build = `pnpm build`, output = Next.js default.
- **Branch → environment:** `main` → Production (→ prod Worker); all other branches / PRs → Preview (→ staging Worker). Auto-deploy on push.
- **Env vars:** set the §7.1 matrix in Vercel's Production and Preview scopes (and document `web/.env.example` for local dev). `APP_API_BASE_URL` = Worker **origin only**. Nothing prefixed `NEXT_PUBLIC_`.
- **OAuth callback URLs:** register `https://<prod-domain>/api/auth/callback/google` (Production) and the Vercel preview URL pattern + `http://localhost:3000/api/auth/callback/google` (dev) in the Google Cloud OAuth client(s). `AUTH_URL`/`NEXTAUTH_URL` set per env.
- **Backend prerequisites (must already be true / verify before launch):** `APP_API_SECRET` provisioned on both `tav-aip-staging` and `tav-aip-production` (it is — see `docs/followups.md` 2026-05-11). `/app/*` deployed and smoked on both envs (it is — `docs/app-api-smoke-2026-05-11.md`).
- **Domain (v1):** use the **Vercel-assigned domain** for v1 — fastest path to ship, no DNS/OAuth blocker. Set `AUTH_URL`/`NEXTAUTH_URL` to the Vercel production URL, and register the Google OAuth callback URLs for: the Vercel **production** domain, the Vercel **preview** URL pattern, and `http://localhost:3000` (dev) — all as `…/api/auth/callback/google`. Moving to a custom production domain (e.g. `intel.texasautovalue.com`) — DNS, the Vercel domain assignment, updating `AUTH_URL`, and adding the new OAuth callback — is a **launch-readiness follow-up** (see §16), not a blocker for building or running `/web`.
- **Co-versioning:** `/web` lives in this repo, so a change to `docs/APP_API.md` and a matching change to `web/lib/app-api.ts` + `web/test/msw/` travel together in one PR.

---

## 15. v1 acceptance criteria ("production usable")

v1 is done when **all** of the following hold:
- `/web` deployed to Vercel **Production** from `main`.
- Auth.js Google gate works: `texasautovalue.com` accounts allowed; non-`texasautovalue.com` accounts denied with a clear message; clear unauthenticated/sign-in state.
- `APP_API_SECRET` never appears in the browser bundle, browser network calls, logs, or client env. Browser calls only the Next.js `/api/app/*` proxy routes — never the Worker directly.
- All 4 v1 pages render **real production-Worker data**: KPI Dashboard, VIN / MMR Lookup Lab, TAV Historical Data, Admin / Integrations.
- Environment badge is correct per Vercel environment.
- Every data region has loading, empty, error, and pending-backend states. No fake operational numbers in normal mode (Demo Mode is deferred to v2).
- Admin shows the signed-in user's email.
- Admin renders the Cox vendor-environment label (was "Sandbox-backed" verbatim caveat; flipped to "Production-enabled" on 2026-05-13 when Cox production MMR credentials went live).
- Dark mode works and is not visually broken.
- `web-ci` is green.
- Playwright v1 smoke/key-flow suite (depth (ii)) passes.
- The manual `pnpm test:contract` against staging passes before the production launch.
- One real Google OAuth round-trip verified manually on a Vercel Preview deploy.
- A TAV staffer can use it for daily VIN lookups, KPI review, historical-sales review, and system-status checks.

---

## 16. Resolved decisions & remaining open items

**Resolved (2026-05-11):**
- **D1 — Page 1 "Outcomes / gross trend" chart:** derive a monthly `grossProfit` trend **client-side from `/app/historical-sales`**, labelled as based on the returned historical-sales sample (bounded by the endpoint's `limit`/filter behaviour, not a full-database aggregate); a proper server-side aggregated trend endpoint is logged in §11 for later.
- **Production domain:** v1 uses the **Vercel-assigned domain**; a custom domain is a launch-readiness follow-up (below).
- **Commit path for this doc:** straight to `main`, docs-only, message `docs: add web frontend design spec` (only this file).

**Launch-readiness follow-ups (do before the production launch, not before building):**
- Provision a custom production domain (e.g. `intel.texasautovalue.com`): DNS → Vercel domain assignment → update `AUTH_URL`/`NEXTAUTH_URL` → add the new Google OAuth callback URL. Until then the Vercel-assigned domain is fine.
- Verify one real Google OAuth round-trip on a Vercel Preview deploy (also in §15).
- Run `pnpm test:contract` against the staging Worker (also in §15).
- Confirm `APP_API_SECRET` is provisioned on both `tav-aip-staging` and `tav-aip-production` (it is — `docs/followups.md` 2026-05-11) and `/app/*` is smoked on both (it is — `docs/app-api-smoke-2026-05-11.md`).
- Add a follow-up entry for an aggregated historical-sales trend/aggregates endpoint (per §11) so the gross-trend chart can later cover the whole table instead of the returned sample.

**Still genuinely open (minor, decide while implementing):**
- **`web-ci` — Playwright E2E in the same job or a separate job?** Small suite; decide when wiring CI.
- **Make/Model filter UX on Page 4:** select-from-distinct-values (safer — the endpoint is exact-match) vs free text. Recommendation: select-from-distinct.

---

## 17. Related docs
- `docs/APP_API.md` — the `/app/*` contract (source of truth for the proxy + `app-api.ts` + MSW fixtures).
- `docs/adr/0002-frontend-app-api-layer.md` — the decision/rationale for `/app/*` and the future Cloudflare-Access path.
- `docs/app-api-smoke-2026-05-11.md` — deploy + smoke evidence (all 5 endpoints, both envs).
- `docs/architecture.md` — the four HTTP surfaces, repo layout, env, routes, data model.
- `docs/followups.md` — `APP_API_SECRET` provisioning + the sell-through and other follow-ups.
- `CLAUDE.md` / `CLAUDE.local.md` — project + personal working rules.
