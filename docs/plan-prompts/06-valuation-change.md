# Plan: Valuation / Manheim Integration Change

```
/plan

Goal: <integrate Manheim MMR | change cache strategy | adjust YMM fallback | change confidence rules>.

Read first:
1. src/valuation/manheim.ts, valuationCache.ts, valuationTypes.ts.
2. src/scoring/scoreLead.ts to see how valuation feeds scoring.
3. docs/architecture.md §8.
4. The KV namespace binding in wrangler.toml.

Then produce the plan:

- Pipeline trace: where valuation is called in the ingestion path; where its result is read.
- API mapping: methods called, request shape, response shape, error modes. Note what we are assuming vs. what we have verified.
- Cache strategy:
   * keys (manheim:token, mmr:vin:<VIN>, mmr:ymm:<y>:<mk>:<md>:<mi_bucket>:<region>)
   * TTLs (token = expires_in − 60s, vin = 24h, ymm = 7d) — confirm or update with reason
   * stampede protection / single-flight
- Failure handling: token refresh, 5xx retry, 4xx skip, partial response.
   * On any failure: confidence = NONE, reason_code = mmr_failed, ingestion does NOT fail.
- Facebook path: VIN absent → YMM + mileage bucket + region; trim if available; lower confidence.
- Tests:
   * VIN MMR success
   * VIN MMR fail → YMM fallback
   * Facebook (no VIN) → YMM only
   * Token expired mid-batch → refresh, continue
   * Cache hit / cache miss
- Verification commands.

Hard constraints:
- No real Manheim creds in source, fixtures, or logs.
- No code path that fails ingestion when valuation fails.
- KV TTLs do not regress without an ADR.

End with: Approve plan? (y / revise / abort)
```
