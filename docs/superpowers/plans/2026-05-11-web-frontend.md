# TAV Acquisition Intelligence — `/web` Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Granularity note:** this plan is organised by **Task** (a coherent ~10–40 min unit). Within each task, TDD applies wherever there's logic to test (the env/label derivation, the API discriminated-union mapper, the recommendation helper, data-state components, the historical-sales aggregation helpers, the proxy auth gate). Pure scaffolding (Next.js init, vendoring shadcn components, installing deps, CI YAML) is given as exact command/file sequences rather than fabricated TDD. Full code is inlined for every load-bearing module; boilerplate-generated files show only the non-default parts. **Source of truth: `docs/superpowers/specs/2026-05-11-web-frontend-design.md`** — read it before starting; this plan does not restate the rationale.

**Goal:** Build a TAV-owned production Next.js dashboard at `web/` (Vercel) that authenticates TAV staff via Google, proxies the existing Cloudflare Worker `/app/*` API server-side (secret never in the browser), and ships four real-data pages — KPI Dashboard, VIN/MMR Lookup Lab, TAV Historical Data, Admin/Integrations — with a polished deal-desk-cockpit UI, dark mode, full loading/empty/error/pending states, tests, and CI.

**Architecture:** Next.js App Router app in an in-repo subdir `web/` (own `package.json`/pnpm), deployed to Vercel (project root `web/`). Browser talks only to Next.js (RSC pages + `/api/app/[...path]` catch-all proxy + Auth.js routes). The proxy injects `Authorization: Bearer ${APP_API_SECRET}` and forwards to `${APP_API_BASE_URL}/app/...`; `APP_API_BASE_URL` is the Worker **origin only**, bound per Vercel environment (Prod→prod Worker, Preview→staging Worker, local→staging). A thin typed client (`web/lib/app-api.ts`) parses Worker responses against Zod schemas mirroring `docs/APP_API.md` and normalises them into a discriminated union (`ok` / `unavailable` / `error`) the UI renders uniformly.

**Tech Stack:** Next.js (App Router) · TypeScript strict · Tailwind v4 + CSS-variable semantic tokens · shadcn/ui (Radix, vendored) · lucide-react · TanStack Table · TanStack Query · Recharts · next-themes · Auth.js (NextAuth) + Google OIDC · Zod · Vitest + React Testing Library · MSW · Playwright · pnpm · GitHub Actions (`web-ci`) · Vercel.

---

## 0. Pre-flight

- [ ] **0.1** Read `docs/superpowers/specs/2026-05-11-web-frontend-design.md` in full. This plan implements it; it does not re-justify decisions.
- [ ] **0.2** Confirm working tree is clean on `main` (`git status` → clean). All `/web` work lands in `web/`; nothing outside `web/` changes except `.github/workflows/web-ci.yml` (new), `.gitignore` (one line if needed), and the §6 cleanup task to `CLAUDE.md`. (Optional: do this on a feature branch + PR per `docs/github.md`; the plan's commit sequence works either way.)
- [ ] **0.3** Confirm backend prerequisites hold (no action, just verify): `APP_API_SECRET` is provisioned on `tav-aip-staging` and `tav-aip-production` (see `docs/followups.md` 2026-05-11); `/app/*` is live + smoked on both (see `docs/app-api-smoke-2026-05-11.md`). The staging Worker base for local/preview dev is `https://tav-aip-staging.rami-1a9.workers.dev`; prod is `https://tav-aip-production.rami-1a9.workers.dev`.
- [ ] **0.4** You will need: the **staging `APP_API_SECRET` value** (to put in `web/.env.local` for local dev — never commit it), and a **Google Cloud OAuth 2.0 client** (Client ID + secret) with redirect URIs for `http://localhost:3000/api/auth/callback/google` (dev) — production/preview redirect URIs get added in Task 5.x once the Vercel domain exists. If the OAuth client doesn't exist yet, that's a launch-readiness item from the spec; for local dev you can create a throwaway dev client.

---

## 1. File structure (created by this plan)

```
web/
  package.json                      # own deps; pnpm; scripts (Task 1.1/1.2)
  pnpm-lock.yaml
  pnpm-workspace.yaml?              # NOT added — web/ is standalone, not a workspace member of root
  tsconfig.json                     # strict (Task 1.3)
  next.config.ts                    # (Task 1.3)
  next-env.d.ts                     # generated
  postcss.config.mjs                # Tailwind v4 (Task 1.4)
  tailwind.config.ts                # (Task 1.4)
  eslint.config.mjs                 # (Task 1.3)
  .gitignore                        # node_modules, .next, .env*.local, coverage, playwright-report, test-results
  .env.example                      # documents every env var, no values (Task 1.5)
  .env.local                        # gitignored — local overrides (operator creates from .env.example)
  vitest.config.ts                  # (Task 1.16)
  vitest.setup.ts                   # RTL + MSW server lifecycle (Task 1.16)
  playwright.config.ts              # (Task 1.17)
  middleware.ts                     # Auth.js gate (Task 1.7)
  app/
    layout.tsx                      # html/body, ThemeProvider, QueryClientProvider, Toaster, fonts (Task 1.13)
    globals.css                     # Tailwind layers + semantic CSS-variable tokens light+dark (Task 1.4/1.13)
    page.tsx                        # redirect("/dashboard") (Task 1.13)
    not-found.tsx                    # 404 inside the shell (Task 1.13)
    (auth)/
      signin/page.tsx               # unauthenticated state — Sign in with Google + domain notice + AccessDenied (Task 1.8)
    (app)/
      layout.tsx                    # AppShell: Sidebar + Topbar; getServerSession gate (Task 1.13)
      dashboard/page.tsx            # Phase 2
      mmr-lab/page.tsx              # Phase 3
      historical/page.tsx           # Phase 4
      admin/page.tsx                # Phase 5
    api/
      app/[...path]/route.ts        # the catch-all Worker proxy — GET/POST (Task 1.9)
      auth/[...nextauth]/route.ts   # Auth.js handlers (Task 1.6)
  lib/
    env.ts                          # zod-validate process.env; derive ENV_LABEL (Task 1.5)
    auth.ts                          # Auth.js config: Google provider + domain-restricted signIn callback (Task 1.6)
    app-api/
      schemas.ts                    # Zod schemas mirroring docs/APP_API.md response shapes (Task 1.10)
      parse.ts                       # shared: validate + normalise → ApiResult<T> discriminated union (Task 1.10)
      client.ts                      # browser-callable typed fns hitting /api/app/* (Task 1.11)
      server.ts                       # server-only: fetch ${APP_API_BASE_URL}/app/... with Bearer; uses parse.ts (Task 1.11)
      missing-reason.ts              # missingReason code → human copy map (Task 1.10)
    query.ts                          # QueryClient factory + query keys + defaults (Task 1.12)
    format.ts                          # null-safe money/number/date/percent/relative formatters (Task 1.12)
    recommendation.ts                  # heuristic Strong Buy / Review / Pass from (spread, confidence) — Phase 3 (Task 3.x)
    historical-aggregate.ts            # pure helpers: bucket HistoricalSale[] by month; segment rollups; median — Phase 4, reused by Phase 2 (Task 4.x)
  components/
    ui/                              # vendored shadcn: button, card, table, tabs, dialog, sheet (drawer), dropdown-menu, badge, skeleton, input, label, select, separator, tooltip, sonner (Task 1.14)
    app-shell/
      app-sidebar.tsx                # nav (Task 1.13)
      app-topbar.tsx                 # title slot + EnvBadge + ThemeToggle + UserMenu + GlobalSearch stub (Task 1.13)
      env-badge.tsx                  # reads ENV_LABEL (Task 1.13)
      theme-toggle.tsx               # next-themes (Task 1.13)
      user-menu.tsx                  # session email/name/avatar + sign out (Task 1.13)
    data-state/
      loading.tsx                    # <CardGridSkeleton/>, <TableSkeleton rows=/>, <ChartSkeleton/> (Task 1.15)
      empty.tsx                      # <Empty title= hint= action?/> (Task 1.15)
      error-panel.tsx                # <ErrorPanel result= onRetry?/> — reads ApiResult error branch (Task 1.15)
      unavailable.tsx                # <Unavailable reason=/> — uses missing-reason map (Task 1.15)
      pending-backend.tsx            # <PendingBackend label= note?/> — styled "not built yet" (Task 1.15)
    data-table/
      data-table.tsx                 # DataTable<T> over TanStack Table — sort/filter/paginate/density/states (Task 1.18)
      column-header.tsx              # sortable header cell (Task 1.18)
      pagination.tsx                 # page controls + page-size (Task 1.18)
    kpi/
      kpi-card.tsx                   # label + null-safe value + optional trend + Unavailable/PendingBackend state (Task 1.19)
      kpi-grid.tsx                   # responsive grid (Task 1.19)
      stat-pill.tsx                  # semantic-status pill (Task 1.19)
    charts/
      bar-chart-card.tsx             # Recharts bar + title + empty/insufficient state (Task 1.20)
      line-chart-card.tsx            # Recharts line/area (Task 1.20)
      histogram-card.tsx             # Recharts bar over buckets (Task 1.20)
      chart-theme.ts                 # axis/grid/colour tokens for Recharts (Task 1.20)
    status/
      status-pill.tsx                # semantic status → token colour + label (Task 1.19)
      health-dot.tsx                 # tiny coloured dot (Task 1.19)
      caveat-banner.tsx              # persistent standing-caveat banner (Task 1.19)
  test/
    msw/
      handlers.ts                    # MSW handlers for /api/app/* (Task 1.16)
      fixtures.ts                    # fixtures mirroring docs/APP_API.md (incl. null+missingReason, 503, 401) (Task 1.16)
      node.ts                        # setupServer for vitest (Task 1.16)
    unit/                            # *.test.ts(x) co-located OR here — convention: co-locate next to source
    e2e/
      auth-gate.spec.ts              # Phase 1 (Task 1.17)
      shell.spec.ts                  # Phase 1 (Task 1.17)
      dashboard.spec.ts              # Phase 2
      mmr-lab.spec.ts                # Phase 3
      historical.spec.ts             # Phase 4
      admin.spec.ts                  # Phase 5
      fixtures/                      # mocked-session + mocked-/api/app fixtures for Playwright (Task 1.17)
    contract/
      app-api.contract.test.ts       # `pnpm test:contract` — real staging Worker via the proxy; NOT in CI (Task 1.21)
.github/
  workflows/
    web-ci.yml                       # lint+typecheck+test+build, path-filtered to web/** (Task 1.22)  [repo root, not under web/]
```

Conventions: TypeScript strict everywhere; files small + single-responsibility; co-locate `*.test.tsx` next to the component it tests (e.g. `components/data-state/error-panel.test.tsx`); never import `lib/app-api/server.ts` or `lib/env.ts`'s server-only parts from a client component (enforce with the `server-only` package import at the top of those modules).

---

## 2. Dependencies (Task 1.2 installs these in `web/`)

**Runtime (`dependencies`):**
```
next  react  react-dom
next-auth@beta            # Auth.js v5 (App Router)
@auth/core
zod
@tanstack/react-query
@tanstack/react-table
recharts
next-themes
lucide-react
clsx  tailwind-merge      # cn() helper used by shadcn
class-variance-authority  # shadcn variants
sonner                    # toasts
@radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-label @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slot
server-only               # guard module
```
**Dev (`devDependencies`):**
```
typescript  @types/node  @types/react  @types/react-dom
tailwindcss@4  @tailwindcss/postcss  postcss
eslint  eslint-config-next  @typescript-eslint/parser @typescript-eslint/eslint-plugin
vitest  @vitejs/plugin-react  jsdom  @testing-library/react  @testing-library/jest-dom  @testing-library/user-event
msw
@playwright/test
```
(shadcn components are *vendored* via `pnpm dlx shadcn@latest add …` in Task 1.14, which pulls the Radix deps listed above — keep both in sync.)

Pin major versions in `package.json`; commit `pnpm-lock.yaml`. **`web/` does not depend on the root `package.json`** and vice-versa.

---

## 3. Environment variables (documented in `web/.env.example`; set in Vercel + `.env.local`)

| Var | Local (`.env.local`) | Vercel Preview | Vercel Production | Notes |
|---|---|---|---|---|
| `APP_API_BASE_URL` | `https://tav-aip-staging.rami-1a9.workers.dev` (or `http://localhost:8787` if running the Worker locally) | `https://tav-aip-staging.rami-1a9.workers.dev` | `https://tav-aip-production.rami-1a9.workers.dev` | **Worker ORIGIN only** — proxy appends `/app`. Server-only (no `NEXT_PUBLIC_`). |
| `APP_API_SECRET` | staging Worker's `APP_API_SECRET` | staging Worker's `APP_API_SECRET` | prod Worker's `APP_API_SECRET` | **Server-only secret. Never logged, never `NEXT_PUBLIC_`.** |
| `AUTH_SECRET` | `openssl rand -base64 32` | (generate) | (generate) | Auth.js cookie/JWT encryption. Server-only secret. |
| `AUTH_GOOGLE_ID` | dev OAuth client ID | preview/staging client ID | prod client ID | Server-only. |
| `AUTH_GOOGLE_SECRET` | dev OAuth client secret | … | … | Server-only secret. |
| `AUTH_URL` | `http://localhost:3000` | Vercel preview URL | Vercel production URL | Auth.js base URL. (`NEXTAUTH_URL` alias also accepted.) |
| `ALLOWED_EMAIL_DOMAIN` | `texasautovalue.com` | `texasautovalue.com` | `texasautovalue.com` | Domain the `signIn` callback enforces. |

`web/.env.example` lists all of the above with empty/placeholder values and the comments. `.gitignore` excludes `.env*.local`. `web/lib/env.ts` (Task 1.5) parses + validates these at boot and throws a clear error if any required one is missing/malformed.

---

## 4. CI / Vercel setup plan

- **`.github/workflows/web-ci.yml`** (Task 1.22): triggers on `push`/`pull_request` when paths under `web/**` or `.github/workflows/web-ci.yml` change. Job: checkout → setup-node (Node 20) → install pnpm → `cd web && pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Runs independently of the existing Worker CI; no shared steps. (Playwright E2E: start with it **not** in `web-ci`; add a separate optional job once the suite is stable — open item in the spec.)
- **Vercel project** (manual, Task 1.23 = a checklist not code): New Project → import the `ramialbanna/TAV-VAIP` repo → set **Root Directory = `web`** → framework preset Next.js → package manager pnpm → build `pnpm build`. Add the §3 env vars in the **Production** and **Preview** scopes (and Development if desired). `main` → Production; all other branches/PRs → Preview. After the first deploy, note the assigned Vercel production + preview domains and add `https://<that-domain>/api/auth/callback/google` to the Google OAuth client redirect URIs; set `AUTH_URL` accordingly per scope.
- **Deploy gating:** Vercel builds on every push; `web-ci` is the fast pre-merge gate. Both must be green for a merge.

---

## PHASE 1 — Platform & shell

> Outcome: `web/` runs locally, gates on Google login (domain-restricted), proxies `/app/*` securely, renders the authenticated app shell with sidebar/topbar/env-badge/theme-toggle/user-menu and a placeholder for each of the 4 pages, has the full data-state component kit + `DataTable` + KPI + chart wrappers + status components, MSW + Vitest + Playwright wired, and `web-ci` green. No real page content yet (Phases 2–5).

### Task 1.1 — Scaffold the Next.js app
**Files:** creates `web/` tree (Next defaults).
- [ ] From repo root: `pnpm dlx create-next-app@latest web --typescript --eslint --app --src-dir=false --tailwind --import-alias "@/*" --use-pnpm --no-turbopack` (answer "No" to any extra prompts). This yields `web/` with `app/`, `package.json`, `tsconfig.json`, `next.config.ts`, Tailwind v3 by default — we upgrade Tailwind to v4 in Task 1.4.
- [ ] `cd web && pnpm dev` → confirm `http://localhost:3000` serves the starter page. Stop the server.
- [ ] Commit: `git add web/ && git commit -m "feat(web): scaffold Next.js app router project"`

### Task 1.2 — Install dependencies
**Files:** `web/package.json`, `web/pnpm-lock.yaml`.
- [ ] In `web/`: install the runtime + dev deps from §2 (one `pnpm add …` and one `pnpm add -D …`). Remove anything `create-next-app` added that we're replacing (it shouldn't conflict).
- [ ] Add scripts to `web/package.json`:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:contract": "vitest run --config vitest.contract.config.ts"
  }
}
```
- [ ] Commit: `git add web/package.json web/pnpm-lock.yaml && git commit -m "build(web): add dependencies and scripts"`

### Task 1.3 — TS strict, ESLint, next.config, gitignore
**Files:** `web/tsconfig.json`, `web/eslint.config.mjs`, `web/next.config.ts`, `web/.gitignore`.
- [ ] `web/tsconfig.json`: ensure `"strict": true`, `"noUncheckedIndexedAccess": true`, `"paths": { "@/*": ["./*"] }`.
- [ ] `web/eslint.config.mjs`: extend `next/core-web-vitals` + `next/typescript`; add a rule banning import of `lib/app-api/server` / `lib/env` server bits from `app/**/*.tsx` client components — or rely on the `server-only` package's runtime guard (cheaper; do that). Keep lint strict (no `any` without comment, per repo style).
- [ ] `web/next.config.ts`: `experimental: { typedRoutes: true }` (optional but nice); nothing else needed.
- [ ] `web/.gitignore`: `node_modules`, `.next`, `out`, `.env*.local`, `coverage`, `playwright-report`, `test-results`, `.vercel`.
- [ ] Commit: `git add web/tsconfig.json web/eslint.config.mjs web/next.config.ts web/.gitignore && git commit -m "chore(web): strict TS, eslint, next config, gitignore"`

### Task 1.4 — Tailwind v4 + semantic CSS-variable tokens
**Files:** `web/postcss.config.mjs`, `web/tailwind.config.ts`, `web/app/globals.css`.
- [ ] Upgrade to Tailwind v4: `pnpm add -D tailwindcss@4 @tailwindcss/postcss`; `postcss.config.mjs` → `export default { plugins: { "@tailwindcss/postcss": {} } }`.
- [ ] `web/app/globals.css` — Tailwind v4 entry + the semantic token layer. Tokens are defined once as CSS variables and exposed to Tailwind via `@theme`:
```css
@import "tailwindcss";

