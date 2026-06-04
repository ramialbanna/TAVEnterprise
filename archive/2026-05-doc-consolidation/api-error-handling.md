# API Error Handling Strategy

**Status:** Locked 2026-05-07. Any change requires an ADR.
**Scope:** All Workers in this repo (`tav-aip`, `tav-intelligence-worker`, future siblings).

This doc records the layered contract for how typed errors propagate
from the lowest internal modules out to the HTTP response envelope.
Once the intelligence Worker's handler layer wires the orchestrator
in Phase G.2, every Worker route in the repo follows this contract.

---

## The decision

**Throw-and-let-handler-format.**

- Service / orchestration layers **throw** typed errors
  (`IntelligenceError` subclasses).
- HTTP handlers **catch** at the route boundary and convert to the
  canonical `ApiResponse<T>` envelope using `errorResponse(...)` from
  `types/api.ts`.
- The top-level `fetch` handler in `src/index.ts` is the final safety
  net for unmapped errors.

There is **one** place that builds the response envelope from an
error: the handler / top-level catch. Nowhere else.

---

## Forbidden patterns

These are explicitly out of scope for the orchestration and service
layers. Reviewers should flag any of them in a PR.

### 1. Swallowed integration failures

```typescript
// ❌ BAD — orchestrator hides Manheim failure as a "fake success"
try {
  const result = await client.lookupByVin(...);
  return envelope(result);
} catch (err) {
  return { ok: false, mmr_value: null, error_code: "manheim_down", ... };
}
```

The orchestrator MUST throw. The handler decides how to surface.

### 2. Partial fake-success envelopes

```typescript
// ❌ BAD — orchestrator returns an envelope with error_code populated
return {
  ok: false,
  mmr_value: null,
  error_code: "manheim_5xx",
  error_message: "...",
  ...
};
```

The `MmrResponseEnvelope` schema permits `error_code` / `error_message`
to be non-null, but the orchestrator MUST NOT populate them. Those
fields are reserved for soft-fail flows (see "Future exception" below).

### 3. Silent retry hidden inside orchestration

The retry loop lives in the transport layer (`manheimHttp.ts` →
`retryWithBackoff`). The orchestrator does NOT wrap client calls in
extra retry logic — it would mask retry counts, double the latency
budget, and break the dashboard story.

### 4. Catching to log and re-throw with the same fidelity

```typescript
// ❌ BAD — duplicate logging, no value added
try {
  return await client.lookupByVin(...);
} catch (err) {
  log("orchestrator.client.failed", { err });
  throw err;
}
```

The transport layer already logs the failure. The orchestrator's
`mmr.lookup.failure` event fires once at the outer boundary with
orchestration context (`cacheKey`, `inferredMileage`, `latencyMs`).
That's the only orchestration-side log.

---

## Why this layering

### Clean separation of concerns

| Layer | Knows |
|---|---|
| Transport (`manheimHttp.ts`) | HTTP, retries, OAuth |
| Orchestration (`mmrLookup.ts`) | Cache + lock dance, mileage inference |
| Handler (`handlers/*.ts`) | URL → input parsing, auth, response envelope |
| Top-level `fetch` | Request lifecycle, requestId, panic catch |

The orchestrator does not need to know what HTTP status to surface.
The transport does not need to know about cache_hit. The handler does
not need to know about retry counts.

Every typed error carries enough information for the handler to
format the envelope without re-implementing service logic.

### Centralized API formatting

The shape of `ApiResponse<T>` is defined exactly once
(`types/api.ts`). All HTTP routes in the worker emit this envelope
via `okResponse()` and `errorResponse()`. A schema change is a
one-file diff.

### Simplified retries and observability

Each layer logs its own concerns:

| Layer | Log namespace | Owns |
|---|---|---|
| Transport | `manheim.http.*`, `manheim.token.*` | retry counts, latency per attempt |
| Cache | `mmr.cache.*` | hit/miss/set/invalidate |
| Lock | `mmr.lock.*` | acquire/release/race |
| Orchestrator | `mmr.lookup.*` | cache_hit / cache_miss / lock_wait / complete / failure |

Dashboards partition cleanly because event names don't collide and
each event has fields scoped to its layer.

### No hidden partial-failure states

If a Manheim 5xx fires, the response is a 502 with
`error_code: "manheim_unavailable"`. The portal sees an explicit
failure and decides what to show the user.

If the orchestrator silently returned a "no data" envelope, the
portal could not distinguish "Manheim is down" from "this VIN has no
MMR data." Two very different operational states.

---

## The handler contract

Every protected handler follows this shape:

```typescript
export async function handleMmrVin(args: HandlerArgs): Promise<Response> {
  // 1. Parse + validate body (throws ValidationError on malformed)
  const body = await args.request.json();
  const parsed = MmrVinLookupRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Invalid MMR VIN payload", parsed.error.flatten());
  }

  // 2. Auth (throws AuthError on anonymous or denied)
  if (args.userContext.email === null) {
    throw new AuthError("Cloudflare Access identity required");
  }
  if (parsed.data.force_refresh && !canForceRefresh(args.userContext, args.env.MANAGER_EMAIL_ALLOWLIST)) {
    throw new AuthError("force_refresh requires manager role or allowlist");
  }

  // 3. Orchestrate (orchestrator throws Manheim* / CacheLockError on failure)
  const envelope = await performMmrLookup(
    { input: { kind: "vin", ...parsed.data }, requestId: args.requestId, forceRefresh: parsed.data.force_refresh },
    deps,
  );

  // 4. Return on success
  return okResponse(envelope, args.requestId);
}
```

The handler does NOT wrap this in try/catch. The top-level `fetch`
in `src/index.ts` catches every `IntelligenceError`, calls
`errorResponse(err.code, err.message, requestId, err.httpStatus, err.details)`,
and emits the envelope.

If the handler needs to add domain context to a thrown error, it
should re-throw as a new typed error with the original as `cause` —
NOT swallow and inline-format.

---

## Future exception: replay / recovery flows

Phase G.2+ may introduce flows where a soft-fail envelope is the
correct behavior. Examples:

- **Bulk replay** (existing main-Worker `POST /replay`): the
  intelligence Worker may be asked to value 500 listings. If
  Manheim is down, the right response may be: skip those listings
  with an `error_code` envelope per listing, return a summary.
  Failing the entire batch is worse than partial success.

- **Background reconciliation jobs**: nightly recompute should not
  abort a 50,000-row scan because one VIN's lookup failed.

These flows are **always** introduced explicitly:
1. The handler adopts a soft-fail policy in code.
2. The handler catches `IntelligenceError` subclasses and builds the
   envelope itself.
3. The orchestrator and service layers do NOT change behavior — they
   still throw.

A handler opting in to soft-fail must document why in its file-level
TSDoc and reference an ADR. Soft-fail is a deliberate per-route
policy decision, never an emergent default.

---

## Enforcement

- New typed errors live in `workers/tav-intelligence-worker/src/errors/index.ts`
  (or sibling worker equivalent). They MUST extend `IntelligenceError`
  with concrete `code` (string) and `httpStatus` (number).
- The orchestrator surface must export `Promise<...>` types that
  reflect the throw contract. No `Result<T, Error>` types — that
  pattern was rejected as adding complexity without benefit.
- Tests assert that the orchestrator throws (not returns) on
  every failure path covered.
- Code review flags any of the four forbidden patterns above.
