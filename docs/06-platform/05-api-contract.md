# API Contract — Buying-Side Platform

Status: Draft control doc  
Date: 2026-05-18  
Scope: `V2-Core`, `V2.5`, `V3`, `V3+`

This document defines the product API contracts for v2/v3. It follows the
existing boundary:

```text
Browser -> Next same-origin /api/app/* proxy -> main Worker /app/* -> Supabase / intelligence Worker
```

No browser code may call Supabase, Cox/Manheim, or the intelligence Worker
directly.

## Existing `/app/*` Pattern

Current product API lives in `src/app/routes.ts` and is consumed by
`web/lib/app-api/client.ts`.

Existing behavior to preserve:

- App auth uses `APP_API_SECRET` server-side.
- Browser calls same-origin `/api/app/<path>`.
- API responses use `{ ok: true, data }` or `{ ok: false, error }`.
- Business unavailability can be `{ ok: true, data: { ...null, missingReason } }`.
- No fabricated metrics or MMR values.

## Response Envelope

### Success

```ts
type AppOk<T> = {
  ok: true;
  data: T;
};
```

### Error

```ts
type AppError = {
  ok: false;
  error: string;
  message?: string;
  details?: unknown;
};
```

### Business Unavailable

Use success envelope with explicit state when the product can render honestly:

```ts
type Unavailable = {
  missingReason: string;
};
```

Examples:

- MMR no-data
- vendor not provisioned
- no opportunity detail found but source/run context exists

## Shared Types

```ts
type OpportunityType =
  | "lead"
  | "near_miss"
  | "repeat_sighting"
  | "price_update"
  | "vin_upgrade"
  | "estimate_update"
  | "manual_submission";

type OpportunityBadge =
  | "first_seen"
  | "seen_again"
  | "price_changed"
  | "vin_appeared"
  | "mileage_changed"
  | "estimated_miles"
  | "estimated_style"
  | "estimated_mmr"
  | "near_miss"
  | "possible_duplicate"
  | "already_claimed"
  | "already_evaluated";

type OpportunityStatus =
  | "new"
  | "assigned"
  | "claimed"
  | "contacted"
  | "negotiating"
  | "passed"
  | "duplicate"
  | "stale"
  | "sold"
  | "purchased"
  | "archived";
```

## `OpportunityRow`

FRs: FR-001, FR-004..010, FR-018  
Schema: `opportunity_read_model`  
State: `SM-OPP-001`, `SM-OPP-002`

```ts
type OpportunityRow = {
  id: string;
  type: OpportunityType;
  status: OpportunityStatus | "unknown";
  badges: OpportunityBadge[];

  source: string;
  region: string | null;
  sourceRunId: string | null;
  normalizedListingId: string | null;
  vehicleCandidateId: string | null;
  leadId: string | null;

  title: string;
  listingUrl: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  vin: string | null;
  price: number | null;
  mileage: number | null;
  mileageEstimated: boolean;
  styleEstimated: boolean;

  mmrValue: number | null;
  mmrMethod: "vin" | "year_make_model" | null;
  mmrMissingReason: string | null;
  mmrEstimated: boolean;
  spread: number | null;

  finalScore: number | null;
  grade: "excellent" | "good" | "fair" | "pass" | null;
  reasonCodes: string[];

  finder: PersonRef | null;
  assignee: PersonRef | null;
  claim: ClaimSummary | null;

  firstSeenAt: string | null;
  lastSeenAt: string | null;
  seenCount: number | null;
};

type PersonRef = {
  userId: string | null;
  name: string | null;
  email?: string | null;
};

type ClaimSummary = {
  claimedBy: PersonRef;
  claimedAt: string;
  expiresAt: string;
  state: "active" | "expired" | "released" | "superseded";
};
```

## `OpportunityDetail`

FRs: FR-002, FR-003, FR-005, FR-015  
Schema: read model + event/timeline sources  
State: `SM-OPP-001`, `SM-OPP-002`

```ts
type OpportunityDetail = OpportunityRow & {
  rawContext: Record<string, unknown> | null;
  scoreContext: Record<string, unknown> | null;
  duplicateContext: DuplicateContext[];
  valuationHistory: ValuationSummary[];
  timeline: OpportunityTimelineEvent[];
};

type DuplicateContext = {
  vehicleCandidateId: string;
  normalizedListingId: string | null;
  confidence: number | null;
  dedupeType: "exact" | "fuzzy" | "possible";
  isCanonical: boolean;
};

type ValuationSummary = {
  mmrValue: number | null;
  method: "vin" | "year_make_model" | null;
  missingReason: string | null;
  mileageUsed: number | null;
  mileageEstimated: boolean;
  styleEstimated: boolean;
  fetchedAt: string;
};

type OpportunityTimelineEvent = {
  id: string;
  type: string;
  actor: PersonRef | null;
  createdAt: string;
  payload: Record<string, unknown>;
};
```

## V2-Core Endpoints

### `GET /app/opportunities`

FRs: FR-001, FR-004..010, FR-018  
Milestone: `V2-Core`

Query:

```ts
type ListOpportunitiesQuery = {
  limit?: number;        // default 50, max 100
  cursor?: string;
  status?: string;
  type?: OpportunityType;
  source?: string;
  region?: string;
  owner?: "unclaimed" | "claimed" | "assigned" | string;
  badge?: OpportunityBadge;
  q?: string;
};
```

Response:

```ts
type ListOpportunitiesResponse = {
  items: OpportunityRow[];
  nextCursor: string | null;
  generatedAt: string;
};
```

Rules:

- First implementation is read-only.
- Include active work-relevant rows by default.
- Do not require workflow write tables.
- Do not fabricate missing fields.

### `GET /app/opportunities/:id`

FRs: FR-002, FR-003, FR-005, FR-015  
Milestone: `V2-Core`

Response:

```ts
type GetOpportunityResponse =
  | { found: true; opportunity: OpportunityDetail }
  | { found: false; missingReason: "not_found" | "source_removed" };
```

Rules:

- Stable `id` is the product key from the read model.
- Missing detail does not crash the queue.

### `POST /app/opportunities/manual-submissions`

FRs: FR-011..013  
Milestone: `V2-Core`

Body:

```ts
type ManualSubmissionRequest = {
  listingUrl: string;
  assignedToUserId?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  vin?: string;
  price?: number;
  mileage?: number;
  source?: string;
  region?: string;
  sellerNotes?: string;
  contextNotes?: string;
};
```

Response:

```ts
type ManualSubmissionResponse = {
  submissionId: string;
  opportunityId: string;
  duplicateWarning: {
    kind: "existing_candidate" | "existing_listing" | "active_claim";
    opportunityId?: string;
    message: string;
  } | null;
};
```

Rules:

- URL is required.
- Optional facts remain optional.
- Duplicate matches warn; do not silently discard.

### `POST /app/opportunities/:id/claim`

FRs: FR-014..016  
Milestone: `V2-Core`

Body:

```ts
type ClaimOpportunityRequest = {
  expectedVersion?: string;
};
```

Response:

```ts
type ClaimOpportunityResponse =
  | { claimed: true; claim: ClaimSummary }
  | { claimed: false; reason: "already_claimed"; currentClaim: ClaimSummary };
```

Rules:

- Must be atomic server-side.
- Exactly one concurrent claim succeeds.
- Creates 24-hour working window.

### `POST /app/opportunities/:id/assign`

FRs: FR-013, FR-017  
Milestone: `V2-Core`

Body:

```ts
type AssignOpportunityRequest = {
  assignedToUserId: string;
  reason?: string;
};
```

Response:

```ts
type AssignOpportunityResponse = {
  assigned: true;
  assignee: PersonRef;
  assignedAt: string;
};
```

Rules:

- Admin-gated unless OQ-008 decides broader permission.
- Assignment does not hide row from the full team.

## V2.5 Endpoints

### `POST /app/opportunities/:id/touches`

FRs: FR-020  
Body:

```ts
type CreateTouchRequest = {
  touchType: "call" | "sms" | "email" | "note" | "other";
  outcome?: string;
  body?: string;
};
```

Response: created timeline event or touch row.

### `POST /app/staff/availability`

FRs: FR-021  
Body:

```ts
type SetAvailabilityRequest = {
  status: "on_duty" | "off_duty" | "away";
  statusUntil?: string;
};
```

## V3 Endpoints

| Endpoint | Method | FRs | Purpose |
|---|---|---|---|
| `/app/opportunities/:id/offers` | `POST` | FR-024, FR-025 | Create offer / compute approval gate. |
| `/app/offers/:id/approve` | `POST` | FR-026 | Approve pending offer. |
| `/app/offers/:id/reject` | `POST` | FR-026 | Reject pending offer with reason. |
| `/app/offers/:id/counters` | `POST` | FR-027 | Record customer counter. |
| `/app/offers/:id/supersede` | `POST` | FR-028 | Supersede offer. |
| `/app/opportunities/:id/disposition` | `POST` | FR-029 | Dispose opportunity. |
| `/app/dispositions/:id/validate` | `POST` | FR-030 | Approve/override/dispute disposition. |

Do not implement V3 endpoints inside V2-Core PRs.

## Error Codes

| Code | Meaning |
|---|---|
| `unauthorized` | Missing/bad app auth. |
| `forbidden` | User lacks role/tier permission. |
| `validation_error` | Request body/query invalid. |
| `not_found` | Product key not found. |
| `conflict` | Claim/assignment/version conflict. |
| `db_error` | Persistence failure. |
| `intel_worker_unavailable` | Intelligence worker unavailable. |
| `vendor_not_provisioned` | Cox/Manheim unavailable/not entitled. |
| `no_mmr_value` | Vendor returned no valuation. |

## First Code PR API Boundary

The first v2 code PR may add only:

- `GET /app/opportunities`
- `GET /app/opportunities/:id`
- typed web client helpers
- Zod schemas/parsers
- tests for read-only contracts

It must not add:

- claim mutation
- assignment mutation
- manual submission mutation
- touches
- offers/counters
- dispositions
- validation
- approval governance