@theme {
  --color-surface-base: var(--surface-base);
  --color-surface-raised: var(--surface-raised);
  --color-surface-sunken: var(--surface-sunken);
  --color-border-subtle: var(--border-subtle);
  --color-border-strong: var(--border-strong);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-status-healthy: var(--status-healthy);
  --color-status-healthy-bg: var(--status-healthy-bg);
  --color-status-review: var(--status-review);
  --color-status-review-bg: var(--status-review-bg);
  --color-status-error: var(--status-error);
  --color-status-error-bg: var(--status-error-bg);
  --color-accent-action: var(--accent-action);
  --color-accent-action-bg: var(--accent-action-bg);
}

:root {
  /* light — primary identity */
  --surface-base: #ffffff;
  --surface-raised: #f7f8fa;
  --surface-sunken: #eef0f3;
  --border-subtle: #e2e5ea;
  --border-strong: #c7ccd4;
  --text-primary: #0f1b2d;       /* deep navy */
  --text-secondary: #3b4757;     /* slate */
  --text-muted: #6b7686;
  --status-healthy: #15803d;     /* green */
  --status-healthy-bg: #e7f5ec;
  --status-review: #b45309;      /* amber */
  --status-review-bg: #fdf3e3;
  --status-error: #b91c1c;       /* red */
  --status-error-bg: #fbeaea;
  --accent-action: #1d4ed8;      /* blue */
  --accent-action-bg: #e8eefc;
}

.dark {
  --surface-base: #0c0f14;
  --surface-raised: #141922;
  --surface-sunken: #1c2330;
  --border-subtle: #232a36;
  --border-strong: #323b4a;
  --text-primary: #e9edf3;
  --text-secondary: #b7c0cd;
  --text-muted: #8b94a3;
  --status-healthy: #4ade80;
  --status-healthy-bg: #12251a;
  --status-review: #fbbf4d;
  --status-review-bg: #2a2010;
  --status-error: #f87171;
  --status-error-bg: #2a1414;
  --accent-action: #6f9bff;
  --accent-action-bg: #131c33;
}

html, body { background: var(--color-surface-base); color: var(--color-text-primary); }
```
  (Contrast-check each `*-fg`/`*-bg` pair to AA in both themes — adjust hex values if a pair fails; this is a quick eyeball + a contrast tool, not code.)
- [ ] `tailwind.config.ts` content paths: `["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"]`. (Tailwind v4 mostly auto-detects; keep this explicit.)
- [ ] Commit: `git add web/postcss.config.mjs web/tailwind.config.ts web/app/globals.css && git commit -m "feat(web): tailwind v4 + semantic color tokens (light/dark)"`

### Task 1.5 — `lib/env.ts` (env validation + `ENV_LABEL`)  [TDD]
**Files:** Create `web/lib/env.ts`; Test `web/lib/env.test.ts`.
- [ ] **Step 1 — failing test.** `web/lib/env.test.ts`: import a pure helper `deriveEnvLabel(baseUrl: string): "PRODUCTION" | "STAGING" | "LOCAL"` and assert: `deriveEnvLabel("https://tav-aip-production.rami-1a9.workers.dev")==="PRODUCTION"`; `…-staging…==="STAGING"`; `"http://localhost:8787"==="LOCAL"`; `"http://127.0.0.1:8787"==="LOCAL"`; `"https://example.com"==="LOCAL"` (unknown → LOCAL, the safe default that won't masquerade as prod). Also test the env parser throws on a missing `APP_API_SECRET`.
- [ ] **Step 2 — run, expect FAIL** (`pnpm test web/lib/env.test.ts` → module not found).
- [ ] **Step 3 — implement `web/lib/env.ts`:**
```ts
import "server-only";
import { z } from "zod";

const Schema = z.object({
  APP_API_BASE_URL: z.string().url(),
  APP_API_SECRET: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  AUTH_URL: z.string().url().optional(),
  ALLOWED_EMAIL_DOMAIN: z.string().min(1).default("texasautovalue.com"),
});

export type EnvLabel = "PRODUCTION" | "STAGING" | "LOCAL";

export function deriveEnvLabel(baseUrl: string): EnvLabel {
  let host: string;
  try { host = new URL(baseUrl).hostname; } catch { return "LOCAL"; }
  if (host.includes("tav-aip-production")) return "PRODUCTION";
  if (host.includes("tav-aip-staging")) return "STAGING";
  return "LOCAL";
}

