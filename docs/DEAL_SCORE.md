This doc is to lock down:

The formula — weighted combo of (asking vs MMR wholesale), recency, proximity to 75048, condition. I had this in the starter.

Red flags — salvage/rebuilt/flood title, mileage > 200k, price < $500, bot-pattern listings.

Threshold for "qualified" — score ≥ 0.12 + no red flags + VIN decoded.

Where it runs — the Make scenario calls a Cloudflare Worker that returns the score, OR a Postgres function does it on insert. Pick one before building.

How to retune — change weights → migrate historical scores → CHANGELOG entry.

This is a spec doc, not code. The point is to have it written down before any agent tries to build it. Otherwise three different agents will invent three different formulas.