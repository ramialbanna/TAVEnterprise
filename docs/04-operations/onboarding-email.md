# New Developer Onboarding Email

Subject: TAV-AIP v2 handoff — repo access, setup, and first steps

Hi team,

Welcome to the TAV-AIP project. You already have access to the GitHub
repository:

https://github.com/ramialbanna/TAVEnterprise

TAV-AIP is Texas Auto Value's internal acquisition intelligence platform. The
current production system ingests marketplace listings, normalizes and dedupes
vehicle candidates, runs Cox/Manheim MMR valuation server-side, creates leads,
and exposes an authenticated internal web app. The next phase is **v2
Opportunities**: a buying-side workflow layer for reviewing opportunities,
manual submissions, claiming/assignment, contact history, and later offers,
dispositions, and validation.

## How To Get Started

1. Clone the repository:

   ```bash
   git clone git@github.com:ramialbanna/TAVEnterprise.git
   cd TAVEnterprise
   ```

2. Read the handoff docs in this order:

   ```text
   docs/INDEX.md
   README.md
   docs/04-operations/final-handoff-checklist.md
   docs/06-platform/18-new-developer-handoff.md
   docs/06-platform/19-v2-implementation-index.md
   docs/06-platform/README.md
   ```

3. Install and verify the root Worker:

   ```bash
   npm install
   npm run lint
   npm run typecheck
   npm test
   ```

4. Install and verify the web app:

   ```bash
   cd web
   pnpm install
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

5. Environment setup:

   - Do not commit `.dev.vars`, tokens, screenshots containing secrets, or
     vendor payloads.
   - Secret names and deployment notes are documented in
     `docs/04-operations/handoff.md` and `docs/04-operations/runbook.md`.
   - Ask Rami for environment values through the approved secure channel.

## First Development Objective

Do not start with claim/assignment/offers. The first v2 implementation should be
the read-only Opportunities slice:

```text
GET /app/opportunities
GET /app/opportunities/:id
/opportunities table + preview pane
badges + honest empty/error states
no mutation workflow yet
```

Use the traceability chain in `docs/06-platform/README.md`:

```text
review source -> FR -> schema -> state machine -> API -> UX -> tests
```

Each PR should state which FR IDs it implements and which tests prove it.

## Recent Cleanup

Before this handoff, the repository documentation was reorganized to remove
noise and make the current source of truth easier to find:

- active docs are now in numbered folders under `docs/`
- historical/superseded material is under `docs/archive/`
- v2/v3 platform controls are consolidated under `docs/06-platform/`
- a new docs index and handoff checklist were added
- Obsidian notes were updated to point to the same source docs

That means you should not need to hunt through old session artifacts or scattered
markdown files to understand what to build next.

Thanks,

Rami / Texas Auto Value

