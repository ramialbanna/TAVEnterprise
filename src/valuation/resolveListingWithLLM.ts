/**
 * Item 57 — LLM Y/M/M/S normalization: resolver.
 *
 * Pipeline (docs/LLM-YMMS-Normalization.md §4, §70 updates):
 *   alias fast-path → offline confident gate → pruned catalog (Ford/Chevy) →
 *   single Claude call → deterministic exact-match gate → fallback.
 */
import type { Env } from "../types/env";
import type { SupabaseClient } from "../persistence/supabase";
import {
  buildListingStyleAliasKey,
  lookupMmrStyleAliasWithFallback,
  type MmrStyleAlias,
} from "../persistence/mmrStyleAliases";
import { hasCoxCatalogTreeForYear, loadCoxCatalogTreeForMake } from "../persistence/coxCatalogTree";
import { loadProvenBookableForMake } from "../persistence/coxProvenBookable";
import {
  isOfflineConfidentCatalogMatch,
  matchListingToCoxCatalog,
  type CoxCatalogTreeRow,
} from "./matchListingToCoxCatalog";
import { isCatalogAliasValid, normalizeCatalogAliasTokens } from "./catalogAliasValidation";
import { extractTitleTrim } from "./extractTitleTrim";
import { extractListingAxisTokens } from "./listingAxisEvidence";
import { resolveFSeriesTrimAxisAlias } from "./fSeriesTrimAxisAliases";
import type { ProvenBookableCombo } from "./provenBookable";
import { callAnthropicForYmms, type AnthropicCallResult } from "../llm/anthropicClient";
import { pruneCatalogSubtreeForLlm } from "../llm/pruneCatalogSubtree";
import type { LlmYmmsTokenUsage } from "../llm/tokenUsage";
import { log } from "../logging/logger";
import type { PriorPaidYmmsDecision } from "../persistence/llmYmmsDecisions";
import {
  buildYmmsAnthropicPrompt,
  classifyYmmsProposalIngestOutcome,
  findCoxPickRow,
  type YmmsAnthropicPrompt,
  type YmmsProposal,
} from "../llm/ymmsPrompt";

/** Same listing, already paid for. Hits expire after a day. A needs_review sticks. */
export const PRIOR_YMMS_DECISION_REUSE_MS = 24 * 60 * 60 * 1000;

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
  /**
   * Item 72 — model+style pairs Manheim already refused to price for this
   * listing. Named in the prompt so Claude picks something else.
   */
  rejectedPicks?: ReadonlyArray<{ model: string; style: string }>;
  /**
   * Item 72 — skip the alias and offline fast-paths and go straight to Claude.
   * Set on a retry: those shortcuts are what produced the rejected pick, so
   * re-running them would just return it again. Also skips the stored decision.
   */
  skipShortcuts?: boolean;
  /** Stable listing URL. Duplicate rows in one scrape share one Claude call. */
  listingUrl?: string | null;
  /** Latest paid decision for this listing, when the row already exists. */
  priorDecision?: PriorPaidYmmsDecision | null;
};

export type LlmYmmsFallbackReason =
  | "llm_disabled"
  | "not_configured"
  | "catalog_not_synced"
  | "timeout"
  | "rate_limited"
  | "http_error"
  | "invalid_response";

type LlmAnthropicCallMeta = {
  latencyMs: number;
  anthropicModel: string;
  tokenUsage?: LlmYmmsTokenUsage;
};