let cached: (z.infer<typeof Schema> & { ENV_LABEL: EnvLabel }) | null = null;
export function serverEnv() {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Invalid /web environment: " + JSON.stringify(parsed.error.flatten().fieldErrors));
  }
  cached = { ...parsed.data, ENV_LABEL: deriveEnvLabel(parsed.data.APP_API_BASE_URL) };
  return cached;
}
```
  Add a tiny **client-safe** sibling for the badge: `web/lib/env-public.ts` exporting nothing secret — instead, expose `ENV_LABEL` to the client by reading it server-side and passing it as a prop from the `(app)/layout.tsx` server component (don't create a `NEXT_PUBLIC_` var). So `env.ts` stays server-only; the topbar receives `envLabel` as a prop.
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — `web/.env.example`** with all §3 vars (empty values + comments). **Step 6 — commit:** `git add web/lib/env.ts web/lib/env.test.ts web/.env.example && git commit -m "feat(web): env validation + ENV_LABEL derivation"`

### Task 1.6 — Auth.js config + route + domain-restricted sign-in  [TDD on the callback]
**Files:** Create `web/lib/auth.ts`, `web/app/api/auth/[...nextauth]/route.ts`; Test `web/lib/auth.test.ts`.
- [ ] **Step 1 — failing test.** Extract the domain check as a pure fn `isAllowedEmail(email: string | null | undefined, domain: string): boolean`. Test: `isAllowedEmail("rami@texasautovalue.com","texasautovalue.com")===true`; `isAllowedEmail("x@gmail.com","texasautovalue.com")===false`; `isAllowedEmail(undefined,…)===false`; case-insensitive (`"R@TexasAutoValue.com"`→true); rejects look-alikes (`"x@texasautovalue.com.evil.com"`→false — match the *exact* domain after the last `@`, not a substring).
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:**
```ts
// web/lib/auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { serverEnv } from "./env";

export function isAllowedEmail(email: string | null | undefined, domain: string): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return email.slice(at + 1).toLowerCase() === domain.toLowerCase();
}

