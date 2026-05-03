# Project Identity — TAV-AIP

## What this project is
A **proprietary acquisition intelligence system** for Texas Auto Value. Not a scraper. Not a dashboard project. The work product is a national, multi-platform vehicle acquisition pipeline that takes raw marketplace listings and turns them into ranked, assigned, trackable buyer leads — with purchase outcomes feeding back into the buy-box.

The MVP scope is narrow on purpose: Facebook Marketplace, four regions, a Cloudflare Worker, Supabase. The architecture is wide on purpose: the data model and module boundaries already accommodate Craigslist, AutoTrader, Cars.com, OfferUp, 100+ buyers, lead locking, purchase-outcome attribution, and a buy-box trained from real 2026 purchases.

## What we optimize for (in order)
1. **Correct architecture** — the four-concept rule (Raw / Normalized / Vehicle Candidate / Lead) is the spine. Everything else conforms to it.
2. **Reliability** — retries with exponential backoff (250ms/1000ms/4000ms), DLQ, alerting. Failed writes never silently disappear.
3. **Data quality** — typed, validated boundaries; reason codes on every rejection; schema-drift events captured.
4. **Stale-listing suppression** — first-class product logic in v1. Stale is the biggest known data problem; it gets solved on day one, not in v2.
5. **Multi-platform expansion** — Facebook adapter is one of many. No source-specific code leaks into shared logic.
6. **Buyer workflow** — assignment, locking, action history, abandoned-lead recycling, manager visibility.
7. **Purchase-outcome feedback** — every purchase is attributable back to the lead, the source, the buyer, the price-vs-MMR delta.
8. **Maintainability** — small modules, pure functions for scoring/stale/dedupe/normalize, one Worker deploy.
9. **Security** — Cloudflare secrets, HMAC ingestion, service-role key isolation, future RLS.
10. **Practical business value** — every change answers the five questions in CLAUDE.md §10.

## What we explicitly de-prioritize / will NOT build yet
- Machine learning model for buy-box. **Start rule-based.** ML waits until 2026 purchase outcomes exist.
- Full SaaS dashboard before lead quality is proven. AppSheet/Sheets is acceptable as a temporary operator surface.
- Microservices. One Worker, modular code. Split only when the deploy itself is the bottleneck.
- Image similarity / advanced computer vision for dedupe.
- Public-facing product, billing, subscriptions.
- Complex RLS policies before the dashboard exists.
- Anything that depends on Facebook exposing VIN. It does not.

## Operating principles for Claude
- **Read first.** Before proposing changes, list the files touched and explain their role in the four-concept pipeline.
- **Plan before editing.** Default to Plan Mode for any change spanning >1 file or that affects layer boundaries, the data model, or external integrations.
- **Cite the code.** Reference paths and line numbers when explaining behavior or proposing diffs.
- **Verify, don't claim.** "Tests pass" requires the actual `npm test` / `npm run typecheck` output. No vibes.
- **Surface trade-offs.** Every non-trivial decision lists at least one rejected alternative with reason. Architectural decisions get an ADR under `docs/adr/`.
- **Refuse silently-broken paths.** If a request would (a) require Facebook VIN, (b) collapse two of the four concepts, (c) drop listings without a reason code, or (d) skip stale logic — raise it before coding.

## "Done" means
- Tests added/updated and green (`npm test`, `npm run test:int` where applicable).
- Lint + typecheck green.
- For schema changes: migration file added, idempotent, indexed.
- For new sources: adapter under `src/sources/<name>.ts`, fixture-backed unit tests, no leakage into shared logic.
- For new ingestion paths: HMAC validated, Zod-validated, retry-wrapped, DLQ on final failure.
- CHANGELOG updated. RUNBOOK updated if ops changed. ADR written for architectural decisions.
- No secrets committed. No `.dev.vars` committed.

## "Not done"
- "It works on my machine."
- "I'll add tests in a follow-up."
- "The lint errors are unrelated."
- "Stale detection can come later." — no.
- "We can normalize Facebook quirks inside the shared normalizer." — no.
- "Service role key in AppSheet is fine for now." — no.

## The first milestone (single sentence)
> One Facebook listing flows end-to-end: Apify → Worker → Supabase raw listing → normalized listing → vehicle candidate → stale score → lead score → active inbox.

Everything in the MVP serves that sentence. Everything else waits.
