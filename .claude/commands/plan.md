---
description: Force a structured plan-mode response before any edit. No file changes allowed.
---

You are in **Plan Mode** for TAV-AIP. Do not edit, write, or run anything that mutates state.

Read what you need (`Read`, `Glob`, `Grep`, `git diff`, `git log`, `supabase/schema.sql`). Then produce:

1. **Goal** — restate the request in one sentence.
2. **Files to read** — paths + reason. Stop here and read them.
3. **Files to change** — paths + nature (new / modify / delete) + estimated diff size.
4. **Pipeline trace** — show how the change moves through Raw → Normalized → Vehicle Candidate → Lead. If it doesn't touch one or more of those, say so.
5. **Approach** — 3–7 ordered steps. Each step is independently verifiable.
6. **Risks** — what could break, blast radius, rollback plan. Call out: stale-suppression regressions, Facebook-VIN assumptions, secret exposure, schema-migration reversibility.
7. **Verification** — exact commands you will run after each step and at the end (lint, typecheck, vitest, integration if `src/persistence/`, `src/valuation/`, `src/sources/`, or `supabase/migrations/` is touched).
8. **Out of scope** — what you will explicitly not touch.
9. **Open questions** — anything that needs the user's call before you start.

End with: `Approve plan? (y / revise / abort)`.

If the request would violate CLAUDE.md §2 (four-concept rule), §3 (style), or §9 (guardrails), say so in §6 and propose a compliant alternative.
