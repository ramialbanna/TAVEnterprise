Apify (4 tasks, 10-min cron)
     │
     ▼
Make.com scenario (watch → iterate → filter)
     │
     ├─→ Google Sheets (operator view)
     │
     ▼
Supabase RPC: tav.upsert_listing()
     │
     ├─→ tav.listings (current state)
     ├─→ tav.fingerprints (relist detection)
     ├─→ tav.listings_history (every sighting)
     └─→ tav.price_changes (every edit)
     │
     ▼
[GAP — to be built]
Cloudflare Worker: Manheim MMR enrichment
     │
     ▼
[GAP — to be built]
Deal score → tag → AppSheet/Sheet "Qualified Leads"

"Make is the integration bus, Postgres is the system of record, Worker is for code that needs to run outside Make's ops budget."