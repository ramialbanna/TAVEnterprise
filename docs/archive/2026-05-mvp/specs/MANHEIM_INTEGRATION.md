# Manheim Integration

## Objective
Build a Cloudflare Worker that enriches vehicle listings with Manheim MMR valuation data.

---

## File to Create
scripts/enrichment-worker.js

---

## Requirements

### Input
POST JSON:
{
  "listing_id": "uuid",
  "vin": "17-character string"
}

Validate VIN length = 17.

---

### Auth (OAuth2)
- Use client credentials flow
- Cache token in Cloudflare KV
- Key: manheim:oauth_token
- Refresh if <5 min remaining

---

### Endpoints
Implement:
- getMmrByVin(vin)
- getMarketReport(vin)
- getConditionGrade(vin)

Base URL from env: MANHEIM_API_BASE_URL

---

### Rate Limit
Max 5 req/sec

---

### Retry
Retry on:
- 429
- 5xx

Backoff:
0ms, 500ms, 1s, 2s, 4s

---

### Circuit Breaker
- 10 consecutive failures → open circuit
- Cooldown: 5 minutes

---

### Caching
KV key: mmr:<vin>
TTL: 24 hours

---

### Database
Insert into tav.listings_valuation

Fields:
- listing_id
- vin
- mmr_value
- market_report
- condition_grade
- raw_response
- valuation_status
- error_message

Do NOT overwrite old rows.

---

### Trigger
Worker is called externally via direct HMAC-signed POST to `/ingest` (Apify webhook or other authorized caller). See `docs/adr/0001-drop-make-com.md`.

---

### Output

Success:
{
  "success": true,
  "listing_id": "...",
  "vin": "...",
  "cached": false,
  "valuation": {
    "mmr_value": number
  }
}

Failure:
{
  "success": false,
  "error": "message"
}

---

## Environment Variables

MANHEIM_CLIENT_ID
MANHEIM_CLIENT_SECRET
MANHEIM_TOKEN_URL
MANHEIM_API_BASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

KV binding: MANHEIM_KV

---

## Rules

- Do not hardcode secrets
- Do not call API if cached
- Do not overwrite previous valuations
- Log important events