# V2 Opportunities Spec

Date: 2026-05-18
Status: Approved product direction; implementation not started

## 1. Decision

V2 is the **Opportunities** workflow, not a simple leads table.

The page should expose acquisition opportunities from all useful signals:

- created leads
- near-miss listings
- manually submitted listing links
- repeated sightings
- price changes
- VIN upgrades
- estimated mileage/style valuations
- active working leads

This keeps the existing four-concept model intact:

```text
Raw Listing -> Normalized Listing -> Vehicle Candidate -> Lead
```

An Opportunity is a buyer-facing read model derived from those concepts. It is
not a fifth source-of-truth table unless later workflow needs require persisting
opportunity events.

## 2. Product Goal

Give the acquisition team one queue where finders/buyers can submit or surface
opportunities and closers can work them.

The system must honor the current manual workflow:

1. A buyer/finder finds a listing on a marketplace.
2. They share the link and relevant facts to the group.
3. A specific closer may be implicitly or explicitly expected to work it.
4. The team needs visibility into who found it, who should work it, and what
   happened next.

V2 should preserve that flow while making it structured, searchable, and
auditable.

The queue should help the team decide:

- call
- watch
- pass
- investigate why the system almost liked the listing
- route to a specific closer
- continue working an active opportunity

The first implementation can be delivered in slices, but the live testing goal
requires assignment, notes, and audit before broader user rollout.

## 3. Opportunity Sources

V2 should include:

| Source | Included in first version? | Notes |
|---|---:|---|
| `tav.leads` | Yes | System-created scored leads. |
| `tav.filtered_out` | Yes | Include filtered/scored listings with filters; do not hide near-misses. |
| `tav.normalized_listings` | Yes | Current listing facts and first/last seen state. |
| `tav.vehicle_candidates` | Yes | Same-vehicle identity context. |
| `tav.duplicate_groups` | Yes | Show duplicate/candidate context, but keep rows separate. |
| `tav.valuation_snapshots` | Yes | Latest MMR and estimate flags. |
| `tav.source_runs` | Yes | Every row needs run identity. |
| Manual submissions | Yes | Buyer/finder-submitted links with optional assigned closer. |

## 4. Row Granularity

Use **one row per listing/run-relevant opportunity** for the first version.

Do not collapse repeated sightings into a single row. Buyers need to see when a
vehicle has surfaced again and which run produced the signal.

Rows should still show candidate context:

- vehicle candidate id
- seen count
- duplicate/candidate badge
- first seen
- last seen
- source run identity

If the same vehicle appears repeatedly, show it as separate rows with clear event
badges instead of silently overwriting the buyer context.

## 5. Event Badges

Every row can carry zero or more event badges.

Initial badge vocabulary:

| Badge | Meaning |
|---|---|
| `First seen` | First known appearance of this listing/candidate. |
| `Seen again #N` | Same vehicle candidate appeared again. |
| `Price changed` | Current price differs from prior captured price. |
| `VIN appeared` | Previous identity was weaker; this listing/run includes VIN. |
| `Mileage changed` | Mileage changed from prior captured value. |
| `Estimated miles` | MMR mileage was inferred from 15k miles/year average. |
| `Estimated style` | Style was selected from the live catalog because source style was missing/ambiguous. |
| `Estimated MMR` | MMR was calculated with one or more inferred inputs. |
| `Near miss` | Listing did not become a lead but is reviewable. |
| `Possible duplicate` | Candidate match is useful but not strong enough to collapse. |

Badges must be visually obvious in the table, preview pane, and detail page.

## 6. Queue Status Scope

The main queue should include:

- `new`
- `assigned`
- `claimed`
- `contacted`
- `negotiating`
- reviewable near-misses that are not stale/removed
- manually submitted opportunities that are not closed/suppressed

Closed/suppressed states should be filterable later, not default:

- `passed`
- `duplicate`
- `stale`
- `sold`
- `purchased`
- `archived`

## 7. People and Routing Model

V2 must distinguish the person who found/submitted the opportunity from the
person expected to work it.

Initial people vocabulary:

| Term | Meaning |
|---|---|
| Finder | Person who found/submitted the listing. Often a buyer in the current manual workflow. |
| Closer | Person expected to contact/negotiate/work the opportunity. |
| Assignee | The currently assigned closer. |
| Admin | User who can reassign and correct workflow state. |

Manual submission requirements:

- User can submit a listing URL.
- User can provide or edit relevant facts when known: price, mileage, year, make,
  model, style, seller notes, region, source, and free-text context.
- User can optionally assign a specific closer at submission time.
- Submission should enter the same Opportunities queue as automated opportunities.
- Submitted-by and assigned-to must be visible in table, preview pane, and detail page.
- Manual submission should still run available enrichment/normalization/valuation
  paths when possible, but missing data must remain honest and badged.

Assignment requirements:

- All buyers and closers can see the entire Opportunities queue during the first
  live testing phase.
- Admin can assign any opportunity to a closer.
- Finder can recommend/choose a closer during submission.
- Buyers/closers can claim unassigned opportunities.
- `claim` is the first required workflow action.
- Reassignment must be audited.
- Concurrent claims must be handled server-side so two users cannot silently own
  the same opportunity.
