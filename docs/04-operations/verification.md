# Verification Loop — TAV-AIP

The verification loop is the contract between "I changed code" and "the change is real". No claim of done bypasses it.

## The five steps

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 1. Lint  │ → │ 2. Type  │ → │ 3. Vitest│ → │ 4. Integ │ → │ 5. Manual│
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
   fast          fast            fast          slower         human
```

1. **Lint** — `npm run lint`. Zero warnings, not just zero errors.
2. **Typecheck** — `npm run typecheck`. Strict mode. No `any`, no `// @ts-ignore` without comment + ticket.
3. **Unit tests** — `npm test` (Vitest). Covers `normalize/`, `dedupe/`, `stale/`, `scoring/`.
4. **Integration tests** — `npm run test:int`. Required when the diff touches `src/persistence/`, `src/valuation/`, `src/sources/`, or `supabase/migrations/`.
5. **Manual smoke** — only when the change has no automated coverage path. Document what was tested and the sample payload used.

Stop at the first failing step. Fix the root cause; do not skip ahead.

## TAV-specific gates (run alongside the loop)

- **No-secret guard:** `git diff` shows no `SUPABASE_SERVICE_ROLE_KEY=`, `WEBHOOK_HMAC_SECRET=`, Manheim creds, or Twilio creds outside `.dev.vars.example`.
- **No-VIN-required:** any new code path that consumes VIN must have a fallback for Facebook listings without VIN.
- **Reason-code coverage:** every `return null` / `throw` / `continue` in the ingestion path is paired with a `reason_code` write to `filtered_out` / `dead_letters` / `schema_drift_events`.
- **Stale-suppression intact:** `tav.v_active_inbox` still excludes `stale_confirmed` and `removed`, and `last_seen_at > now() − 30d`.

## Stage gating

| Stage | Gate to advance |
|---|---|
| Local edit | Steps 1–3 green |
| Push branch | Steps 1–4 green; CI agrees |
| Merge to main | CI green + reviewer subagent PASS |
| Deploy to Cloudflare | Main green + smoke against `/health` and a fixture `POST /ingest` |
| Production traffic | Cloudflare deploy soaked ≥ 24h on test region + alert thresholds tuned |

## Failure protocol

When a step fails, the response shape is:

```
VERIFY: FAIL at <step>
COMMAND: <what was run>
EXIT:    <code>
TAIL:
<last 20 lines>

ROOT CAUSE (hypothesis): <one sentence>
PROPOSED FIX:            <minimal change>
SCOPE OF FIX:            <files affected>
RISK:                    <one sentence — especially: stale, secrets, four-concept boundary>
```

The fix is proposed, not applied, unless the user (or the calling plan) authorized the implementer to keep going.

## Non-negotiables

- "It worked locally" is not verification. The commands and their output are.
- Skipping integration tests because they're slow is a CI-budget problem, not permission to skip.
- A flaky test is a failing test until proven otherwise. Quarantine, don't ignore.
- Coverage going down is a review concern, not an automatic block — but it must be acknowledged.
- Facebook fixtures must continue to pass on every change to `src/normalize/`, `src/dedupe/`, or `src/sources/`.

## Subagent integration

- The `implementer` subagent runs the loop after each step in its plan and pastes the output into its reply.
- The `reviewer` subagent does **not** run the loop; it inspects the diff and the implementer's verification log.
- The `data-modeler` subagent runs only the lint/typecheck steps + a migration dry-run; full DB integration runs at the application level.
- The `/verify` slash command runs the loop on demand without making changes.

## Hook integration

- `.claude/hooks/post-edit-verify.sh` runs format + a fast syntax check + a secret-leak guard after every Edit/Write. This is **step 0** — it never substitutes for the full loop.
