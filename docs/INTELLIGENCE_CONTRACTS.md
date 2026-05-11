# Intelligence Layer Contracts

**Status:** Frozen. Any change requires an ADR.
**Owners:** TAV-AIP Worker + tav-intelligence-worker
**Last updated:** 2026-05-07

These four contracts are the seams between the main Worker, the new
intelligence Worker, KV, and Postgres. Once handlers ship in Phase F.1,
breaking any of these silently corrupts the cache or the identity log —
so we lock them now.

---

## A. `cache_key` derivation

**Authoritative helper:** `deriveMmrCacheKey()` (to be implemented in
`workers/tav-intelligence-worker/src/cache/mmrCacheKey.ts`).

**Format — VIN lookup:**

```
vin:${normalizedVin}
```

`normalizedVin` is `vin.trim().toUpperCase()` — VIN characters are
case-insensitive and uppercase is the standard form Manheim returns.

> Note: while the rest of the cache key is lowercase, **the VIN itself
> stays uppercase** to match Manheim's canonical form. The `vin:` prefix
> is the lowercase namespace; the VIN value preserves case.

**Format — Year/Make/Model lookup:**

```
ymm:${year}:${makeLower}:${modelLower}:${trimLower ?? 'base'}:${mileageBucket}
```

Where:
- `makeLower` / `modelLower` / `trimLower`: input strings normalized via
  `s.trim().toLowerCase().replace(/\s+/g, '_')`
- `trim` may be null/undefined → use the literal string `'base'`
- `mileageBucket`: see below

### Mileage bucket

```
mileageBucket = Math.round(mileage / 5000) * 5000
```

Examples:

| Input mileage | Bucket |
|---|---|
| 47,250 | 45,000 |
| 48,999 | 50,000 |
| 50,000 | 50,000 |
| 52,499 | 50,000 |
| 52,500 | 55,000 |
| 0 (after inference) | 1,000 → 0 |

Edge case: `Math.round(0.5) === 1` and `Math.round(1.5) === 2` in JS
(half-up). Confirm the helper uses `Math.round` consistently.

> When the inference helper returns `INFERRED_MILEAGE_FLOOR = 1000`, the
> bucket is `Math.round(1000/5000)*5000 = 0`. **Treat `0` as a valid
> bucket** — it represents "negligibly used."

### Why bucket?

- Better cache reuse — vehicles within ~5k miles of each other return
  the same MMR within Manheim's tolerance.
- Fewer duplicate Manheim calls.
- Aligns with MMR's own internal rounding behavior.

### Cache key examples

```
vin:1HGCM82633A123456
ymm:2020:toyota:camry:se:60000
ymm:2024:ford:f-150:base:25000
ymm:2027:rivian:r1t:base:0
```

### Anti-collision rules

- VINs and YMM keys never collide because of the prefix.
- Two YMM keys collide only when year, make, model, trim, and mileage
  bucket are all equal — by design (the whole point of the bucket).

---

## B. `segment_key` derivation

**Authoritative helper:** `deriveSegmentKey()` (to be implemented in
`workers/tav-intelligence-worker/src/scoring/segmentKey.ts`).

**Format:**

```
${year ?? 'all'}:${makeLower}:${modelLower}:${trimLower ?? 'base'}:${region ?? 'national'}
```

Normalization rules:
- All lowercase
- `s.trim().replace(/\s+/g, ' ').replace(/[^a-z0-9 _-]/gi, '').replace(/ /g, '_')`
  - Trim outer whitespace
  - Collapse internal whitespace
  - Strip non-alphanumeric except underscore and hyphen
  - Spaces → underscores
- Year → string. Use literal `'all'` for null (whole-make rollups).
- Trim → use literal `'base'` for null.
- Region → use literal `'national'` for null. Otherwise must be one of
  `dallas_tx`, `houston_tx`, `austin_tx`, `san_antonio_tx`.

### Examples

```
2020:toyota:camry:se:dallas_tx
all:ford:f-150:base:national
2024:rivian:r1t:adventure_package:austin_tx
```

### Stability guarantee

A given segment must produce a deterministic key. Reordering inputs,
case changes, or whitespace differences must NOT produce different keys.

---

## C. User context contract

**Authoritative helper:** `extractUserContext()` in
`/src/auth/userContext.ts` (root project, sharable).

```typescript
export interface UserContext {
  userId: string | null;
  email:  string | null;
  name:   string | null;
  roles:  string[];
}

export function extractUserContext(request: Request): UserContext;
```

### Read order

1. **`Cf-Access-Authenticated-User-Email`** — primary identity. Set by
   Cloudflare Access on every authenticated request. Maps to `email`.
2. **`Cf-Access-Jwt-Assertion`** — full JWT with claims. **Defer**
   parsing until we need richer fields. Phase F.1 ignores it.
3. **`Cf-Access-Authenticated-User-Roles`** — comma-separated roles
   (Cloudflare Access groups). Empty list when header absent.

The `userId` for now mirrors `email` — Cloudflare Access doesn't
provide a separate stable ID. Promote to JWT `sub` claim when JWT
parsing lands.

### Failure mode

If no Cloudflare Access headers are present (e.g. internal smoke
tests, local `wrangler dev`), the context is:

```typescript
{ userId: null, email: null, name: null, roles: [] }
```

Handlers decide whether anonymous access is permitted on a per-route
basis.

### Forbidden

- Handlers MUST NOT manually parse `Cf-Access-*` headers.
- Handlers MUST NOT trust other identity headers (e.g. `X-User-Email`)
  unless explicitly added to this contract.

---

## D. `force_refresh` authorization contract

**Authoritative helper:** `canForceRefresh()` in
`/src/auth/userContext.ts`.

```typescript
export function canForceRefresh(
  ctx: UserContext,
  managerAllowlist: string | undefined,
): boolean;
```

### Decision logic (MVP — temporary)

1. If `ctx.roles` includes the literal string `"manager"` → allow.
2. Else if `ctx.email` is non-null AND `managerAllowlist` env var is
   defined AND the email (lowercased) appears in the comma-separated
   allowlist → allow.
3. Else → deny.

### Env var

```
MANAGER_EMAIL_ALLOWLIST=alice@texasautovalue.com,bob@texasautovalue.com
```

Empty / missing env var means no email-based bypass; only role-based
authorization is honored.

### Why temporary

This is a stop-gap until `tav.user_roles` exists. Once that table is
introduced (post-pivot), `canForceRefresh` will read from Postgres and
the env var goes away. **Do not depend on the env-var path long-term.**

### What `force_refresh` skips

When granted:
- Cache is bypassed for the lookup.
- Result is written back to cache, replacing any existing entry.
- The query is logged with `force_refresh=true` and
  `source='manheim'` regardless of cache state.

When denied: the request returns 403 if `force_refresh: true` was
supplied. The request does NOT silently downgrade to a cached lookup.

---

## Change procedure

Any modification to A, B, C, or D after Phase F.1 ships requires:
1. An ADR in `docs/adr/` explaining the migration path.
2. A coordinated cache flush (for A) or full velocity recompute (for
   B) before deploy.
3. Tests covering the OLD and NEW key shapes.
