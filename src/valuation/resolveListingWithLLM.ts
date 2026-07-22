/**
 * Item 57 — LLM Y/M/M/S normalization: resolver.
 *
 * Pipeline (docs/LLM-YMMS-Normalization.md §4):
 *   alias fast-path (mmr_style_aliases) → full (year, make) catalog subtree →
 *   single Claude call → deterministic exact-match gate → fallback.
 *
 * Every dependency is injected via `LlmYmmsDeps` so this module is testable
 * without a real Supabase client or Anthropic API key — see
 * buildLlmYmmsDeps() for the production wiring and
 * __tests__/resolveListingWithLLM.test.ts for the mocked version.
 */
import type { Env } from "../types/env";
import type { SupabaseClient } from "../persistence/supabase";
import {
  buildListingStyleAliasKey,
  lookupMmrStyleAlias,
  type MmrStyleAlias,
} from "../persistence/mmrStyleAliases";
import { hasCoxCatalogTreeForYear, loadCoxCatalogTreeForMake } from "../persistence/coxCatalogTree";
import type { CoxCatalogTreeRow } from "./matchListingToCoxCatalog";
import { callAnthropicForYmms, type AnthropicCallResult } from "../llm/anthropicClient";
import { buildYmmsUserPrompt, isValidCoxPick, type YmmsProposal } from "../llm/ymmsPrompt";

export type LlmYmmsResolutionInput = {
  year: number;
  make: string;
  model?: string | null;
  trim?: string | null;
  title?: string | null;
  description?: string | null;
  condition?: string | null;
  /** Stated odometer from the listing payload when present — never estimated. */
  listingMileage?: number | null;
  location?: string | null;
  price?: number | null;
  /** Prior rules-based miss reason, if this is a re-attempt. */
  priorMissReason?: string | null;
};

export type LlmYmmsFallbackReason =
  | "llm_disabled"
  | "not_configured"
  | "catalog_not_synced"
  | "timeout"
  | "rate_limited"
  | "http_error"
  | "invalid_response";

export type LlmYmmsResolution =
  | { kind: "alias_hit"; make: string; model: string; style: string }
  | {
      kind: "llm_hit";
      make: string;
      model: string;
      style: string;
      confidence: number;
      reasoning: string;
      latencyMs: number;
      anthropicModel: string;
      catalogRowCount: number;
    }
  | { kind: "llm_needs_review"; proposal: YmmsProposal; catalogRowCount: number }
  | { kind: "llm_invalid_pick"; proposal: YmmsProposal; catalogRowCount: number }
  | { kind: "fallback"; reason: LlmYmmsFallbackReason };

export type LlmYmmsDeps = {
  enabled: boolean;
  callAnthropic: (userPrompt: string) => Promise<AnthropicCallResult>;
  lookupStyleAlias: (aliasKey: string) => Promise<MmrStyleAlias | null>;
  hasTreeForYear: (year: number) => Promise<boolean>;
  loadTreeRows: (year: number, make: string) => Promise<CoxCatalogTreeRow[]>;
};

/** Production wiring — real Supabase + real Anthropic call. */
export function buildLlmYmmsDeps(db: SupabaseClient, env: Env): LlmYmmsDeps {
  return {
    enabled: env.LLM_YMMS_ENABLED === "true",
    callAnthropic: (userPrompt: string) => callAnthropicForYmms({ env, userPrompt }),
    lookupStyleAlias: (aliasKey: string) => lookupMmrStyleAlias(db, aliasKey),
    hasTreeForYear: (year: number) => hasCoxCatalogTreeForYear(db, year),
    loadTreeRows: (year: number, make: string) => loadCoxCatalogTreeForMake(db, year, make),
  };
}

const FALLBACK_REASON_BY_CALL_KIND: Record<
  Exclude<AnthropicCallResult["kind"], "ok">,
  LlmYmmsFallbackReason
> = {
  not_configured: "not_configured",
  timeout: "timeout",
  rate_limited: "rate_limited",
  http_error: "http_error",
  invalid_response: "invalid_response",
};

/**
 * Resolve one listing's Y/M/M/S via the LLM path. Returns `{ kind: "fallback" }`
 * for every expected non-hit case (flag off, no key, catalog not synced yet,
 * Claude error/timeout) — callers must fall back to
 * resolveListingToCatalogForIngest / matchListingToCoxCatalog, never treat a
 * fallback as a hard failure.
 */
