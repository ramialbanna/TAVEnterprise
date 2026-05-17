# Preserved: Issue #45 R0 — Production Contract Probe (human-reviewed)

**Date:** 2026-05-17
**Why this file exists:** RuFlo autopilot auto-authored ~17 unreviewed #45 commits on
local branch `feat/issue-45-manheim-smoke` (governance breach — see Issue #44 comment
and memory `project_autopilot_breach.md`). Those commits are being discarded. The ONLY
human-reviewed, R0-gate-compliant #45 artifact is the **read-only production contract
probe** below. It is preserved here so #45 can be rebuilt deliberately from clean
`origin/main` after the probe confirms the endpoint family.

**Contains no secrets.** The probe is redaction-first: it never copies tokens, secrets,
or licensed MMR/wholesale figures into its report or logs.

**Scope reminder:** read-only. Server-side. No browser→vendor. 401/403/596/`invalid_scope`
⇒ `not_provisioned`; 5xx/network ⇒ `unavailable`; never a fabricated fallback. Probe
execution against production (deploy + authenticated call) is a SEPARATE gated step —
not done here.

---

## Reapply procedure (onto a clean branch from `origin/main`)

1. `git switch -c feat/issue-45-contract-probe origin/main`
2. Create `workers/tav-intelligence-worker/src/clients/valuationsContractProbe.ts`
   (FILE 1 below, verbatim).
3. Create `workers/tav-intelligence-worker/src/handlers/valuationsContractProbe.ts`
   (FILE 2 below, verbatim).
4. Apply INSERT 1 + INSERT 2 to `workers/tav-intelligence-worker/src/clients/manheimHttp.ts`.
5. Apply INSERT 3 + INSERT 4 to `workers/tav-intelligence-worker/src/routes/index.ts`.
6. Add unit test `workers/tav-intelligence-worker/src/clients/__tests__/valuationsContractProbe.test.ts`
   (classify table; `extractShape` redaction; `executeContractProbe` token-ok→legacy/cox,
   596/401/`invalid_scope`→not_provisioned, 5xx→unavailable; assert serialized report
   excludes `Bearer`/token/secret/sample MMR figure). Not yet written — the contested
   tree blocked verification.
7. Verify loop: `npm run lint && npm run typecheck && npm test`.

> Note: the probe imports only error classes that exist on clean `origin/main`
> (`CacheLockError, ManheimAuthError, ManheimRateLimitError, ManheimUnavailableError`).
> It does NOT depend on the automation's `CatalogNotProvisionedError`/`CatalogUnavailableError`
> or the widened `ManheimClient` interface, so it applies cleanly to pristine `origin/main`.

---

## FILE 1 — `workers/tav-intelligence-worker/src/clients/valuationsContractProbe.ts`