const env = serverEnv();
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  providers: [Google({
    clientId: env.AUTH_GOOGLE_ID,
    clientSecret: env.AUTH_GOOGLE_SECRET,
    authorization: { params: { hd: env.ALLOWED_EMAIL_DOMAIN } }, // Google account-chooser hint; server check below is the real gate
  })],
  pages: { signIn: "/signin" },
  callbacks: {
    signIn({ profile, user }) {
      const email = (profile as { email?: string } | undefined)?.email ?? user?.email;
      return isAllowedEmail(email, env.ALLOWED_EMAIL_DOMAIN); // false → Auth.js redirects to /signin?error=AccessDenied
    },
    session({ session, token }) {
      // keep only what we surface
      if (session.user) { session.user.email = (token.email as string) ?? session.user.email; }
      return session;
    },
  },
});
```
```ts
// web/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```
- [ ] **Step 4 — run, expect PASS.** (Auth.js itself isn't unit-tested here — only `isAllowedEmail`. The full OAuth round-trip is the manual Preview check from the spec.)
- [ ] **Step 5 — commit:** `git add web/lib/auth.ts web/lib/auth.test.ts "web/app/api/auth/[...nextauth]/route.ts" && git commit -m "feat(web): auth.js google oidc with domain-restricted sign-in"`

### Task 1.7 — `middleware.ts` (the gate)
**Files:** Create `web/middleware.ts`.
- [ ] Implement: use Auth.js middleware to require a session on everything except `/signin`, `/api/auth/*`, `/_next/*`, static files, and `/api/app/*` (those return 401 JSON themselves — don't redirect API calls). Unauthenticated page request → `NextResponse.redirect(new URL("/signin?callbackUrl=" + encodeURIComponent(req.nextUrl.pathname), req.url))`.
```ts
// web/middleware.ts
import { auth } from "@/lib/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = pathname === "/signin" || pathname.startsWith("/api/auth");
  const isApi = pathname.startsWith("/api/");
  if (!req.auth && !isPublic) {
    if (isApi) return; // let the route return 401 JSON
    const url = new URL("/signin", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```
- [ ] Commit: `git add web/middleware.ts && git commit -m "feat(web): auth gate middleware"`

### Task 1.8 — `/signin` page (unauthenticated + AccessDenied states)
**Files:** Create `web/app/(auth)/signin/page.tsx`.
- [ ] Implement a centred card: TAV wordmark, "Sign in with Google" button (`signIn("google", { callbackUrl })` — a small client component for the button), the domain notice ("Use your Texas Auto Value Google account."), and — when `searchParams.error === "AccessDenied"` — a clear denied message ("That account isn't authorised for this dashboard. Sign in with your @texasautovalue.com account."). No app chrome behind it (this route is outside `(app)/`).
- [ ] Manual check: visit `http://localhost:3000` while logged out → redirected to `/signin`. (Real Google login deferred to the Preview check.)
- [ ] Commit: `git add "web/app/(auth)/signin/page.tsx" && git commit -m "feat(web): sign-in page with access-denied state"`

### Task 1.9 — Catch-all Worker proxy `/api/app/[...path]/route.ts`  [TDD on the handler]
**Files:** Create `web/app/api/app/[...path]/route.ts`; Test `web/app/api/app/[...path]/route.test.ts`.
- [ ] **Step 1 — failing test.** Mock `@/lib/auth`'s `auth()` and `global.fetch`. Assert: (a) no session → response status 401, body `{ok:false,error:"unauthorized"}`, and `fetch` NOT called; (b) with session, a GET to `/api/app/kpis?limit=5` → `fetch` called once with URL `https://tav-aip-staging.rami-1a9.workers.dev/app/kpis?limit=5`, header `Authorization: Bearer <secret>`, and **no** incoming `Cookie`/`Authorization` forwarded; the Worker's `{ok:true,data:{…}}` body + its status code are returned verbatim; (c) `fetch` throws/times out → response status 502, body `{ok:false,error:"upstream_unreachable",retryable:true}`; (d) a POST to `/api/app/mmr/vin` forwards the JSON body and method.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:**
```ts
// web/app/api/app/[...path]/route.ts
import "server-only";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { serverEnv } from "@/lib/env";

const READ_TIMEOUT_MS = 8_000;
const MMR_TIMEOUT_MS = 10_000;

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const session = await auth();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const env = serverEnv();
  const { path } = await ctx.params;
  const search = req.nextUrl.search; // includes leading "?" or ""
  const target = `${env.APP_API_BASE_URL}/app/${path.join("/")}${search}`;
  const isMmr = path[0] === "mmr";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), isMmr ? MMR_TIMEOUT_MS : READ_TIMEOUT_MS);
  try {
    const init: RequestInit = {
      method: req.method,
      headers: { "Authorization": `Bearer ${env.APP_API_SECRET}`, "Content-Type": "application/json" },
      signal: ac.signal,
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = await req.text(); // pass JSON through untouched
    }
    const upstream = await fetch(target, init);
    const body = await upstream.text();
    return new Response(body, { status: upstream.status, headers: { "Content-Type": "application/json" } });
  } catch {
    return Response.json({ ok: false, error: "upstream_unreachable", retryable: true }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

export const GET = handle;
export const POST = handle;
// (PUT/PATCH/DELETE intentionally not exported in v1 — no /app/* mutations exist yet.)
```
  Logging: optionally `console.info` method+path+status+duration — **never** the body or `Authorization` or env. (Skip logging entirely in v1 if you want; Vercel logs the request line anyway.)
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit:** `git add "web/app/api/app/[...path]/route.ts" "web/app/api/app/[...path]/route.test.ts" && git commit -m "feat(web): catch-all /app/* worker proxy with bearer injection"`

### Task 1.10 — App-API schemas, `ApiResult` mapper, missing-reason copy  [TDD on the mapper]
**Files:** Create `web/lib/app-api/schemas.ts`, `web/lib/app-api/parse.ts`, `web/lib/app-api/missing-reason.ts`; Test `web/lib/app-api/parse.test.ts`.
- [ ] **Step 1 — failing test (`parse.test.ts`).** Define the discriminated union and the per-endpoint parser, then assert each branch:
  - `parseKpis({ok:true,data:{generatedAt,outcomes:{value:{totalOutcomes:3,avgGrossProfit:1500,avgHoldDays:21.5,lastOutcomeAt:"…",byRegion:[]},missingReason:null},leads:{value:{total:7},missingReason:null},listings:{value:{normalizedTotal:42},missingReason:null}}})` → `{status:"ok", data:{… typed …}}`.
  - `outcomes.value:null, missingReason:"db_error"` → the `outcomes` block surfaces as `{status:"unavailable", reason:"db_error"}` while `leads`/`listings` stay `ok` (block-level, not whole-call).
  - `{ok:false,error:"db_error"}` (HTTP 503) → `{status:"error", code:"db_error", retryable:true}`.
  - HTTP 502 `{ok:false,error:"upstream_unreachable",retryable:true}` → `{status:"error", code:"upstream_unreachable", retryable:true}`.
  - HTTP 401 `{ok:false,error:"unauthorized"}` → `{status:"error", code:"unauthorized", retryable:false}` (the UI treats this as "session expired — reload/sign in").
  - `parseMmrVin({ok:true,data:{mmrValue:68600,confidence:"high",method:"vin"}})` → `{status:"ok", data:{mmrValue:68600,confidence:"high",method:"vin"}}`.
  - `parseMmrVin({ok:true,data:{mmrValue:null,missingReason:"intel_worker_timeout"}})` → `{status:"unavailable", reason:"intel_worker_timeout"}`.
  - `parseMmrVin` HTTP 400 `{ok:false,error:"invalid_body",issues:[…]}` → `{status:"error", code:"invalid_body", retryable:false, issues:[…]}`.
  - `parseSystemStatus({ok:true,data:{…always-200 shape…}})` → `{status:"ok", data}` (system-status has **no** unavailable variant — `db.ok:false` is *inside* `data`, the call still succeeded). A schema-mismatch (Zod fails) → `{status:"error", code:"bad_response", retryable:false}`.
  - `missingReasonCopy("intel_worker_timeout")` returns a non-empty human string; an unknown code returns a sensible fallback ("Not available").
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement** `schemas.ts` (Zod schemas exactly mirroring `docs/APP_API.md`: `SystemStatusSchema`, `KpisSchema`, `ImportBatchSchema`/`ImportBatchListSchema`, `HistoricalSaleSchema`/`HistoricalSaleListSchema`, `MmrVinOkSchema`/`MmrVinUnavailableSchema`), `parse.ts` (the `ApiResult<T>` union: `{status:"ok",data:T}` | `{status:"unavailable",reason:string}` | `{status:"error",code:string,retryable:boolean,issues?:unknown[]}`; one parser per endpoint that takes `(status:number, json:unknown)` and returns `ApiResult<…>` — for `kpis` it returns the top-level result plus block-level results; for the list endpoints a `ApiResult<T[]>`), and `missing-reason.ts` (a `Record<string,string>` for the documented codes — `intel_worker_not_configured`, `no_mmr_value`, `intel_worker_timeout`, `intel_worker_rate_limited`, `intel_worker_unavailable`, `db_error`, `never_run` — plus a `missingReasonCopy(code)` with a fallback).
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit:** `git add web/lib/app-api/ && git commit -m "feat(web): app-api zod schemas + ApiResult mapper + missing-reason copy"`

### Task 1.11 — Typed client (`client.ts`) + server fetch (`server.ts`)
**Files:** Create `web/lib/app-api/client.ts`, `web/lib/app-api/server.ts`.
- [ ] `client.ts` (browser-callable; no `server-only`): `getSystemStatus()`, `getKpis()`, `listHistoricalSales(filter)`, `listImportBatches(limit?)`, `postMmrVin(body)` — each does `fetch("/api/app/<path>", …)`, reads status + JSON, hands them to the matching `parse.ts` parser, returns the `ApiResult`. Define `HistoricalSalesFilter = { limit?: number; year?: number; make?: string; model?: string; since?: string }` and `MmrVinRequest = { vin: string; year?: number; mileage?: number }` here (used by Phases 3–4).
- [ ] `server.ts` (top line `import "server-only";`): the same functions but calling `${serverEnv().APP_API_BASE_URL}/app/<path>` directly with the Bearer header, then the same parsers. Used by RSC pages for first-paint data. Share the path/query-building with `client.ts` via a tiny internal helper if convenient, but it's fine to keep them parallel and small.
- [ ] (No dedicated test task — these are thin and exercised by the page tests + MSW in Phases 2–5. Optionally a smoke test that `getKpis()` against an MSW handler returns `{status:"ok"}`.)
- [ ] Commit: `git add web/lib/app-api/client.ts web/lib/app-api/server.ts && git commit -m "feat(web): typed app-api client (browser) + server fetch"`

### Task 1.12 — `lib/query.ts` + `lib/format.ts`  [TDD on format]
**Files:** Create `web/lib/query.ts`, `web/lib/format.ts`; Test `web/lib/format.test.ts`.
- [ ] **Step 1 — failing test (`format.test.ts`):** `money(1500)==="$1,500"`; `money(null)==="—"`; `money(undefined)==="—"`; `num(21.5,{maxFrac:1})==="21.5"`; `num(null)==="—"`; `pct(0.42)==="42%"`; `relativeTime("<iso just now>")` returns a string containing "ago" or "just now"; `dateLabel("2026-05-01")==="May 1, 2026"`; all formatters return `"—"` for `null`/`undefined`/`NaN`.
- [ ] **Step 2 — FAIL. Step 3 — implement `format.ts`** (use `Intl.NumberFormat`/`Intl.DateTimeFormat`; `relativeTime` via `Intl.RelativeTimeFormat`; the universal `"—"` for missing). **Step 4 — PASS.**
- [ ] `query.ts`: `makeQueryClient()` factory (default `staleTime: 30_000`, `retry: (n, err) => n < 2 && (err is retryable)`); `queryKeys = { systemStatus: ["system-status"], kpis: ["kpis"], historicalSales: (f) => ["historical-sales", f], importBatches: (l) => ["import-batches", l] }`; constants `SYSTEM_STATUS_REFETCH_MS = 30_000`.
- [ ] Commit: `git add web/lib/query.ts web/lib/format.ts web/lib/format.test.ts && git commit -m "feat(web): query client config + null-safe formatters"`

### Task 1.13 — App shell: root layout, providers, `(app)` layout, sidebar/topbar/env-badge/theme-toggle/user-menu, page placeholders
**Files:** Create `web/app/layout.tsx`, `web/app/page.tsx`, `web/app/not-found.tsx`, `web/app/(app)/layout.tsx`, `web/app/(app)/dashboard/page.tsx`, `web/app/(app)/mmr-lab/page.tsx`, `web/app/(app)/historical/page.tsx`, `web/app/(app)/admin/page.tsx`, `web/components/app-shell/*`.
- [ ] `app/layout.tsx`: `<html suppressHydrationWarning>`, fonts, `import "./globals.css"`, wrap children in `<ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>` (next-themes), a client `<QueryClientProvider>` wrapper component (`makeQueryClient()` in a `useState`), and `<Toaster />` (sonner).
- [ ] `app/page.tsx`: `redirect("/dashboard")`. `app/not-found.tsx`: a simple "Not found" inside minimal chrome.
- [ ] `app/(app)/layout.tsx` (server component): `const session = await auth(); if (!session) redirect("/signin");` (defence in depth alongside middleware). Read `serverEnv().ENV_LABEL`, render `<AppSidebar/>` + `<AppTopbar envLabel={ENV_LABEL} user={session.user}/>` + `<main>{children}</main>`.
- [ ] `components/app-shell/app-sidebar.tsx`: nav list — Dashboard (`/dashboard`, icon `LayoutDashboard`), VIN/MMR Lab (`/mmr-lab`, icon `Search`/`Car`), TAV Historical Data (`/historical`, icon `Database`/`History`), Admin/Integrations (`/admin`, icon `Settings`/`Plug`). Active-route highlight. Collapses to icons ≤1280px; off-canvas ≤768px (a `Sheet`). (v1.5 entries Ingest Monitor + Import Batches: commented out, not rendered.)
- [ ] `components/app-shell/app-topbar.tsx`: left = page title slot (children or `usePathname`-derived); right = `<GlobalSearch/>` stub (a disabled input with tooltip "Search — coming soon", or omit), `<EnvBadge label={envLabel}/>`, `<ThemeToggle/>`, `<UserMenu user={user}/>`.
- [ ] `components/app-shell/env-badge.tsx`: `PRODUCTION` → amber/red ring + bold; `STAGING` → blue; `LOCAL` → muted. Always visible.
- [ ] `components/app-shell/theme-toggle.tsx`: `useTheme()` from next-themes; toggles `light`/`dark`; sun/moon icon.
- [ ] `components/app-shell/user-menu.tsx`: dropdown — name, email, avatar; "Sign out" → `signOut()`.
- [ ] The 4 page files: each a placeholder for now — `export default function Page(){ return <div className="p-6"><h1>…</h1><p className="text-text-muted">Coming in Phase N.</p></div>; }`. (Phases 2–5 replace these.)
- [ ] Manual check: log in (or temporarily stub the session in dev) → see the shell, nav between the 4 placeholders, env badge shows `LOCAL`/`STAGING`, theme toggle flips.
- [ ] Commit: `git add web/app web/components/app-shell && git commit -m "feat(web): app shell — layout, providers, sidebar, topbar, env badge, theme toggle, user menu, page placeholders"`

### Task 1.14 — Vendor shadcn/ui components
**Files:** Creates `web/components/ui/*`, `web/lib/utils.ts` (the `cn()` helper).
- [ ] `pnpm dlx shadcn@latest init` (style: default; base color: slate; CSS variables: yes — but we'll point its tokens at our semantic vars). Then `pnpm dlx shadcn@latest add button card table tabs dialog sheet dropdown-menu badge skeleton input label select separator tooltip sonner`.
- [ ] Edit the generated `components.json` / the components' Tailwind classes so colours come from **our** semantic tokens (`bg-surface-raised`, `text-text-primary`, `border-border-subtle`, `bg-accent-action text-white` for primary buttons, status pills use `bg-status-*-bg text-status-*`), not shadcn's default `bg-background`/`text-foreground` names — i.e. either alias our vars to shadcn's expected names in `globals.css`, or do a find-replace pass in `components/ui/`. Goal: shadcn as *owned source styled to TAV*, not the default look.
- [ ] Commit: `git add web/components/ui web/components.json web/lib/utils.ts && git commit -m "feat(web): vendor shadcn/ui components, retheme to TAV semantic tokens"`

### Task 1.15 — Data-state components  [TDD on ErrorPanel + Unavailable]
**Files:** Create `web/components/data-state/{loading,empty,error-panel,unavailable,pending-backend}.tsx`; Tests for `error-panel` and `unavailable`.
- [ ] **`error-panel.test.tsx`:** render `<ErrorPanel result={{status:"error",code:"db_error",retryable:true}} onRetry={fn}/>` → shows a message + a "Retry" button that calls `fn` on click; with `retryable:false` (`code:"invalid_body"`) → no Retry button; `code:"unauthorized"` → message mentions signing in again.
- [ ] **`unavailable.test.tsx`:** `<Unavailable reason="intel_worker_timeout"/>` renders the human copy from `missingReasonCopy`; an unknown reason renders the fallback; never renders a number or "0".
- [ ] Implement all five: `loading.tsx` exports `<CardGridSkeleton count/>`, `<TableSkeleton rows/>`, `<ChartSkeleton/>` (shadcn `Skeleton` shapes); `empty.tsx` `<Empty title hint? action?/>`; `error-panel.tsx` as tested; `unavailable.tsx` as tested; `pending-backend.tsx` `<PendingBackend label note?/>` — visually distinct "Pending backend" placeholder (dashed border, muted, a small clock/construction icon), **never a value**.
- [ ] Commit: `git add web/components/data-state && git commit -m "feat(web): data-state component kit (loading/empty/error/unavailable/pending-backend)"`

### Task 1.16 — Vitest + RTL + MSW wiring
**Files:** Create `web/vitest.config.ts`, `web/vitest.setup.ts`, `web/test/msw/{handlers,fixtures,node}.ts`.
- [ ] `vitest.config.ts`: `@vitejs/plugin-react`, `environment: "jsdom"`, `setupFiles: ["./vitest.setup.ts"]`, alias `@`→`.`.
- [ ] `vitest.setup.ts`: `import "@testing-library/jest-dom"`; start the MSW node server `beforeAll`, `resetHandlers` `afterEach`, `close` `afterAll`.
- [ ] `test/msw/fixtures.ts`: typed fixtures mirroring `docs/APP_API.md` exactly — a healthy `system-status`, a `never_run` stale-sweep variant, a `db_error` variant; a full `kpis` payload, one with `outcomes.value:null,missingReason:"db_error"`; an `import-batches` list; a `historical-sales` list (a dozen realistic rows spanning a few months — used by Phase 2/4 tests); `mmr/vin` ok (`{68600,"high","vin"}` for the preview VIN), `mmr/vin` null+`intel_worker_timeout`, `mmr/vin` `400 invalid_body`.
- [ ] `test/msw/handlers.ts`: `http.get("/api/app/system-status", …)`, `…/kpis`, `…/import-batches`, `…/historical-sales` (respects `year`/`make`/`since` query params over the fixture rows), `http.post("/api/app/mmr/vin", …)` (returns the preview-VIN fixture for that VIN, the timeout fixture otherwise, `400` for a too-short VIN). `node.ts`: `setupServer(...handlers)`.
- [ ] Commit: `git add web/vitest.config.ts web/vitest.setup.ts web/test/msw && git commit -m "test(web): vitest + RTL + MSW setup with /app/* fixtures"`

### Task 1.17 — Playwright wiring + Phase-1 E2E (auth gate, shell)
**Files:** Create `web/playwright.config.ts`, `web/test/e2e/{auth-gate,shell}.spec.ts`, `web/test/e2e/fixtures/*`.
- [ ] `playwright.config.ts`: `webServer` runs `pnpm build && pnpm start` (or `pnpm dev`) on port 3000 with test env vars (a fake `APP_API_BASE_URL`/secret are fine since the app's network is intercepted); `use.baseURL = "http://localhost:3000"`; one project (chromium).
- [ ] **Mocked session:** the cleanest approach — set the Auth.js session cookie directly via `context.addCookies` using a test JWT, OR add a tiny test-only sign-in shortcut behind `process.env.E2E === "1"` (a route that creates a session for `e2e@texasautovalue.com`). Document whichever you pick in `test/e2e/fixtures/`. **Mocked `/api/app/*`:** `page.route("**/api/app/**", …)` returning the same fixtures as MSW.
- [ ] `auth-gate.spec.ts`: visit `/dashboard` without a session → URL ends at `/signin`; the "Sign in with Google" button is visible; visiting `/signin?error=AccessDenied` shows the denied copy.
- [ ] `shell.spec.ts`: with a mocked session → `/dashboard` renders; sidebar shows all 4 nav items; clicking each navigates and the URL changes; the env badge text matches the test env (`LOCAL`); the theme toggle flips a `dark` class on `<html>`.
- [ ] Run `pnpm test:e2e` → green. Commit: `git add web/playwright.config.ts web/test/e2e && git commit -m "test(web): playwright + phase-1 e2e (auth gate, shell)"`

### Task 1.18 — `DataTable<T>` (TanStack Table wrapper)
**Files:** Create `web/components/data-table/{data-table,column-header,pagination}.tsx`; Test `data-table.test.tsx`.
- [ ] **Test:** render `<DataTable columns=[{accessorKey:"name",header:"Name"},{accessorKey:"qty",header:"Qty"}] data=[{name:"B",qty:2},{name:"A",qty:1}] />` → both rows render; clicking the "Name" header sorts (A before B); a text filter on "Name" with "A" leaves one row; with `data={[]}` it renders the `<Empty/>` slot; with a `loading` prop the `<TableSkeleton/>`; with an `error` prop (an `ApiResult` error) the `<ErrorPanel/>` + Retry.
- [ ] Implement `DataTable<T>`: props `columns: ColumnDef<T>[]`, `data: T[]`, `loading?: boolean`, `error?: Extract<ApiResult, {status:"error"}>`, `onRetry?: ()=>void`, `emptyTitle?`, `pageSize?` (default 25), `density?` toggle. Uses `useReactTable` with `getCoreRowModel/getSortedRowModel/getFilteredRowModel/getPaginationRowModel`. Sticky header, per-column text filter inputs (and a `filterFn:"includesString"`), `column-header.tsx` for sortable headers, `pagination.tsx` (prev/next + page-size select + "Showing X–Y of Z"). Row-selection plumbing present but unused in v1 (`enableRowSelection` off).
- [ ] Commit: `git add web/components/data-table && git commit -m "feat(web): DataTable<T> over tanstack-table with sort/filter/paginate/states"`

### Task 1.19 — KPI + status components
**Files:** Create `web/components/kpi/{kpi-card,kpi-grid,stat-pill}.tsx`, `web/components/status/{status-pill,health-dot,caveat-banner}.tsx`; Test `kpi-card.test.tsx`, `status-pill.test.tsx`.
- [ ] **`kpi-card.test.tsx`:** `<KpiCard label="Avg gross" value={1500}/>` → renders "$1,500" (uses `money`); `value={null}` → renders `<Unavailable/>`-style "—"/"Not available", **not** "0"; `state="pending"` → renders `<PendingBackend/>`; `trend={{dir:"up",text:"+12% vs last month"}}` → shows the trend badge.
- [ ] **`status-pill.test.tsx`:** `<StatusPill status="healthy">Healthy</StatusPill>` has the healthy token classes; `status="error"` the error classes; statuses map `healthy|review|error|neutral`.
- [ ] Implement: `KpiCard` (label + big null-safe value + optional `trend` badge + optional `state:"pending"|"unavailable"` with `reason`), `KpiGrid` (responsive 2/3/4-col), `StatPill`; `StatusPill` (semantic-status → `bg-status-*-bg text-status-*`), `HealthDot`, `CaveatBanner` (a persistent dismissible-or-not banner — for the Cox-sandbox notice it's **not** dismissible).
- [ ] Commit: `git add web/components/kpi web/components/status && git commit -m "feat(web): KPI cards/grid + status pill/dot/caveat-banner"`

### Task 1.20 — Recharts wrappers
**Files:** Create `web/components/charts/{bar-chart-card,line-chart-card,histogram-card,chart-theme}.tsx`; Test `bar-chart-card.test.tsx`.
- [ ] **Test:** `<BarChartCard title="Gross by region" data=[{label:"TX-East",value:1200},{label:"TX-West",value:900}] xKey="label" yKey="value"/>` → renders the title and the two category labels; `data={[]}` → renders an "No data" empty state (not an empty chart frame); `data` with `< minPoints` (e.g. a `minPoints={2}` prop and 1 point) → "Not enough data" state.
- [ ] Implement: `chart-theme.ts` (axis/grid stroke = `var(--color-border-subtle)`, text = `var(--color-text-secondary)`, bar/line fill = `var(--color-accent-action)` with status-coloured variants available); `BarChartCard` (vertical bars, `ResponsiveContainer`, title, empty/insufficient states, accessible — `<title>`/`aria-label` + an optional toggle to show the underlying values as a small table), `LineChartCard` (line or area via a `variant` prop — used for the monthly gross trend), `HistogramCard` (bars over pre-bucketed `{bucketLabel, count}` data). All consume already-shaped typed series (no data-massaging inside the chart).
- [ ] Commit: `git add web/components/charts && git commit -m "feat(web): recharts wrappers (bar/line/histogram) with empty + a11y states"`

### Task 1.21 — Contract test scaffold (`pnpm test:contract`)
**Files:** Create `web/vitest.contract.config.ts`, `web/test/contract/app-api.contract.test.ts`.
- [ ] `vitest.contract.config.ts`: node environment, no MSW, reads `APP_API_BASE_URL`/`APP_API_SECRET` from the real environment, **excluded from the default `pnpm test` glob**.
- [ ] `app-api.contract.test.ts`: against the **real staging Worker** (call it directly with the Bearer, or stand up the Next proxy) — assert: `GET /app/system-status` → 200 and matches `SystemStatusSchema`; `GET /app/kpis` → 200 (or 503 `db_error`) and matches `KpisSchema`; `GET /app/import-batches?limit=2` → 200, `ImportBatchListSchema`; `GET /app/historical-sales?limit=2` → 200, `HistoricalSaleListSchema`; `POST /app/mmr/vin {vin:"1FT8W3BT1SEC27066",mileage:50000}` → 200, body matches `MmrVinOkSchema | MmrVinUnavailableSchema` (don't assert the exact MMR number — it's sandbox-backed and may move; assert shape + `confidence`/`method` enums); a bad VIN (`"x"`) → 400 `invalid_body` with `issues`. Each test `skip()`s itself if `APP_API_SECRET` is unset (so it never fails in CI if accidentally run).
- [ ] Add a `test:contract` script (already in Task 1.2's script block). **Do NOT add it to `web-ci`.**
- [ ] Commit: `git add web/vitest.contract.config.ts web/test/contract && git commit -m "test(web): manual staging contract test for /app/* envelopes"`

### Task 1.22 — `web-ci` GitHub Actions workflow
**Files:** Create `.github/workflows/web-ci.yml` (repo root, not under `web/`).
- [ ] Implement:
```yaml
name: web-ci
on:
  push:
    paths: ["web/**", ".github/workflows/web-ci.yml"]
  pull_request:
    paths: ["web/**", ".github/workflows/web-ci.yml"]
jobs:
  web:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: web } }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm, cache-dependency-path: web/pnpm-lock.yaml }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```
  (Provide dummy build-time env so `next build` + `serverEnv()` don't throw — either guard `serverEnv()` to tolerate build-time absence, or pass placeholder `APP_API_BASE_URL=https://tav-aip-staging.rami-1a9.workers.dev APP_API_SECRET=ci AUTH_SECRET=ci AUTH_GOOGLE_ID=ci AUTH_GOOGLE_SECRET=ci` as `env:` on the build step. Prefer the placeholders — keeps `serverEnv()` strict.)
- [ ] Push the branch / open the PR → confirm `web-ci` runs and is green.
- [ ] Commit: `git add .github/workflows/web-ci.yml && git commit -m "ci: add web-ci workflow for the /web frontend"`

### Task 1.23 — Vercel project (manual checklist — no code)
- [ ] Create the Vercel project (root dir `web`, Next.js preset, pnpm). Set the §3 env vars in Production + Preview scopes. Map `main`→Production, branches/PRs→Preview. Trigger the first Preview deploy from a branch.
- [ ] Note the assigned Vercel domains; add `https://<prod-domain>/api/auth/callback/google` and the preview-URL callback to the Google OAuth client; set `AUTH_URL` per scope.
- [ ] On a Preview deploy: do **one real Google OAuth round-trip** with a `@texasautovalue.com` account → lands in the dashboard; try a non-domain account → denied with the message. (This satisfies the spec's manual-OAuth acceptance item.)
- [ ] (No commit — this is infra config. Record completion in `docs/followups.md` if you want a trail.)

**Phase 1 done when:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass locally; `pnpm test:e2e` green; `web-ci` green; logging in shows the shell + 4 placeholder pages + working env badge + theme toggle; the proxy works (a quick manual `fetch("/api/app/system-status")` from the browser console while logged in returns the Worker JSON); `APP_API_SECRET` appears nowhere in the client bundle (`pnpm build` then `grep -r "APP_API_SECRET" .next/static` → nothing) or in browser network calls.

---

## PHASE 2 — KPI Dashboard (`/dashboard`)

> Outcome: the landing page renders live KPI cards from `/app/kpis` + `/app/system-status`, gross-by-region and hold-days-by-region bar charts, the client-side monthly gross-trend line chart from `/app/historical-sales` (labelled as a sample), the system-health pill, the "Pending backend" future-metrics grid (with the few `system-status`-derivable tiles promoted to live), and per-region every loading/empty/error/unavailable state. No fabricated numbers.

### Task 2.1 — Dashboard data layer (RSC + client refresh)
**Files:** Modify `web/app/(app)/dashboard/page.tsx`; Create `web/app/(app)/dashboard/_components/*` (page-local components).
- [ ] `page.tsx` is a server component: `await Promise.all([appApiServer.getKpis(), appApiServer.getSystemStatus(), appApiServer.listHistoricalSales({ limit: 100 })])` for first paint; pass results to client child components that also register TanStack Query (`useQuery(queryKeys.kpis, () => appApiClient.getKpis(), { initialData })`, `useQuery(queryKeys.systemStatus, …, { refetchInterval: SYSTEM_STATUS_REFETCH_MS, initialData })`, `useQuery(queryKeys.historicalSales({limit:100}), …, { initialData })`).
- [ ] Each consuming component switches on the `ApiResult` status: `ok` → render; `unavailable` → `<Unavailable reason/>`; `error` → `<ErrorPanel result onRetry={refetch}/>`; while `isFetching` with no data → the matching skeleton. The page itself never shows a single global spinner — it streams region by region.
- [ ] Commit when 2.x are individually green; or commit per sub-task. Suggested: one commit per logical block (cards, charts, health, future-metrics).

### Task 2.2 — Live KPI cards  [TDD on the card-section component]
**Files:** `web/app/(app)/dashboard/_components/kpi-cards.tsx`; Test `kpi-cards.test.tsx`.
- [ ] **Test (with the MSW kpis fixture):** renders cards for Total outcomes (3), Avg gross profit ($1,500), Avg hold days (21.5), Last outcome at (relative), Leads total (7), Normalized listings (42). With the `outcomes.value:null,missingReason:"db_error"` fixture → the outcomes-derived cards show `<Unavailable reason="db_error"/>` while Leads/Listings still render their numbers. No "0" appears for a `null` value.
- [ ] Implement: a `KpiGrid` of `KpiCard`s reading the `kpis` `ApiResult` (handling the block-level results — `outcomes` may be `unavailable` while `leads`/`listings` are `ok`). Use `money`/`num`/`relativeTime` from `format.ts`.
- [ ] Commit: `git add web/app/(app)/dashboard && git commit -m "feat(web): dashboard live KPI cards from /app/kpis"`

### Task 2.3 — System-health pill
**Files:** `web/app/(app)/dashboard/_components/system-health.tsx`.
- [ ] From the `system-status` data: derive a single status — `Healthy` if `db.ok` and `intelWorker.binding` (or `mode==="worker"` with a `url`) and `staleSweep` not `db_error`; `Degraded` if some-but-not-all; `Down` if `db.ok` is false. Render `<StatusPill>` + a popover/`Drawer` with the per-subsystem detail (DB ok/error; intel worker mode/binding/url; stale sweep "last run <relative> — <status> — <updated> rows" / "never run" / "unavailable").
- [ ] Commit with the next block or solo: `git commit -m "feat(web): dashboard system-health pill from /app/system-status"`

### Task 2.4 — Gross-by-region & hold-days-by-region charts
**Files:** `web/app/(app)/dashboard/_components/region-charts.tsx`; Test `region-charts.test.tsx`.
- [ ] **Test:** with a `kpis` fixture whose `outcomes.value.byRegion` has 2–3 rows → two `BarChartCard`s render with the region labels; with `byRegion: []` → both show the empty state; with `outcomes` unavailable → both show `<Unavailable/>`.
- [ ] Implement: map `outcomes.value.byRegion` rows (passed through verbatim from `v_outcome_summary` — pick the gross + hold-days + region columns, which carry their raw snake_case names; pick defensively with optional chaining and skip rows missing the needed field) → `[{label: region, value: avgGross}]` and `[{label: region, value: avgHoldDays}]` → `<BarChartCard/>` each.
- [ ] Commit: `git commit -m "feat(web): dashboard gross-by-region & hold-days-by-region charts"`

### Task 2.5 — Monthly gross-trend chart (client-side from historical-sales)
**Files:** `web/app/(app)/dashboard/_components/gross-trend.tsx` (uses `lib/historical-aggregate.ts` — **build that helper here if Phase 4 hasn't yet**, see Task 4.2; it's shared).
- [ ] Use `bucketGrossByMonth(historicalSales: HistoricalSale[]): { month: string; avgGross: number; count: number }[]` (from `lib/historical-aggregate.ts`). Render a `<LineChartCard variant="area" title="Gross trend (TAV historical sales — returned sample)">` over `{x: month, y: avgGross}`. **Caption under the chart:** "Based on the most recent {n} historical-sales rows returned by the API — not a full-database aggregate." (Show `n` and, if any filter were active, the filter — none on the dashboard.) Empty/insufficient state if `< 2` months.
- [ ] If `historicalSales` came back `error` → `<ErrorPanel/>`; `unavailable` doesn't apply (the list endpoint either 200s with rows or 503s).
- [ ] Commit: `git commit -m "feat(web): dashboard monthly gross-trend chart from historical-sales sample"`

### Task 2.6 — "Pending backend" future-metrics grid (+ promote derivable tiles)
**Files:** `web/app/(app)/dashboard/_components/future-metrics.tsx`.
- [ ] Render a clearly-headed section ("Coming soon — pending backend") of `<PendingBackend label/>` tiles for the spec's ~30 future metrics — **titles only, no numbers**. **Promote to live tiles** (real values, not `PendingBackend`) the ones derivable from `system-status`: "Cox/Manheim worker status" (from `intelWorker`), "Supabase/API health" (from `db.ok`), "Apify ingest status" (from `sources` — show "N sources, last run <most-recent>"); and "MMR routing mode" (`intelWorker.mode`). Everything else stays `PendingBackend`.
- [ ] **Explicitly do NOT render any `sellThroughRate`** anywhere.
- [ ] Commit: `git commit -m "feat(web): dashboard future-metrics grid (pending) + promote system-status-derivable tiles"`

### Task 2.7 — Dashboard E2E
**Files:** `web/test/e2e/dashboard.spec.ts`.
- [ ] With mocked session + mocked `/api/app/*` (the same fixtures): `/dashboard` renders; the KPI cards show the fixture numbers; the gross-by-region chart shows a region label; the gross-trend chart and its "returned sample" caption are present; the "pending backend" section header is present; toggling theme doesn't break the charts.
- [ ] Run `pnpm test && pnpm test:e2e` → green. Commit: `git add web/test/e2e/dashboard.spec.ts && git commit -m "test(web): dashboard e2e"`

**Phase 2 done when:** `/dashboard` renders all live regions from real data (against staging in a Preview deploy), each region has its loading/empty/error/unavailable state, no fabricated numbers, the trend chart is correctly labelled as a sample, tests + e2e green, `web-ci` green.

---

## PHASE 3 — VIN / MMR Lookup Lab (`/mmr-lab`)

> Outcome: a form (`vin`, `mileage`, `year`, client-only `asking price`/`source`/`notes`) → `POST /api/app/mmr/vin` mutation → result panel (MMR value, confidence pill, method, timestamp, or `Unavailable` with the missing-reason copy + Retry), client-side deal spread + heuristic Strong-Buy/Review/Pass recommendation (labelled "heuristic — not the production buy-box score"), collapsed raw-payload viewer, the preview-VIN "fill example" button (labelled test input), the inline Cox-sandbox caveat, and the TAV-historical-comparison panel (client-side aggregates over `/app/historical-sales?year=&make=&model=`, the rest `PendingBackend`).

### Task 3.1 — `lib/recommendation.ts`  [TDD]
**Files:** Create `web/lib/recommendation.ts`; Test `web/lib/recommendation.test.ts`.
- [ ] **Test:** `recommend({ spread: 5000, confidence: "high" })` → `"strong_buy"` (big positive headroom, high confidence); `recommend({ spread: 500, confidence: "low" })` → `"review"` (thin margin or low confidence); `recommend({ spread: -2000, confidence: "high" })` → `"pass"` (asking above MMR); `recommend({ spread: undefined, confidence: "high" })` → `"insufficient"` (no asking price entered). Document the thresholds in the test (they're product knobs — pick reasonable v1 numbers, e.g. strong_buy ≥ $3000 headroom & confidence high|medium; pass if headroom < 0; review otherwise; insufficient if spread undefined).
- [ ] **FAIL → implement** a pure function with a tiny documented threshold table → **PASS**.
- [ ] Commit: `git add web/lib/recommendation.ts web/lib/recommendation.test.ts && git commit -m "feat(web): heuristic acquisition recommendation helper"`

### Task 3.2 — MMR Lab form + mutation
**Files:** Modify `web/app/(app)/mmr-lab/page.tsx`; Create `web/app/(app)/mmr-lab/_components/{lookup-form,result-panel,historical-comparison}.tsx`.
- [ ] `lookup-form.tsx`: controlled inputs — VIN (required; client check: trimmed, length 11–17, A–Z0–9; show inline error before submit, but also surface the Worker's `400 invalid_body` `issues` if it rejects), Mileage (int 0–2,000,000), Year (int 1900–2100, optional), Asking price (currency, **client-only**), Source / Notes (text, **client-only**, not sent). Submit → `useMutation(() => appApiClient.postMmrVin({ vin, year, mileage }))`. A "Fill example" button populates the preview VIN `1FT8W3BT1SEC27066` / mileage `50000` / year `2025` and is labelled "example / test input — not production data".
- [ ] An inline `<CaveatBanner>` at the top of the page: the Cox-sandbox string verbatim ("Cox MMR is currently sandbox-backed in production until Cox enables true production MMR credentials.").
- [ ] Commit after the result panel (next task): logical commit.

### Task 3.3 — Result panel + spread + recommendation + raw payload  [TDD on the result component]
**Files:** `web/app/(app)/mmr-lab/_components/result-panel.tsx`; Test `result-panel.test.tsx`.
- [ ] **Test (no network — pass `ApiResult` props directly):**
  - `result={{status:"ok",data:{mmrValue:68600,confidence:"high",method:"vin"}}}, asking={62000}` → shows "$68,600", a "high" confidence pill, method "vin", a timestamp, and **deal spread** "headroom $6,600" (`mmr − asking`) styled positive, and recommendation "Strong Buy" with the "heuristic — not the production buy-box score" label.
  - same with `asking={71000}` → spread "overpriced by $2,400" styled negative; recommendation "Pass".
  - no `asking` → spread region says "Enter an asking price for a spread & recommendation"; recommendation "—".
  - `result={{status:"unavailable",reason:"intel_worker_timeout"}}` → `<Unavailable/>` with the timeout copy + a Retry button (wired to a passed `onRetry`).
  - `result={{status:"error",code:"invalid_body",retryable:false,issues:[…]}}` → shows the validation issues, no Retry.
  - YMM/trim fields → rendered as `<PendingBackend label="Year / Make / Model / Trim — not returned by the lookup yet"/>` (the lean endpoint doesn't return them).
  - Raw-payload `<details>` collapsed by default; expanding shows the `{mmrValue,confidence,method}` JSON.
- [ ] Implement accordingly (use `lib/recommendation.ts`, `format.ts`).
- [ ] Commit: `git add web/app/(app)/mmr-lab && git commit -m "feat(web): mmr lab — form, result panel, spread, heuristic recommendation, raw payload, sandbox caveat"`

### Task 3.4 — TAV-historical-comparison panel
**Files:** `web/app/(app)/mmr-lab/_components/historical-comparison.tsx` (uses `lib/historical-aggregate.ts` — Task 4.2).
- [ ] When the user has entered (or the lookup returned) a year/make/model: `useQuery(queryKeys.historicalSales({year,make,model,limit:100}), () => appApiClient.listHistoricalSales({year,make,model,limit:100}))`. From the returned rows, filter `trim` client-side (the endpoint has no trim filter), then compute the **available** aggregates via `lib/historical-aggregate.ts`: count, last sold date, avg & median `salePrice`, avg `acquisitionCost`, avg `grossProfit`. Render them with the sample size shown ("n = 12 similar units" / "low confidence — n < 5"). Render the rest the spec lists — front/back gross split, days-to-sell, regional performance — as `<PendingBackend>` with a one-line note pointing at the API-gap register.
- [ ] If the query is `error` → `<ErrorPanel/>`; empty rows → `<Empty title="No matching historical sales"/>`.
- [ ] Commit: `git commit -m "feat(web): mmr lab — TAV historical comparison panel (available aggregates + pending fields)"`

### Task 3.5 — MMR Lab E2E
**Files:** `web/test/e2e/mmr-lab.spec.ts`.
- [ ] Mocked session + `page.route("**/api/app/mmr/vin", …)` returning the preview-VIN fixture: open `/mmr-lab`; click "Fill example" → VIN populated; enter asking price $62,000; submit → result panel shows the MMR value, confidence pill, the spread/headroom, and a recommendation; the Cox-sandbox caveat text is present; a too-short VIN → the inline validation error appears (no network call).
- [ ] `pnpm test && pnpm test:e2e` → green. Commit: `git add web/test/e2e/mmr-lab.spec.ts && git commit -m "test(web): mmr lab e2e"`

**Phase 3 done when:** the lookup flow works against the staging Worker in a Preview deploy (sandbox MMR value shows, with the caveat visible), all `ApiResult` branches render correctly, the recommendation is clearly labelled heuristic, the historical-comparison panel is honest about what it can and can't show, tests + e2e green, `web-ci` green.

---

## PHASE 4 — TAV Historical Data (`/historical`)

> Outcome: a filter bar (server-side `year`/`make`/`model`/`since` + client-side `trim`/`vin`/`gross-range`), a `DataTable` with the columns the row shape actually has, a row-detail `Sheet`, the derivable charts (gross by month, gross by make/model, volume by month, sale-price trend, gross histogram), `PendingBackend` for the charts/filters that need data the row doesn't carry, and a "Load more" that bumps `limit`. Every chart/table has its states.

### Task 4.1 — Historical page data layer + filter bar
**Files:** Modify `web/app/(app)/historical/page.tsx`; Create `web/app/(app)/historical/_components/{filter-bar,sales-table,sales-charts,row-detail-sheet}.tsx`.
- [ ] `page.tsx` server component: initial `appApiServer.listHistoricalSales({ limit: 100 })`; a client wrapper holds the filter state and `useQuery(queryKeys.historicalSales(filter), () => appApiClient.listHistoricalSales(filter), { initialData (when filter is the initial one) })`. Filter changes refetch.
- [ ] `filter-bar.tsx`: Sale-date "since" (date picker → `since`); Year (number input → `year`, exact); Make / Model (**select-from-distinct** populated from a first unfiltered fetch's distinct values, per the spec's recommendation — falls back to free text if the distinct fetch is empty); Trim / VIN-present / Gross-range — **client-side** filters over the returned rows. Controls for mileage / days-to-sell / region / store / source — **omitted** in v1 (listed in the API-gap register; don't render disabled clutter). A small note above the table: "Showing what TAV's data currently includes — more columns/filters after schema work."
- [ ] Commit with the next tasks.

### Task 4.2 — `lib/historical-aggregate.ts`  [TDD]  (shared with Phases 2 & 3)
**Files:** Create `web/lib/historical-aggregate.ts`; Test `web/lib/historical-aggregate.test.ts`. (If Phase 2 already created this for the trend chart, this task is just "verify it covers all the helpers below + add tests".)
- [ ] **Test:** given a small `HistoricalSale[]` fixture spanning 3 months:
  - `bucketGrossByMonth(rows)` → array of `{ month: "2026-03", avgGross, count }` sorted ascending, skipping rows with `grossProfit == null`, `saleDate` missing — assert the month keys and a computed avg.
  - `bucketCountByMonth(rows)` → `{ month, count }[]`.
  - `bucketAvgSalePriceByMonth(rows)` → `{ month, avgSalePrice }[]`.
  - `segmentRollup(rows, r => `${r.make} ${r.model}`)` → `{ key, count, sumGross, avgGross }[]` sorted by `avgGross` desc.
  - `median(nums)` → correct for odd/even/empty (`empty → null`).
  - `histogramBuckets(nums, bucketSize)` → `{ bucketLabel, count }[]` (e.g. gross-profit in $1k buckets).
  - `comparisonAggregates(rows)` → `{ count, lastSoldDate, avgSalePrice, medianSalePrice, avgAcquisitionCost, avgGross }` (all null-safe; `count===0 → everything null except count`).
- [ ] **FAIL → implement** pure functions (no I/O) → **PASS**.
- [ ] Commit: `git add web/lib/historical-aggregate.ts web/lib/historical-aggregate.test.ts && git commit -m "feat(web): pure historical-sales aggregation helpers (shared)"`

### Task 4.3 — Sales table + row-detail sheet
**Files:** `web/app/(app)/historical/_components/{sales-table,row-detail-sheet}.tsx`; Test `sales-table.test.tsx`.
- [ ] **Test (with the historical-sales MSW fixture):** the `DataTable` renders the columns — Sale date · VIN (or "—") · Year · Make · Model · Trim (or "—") · Acquisition cost · Sale price · Transport cost · Recon cost · Auction fees · **Gross profit** · Acquisition date · Buyer · Source file · Upload batch — with `money`-formatted currencies and `dateLabel` dates; a `null` VIN shows "—" not blank; clicking a row opens the `Sheet` showing the full record; the columns the brief asked for that don't exist (Stock number, Mileage, Front gross, Back gross, Total gross, Days to sell, Region/store, Source channel) are **not** columns — instead a small "more columns pending schema work" note is visible.
- [ ] Implement: `ColumnDef<HistoricalSale>[]`, the `DataTable` (page size 25, sortable, the client-side trim/vin/gross filters wired through), `RowDetailSheet` (a shadcn `Sheet` with the full formatted record — no extra fetch). A "Load more" button increments the `limit` in the filter state (best-effort; note server clamps to 100).
- [ ] Commit: `git add web/app/(app)/historical && git commit -m "feat(web): historical sales table + row-detail sheet + filters"`

### Task 4.4 — Historical charts
**Files:** `web/app/(app)/historical/_components/sales-charts.tsx`.
- [ ] Using `lib/historical-aggregate.ts` over the *currently-displayed* rows: **Gross by month** (`LineChartCard` over `bucketGrossByMonth`), **Volume by month** (`BarChartCard` over `bucketCountByMonth`), **Gross by make/model** (`BarChartCard` over the top-N `segmentRollup`), **Sale-price trend** (`LineChartCard` over `bucketAvgSalePriceByMonth` — labelled "TAV sale price, not market retail"), **Gross distribution histogram** (`HistogramCard` over `histogramBuckets(grossProfit, 1000)`). Each: the same "based on the returned sample (n, plus active filters)" caption as the dashboard trend chart. Charts the brief listed that need absent data — days-to-sell by segment, aging/velocity, wholesale-to-retail spread — rendered as `<PendingBackend>` with a one-line "needs <field>" note.
- [ ] Commit: `git commit -m "feat(web): historical sales charts (derivable) + pending placeholders for missing-data charts"`

### Task 4.5 — Historical E2E
**Files:** `web/test/e2e/historical.spec.ts`.
- [ ] Mocked session + mocked `/api/app/historical-sales` (respects `year`/`make` query params over the fixture): open `/historical`; the table shows fixture rows; apply a `year` filter → the table updates to the matching subset (assert a known row appears/disappears); click a row → the detail sheet opens; the "more columns pending" note is present; a chart renders a month label.
- [ ] `pnpm test && pnpm test:e2e` → green. Commit: `git add web/test/e2e/historical.spec.ts && git commit -m "test(web): historical data e2e"`

**Phase 4 done when:** `/historical` lists real TAV sales (Preview deploy against staging), server-side filters round-trip, client-side filters work, the table/charts honestly reflect the available columns with `PendingBackend` for the rest, row detail works, tests + e2e green, `web-ci` green.

---

## PHASE 5 — Admin / Integrations (`/admin`)

> Outcome: all the §9-Page-9 sections from the spec — signed-in email, the explicit environment section, API health, intelligence-worker status, the persistent Cox-sandbox `CaveatBanner` (verbatim string), the `v_source_health` source-run table, the stale-sweep panel, the secrets checklist (names only, never values), `MANHEIM_LOOKUP_MODE`, and a single safe "Refresh system status" button. `PendingBackend` for the bits `/app/system-status` doesn't expose yet.

### Task 5.1 — Admin page
**Files:** Modify `web/app/(app)/admin/page.tsx`; Create `web/app/(app)/admin/_components/{env-section,api-health,intel-worker,source-health-table,stale-sweep,secrets-checklist,feature-flags}.tsx`; Test `admin/_components/secrets-checklist.test.tsx`, `intel-worker.test.tsx`.
- [ ] `page.tsx`: server component — `const session = await auth();` (it's gated, but read the email here), `const status = await appApiServer.getSystemStatus();`; pass `session.user.email`, `serverEnv().ENV_LABEL`, `serverEnv().APP_API_BASE_URL` *host only* (compute `new URL(base).host`), and `status` to client components. A client child runs `useQuery(queryKeys.systemStatus, …, { refetchInterval })` so "Refresh" + auto-poll work.
- [ ] **Sections:**
  - **Signed-in user** — the email + name. Nothing else.
  - **Environment** — big explicit "Connected to **{ENV_LABEL}**" + the `APP_API_BASE_URL` **host** (never the secret).
  - **API health** — `db.ok` → Healthy / "Database error"; `service`, `version`, `timestamp`.
  - **Intelligence worker** — `intelWorker.mode` ("worker"/"direct"), `binding` (yes/no), `url` (or "none"); a `StatusPill` summarising. **Test:** `<IntelWorker data={{mode:"worker",binding:true,url:"https://…"}}/>` → "Healthy / routed via worker, service binding active"; `{mode:"direct",binding:false,url:null}` → a degraded pill.
  - **Cox / Manheim** — a **non-dismissible** `<CaveatBanner>` with the exact string "Cox MMR is currently sandbox-backed in production until Cox enables true production MMR credentials.", plus an explicit "Cox environment: **Sandbox-backed**" label (static, tied to the caveat — there's no machine-readable flag in `system-status` yet; note that as a tiny API-gap item).
  - **Source-run health** — a `DataTable` over `status.sources` (rows of `v_source_health`, columns picked defensively from whatever keys are present — source name, last run, counts, status). Empty state when `db.ok` is false (`sources` is `[]` then).
  - **Stale sweep** — `staleSweep`: "Last run <relative> — <status> — <updated> rows", or "Never run" (`missingReason:"never_run"` — note "expected right after the migration until the first daily cron fires"), or "Unavailable" (`missingReason:"db_error"`).
  - **Secrets checklist (names only)** — a static list of the backend secret *names* (`APP_API_SECRET`, `ADMIN_API_SECRET`, `WEBHOOK_HMAC_SECRET`, `INTEL_WORKER_SECRET`, Manheim creds, Twilio creds, Supabase service role key) shown as a checklist; `APP_API_SECRET` is "confirmed configured" (we got `/app/*` data, so it must be); intel-worker wiring inferred from `system-status`; the rest "managed as Cloudflare Worker secrets — not visible here". **Test:** the component renders the names and **never** any value (assert the rendered text contains no `=`-style assignment, no token-looking strings — really just assert it renders the fixed name list and a "not visible here" label).
  - **Feature flags** — show `MANHEIM_LOOKUP_MODE` (from `intelWorker.mode`); `HYBRID_BUYBOX_ENABLED` → `<PendingBackend label="HYBRID_BUYBOX_ENABLED — not exposed by /app/system-status yet"/>`.
  - **"Refresh system status"** — a button that calls `queryClient.invalidateQueries(queryKeys.systemStatus)`. No other test buttons in v1.
  - **PendingBackend** for: last successful MMR lookup, last ingest, last sales upload, error-log summary (note `status.sources` covers *some* of "last ingest" per source).
- [ ] Commit: `git add web/app/(app)/admin && git commit -m "feat(web): admin/integrations page — env, health, intel worker, cox caveat, source health, stale sweep, secrets checklist"`

### Task 5.2 — Admin E2E
**Files:** `web/test/e2e/admin.spec.ts`.
- [ ] Mocked session + mocked `/api/app/system-status` (healthy fixture): open `/admin`; the signed-in email is shown; the environment label matches the test env; the **exact Cox-sandbox caveat string is present** (assert the literal text); the source-health table renders a row from the fixture; the stale-sweep panel shows the fixture's last-run line; the secrets checklist shows names and the "not visible here" label and **no secret values**; "Refresh system status" is clickable. Also test with the `never_run` stale-sweep fixture → "Never run" copy; with `db.ok:false` → API-health shows "Database error" and the source table shows its empty state.
- [ ] `pnpm test && pnpm test:e2e` → green. Commit: `git add web/test/e2e/admin.spec.ts && git commit -m "test(web): admin/integrations e2e"`

**Phase 5 done when:** `/admin` shows all sections from real `system-status` (Preview deploy against staging), the Cox-sandbox caveat is verbatim and persistent, no secret values appear anywhere, the signed-in email shows, "Refresh" works, tests + e2e green, `web-ci` green.

---

## 6. Cleanup task — fix repo guidance to match the approved spec
**Files:** Modify `CLAUDE.md` (repo root).
- [ ] In `CLAUDE.md` §1 "Stack" line, change **"Future dashboard: Next.js + Supabase Auth + Tailwind."** → **"Production dashboard (`/web`): Next.js (App Router) + Auth.js (Google OIDC) + Tailwind v4 + shadcn/ui — see `docs/superpowers/specs/2026-05-11-web-frontend-design.md`."** (No other edits to `CLAUDE.md`.)
- [ ] Commit: `git add CLAUDE.md && git commit -m "docs: update dashboard stack note to Auth.js (Google OIDC) per approved web frontend spec"`
- [ ] (Do this commit at the end of Phase 1, or even before Phase 1 — it's independent. Suggested: right after Task 1.6 lands, so the repo guidance is correct as soon as auth exists.)

---

## 7. Test plan per phase (summary)

| Phase | Unit / component (Vitest+RTL, MSW) | E2E (Playwright, mocked session + mocked `/api/app/*`) | Manual / Preview |
|---|---|---|---|
| 1 | `deriveEnvLabel` + env parser; `isAllowedEmail`; proxy handler (auth gate, bearer injection, no-cookie-forward, 502 on upstream fail, POST body pass-through); `ApiResult` mapper (all branches); formatters; `DataTable` (sort/filter/empty/loading/error); `ErrorPanel`/`Unavailable`/`KpiCard`/`StatusPill`/`BarChartCard` states | `auth-gate.spec` (redirect, denied copy); `shell.spec` (4 nav items, navigation, env badge, theme toggle) | `pnpm build` then `grep APP_API_SECRET .next/static` → empty; one real Google OAuth round-trip on a Preview deploy (domain account in, non-domain denied); a browser-console `fetch('/api/app/system-status')` returns Worker JSON |
| 2 | `kpi-cards` (numbers, block-level unavailable, no "0" for null); `region-charts` (labels, empty, unavailable); `historical-aggregate` (if not yet) | `dashboard.spec` (cards show fixture numbers, region chart label, trend-chart "returned sample" caption, pending-backend section, theme toggle doesn't break charts) | view `/dashboard` on a Preview deploy against staging — real numbers, real region rows |
| 3 | `recommendation` (strong_buy/review/pass/insufficient); `result-panel` (ok/unavailable/error branches, spread sign, recommendation label, YMM pending, raw payload collapsed) | `mmr-lab.spec` (fill example → submit → result + spread + recommendation; caveat text present; short-VIN inline error, no network) | run a real lookup (preview VIN) on a Preview deploy → sandbox MMR shows, caveat visible |
| 4 | `historical-aggregate` (all helpers, null-safety, median, histogram); `sales-table` (columns, "—" for null VIN, row sheet, "more columns pending" note) | `historical.spec` (table rows, year filter updates table, row sheet opens, pending note, a chart month label) | view `/historical` on a Preview deploy → real TAV rows, filters round-trip |
| 5 | `intel-worker` (healthy/degraded pill); `secrets-checklist` (names only, no values) | `admin.spec` (signed-in email, env label, **exact Cox caveat string**, source-health row, stale-sweep line, secrets checklist names + "not visible here" + no values, Refresh clickable; `never_run` and `db.ok:false` variants) | view `/admin` on a Preview deploy → real `system-status`, caveat verbatim, no secret values |
| all | — | — | `pnpm test:contract` against the staging Worker passes (manual, pre-release) |

---

## 8. Acceptance criteria (from the spec §15 — v1 "production usable")

- [ ] `/web` deployed to Vercel **Production** from `main`.
- [ ] Auth.js Google gate works: `texasautovalue.com` accounts allowed; non-`texasautovalue.com` denied with a clear message; clear unauthenticated/sign-in state.
- [ ] `APP_API_SECRET` never appears in the browser bundle, browser network calls, logs, or client env. Browser calls only `/api/app/*` proxy routes — never the Worker directly.
- [ ] All 4 v1 pages render **real production-Worker data**: KPI Dashboard, VIN/MMR Lookup Lab, TAV Historical Data, Admin/Integrations.
- [ ] Environment badge correct per Vercel environment.
- [ ] Every data region has loading / empty / error / pending-backend states. No fake operational numbers in normal mode (Demo Mode is v2).
- [ ] Admin shows the signed-in user's email.
- [ ] Admin shows the Cox sandbox-backed production caveat string verbatim.
- [ ] Dark mode works and is not visually broken.
- [ ] `web-ci` green.
- [ ] Playwright v1 smoke/key-flow suite (depth (ii)) passes.
- [ ] The manual `pnpm test:contract` against staging passes before the production launch.
- [ ] One real Google OAuth round-trip verified manually on a Vercel Preview deploy.
- [ ] A TAV staffer can use it for daily VIN lookups, KPI review, historical-sales review, and system-status checks.

---

## 9. Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| **Secret leakage** — `APP_API_SECRET` ends up in the client bundle or a browser request | `env.ts`/`server.ts`/the proxy route all `import "server-only"`; no `NEXT_PUBLIC_` variant exists; Phase-1 acceptance includes a `grep APP_API_SECRET .next/static` check + a browser-devtools network check; the proxy never forwards the incoming `Authorization`/`Cookie` and only ever *adds* the Bearer server-side. If a leak is found: rotate `APP_API_SECRET` on both Workers (`wrangler secret put APP_API_SECRET`), update Vercel env, redeploy. |
| **Auth.js v5 (beta) churn** — API changes between releases | Pin the `next-auth@beta` version in `package.json`; the only Auth.js surface we touch is `NextAuth({...})`, the `auth()` helper, `signIn`/`signOut`, and `handlers` — small blast radius. If a breaking change bites, pin to the last-known-good version; the spec's v2 path (Cloudflare Access) is an escape hatch if Auth.js becomes untenable. |
| **`/app/*` contract drift** — backend changes a response shape | `lib/app-api/schemas.ts` Zod-validates every response; a mismatch surfaces as `{status:"error",code:"bad_response"}` (a visible, non-silent failure) rather than a runtime crash; `pnpm test:contract` against staging catches drift before release; `docs/APP_API.md` + `web/lib/app-api/*` + `web/test/msw/*` are documented as a "change together" set. |
| **Cox sandbox values mistaken for real wholesale** | The Cox-sandbox caveat is rendered verbatim and persistently on Admin **and** inline on the MMR Lab page; the recommendation is explicitly labelled "heuristic — not the production buy-box score". |
| **Charts mislead** — the trend/aggregate charts are over the *returned sample*, not the whole table | Every such chart has a caption stating it's based on the N returned rows (+ active filters), not a full-database aggregate; the API-gap register tracks the proper aggregated endpoint. |
| **Thin `historical_sales` row shape** — many requested columns/filters/charts can't be built | Spec'd as `PendingBackend` with notes; the API-gap register lists the schema work; no faking. |
| **Vercel/CI build fails because `serverEnv()` throws at build time** | Pass placeholder env vars on the `next build` step in `web-ci` and to Vercel's build (real values are runtime); documented in Task 1.22. |
| **Rollback of a bad `/web` deploy** | `/web` is independent — `git revert` the offending commit(s) and let Vercel redeploy from `main`, or use Vercel's "promote a previous deployment". The Worker/backend is untouched by anything in this plan (except the doc-only `CLAUDE.md` line), so a `/web` rollback never affects `/ingest`, `/admin`, `/app/*`, or Supabase. |
| **Working in `~/Claude/TAV-AIP` directly (no worktree)** | All changes are confined to `web/`, `.github/workflows/web-ci.yml`, and the one `CLAUDE.md` line; frequent commits per the sequence below make any step cheaply revertible. Optionally do the whole thing on a `feat/web-frontend` branch + PR per `docs/github.md`. |

---

## 10. Suggested commit sequence

(Conventional Commits; one logical change each — matches `CLAUDE.md` §3.)

**Phase 1**
1. `feat(web): scaffold Next.js app router project`
2. `build(web): add dependencies and scripts`
3. `chore(web): strict TS, eslint, next config, gitignore`
4. `feat(web): tailwind v4 + semantic color tokens (light/dark)`
5. `feat(web): env validation + ENV_LABEL derivation`
6. `feat(web): auth.js google oidc with domain-restricted sign-in`
7. `docs: update dashboard stack note to Auth.js (Google OIDC) per approved web frontend spec`  *(the §6 cleanup — slot it here)*
8. `feat(web): auth gate middleware`
9. `feat(web): sign-in page with access-denied state`
10. `feat(web): catch-all /app/* worker proxy with bearer injection`
11. `feat(web): app-api zod schemas + ApiResult mapper + missing-reason copy`
12. `feat(web): typed app-api client (browser) + server fetch`
13. `feat(web): query client config + null-safe formatters`
14. `feat(web): app shell — layout, providers, sidebar, topbar, env badge, theme toggle, user menu, page placeholders`
15. `feat(web): vendor shadcn/ui components, retheme to TAV semantic tokens`
16. `feat(web): data-state component kit (loading/empty/error/unavailable/pending-backend)`
17. `test(web): vitest + RTL + MSW setup with /app/* fixtures`
18. `test(web): playwright + phase-1 e2e (auth gate, shell)`
19. `feat(web): DataTable<T> over tanstack-table with sort/filter/paginate/states`
20. `feat(web): KPI cards/grid + status pill/dot/caveat-banner`
21. `feat(web): recharts wrappers (bar/line/histogram) with empty + a11y states`
22. `test(web): manual staging contract test for /app/* envelopes`
23. `ci: add web-ci workflow for the /web frontend`
    *(Vercel project + OAuth + first Preview deploy + manual OAuth check — infra, no commit; optionally record in `docs/followups.md`.)*

**Phase 2** — `feat(web): dashboard live KPI cards from /app/kpis` · `feat(web): dashboard system-health pill from /app/system-status` · `feat(web): dashboard gross-by-region & hold-days-by-region charts` · `feat(web): dashboard monthly gross-trend chart from historical-sales sample` · `feat(web): dashboard future-metrics grid (pending) + promote system-status-derivable tiles` · `test(web): dashboard e2e`

**Phase 3** — `feat(web): heuristic acquisition recommendation helper` · `feat(web): mmr lab — form, result panel, spread, heuristic recommendation, raw payload, sandbox caveat` · `feat(web): mmr lab — TAV historical comparison panel (available aggregates + pending fields)` · `test(web): mmr lab e2e`

**Phase 4** — `feat(web): pure historical-sales aggregation helpers (shared)` *(if not already landed in Phase 2)* · `feat(web): historical sales table + row-detail sheet + filters` · `feat(web): historical sales charts (derivable) + pending placeholders for missing-data charts` · `test(web): historical data e2e`

**Phase 5** — `feat(web): admin/integrations page — env, health, intel worker, cox caveat, source health, stale sweep, secrets checklist` · `test(web): admin/integrations e2e`

---

## 11. Self-review notes (against the spec)

- **Spec coverage:** §1 decisions → realised in Tasks 1.1–1.23 + the phase tasks. §2 backend constraints → the proxy (1.9), `server-only` guards, no-cookie-forward, no browser Supabase (we never add a Supabase client), VIN-only-via-proxy (3.x uses `appApiClient.postMmrVin`), env badge (1.13), secrets-never-displayed (5.x). §3 architecture → 1.9/1.11/1.13. §4 repo layout → §1 of this plan + the per-task file lists. §5 auth → 1.6/1.7/1.8 + the §6 cleanup. §6 API proxy → 1.9/1.10/1.11. §7 env → 1.5 + §3/§4 of this plan. §8 design system → 1.4/1.14/1.15/1.18/1.19/1.20. §9 v1 pages → Phases 2–5 (each spec'd region maps to a task; the `PendingBackend` and "returned sample" caveats are explicit). §10 9-page vision / §11 API-gap register → not built (correct — v1 scope), but referenced in the `PendingBackend` notes and the historical-comparison panel. §12 phases → this plan's Phases 1–5; v1.5/v2 deliberately out of scope. §13 testing → 1.16/1.17/1.21 + per-phase e2e. §14 deployment → §4 of this plan + Task 1.23. §15 acceptance → §8 of this plan. §16 open items: D1 resolved (the trend chart is the client-side derivation — Task 2.5/4.2/4.4 with the sample caveat); production domain = Vercel-assigned (Task 1.23, custom domain noted as launch-readiness); `web-ci` E2E placement = "separate job later" (Task 1.22 note); Make/Model filter UX = select-from-distinct (Task 4.1).
- **Placeholder scan:** the only "TODO"-flavoured items are intentional `PendingBackend` UI placeholders (a product decision, not a plan gap) and the recommendation thresholds (a product knob, with reasonable v1 defaults stated in the test). No "implement later" / "add error handling" / "similar to Task N" hand-waves — every load-bearing module has its code inlined; the rest are exact commands.
- **Type consistency:** `ApiResult<T>` discriminated union (`ok`/`unavailable`/`error`) is defined once in `lib/app-api/parse.ts` and consumed everywhere; `HistoricalSalesFilter` / `MmrVinRequest` defined in `lib/app-api/client.ts`; `EnvLabel` in `lib/env.ts`; `recommend()` returns `"strong_buy"|"review"|"pass"|"insufficient"` consistently between Task 3.1 and 3.3; `bucketGrossByMonth`/`comparisonAggregates`/etc. signatures in Task 4.2 match their callers in Tasks 2.5/3.4/4.4. `serverEnv()` (server) vs `appApiClient.*` (browser) split is consistent. No name drift found.