- A claim grants a 24-hour working window to the claiming user/assigned closer.
- The queue and detail view must show claim owner, claim timestamp, and claim
  expiration timestamp.
- If another user evaluates, opens, or attempts an MMR lookup for an opportunity
  that has already been evaluated or claimed by someone else, the UI must notify
  them with the evaluator/claim owner and timestamp.
- Claim expiration should not delete the history; it only marks the opportunity
  eligible for another user/admin to reclaim or reassign.

## 8. Interaction Model

Build all three interaction layers:

1. **Main table**
   - scan and sort opportunities quickly
   - show badges, price, MMR, spread, score, status, finder, assigned closer,
     source run, first/last seen

2. **Preview pane**
   - single click opens a right-side preview
   - show enough context to make a fast call/watch/pass/assign judgment

3. **Full detail page**
   - double click opens the full detail view
   - show as much structured data as exists and makes sense
   - include raw/source context, all identity signals, valuation signals, reason
     codes, candidate history, and source run history

Preferred frontend route:

```text
/opportunities
/opportunities/:id
```

## 9. Valuation Display

V2 should show the basic spread only:

```text
Spread vs MMR = MMR - asking price
```

Do not show projected gross, expected net, front/back profit, recon, transport,
fees, pack, hold cost, or retail assumptions in this version. Those are future
business rules.

Estimated inputs are allowed, but they must be badged:

- estimated mileage
- estimated style
- estimated MMR

## 10. API Shape

Preferred product API:

```text
GET /app/opportunities
GET /app/opportunities/:id
POST /app/opportunities/manual
POST /app/opportunities/:id/assign
POST /app/opportunities/:id/claim
POST /app/opportunities/:id/status
POST /app/opportunities/:id/notes
```

The outward contract should return a product read model, not raw Supabase rows.

Example list row shape:

```ts
type OpportunityRow = {
  id: string;
  type:
    | "lead"
    | "near_miss"
    | "repeat_sighting"
    | "price_update"
    | "vin_upgrade"
    | "estimate_update"
    | "manual_submission";
  badges: string[];
  source: string;
  region: string | null;
  sourceRunId: string | null;
  normalizedListingId: string | null;
  vehicleCandidateId: string | null;
  leadId: string | null;
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  style: string | null;
  vin: string | null;
  price: number | null;
  mmrValue: number | null;
  spread: number | null;
  finalScore: number | null;
  grade: string | null;
  status: string | null;
  submittedBy: string | null;
  assignedTo: string | null;
  assignedCloserName: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  claimExpiresAt: string | null;
  lastEvaluatedBy: string | null;
  lastEvaluatedAt: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  seenCount: number | null;
  listingUrl: string | null;
  estimateFlags: {
    mileage: boolean;
    style: boolean;
    mmr: boolean;
  };
};
```

Manual submission request shape should be intentionally narrow at first:

```ts
type ManualOpportunitySubmission = {
  listingUrl: string;
  assignedToUserId?: string;
  source?: string;
  region?: string;
  year?: number;
  make?: string;
  model?: string;
  style?: string;
  price?: number;
  mileage?: number;
  sellerNotes?: string;
  submitterNotes?: string;
};
```

## 11. Implementation Constraints

- Keep the four-concept boundary intact.
- Do not add workflow mutations until identity and audit are ready.
- Do not allow assignment or status changes without an auditable actor.
- Do not fabricate profit assumptions.
- Do not collapse duplicate/candidate rows silently.
- Use current listing facts from `normalized_listings`; do not trust stale
  denormalized lead fields when a better current source exists.
- Show source run identity for every row when available.
- Use `--`/empty state for unknown values instead of invented data.
- Keep manual submissions in the same opportunity model as automated
  opportunities; do not build a separate side inbox.

## 12. Known Technical Gaps Before Build

1. `GET /app/opportunities` and `GET /app/opportunities/:id` do not exist yet.
2. The web client has no opportunities schema/client/parser.
3. The nav has no Opportunities entry.
4. Latest valuation lookup may need an index:

```sql
CREATE INDEX ON tav.valuation_snapshots (normalized_listing_id, fetched_at DESC);
```

5. Near-miss inclusion needs a first-pass reason-code filter so obvious junk does
   not overwhelm the buyer queue.
6. Manual submission needs a persistence design.
7. Assignment requires a user/role model and auditable actor identity.
8. Full workflow mutations require an identity/audit design.

## 13. Recommended Delivery Slices

### Slice A — Read Model

- `GET /app/opportunities`
- `GET /app/opportunities/:id`
- `/opportunities` table, preview pane, detail page
- includes automated leads, near-misses, repeat/price/VIN/estimate badges
- no assignment mutations yet

### Slice B — Manual Submission and Routing Foundation

- user/role table or equivalent identity mapping
- `POST /app/opportunities/manual`
- submitter/finder recorded
- optional assigned closer at submission time
- manual opportunities appear in same queue
- audit event written for submission and assignment

### Slice C — Live Assignment Workflow

- claim
- 24-hour claim window
- notify when another user already evaluated/claimed the opportunity
- assign
- unassign/reassign
- status update
- notes
- action history
- concurrency protection

Live multi-user testing should begin after Slice C, not after Slice A alone.
