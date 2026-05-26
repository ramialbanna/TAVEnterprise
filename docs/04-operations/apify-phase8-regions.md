# Apify Phase 8 — Region schedules

**Last updated:** 2026-05-26

Enable Apify schedules in soak order after Worker + Supabase migration are live.
Use the Ingest Monitor (`/ingest`) to verify runs per region before enabling the next.

## Resource map

| Apify task | Task ID | TAV region | Schedule ID | Stagger (America/Chicago) |
|------------|---------|------------|-------------|---------------------------|
| `tav-tx-east` | `nccVufFs2grLH4Qsj` | `dallas_tx` | `JdekUcQ4NZBdE25pw` | :00, :10, :20, :30, :40, :50 |
| `tav-tx-west` | `vk7OijnAOOo8V1ekc` | `lubbock_tx` | `KD49MXipQmFUEiIRc` | :02, :12, :22, :32, :42, :52 |
| `tav-tx-south` | `MWtcjZFWqJrnYChgp` | `san_antonio_tx` | `6yk59JRahCfbTy2h8` | :04, :14, :24, :34, :44, :54 |
| `tav-ok` | `Xpq656NgueqfXDHvU` | `oklahoma_city_ok` | `0qdlWHsaojVZxEb1s` | :06, :16, :26, :36, :46, :56 |

Migration **0049** (`lubbock_tx`) and **0050** (`oklahoma_city_ok`) must be applied before
west/OK schedules ingest. South uses existing `san_antonio_tx` keys (no migration).

## Enable one schedule

```bash
export APIFY_API_TOKEN="<from-secure-channel>"
SCHEDULE_ID="KD49MXipQmFUEiIRc"   # west example
curl -sS -X PUT "https://api.apify.com/v2/schedules/${SCHEDULE_ID}?token=${APIFY_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"isEnabled": true}' | jq '{id: .data.id, enabled: .data.isEnabled, name: .data.name}'
```

## Soak checklist (per region, ~24–48h)

- [ ] `tav.source_runs` shows `completed` rows for the region (~every 10 min)
- [ ] No duplicate `run_id` for the same Apify run
- [ ] No stuck `running` rows older than 30 min
- [ ] Webhook returns 200 (no retry storms in Worker logs)
- [ ] `created_leads` may be 0 — compare rejection/valuation mix to [diagnostics.md](diagnostics.md)
- [ ] Ingest Monitor lists runs with correct `source` + `region`

## Emergency pause (all non-east)

```bash
export APIFY_API_TOKEN="<from-secure-channel>"
for id in KD49MXipQmFUEiIRc 6yk59JRahCfbTy2h8 0qdlWHsaojVZxEb1s; do
  curl -sS -X PUT "https://api.apify.com/v2/schedules/${id}?token=${APIFY_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"isEnabled": false}' | jq '{id: .data.id, enabled: .data.isEnabled}'
done
```

East (`JdekUcQ4NZBdE25pw`) stays on unless incident response requires a full stop.

## Verification SQL (Supabase)

```sql
SELECT region, status, count(*) AS n
FROM tav.source_runs
WHERE scraped_at > now() - interval '24 hours'
  AND source = 'facebook'
GROUP BY region, status
ORDER BY region, status;
```
