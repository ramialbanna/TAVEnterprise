# Spike Plan 12 — `tav-intelligence-worker` Contract Pinning

**Punch-list item:** #12 · **Category:** Architecture Spike (no production code) ·
**Owner:** D · **Closes risk:** R9 · **Status:** Plan ready — not yet executed.
**Lands in:** [`../02-ARCHITECTURE.md`](../../docs/07-buybox/ARCHITECTURE.md) §4.2;
[`../03-TECHNICAL-SPEC.md`](../../docs/07-buybox/TECHNICAL-SPEC.md) §2 (versioned API contract)
and §1.4 (`intelligence_worker_contract_version`).

**What this is:** A read-only investigation plan. It produces a pinned contract
document and the design for a CI compatibility test. The spike itself adds no
application code; the compatibility test is built in Phase 1 from this design.

---

## 1. Objective

MaxBuy's verdict depends on the MMR valuation it receives from
`tav-intelligence-worker`. If that response shape drifts silently, MaxBuy's
benchmark — and every decision replayed against it — is corrupted. This spike:

1. Documents the exact request/response contract MaxBuy depends on.
2. Assigns it a version: `intelligence_worker_contract_version`.
3. Decides which normalized MMR fields are **safe and sufficient** to persist
   (the licensed-data question, R18).
4. Designs the CI compatibility test that fails the build on drift.

## 2. Scope & guardrails

- Read-only investigation. No edits to `tav-intelligence-worker` or the main
  Worker in this phase.
- **Licensed data:** the contract document describes the response **shape** —
  field names and types — never real Cox/Manheim values. Any fixture used by
  the compatibility test uses **synthetic** numbers. A captured live payload is
  never committed.
- The safe-persist decision (§4.3) must be checked against Manheim/Cox vendor
  terms; when in doubt, a field is *not* persisted.

## 3. Existing contract surface — start here

[`../../03-api/intelligence-contracts.md`](../../docs/03-api/intelligence-contracts.md)
already freezes four seams: **A** `cache_key` derivation, **B** `segment_key`
derivation, **C** user context, **D** `force_refresh` authorization. Those are
inputs and identity — they are **not** the MMR response body.

The gap this spike closes: **there is no pinned contract for the MMR valuation
response payload MaxBuy will consume.** That is the deliverable.

## 4. Methodology

### 4.1 Identify the dependency surface

Confirm, by reading the code (read-only), the exact call path MaxBuy will use:

- Main Worker MMR proxy route(s) under `/app/mmr*` (the `/app/*` product API).
- `tav-intelligence-worker` MMR endpoints under `/intel/mmr/*`.
- The Service Binding path main Worker → intelligence Worker.

Decide and record: **does MaxBuy call the main Worker `/app/*` layer, or the
intelligence Worker directly?** Recommendation — depend on the `/app/*` layer
so MaxBuy inherits one auth/version boundary, not two. Record the decision.

### 4.2 Document the response contract

For the chosen endpoint(s), enumerate the response envelope and the MMR result
body — **field names and types only**:

```
field name | type | nullable | meaning | example shape (synthetic)
```

Cover at minimum: the success/error envelope; `mmr_value` and the wholesale /
retail distribution fields; `valuation_method` (`vin` | `year_make_model`);
`confidence` / `normalization_confidence`; `missing_reason` on a miss;
mileage-inference flags; cache metadata (age / `cache_hit`); and the
VIN-vs-YMM path indicator. Cross-reference the columns already mirrored in
`tav.valuation_snapshots` and `tav.mmr_cache` — those names are the existing
normalized vocabulary; reuse them, do not invent parallel names.

### 4.3 Safe-persist field list (R18)

Split every response field into:

- **safe to persist** — normalized, derived fields TAV computes or that are not
  licensed verbatim vendor content (e.g. `valuation_method`, `confidence`,
  `missing_reason`, a single `mmr_value` integer, cache age).
- **must not persist** — raw licensed vendor payload / distribution detail
  beyond what TAV is licensed to retain.

The MaxBuy decision-replay snapshot ([`../03-TECHNICAL-SPEC.md`](../../docs/07-buybox/TECHNICAL-SPEC.md)
§1.4) stores **only** the safe-to-persist set plus method/fallback/cache-age/
timestamp metadata. Verify the split against vendor terms with the owner
(this is the owner-confirmation half of punch-list item #14, retention split).

### 4.4 Version and pin

Assign `intelligence_worker_contract_version` (e.g. `mmr-v1`). Pin the value in
[`../03-TECHNICAL-SPEC.md`](../../docs/07-buybox/TECHNICAL-SPEC.md) §1.4 so every MaxBuy
recommendation records which contract version produced its inputs.

### 4.5 Compatibility-test design

Design (do not yet build) a CI test that:

- Holds a **synthetic** fixture matching the pinned schema (Zod or equivalent).
- Validates a representative worker response — recorded with synthetic values,
  or a contract-shape assertion against a local `wrangler dev` instance —
  against the pinned schema.
- **Fails the build** on any added/removed/retyped field, before MaxBuy ships.
- Lives in CI alongside the existing worker tests; runs on every PR.

## 5. Deliverable — contract document

Commit as `audits/reports/12-worker-contract.md`:

```markdown
# tav-intelligence-worker — MMR Contract (pinned)
Contract version: mmr-v1 · Pinned: YYYY-MM-DD

## Dependency surface
MaxBuy calls: ... (endpoint + via main Worker /app or direct)

## Request schema
| field | type | required | notes |

## Response schema (shape only — no licensed values)
| field | type | nullable | meaning |

## Safe-to-persist field list (R18)
Safe: ...
Must NOT persist: ...
Vendor-terms check: signed off by ... on ...

## Compatibility test
Location: ... · Fixture: synthetic · Fails build on: field add/remove/retype

## Change procedure
Any change to this contract requires an ADR in docs/01-architecture/adr/,
consistent with docs/03-api/intelligence-contracts.md.
```

## 6. Dependencies and ordering

- **Critical path.** Every MaxBuy component that reads MMR depends on this pin.
  Run it in Week 0 alongside the data audits.
- **Feeds item #3** — the safe-persist field list defines exactly which MMR
  fields the decision-replay snapshot stores.
- **Feeds item #14** — the vendor-terms half of the retention-split decision.

## 7. Definition of done

Contract document committed; `intelligence_worker_contract_version` value
pinned in [`../03-TECHNICAL-SPEC.md`](../../docs/07-buybox/TECHNICAL-SPEC.md) §1.4;
compatibility-test design recorded and scheduled for Phase 1 CI; safe-persist
field list confirmed against vendor terms with the owner. No licensed payload
appears in the committed contract document or any fixture.
