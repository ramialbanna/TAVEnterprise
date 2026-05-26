# Agent Tools & MCP Reference

**Purpose:** Tell any new chat what external tools exist for TAV-AIP and when to use them.  
**Config location (user machine):** `~/.cursor/mcp.json` (global Cursor MCP — not committed to this repo).  
**Related:** [NEXT_STEPS.md](NEXT_STEPS.md) · [handoff](04-operations/handoff.md) · [runbook](04-operations/runbook.md)

> Do not store API keys, tokens, or secret values in this file. MCP credentials live only in `mcp.json` or Cursor OAuth.

---

## How to use this doc in a chat

- Reference: `@docs/tools.md`
- For task order: `@docs/NEXT_STEPS.md`

---

## GitHub (no MCP — shell + Cursor login)

GitHub is **not** an MCP server here. Use:

- Cursor / local **GitHub login**
- **`gh` CLI** in terminal: `gh pr create`, `gh pr checks`, `gh issue list`, `gh auth status`

Use for: PRs, CI status, branches, code review — especially roadmap phase PRs.

---

## MCP servers (configured)

| Server | Type | Use for TAV-AIP |
|--------|------|------------------|
| **supabase-TAVEnterprise** | Remote OAuth | **Default DB** — schema, migrations, SQL diagnosis, logs, advisors |
| **supabase-US-communication** | Remote OAuth | **Different project** — do not use for TAV leads/ingest unless explicitly asked |
| **cloudflare-api** | Remote OAuth | Workers (`tav-aip-production`, intel worker), KV, cron, deploy metadata |
| **apify** | Remote OAuth | Scrape runs, datasets, actors — correlate with `tav.source_runs` |
| **vercel** | Remote OAuth (`https://mcp.vercel.com`) | Web app deploys, build logs, project/env for `tav-enterprise` |
| **chrome-devtools** | Local (`npx`) | Live UI: sign-in, `/ingest`, `/mmr-lab`, future `/opportunities` |
| **firecrawl** | Local (`npx`) | Research / page extraction only — not production ingest |
| **make** | Remote OAuth | **Deprecated** in target arch — legacy scenarios only |
| **twilio** | Local (`npx`) | Phone numbers API — only if SMS/voice work is in scope |
| **Magic MCP** | Local (`npx`) | Optional UI component generation — not required for pipeline |

---

## Which MCP for which work

| Task area | Prefer |
|-----------|--------|
| Phase 0 schema / migrations | **supabase-TAVEnterprise** (`list_migrations`, `execute_sql`, `apply_migration`) |
| Phase 4 “why zero leads?” | **apify** + **supabase-TAVEnterprise** together |
| Worker deploy / cron / KV | **cloudflare-api** (+ `wrangler` in shell when needed) |
| Web deploy / env / build failures | **vercel** |
| MMR / Cox issues | Intel worker logs via **cloudflare-api**; contract probe via shell + `ADMIN_API_SECRET` (never log secret) |
| v2 Opportunities UI QA | **chrome-devtools** + **vercel** |
| PR / CI | **gh** (shell), not MCP |

---

## Supabase project mapping

| MCP name | Project ref | TAV-AIP? |
|----------|-------------|----------|
| `supabase-TAVEnterprise` | `fjnevgakkhnsrcimfivw` | **Yes** — `tav.*` schema, leads, ingest, buy-box |
| `supabase-US-communication` | `wiacdfruipunzfffgyfy` | **No** — separate product |

Before running SQL, confirm the active MCP is **supabase-TAVEnterprise**.

### Useful Supabase MCP tools

- `list_tables` — schema discovery  
- `list_migrations` — compare to `supabase/schema.sql`  
- `execute_sql` — read-only diagnosis (counts, last runs, rejection reasons)  
- `apply_migration` — only when explicitly implementing schema changes  
- `generate_typescript_types` — after schema changes  
- `get_logs` — API/DB errors  
- `get_advisors` — security/performance hints  

---

## Production surfaces (for tool targeting)

| Surface | Where |
|---------|--------|
| Main Worker | `tav-aip-production` (Cloudflare) |
| Intelligence Worker | `tav-intelligence-worker-production` |
| Web app | `tav-enterprise.vercel.app` (Vercel) |
| Database | Supabase project `fjnevgakkhnsrcimfivw` |
| Scrape (live regions) | Apify schedules — see [apify-phase8-regions](04-operations/apify-phase8-regions.md) |

---

## When MCP is not enough

Use terminal + repo docs:

- `npm run deploy` / `npm run deploy:intelligence` — [runbook](04-operations/runbook.md)  
- `gh` — GitHub  
- `pnpm dev` in `web/` — local UI  
- Licensed MMR values — do not paste into issues, logs, or screenshots  

---

## Maintenance

When you add/remove an MCP in Cursor:

1. Update this file (server name + one-line purpose).  
2. Bump **Last updated** below.  
3. Keep `mcp.json` secrets out of git.

**Last updated:** 2026-05-19