```ts
/**
 * Production contract probe for the Cox/Manheim Wholesale-Valuations API
 * (Issue #45, R0 contract reconciliation).
 *
 * Purpose: against the *production-configured* host for our app, determine
 * which catalog + valuation contract actually responds:
 *   - legacy  `${MANHEIM_MMR_URL}/valuations/{years,...,search}`  (api.manheim.com)
 *   - Cox     `${MANHEIM_MMR_URL}/mmr-lookup/...` + `/search/...`  (storefront)
 *
 * HARD RULES (production-bound, see docs/ISSUE_45_CATALOG_API_SPEC.md):
 *   - Read-only. GET probes only. No persistence, no business state mutation.
 *   - The returned report is assembled ONLY from: a fixed enum of status
 *     strings, booleans, integers (HTTP status / array counts), and the
 *     *key names* of response objects. Response VALUES — tokens, secrets,
 *     and licensed MMR/wholesale figures — are NEVER copied into the report
 *     or logs.
 *   - 401 / 403 / 596 / `invalid_scope` ⇒ `not_provisioned`. 5xx / network
 *     ⇒ `unavailable`. Never a fabricated/sample fallback.
 *
 * The probe uses fixed, public, non-sensitive vehicle inputs so requests are
 * minimal and deterministic; the returned valuation number is classified
 * (present / absent) but never read out.
 */

import type { Env } from "../types/env";
import {
  CacheLockError,
  ManheimAuthError,
  ManheimRateLimitError,
  ManheimUnavailableError,
} from "../errors";

/** Fixed, public, non-sensitive probe vehicle. Values are not licensed data. */
const PROBE = {
  year: 2023,
  make: "HONDA",
  model: "ACCORD",
  body: "4D SEDAN",
  odometer: 50000,
} as const;

export type ProbeClass =
  | "ok"
  | "not_provisioned"
  | "not_found"
  | "unavailable"
  | "bad_response";

export type ProbeEndpoint =
  | "years"
  | "makes"
  | "models"
  | "trims"
  | "valuation_search";

export type ProbeFamily = "legacy_valuations" | "cox_storefront";

export interface ShapeInfo {
  /** Top-level object key names only (sorted). No values. */
  topLevelKeys: string[];
  /** `items[]` length when present, else null. */
  itemCount: number | null;
  /** `items[0]` key names only, when present. No values. */
  itemKeys: string[] | null;
  /** Key-name heuristic: looks like a catalog enumeration response. */
  looksLikeCatalog: boolean;
  /** Key-name heuristic: carries a pricing block (value never read). */
  hasPricingKeys: boolean;
}

export interface ProbeResult {
  family: ProbeFamily;
  endpoint: ProbeEndpoint;
  /** Templated path — no concrete IDs or values. */
  pathTemplate: string;
  httpStatus: number | null;
  classified: ProbeClass;
  /** OAuth/error code string (a code, never a secret), when the body carried one. */
  errorCode?: string;
  shape?: ShapeInfo;
}

export interface ContractProbeReport {
  vendorConfigured: "cox" | "legacy";
  grantType: string;
  scopeConfigured: boolean;
  tokenObtained: boolean;
  tokenClassified: "ok" | "not_provisioned" | "unavailable";
  tokenErrorCode?: string;
  probes: ProbeResult[];
  recommendation: string;
}

type TokenResult = { token: string } | { token: null; error: unknown };

const CATALOG_KEY_HINTS = [
  "years",
  "makes",
  "models",
  "trims",
  "year",
  "make",
  "model",
  "trim",
  "items",
];
const PRICING_KEY_HINTS = ["adjustedpricing", "wholesale", "mmr", "average"];

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Extract ONLY structural key names + counts from a parsed body. No value is
 * ever copied — this is the redaction boundary.
 */
export function extractShape(json: unknown): ShapeInfo {
  let topLevelKeys: string[] = [];
  let itemCount: number | null = null;
  let itemKeys: string[] | null = null;

  if (Array.isArray(json)) {
    itemCount = json.length;
    if (json.length > 0 && isObject(json[0])) itemKeys = Object.keys(json[0]).sort();
  } else if (isObject(json)) {
    topLevelKeys = Object.keys(json).sort();
    const items = json.items;
    if (Array.isArray(items)) {
      itemCount = items.length;
      if (items.length > 0 && isObject(items[0])) itemKeys = Object.keys(items[0]).sort();
    }
  }

  const allKeysLower = [...topLevelKeys, ...(itemKeys ?? [])].map((k) => k.toLowerCase());
  const looksLikeCatalog =
    (itemCount !== null || allKeysLower.length > 0) &&
    allKeysLower.some((k) => CATALOG_KEY_HINTS.includes(k));
  const hasPricingKeys = allKeysLower.some((k) =>
    PRICING_KEY_HINTS.some((h) => k.includes(h)),
  );

  return { topLevelKeys, itemCount, itemKeys, looksLikeCatalog, hasPricingKeys };
}

/**
 * Classify a probe response from status + (already-parsed) body. The body is
 * inspected ONLY for an `error` code string — never for values.
 */
export function classifyProbe(
  status: number,
  body: unknown,
): { classified: ProbeClass; errorCode?: string } {
  const errorCode =
    isObject(body) && typeof body.error === "string" ? body.error : undefined;

  if (status === 200) return { classified: "ok" };
  if (status === 401 || status === 403 || status === 596) {
    return { classified: "not_provisioned", ...(errorCode ? { errorCode } : {}) };
  }
  if (status === 400 && errorCode === "invalid_scope") {
    return { classified: "not_provisioned", errorCode };
  }
  if (status === 404) {
    return { classified: "not_found", ...(errorCode ? { errorCode } : {}) };
  }
  if (status >= 500 && status < 600) {
    return { classified: "unavailable", ...(errorCode ? { errorCode } : {}) };
  }
  return { classified: "bad_response", ...(errorCode ? { errorCode } : {}) };
}

interface PlanEntry {
  family: ProbeFamily;
  endpoint: ProbeEndpoint;
  url: string;
  pathTemplate: string;
  coxHeaders: boolean;
}

function trimTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

/**
 * Build both candidate contract plans against the configured base host so the
 * decision is evidence-based regardless of `MANHEIM_API_VENDOR`.
 */
export function buildProbePlan(env: Env): PlanEntry[] {
  const base = trimTrailingSlash(env.MANHEIM_MMR_URL || "");
  const y = PROBE.year;
  const mk = encodeURIComponent(PROBE.make);
  const md = encodeURIComponent(PROBE.model);
  const bd = encodeURIComponent(PROBE.body);

  // Legacy Manheim Valuations (host-only base, e.g. https://api.manheim.com).
  const legacy: PlanEntry[] = [
    {
      family: "legacy_valuations",
      endpoint: "years",
      url: `${base}/valuations/years`,
      pathTemplate: "/valuations/years",
      coxHeaders: false,
    },
    {
      family: "legacy_valuations",
      endpoint: "makes",
      url: `${base}/valuations/years/${y}/makes`,
      pathTemplate: "/valuations/years/{year}/makes",
      coxHeaders: false,
    },
    {
      family: "legacy_valuations",
      endpoint: "models",
      url: `${base}/valuations/years/${y}/makes/${mk}/models`,
      pathTemplate: "/valuations/years/{year}/makes/{make}/models",
      coxHeaders: false,
    },
    {
      family: "legacy_valuations",
      endpoint: "trims",
      url: `${base}/valuations/years/${y}/makes/${mk}/models/${md}/trims`,
      pathTemplate: "/valuations/years/{year}/makes/{make}/models/{model}/trims",
      coxHeaders: false,
    },
    {
      family: "legacy_valuations",
      endpoint: "valuation_search",
      url: `${base}/valuations/search/${y}/${mk}/${md}?odometer=${PROBE.odometer}`,
      pathTemplate: "/valuations/search/{year}/{make}/{model}?odometer={odo}",
      coxHeaders: false,
    },
  ];

  // Cox Storefront. Reference tree lives under /mmr-lookup; valuation under /search.
  const lookupBase = base.replace(/\/mmr$/, "/mmr-lookup");
  const cox: PlanEntry[] = [
    {
      family: "cox_storefront",
      endpoint: "years",
      url: `${lookupBase}/years`,
      pathTemplate: "{mmr-lookup}/years",
      coxHeaders: true,
    },
    {
      family: "cox_storefront",
      endpoint: "makes",
      url: `${lookupBase}/years/${y}/makes`,
      pathTemplate: "{mmr-lookup}/years/{year}/makes",
      coxHeaders: true,
    },
    {
      family: "cox_storefront",
      endpoint: "models",
      url: `${lookupBase}/years/${y}/makes/${mk}/models`,
      pathTemplate: "{mmr-lookup}/years/{year}/makes/{make}/models",
      coxHeaders: true,
    },
    {
      family: "cox_storefront",
      endpoint: "trims",
      url: `${lookupBase}/years/${y}/makes/${mk}/models/${md}/trims`,
      pathTemplate: "{mmr-lookup}/years/{year}/makes/{make}/models/{model}/trims",
      coxHeaders: true,
    },
    {
      family: "cox_storefront",
      endpoint: "valuation_search",
      url: `${base}/search/${y}/${mk}/${md}/${bd}?odometer=${PROBE.odometer}`,
      pathTemplate: "{mmr}/search/{year}/{make}/{model}/{body}?odometer={odo}",
      coxHeaders: true,
    },
  ];

  return [...legacy, ...cox];
}

function classifyTokenError(error: unknown): {
  tokenClassified: "not_provisioned" | "unavailable";
  tokenErrorCode?: string;
} {
  if (error instanceof ManheimAuthError) {
    const details = error.details;
    const code =
      isObject(details) && typeof details.error_code === "string"
        ? details.error_code
        : undefined;
    return { tokenClassified: "not_provisioned", ...(code ? { tokenErrorCode: code } : {}) };
  }
  if (
    error instanceof ManheimUnavailableError ||
    error instanceof ManheimRateLimitError ||
    error instanceof CacheLockError
  ) {
    return { tokenClassified: "unavailable" };
  }
  return { tokenClassified: "unavailable" };
}

function deriveRecommendation(
  tokenClassified: ContractProbeReport["tokenClassified"],
  probes: ProbeResult[],
): string {
  if (tokenClassified === "not_provisioned") {
    return "blocked_not_provisioned: OAuth token denied (401/403/invalid_scope). Escalate to Cox/Manheim rep for production entitlement. Render honest not_provisioned; do NOT wire catalog routes or UI.";
  }
  if (tokenClassified === "unavailable" || probes.length === 0) {
    return "inconclusive_unavailable: token endpoint or upstream unavailable. Re-run the production probe; do not change the contract on this result.";
  }

  const catalogOf = (fam: ProbeFamily) =>
    (["years", "makes", "models", "trims"] as ProbeEndpoint[]).map(
      (ep) => probes.find((p) => p.family === fam && p.endpoint === ep)?.classified,
    );
  const allOk = (xs: (ProbeClass | undefined)[]) => xs.every((c) => c === "ok");
  const anyOk = (xs: (ProbeClass | undefined)[]) => xs.some((c) => c === "ok");

  const legacy = catalogOf("legacy_valuations");
  const cox = catalogOf("cox_storefront");
  const legacyOk = allOk(legacy);
  const coxOk = allOk(cox);

  if (legacyOk && coxOk) {
    return "implement_vendor_adapters: both contracts respond. Wire vendor-specific adapters keyed on MANHEIM_API_VENDOR.";
  }
  if (legacyOk) {
    return "implement_legacy_valuations: api.manheim.com /valuations/{years,makes,models,trims,search} is the production contract.";
  }
  if (coxOk) {
    return "implement_cox_storefront: Cox wholesale-valuations /mmr-lookup/* + /search/* is the production contract.";
  }
  if (anyOk(legacy) || anyOk(cox)) {
    return "partial_contract: some catalog levels respond, others do not. Inspect per-endpoint classified/shape before wiring; do not assume a full tree.";
  }
  if ([...legacy, ...cox].some((c) => c === "not_provisioned")) {
    return "blocked_not_provisioned: catalog endpoints return 401/403/596/invalid_scope. Escalate to Cox/Manheim rep. Render honest not_provisioned; do NOT wire UI.";
  }
  return "inconclusive: no catalog family confirmed. Review per-endpoint results; do not wire routes/UI until a family is confirmed ok.";
}

/**
 * Execute the probe. `getToken` and `fetchFn` are injected so this is unit
 * testable without the worker class. Never throws — every failure becomes a
 * classified, redacted result.
 */
export async function executeContractProbe(args: {
  env: Env;
  fetchFn: typeof fetch;
  getToken: () => Promise<TokenResult>;
  requestId: string;
}): Promise<ContractProbeReport> {
  const { env, fetchFn, getToken } = args;
  const vendorConfigured = env.MANHEIM_API_VENDOR === "cox" ? "cox" : "legacy";
  const grantType = env.MANHEIM_GRANT_TYPE ?? "password";
  const scopeConfigured =
    typeof env.MANHEIM_SCOPE === "string" && env.MANHEIM_SCOPE.trim().length > 0;

  const tok = await getToken();

  if (tok.token === null) {
    const { tokenClassified, tokenErrorCode } = classifyTokenError(tok.error);
    return {
      vendorConfigured,
      grantType,
      scopeConfigured,
      tokenObtained: false,
      tokenClassified,
      ...(tokenErrorCode ? { tokenErrorCode } : {}),
      probes: [],
      recommendation: deriveRecommendation(tokenClassified, []),
    };
  }

  const token = tok.token;
  const plan = buildProbePlan(env);
  const probes: ProbeResult[] = [];

  for (const entry of plan) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: entry.coxHeaders ? "application/vnd.coxauto.v1+json" : "application/json",
    };

    let httpStatus: number | null = null;
    let classified: ProbeClass;
    let errorCode: string | undefined;
    let shape: ShapeInfo | undefined;

    try {
      const res = await fetchFn(entry.url, { method: "GET", headers });
      httpStatus = res.status;
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      const c = classifyProbe(res.status, body);
      classified = c.classified;
      errorCode = c.errorCode;
      if (classified === "ok") shape = extractShape(body);
    } catch {
      // fetch threw — network failure / timeout. Honest unavailable.
      classified = "unavailable";
    }

    probes.push({
      family: entry.family,
      endpoint: entry.endpoint,
      pathTemplate: entry.pathTemplate,
      httpStatus,
      classified,
      ...(errorCode ? { errorCode } : {}),
      ...(shape ? { shape } : {}),
    });
  }

  return {
    vendorConfigured,
    grantType,
    scopeConfigured,
    tokenObtained: true,
    tokenClassified: "ok",
    probes,
    recommendation: deriveRecommendation("ok", probes),
  };
}
```