export async function resolveListingWithLLM(
  input: LlmYmmsResolutionInput,
  deps: LlmYmmsDeps,
): Promise<LlmYmmsResolution> {
  if (!deps.enabled) return { kind: "fallback", reason: "llm_disabled" };

  const makeRaw = input.make.trim();
  const modelRaw = input.model?.trim() ?? "";
  if (!makeRaw) return { kind: "fallback", reason: "llm_disabled" };

  const aliasKey = buildListingStyleAliasKey(makeRaw, modelRaw, input.trim);
  const alias = await deps.lookupStyleAlias(aliasKey);
  if (alias) {
    return {
      kind: "alias_hit",
      make: alias.canonicalMake,
      model: alias.canonicalModel,
      style: alias.canonicalStyle,
    };
  }

  const hasTree = await deps.hasTreeForYear(input.year);
  if (!hasTree) return { kind: "fallback", reason: "catalog_not_synced" };

  const rows = await deps.loadTreeRows(input.year, makeRaw);
  if (rows.length === 0) return { kind: "fallback", reason: "catalog_not_synced" };

  const userPrompt = buildYmmsUserPrompt(
    {
      year: input.year,
      make: makeRaw,
      model: modelRaw || null,
      trim: input.trim,
      title: input.title,
      description: input.description,
      condition: input.condition,
      listingMileage: input.listingMileage,
      location: input.location,
      price: input.price,
      priorMissReason: input.priorMissReason,
    },
    rows,
  );

  const callResult = await deps.callAnthropic(userPrompt);

  if (callResult.kind !== "ok") {
    return { kind: "fallback", reason: FALLBACK_REASON_BY_CALL_KIND[callResult.kind] };
  }

  const { proposal } = callResult;

  if (!isValidCoxPick(proposal, rows)) {
    return { kind: "llm_invalid_pick", proposal, catalogRowCount: rows.length };
  }

  if (proposal.needsReview) {
    return { kind: "llm_needs_review", proposal, catalogRowCount: rows.length };
  }

  return {
    kind: "llm_hit",
    make: proposal.make,
    model: proposal.model,
    style: proposal.style,
    confidence: proposal.confidence,
    reasoning: proposal.reasoning,
    latencyMs: callResult.latencyMs,
    anthropicModel: callResult.model,
    catalogRowCount: rows.length,
  };
}

/**
 * Flatten a resolution into the fields src/persistence/llmYmmsDecisions.ts
 * expects, so every call site logs the audit row the same way regardless of
 * which branch fired.
 */
export function llmResolutionToAuditFields(resolution: LlmYmmsResolution): {
  outcome: LlmYmmsResolution["kind"];
  fallbackReason?: string;
  proposedMake?: string;
  proposedModel?: string;
  proposedStyle?: string;
  confidence?: number;
  reasoning?: string;
  anthropicModel?: string;
  latencyMs?: number;
  catalogRowCount?: number;
} {
  switch (resolution.kind) {
    case "alias_hit":
      return {
        outcome: resolution.kind,
        proposedMake: resolution.make,
        proposedModel: resolution.model,
        proposedStyle: resolution.style,
      };
    case "llm_hit":
      return {
        outcome: resolution.kind,
        proposedMake: resolution.make,
        proposedModel: resolution.model,
        proposedStyle: resolution.style,
        confidence: resolution.confidence,
        reasoning: resolution.reasoning,
        anthropicModel: resolution.anthropicModel,
        latencyMs: resolution.latencyMs,
        catalogRowCount: resolution.catalogRowCount,
      };
    case "llm_needs_review":
    case "llm_invalid_pick":
      return {
        outcome: resolution.kind,
        proposedMake: resolution.proposal.make,
        proposedModel: resolution.proposal.model,
        proposedStyle: resolution.proposal.style,
        confidence: resolution.proposal.confidence,
        reasoning: resolution.proposal.reasoning,
        catalogRowCount: resolution.catalogRowCount,
      };
    case "fallback":
      return { outcome: resolution.kind, fallbackReason: resolution.reason };
  }
}

/** Fallback reasons that mean "Claude was actually called and it failed" — as opposed to
 * "the LLM path wasn't applicable" (disabled / not configured / catalog not synced). Used
 * to pick MmrMissReason "llm_unavailable" vs the pre-existing rules-based miss reasons. */
export function isLlmAttemptFailure(resolution: LlmYmmsResolution): boolean {
  return (
    resolution.kind === "fallback" &&
    (resolution.reason === "timeout" ||
      resolution.reason === "rate_limited" ||
      resolution.reason === "http_error" ||
      resolution.reason === "invalid_response")
  );
}