export type LlmYmmsResolution = (
  | { kind: "alias_hit"; make: string; model: string; style: string }
  | {
      kind: "offline_hit";
      make: string;
      model: string;
      style: string;
      score: number;
      catalogRowCount: number;
    }
  | {
      kind: "llm_hit";
      make: string;
      model: string;
      style: string;
      confidence: number;
      reasoning: string;
      catalogRowCount: number;
    } & LlmAnthropicCallMeta
  | ({
      kind: "llm_needs_review";
      proposal: YmmsProposal;
      catalogRowCount: number;
      /**
       * Item 72 — a needs-review pick already passed the deterministic catalog
       * gate; only Claude's confidence was low. Carrying the matched row lets
       * the caller use it as a last resort instead of abstaining, in Cox's
       * spelling rather than Claude's.
       */
      canonical?: { make: string; model: string; style: string };
    } & LlmAnthropicCallMeta)
  | ({ kind: "llm_invalid_pick"; proposal: YmmsProposal; catalogRowCount: number } & LlmAnthropicCallMeta)
  | { kind: "fallback"; reason: LlmYmmsFallbackReason }
) & { reusedPriorDecision?: boolean };

export type LlmYmmsDeps = {
  enabled: boolean;
  callAnthropic: (prompt: YmmsAnthropicPrompt) => Promise<AnthropicCallResult>;
  lookupStyleAlias: (
    make: string,
    model: string,
    trim?: string | null,
    titleTrim?: string | null,
    axisTokens?: readonly string[] | null,
  ) => Promise<MmrStyleAlias | null>;
  hasTreeForYear: (year: number) => Promise<boolean>;
  loadTreeRows: (year: number, make: string) => Promise<CoxCatalogTreeRow[]>;
  loadProvenCombos: (year: number, make: string) => Promise<ProvenBookableCombo[]>;
};