---

## FILE 2 — `workers/tav-intelligence-worker/src/handlers/valuationsContractProbe.ts`

```ts
import { okResponse } from "../types/api";
import { AuthError } from "../errors";
import { ManheimHttpClient } from "../clients/manheimHttp";
import { log } from "../utils/logger";
import type { HandlerArgs } from "./types";

/**
 * GET /admin/valuations/contract-probe — Issue #45 R0 production contract
 * reconciliation.
 *
 * Read-only. Reachable only with a resolved identity (Cloudflare Access, or
 * the worker-to-worker service identity the router injects when the
 * `x-tav-service-secret` header matches `INTEL_SERVICE_SECRET`).
 *
 * The response is a redacted report only — status, endpoint family, response
 * key names, array counts, and classified error codes. The OAuth token,
 * secrets, and any licensed MMR/wholesale figure are NEVER included in the
 * body or the logs. Safe to share / paste into an issue.
 */
export async function handleValuationsContractProbe(
  args: HandlerArgs,
): Promise<Response> {
  if (args.userContext.email === null) {
    throw new AuthError("Cloudflare Access identity required");
  }

  const client = new ManheimHttpClient(args.env, args.env.TAV_INTEL_KV);
  const report = await client.runContractProbe(args.requestId);

  // Redacted summary only: classifications + guidance string, no values.
  log("valuations.contract_probe.complete", {
    requestId: args.requestId,
    vendorConfigured: report.vendorConfigured,
    tokenObtained: report.tokenObtained,
    tokenClassified: report.tokenClassified,
    probeCount: report.probes.length,
    recommendation: report.recommendation,
  });

  return okResponse(report, args.requestId);
}
```

