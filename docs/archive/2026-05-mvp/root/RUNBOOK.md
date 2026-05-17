# TAV Facebook Marketplace Pipeline — Operations Runbook

## Resource IDs

| Resource | ID |
|---|---|
| tav-tx-east task | nccVufFs2grLH4Qsj |
| tav-tx-west task | vk7OijnAOOo8V1ekc |
| tav-tx-south task | MWtcjZFWqJrnYChgp |
| tav-ok task | Xpq656NgueqfXDHvU |
| tav-tx-east-10min schedule | JdekUcQ4NZBdE25pw |
| tav-tx-west-10min schedule | KD49MXipQmFUEiIRc |
| tav-tx-south-10min schedule | 6yk59JRahCfbTy2h8 |
| tav-ok-10min schedule | 0qdlWHsaojVZxEb1s |
| Google Sheet | 1MEvUmqVSVYR5fAy_cNySctSInbe_ljv7oZbnzfHYRe8 |

## Schedule Timing (America/Chicago)

| Task | Fires at (past the hour) |
|---|---|
| tav-tx-east | :00, :10, :20, :30, :40, :50 |
| tav-tx-west | :02, :12, :22, :32, :42, :52 |
| tav-tx-south | :04, :14, :24, :34, :44, :54 |
| tav-ok | :06, :16, :26, :36, :46, :56 |

## Pause Everything (emergency stop)

```bash
export APIFY_API_TOKEN="<your-token>"
for id in JdekUcQ4NZBdE25pw KD49MXipQmFUEiIRc 6yk59JRahCfbTy2h8 0qdlWHsaojVZxEb1s; do
  curl -s -X PUT "https://api.apify.com/v2/schedules/${id}?token=$APIFY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"isEnabled": false}' | jq '{id: .data.id, enabled: .data.isEnabled}'
done
```

Re-enable by changing `false` to `true`.

## Widen / Tighten the Buy-Box

Edit the relevant `task-*.json` file, then PUT it to all tasks:

```bash
export APIFY_API_TOKEN="<your-token>"

# Example: lower price floor to $8,000
curl -s -X PUT "https://api.apify.com/v2/actor-tasks/nccVufFs2grLH4Qsj/input?token=$APIFY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @task-tx-east.json
```

Repeat for each task ID. Key fields to tune:
- `priceMin` / `priceMax` — dollar range
- `minYear` / `maxYear` — model year range
- `maxMileage` — odometer cap
- `radius` — allowed values: `"100000"` (62mi), `"250000"` (155mi), `"500000"` (310mi)
- `maxListingAge` — `"1800"` (30 min, production) or `""` (no filter, for testing)

## Add a 5th Metro

1. Create the input JSON:
```bash
cat > task-nm.json << 'EOF'
{
  "location": "Albuquerque, NM",
  "radius": "250000",
  "vehicleType": "car_truck",
  "minYear": 2010, "maxYear": 2026,
  "minMileage": 0, "maxMileage": 200000,
  "priceMin": 10000, "priceMax": 300000,
  "fetchDetailedItems": true, "fetchListingMedia": false,
  "maxListingAge": "1800", "maxResults": 100,
  "enableDeduplication": true, "keywords": []
}
EOF
```

2. Create the task:
```bash
curl -s -X POST "https://api.apify.com/v2/actor-tasks?token=$APIFY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"actId\": \"raidr-api~facebook-marketplace-vehicle-scraper\", \"name\": \"tav-nm\", \"options\": {\"build\": \"latest\", \"memoryMbytes\": 2048, \"timeoutSecs\": 600}, \"input\": $(cat task-nm.json)}"
```

3. Create the schedule (stagger at :08 past the hour):
```bash
curl -s -X POST "https://api.apify.com/v2/schedules?token=$APIFY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"tav-nm-10min\", \"isEnabled\": true, \"cronExpression\": \"8,18,28,38,48,58 * * * *\", \"timezone\": \"America/Chicago\", \"actions\": [{\"type\": \"RUN_ACTOR_TASK\", \"actorTaskId\": \"<NEW_TASK_ID>\"}]}"
```

4. In Make.com, the existing scenario picks up ALL runs of the actor automatically — no change needed.

## Reading Run Logs When Something Breaks

```bash
export APIFY_API_TOKEN="<your-token>"
TASK_ID="nccVufFs2grLH4Qsj"   # replace with the failing task

# Get latest run ID and status
latest=$(curl -s "https://api.apify.com/v2/actor-tasks/${TASK_ID}/runs?token=$APIFY_API_TOKEN&limit=1&desc=1")
run_id=$(echo "$latest" | jq -r '.data.items[0].id')
echo "Run: $run_id  Status: $(echo "$latest" | jq -r '.data.items[0].status')"

# Stream the full log
curl -s "https://api.apify.com/v2/actor-runs/${run_id}/log?token=$APIFY_API_TOKEN"
```

Common failure patterns:
- `0 items, all age-filtered` — normal on manual runs; `maxListingAge: "1800"` only catches listings <30 min old
- `dedup: 0 new` — all listings already seen in a prior run; expected behavior
- `FAILED` status — check log for proxy/rate-limit errors; actor auto-retries but may need a run restart

## Expected Monthly Cost

| Item | Cost |
|---|---|
| Actor rental (raidr-api) | ~$20/mo |
| Apify compute (4 tasks × 144 runs/day × ~$0.005) | ~$50–80/mo |
| Make.com (Core plan) | ~$11/mo |
| **Total** | **~$80–110/mo** |

Set a hard cap in Apify Console → Billing → Spending limits: **$150/mo**.

## Notifications Setup

In **Apify Console → Settings → Notifications**, enable:
- Actor run failed (2+ consecutive) → email rami@texasautovalue.com
- Monthly spend reaches 80% of cap → email rami@texasautovalue.com

In **Make.com → Scenario → … → Notification settings**, enable email on error.

## Next 3 Manual Steps

1. **Run `setup-sheet.gs`** in Google Apps Script to create the `Listings` tab with 17-column headers
2. **Import `make-scenario-blueprint.json`** into Make.com and authorize Apify + Google Sheets connections
3. **Enable the Make scenario** and click "Run once" to capture a live payload — confirm rows appear in the Sheet within 15 minutes of the next scheduled run