/** Production wiring — real Supabase + real Anthropic call. */
export function buildLlmYmmsDeps(db: SupabaseClient, env: Env): LlmYmmsDeps {
  return {
    enabled: env.LLM_YMMS_ENABLED === "true",
    callAnthropic: (prompt: YmmsAnthropicPrompt) => callAnthropicForYmms({ env, prompt }),
    lookupStyleAlias: (make, model, trim, titleTrim, axisTokens) =>
      lookupMmrStyleAliasWithFallback(db, make, model, trim, titleTrim, axisTokens),
    hasTreeForYear: (year: number) => hasCoxCatalogTreeForYear(db, year),
    loadTreeRows: (year: number, make: string) => loadCoxCatalogTreeForMake(db, year, make),
    loadProvenCombos: (year: number, make: string) => loadProvenBookableForMake(db, year, make),
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

function anthropicMeta(callResult: Extract<AnthropicCallResult, { kind: "ok" }>): LlmAnthropicCallMeta {
  return {
    latencyMs: callResult.latencyMs,
    anthropicModel: callResult.model,
    tokenUsage: callResult.cacheUsage,
  };
}

const REUSED_DECISION_META = {
  latencyMs: 0,
  anthropicModel: "prior_decision",
  reusedPriorDecision: true as const,
};

function proposalFromPrior(prior: PriorPaidYmmsDecision): YmmsProposal {
  return {
    make: prior.proposedMake?.trim() || "",
    model: prior.proposedModel?.trim() || "",
    style: prior.proposedStyle?.trim() || "",
    confidence: prior.confidence ?? 0,
    reasoning: prior.reasoning?.trim() || "Reused the previous decision for this listing.",
    needsReview: prior.outcome !== "llm_hit",
  };
}

/**
 * Skip a new Claude call when this listing was already paid for.
 * Any paid outcome covers the next 24 hours. `llm_needs_review` never becomes
 * an alias, so it is reused until the listing row is gone.
 */
export function reusePriorYmmsDecision(
  prior: PriorPaidYmmsDecision | null | undefined,
  nowMs: number,
): LlmYmmsResolution | null {
  if (!prior) return null;
  const ageMs = nowMs - Date.parse(prior.createdAt);
  const fresh = Number.isFinite(ageMs) && ageMs >= 0 && ageMs < PRIOR_YMMS_DECISION_REUSE_MS;
  if (prior.outcome !== "llm_needs_review" && !fresh) return null;

  const proposal = proposalFromPrior(prior);
  if (prior.outcome === "llm_hit") {
    if (!proposal.make || !proposal.model || !proposal.style) return null;
    return {
      kind: "llm_hit",
      make: proposal.make,
      model: proposal.model,
      style: proposal.style,
      confidence: proposal.confidence,
      reasoning: proposal.reasoning,
      catalogRowCount: 0,
      ...REUSED_DECISION_META,
    };
  }
  if (prior.outcome === "llm_invalid_pick") {
    return { kind: "llm_invalid_pick", proposal, catalogRowCount: 0, ...REUSED_DECISION_META };
  }
  const canonical =
    proposal.make && proposal.model && proposal.style
      ? { make: proposal.make, model: proposal.model, style: proposal.style }
      : undefined;
  return {
    kind: "llm_needs_review",
    proposal,
    catalogRowCount: 0,
    ...(canonical && { canonical }),
    ...REUSED_DECISION_META,
  };
}

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

  const hasTree = await deps.hasTreeForYear(input.year);
  if (!hasTree) return { kind: "fallback", reason: "catalog_not_synced" };

  const allRows = await deps.loadTreeRows(input.year, makeRaw);
  if (allRows.length === 0) return { kind: "fallback", reason: "catalog_not_synced" };

  const titleTrim =
    extractTitleTrim(input.title) ?? extractTitleTrim(input.description) ?? null;
  const axisTokens = extractListingAxisTokens({
    title: input.title,
    trim: input.trim,
    description: input.description,
  });

  const alias = input.skipShortcuts
    ? null
    : await deps.lookupStyleAlias(makeRaw, modelRaw, input.trim, titleTrim, axisTokens);
  if (alias) {
    if (isCatalogAliasValid(allRows, alias)) {
      const tokens = normalizeCatalogAliasTokens(alias);
      return {
        kind: "alias_hit",
        make: tokens.make,
        model: tokens.model,
        style: tokens.style,
      };
    }
    log("llm_ymms.alias_rejected_invalid_catalog", {
      make: makeRaw,
      model: modelRaw,
      title_trim: titleTrim,
      alias_model: alias.canonicalModel,
      alias_style: alias.canonicalStyle,
    });
  }

  if (!input.skipShortcuts && !alias && axisTokens.length > 0) {
    const provenCombos = await deps.loadProvenCombos(input.year, makeRaw);
    const fSeriesPick = resolveFSeriesTrimAxisAlias({
      model: modelRaw,
      trim: input.trim,
      titleTrim,
      axisTokens,
      catalogRows: allRows,
      provenCombos,
    });
    if (
      fSeriesPick &&
      isCatalogAliasValid(allRows, {
        canonicalMake: fSeriesPick.make,
        canonicalModel: fSeriesPick.model,
        canonicalStyle: fSeriesPick.style,
      })
    ) {
      log("llm_ymms.f_series_trim_axis_alias", {
        make: makeRaw,
        model: modelRaw,
        trim: input.trim ?? titleTrim,
        axis_tokens: axisTokens,
        canonical_model: fSeriesPick.model,
        canonical_style: fSeriesPick.style,
        kpi: true,
      });
      return {
        kind: "alias_hit",
        make: fSeriesPick.make,
        model: fSeriesPick.model,
        style: fSeriesPick.style,
      };
    }
  }

  if (!input.skipShortcuts) {
    const offlineMatch = matchListingToCoxCatalog(
      {
        year: input.year,
        make: makeRaw,
        model: modelRaw || null,
        trim: input.trim,
        title: input.title,
        description: input.description,
      },
      allRows,
    );
    if (isOfflineConfidentCatalogMatch(offlineMatch)) {
      log("llm_ymms.offline_confident_skip", {
        make: makeRaw,
        model: modelRaw,
        score: offlineMatch.score,
        catalog_row_count: allRows.length,
      });
      return {
        kind: "offline_hit",
        make: offlineMatch.make,
        model: offlineMatch.model,
        style: offlineMatch.style,
        score: offlineMatch.score,
        catalogRowCount: allRows.length,
      };
    }
  }

  if (!input.skipShortcuts && input.priorDecision) {
    const reused = reusePriorYmmsDecision(input.priorDecision, Date.now());
    if (reused) {
      log("llm_ymms.reused_prior_decision", {
        outcome: reused.kind,
        listing_url: input.listingUrl ?? null,
        kpi: true,
      });
      return reused;
    }
  }

  const rows = pruneCatalogSubtreeForLlm(
    { make: makeRaw, model: modelRaw || null, trim: input.trim, title: input.title },
    allRows,
  );
  if (rows.length < allRows.length) {
    log("llm_ymms.catalog_pruned", {
      make: makeRaw,
      before: allRows.length,
      after: rows.length,
    });
  }

  const prompt = buildYmmsAnthropicPrompt(
    {
      year: input.year,
      make: makeRaw,
      model: modelRaw || null,
      trim: input.trim,
      title: input.title,
      description: input.description,
      condition: input.condition,
      listingMileage: input.listingMileage,
      price: input.price,
      priorMissReason: input.priorMissReason,
      rejectedPicks: input.rejectedPicks,
    },
    rows,
  );

  const callResult = await deps.callAnthropic(prompt);

  if (callResult.kind !== "ok") {
    return { kind: "fallback", reason: FALLBACK_REASON_BY_CALL_KIND[callResult.kind] };
  }

  const { proposal } = callResult;
  const meta = anthropicMeta(callResult);

  const ingestOutcome = classifyYmmsProposalIngestOutcome(proposal, rows);
  if (ingestOutcome === "llm_invalid_pick") {
    return { kind: "llm_invalid_pick", proposal, catalogRowCount: rows.length, ...meta };
  }
  // Send Cox's own spelling to Manheim, not Claude's echo of the listing make.
  // Claude answers `bmw` for a catalog that says `B M W`; forwarding that would
  // fail the lookup even though the pick itself is right (item 72).
  const matched = findCoxPickRow(proposal, rows);

  if (ingestOutcome === "llm_needs_review") {
    return {
      kind: "llm_needs_review",
      proposal,
      catalogRowCount: rows.length,
      ...(matched && {
        canonical: { make: matched.make, model: matched.model, style: matched.style },
      }),
      ...meta,
    };
  }

  return {
    kind: "llm_hit",
    make: matched?.make ?? proposal.make,
    model: matched?.model ?? proposal.model,
    style: matched?.style ?? proposal.style,
    confidence: proposal.confidence,
    reasoning: proposal.reasoning,
    catalogRowCount: rows.length,
    ...meta,
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
  model?: string;
  latencyMs?: number;
  catalogRowCount?: number;
  tokenUsage?: LlmYmmsTokenUsage;
} {
  switch (resolution.kind) {
    case "alias_hit":
      return {
        outcome: resolution.kind,
        proposedMake: resolution.make,
        proposedModel: resolution.model,
        proposedStyle: resolution.style,
      };
    case "offline_hit":
      return {
        outcome: resolution.kind,
        proposedMake: resolution.make,
        proposedModel: resolution.model,
        proposedStyle: resolution.style,
        catalogRowCount: resolution.catalogRowCount,
      };
    case "llm_hit":
      return {
        outcome: resolution.kind,
        proposedMake: resolution.make,
        proposedModel: resolution.model,
        proposedStyle: resolution.style,
        confidence: resolution.confidence,
        reasoning: resolution.reasoning,
        model: resolution.anthropicModel,
        latencyMs: resolution.latencyMs,
        catalogRowCount: resolution.catalogRowCount,
        tokenUsage: resolution.tokenUsage,
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
        model: resolution.anthropicModel,
        latencyMs: resolution.latencyMs,
        catalogRowCount: resolution.catalogRowCount,
        tokenUsage: resolution.tokenUsage,
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

/** Re-export for tests and alias key construction at call sites. */
export { buildListingStyleAliasKey };