---

## INSERT 1 — `clients/manheimHttp.ts` imports

After the existing `retryWithBackoff` import line:

```ts
import { retryWithBackoff } from "../utils/retry";
```

add:

```ts
import {
  executeContractProbe,
  type ContractProbeReport,
} from "./valuationsContractProbe";
```

## INSERT 2 — `clients/manheimHttp.ts` method

Inside `class ManheimHttpClient`, immediately after the `lookupByYmm(...)` method
closes and before the `// ── Vendor-aware URL builders ──` comment, add:

```ts
  /**
   * Issue #45 R0 — production contract probe. Read-only: reuses the cached
   * OAuth token and this client's fetch to discover which catalog/valuation
   * contract the production-configured host actually serves. Never throws;
   * token failure is classified into the redacted report.
   */
  async runContractProbe(requestId: string): Promise<ContractProbeReport> {
    return executeContractProbe({
      env:       this.env,
      fetchFn:   this.fetchFn,
      requestId,
      getToken: async () => {
        try {
          return { token: await this.getAccessToken(requestId) };
        } catch (error) {
          return { token: null, error };
        }
      },
    });
  }
```

> Requires `this.env`, `this.fetchFn` (constructor params) and the private
> `getAccessToken(requestId)` — all present on clean `origin/main`.

## INSERT 3 — `routes/index.ts` handler import

After:

```ts
import { handleIntelMmrQueries }   from "../handlers/intelMmrQueries";
```

add:

```ts
import { handleValuationsContractProbe } from "../handlers/valuationsContractProbe";
```

## INSERT 4 — `routes/index.ts` route

After the `if (method === "GET" && pathname.startsWith("/intel/mmr/")) { ... }`
block and before the final `return errorResponse("not_found", ...)`, add:

```ts
  if (method === "GET" && pathname === "/admin/valuations/contract-probe") {
    return handleValuationsContractProbe(baseArgs);
  }
```

---

## Gated production execution (NOT performed — requires explicit go)

Once rebuilt + verified on a clean branch:

- `npm run deploy:intelligence` (production) to publish the route.
- `curl -s -H "x-tav-service-secret: <prod INTEL_SERVICE_SECRET>" https://<prod-intel-worker>/admin/valuations/contract-probe`
- Output is the redacted report (no token/secret/MMR figure) → drives the
  contract decision: legacy `/valuations/*` vs Cox `/mmr-lookup/*` vs vendor adapters.

Deploy + live licensed-API calls are a separate, explicitly-gated step.
