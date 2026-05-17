# TAV-AIP Web

Next.js App Router dashboard for TAV-AIP. The web app is an authenticated internal UI; it does not call Cloudflare Workers, Cox/Manheim, or Supabase directly from the browser. Browser requests go through same-origin Next.js routes under `/api/app/*`.

## Stack

- Next.js App Router
- Auth.js Google OIDC
- Tailwind v4
- shadcn/ui
- Vitest + React Testing Library
- Playwright e2e

## Local Commands

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm dev
```

MMR Lab focused checks:

```bash
pnpm test -- mmr-lab app-api
pnpm test:e2e -- mmr-lab
```

## Environment

Use `web/.env.local` for local-only values. Do not commit it.

Important names:

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `APP_API_BASE_URL`
- `APP_API_SECRET`

## Boundaries

- No browser-to-Cox/Manheim calls.
- No browser-to-Supabase service-role calls.
- No local fake MMR catalog.
- Licensed valuation figures must not be written into public logs, issues, PRs, or screenshots unless explicitly approved.
