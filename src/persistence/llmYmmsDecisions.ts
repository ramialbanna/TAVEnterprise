import type { SupabaseClient } from "./supabase";
import type { LlmYmmsTokenUsage } from "../llm/tokenUsage";

export type LlmYmmsDecisionOutcome =
  | "alias_hit"
  | "offline_hit"
  | "llm_hit"
  | "llm_needs_review"
  | "llm_invalid_pick"
  | "fallback";

export type PriorPaidYmmsDecision = {
  outcome: "llm_hit" | "llm_needs_review" | "llm_invalid_pick";
  createdAt: string;
  proposedMake: string | null;
  proposedModel: string | null;
  proposedStyle: string | null;
  confidence: number | null;
  reasoning: string | null;
};

const LISTING_ID_CHUNK = 100;

export interface LlmYmmsDecisionInput {
  normalizedListingId?: string | null;
  year: number;
  inputMake: string;
  inputModel?: string | null;
  inputTrim?: string | null;
  inputTitle?: string | null;
  catalogRowCount?: number;
  outcome: LlmYmmsDecisionOutcome;
  fallbackReason?: string | null;
  proposedMake?: string | null;
  proposedModel?: string | null;
  proposedStyle?: string | null;
  confidence?: number | null;
  reasoning?: string | null;
  model?: string | null;
  latencyMs?: number | null;
  accepted?: boolean | null;
  tokenUsage?: LlmYmmsTokenUsage | null;
}

/**
 * Best-effort audit write — item 57. Callers should never let this block or
 * fail the ingest/eval path; wrap in try/catch like every other
 * observability write in this codebase (e.g. writeSchemaDrift, insertBuyBoxScoreAttribution).
 */
export async function insertLlmYmmsDecision(db: SupabaseClient, input: LlmYmmsDecisionInput): Promise<void> {
  const usage = input.tokenUsage;
  const { error } = await db.schema("tav").from("llm_ymms_decisions").insert({
    normalized_listing_id: input.normalizedListingId ?? null,
    year: input.year,
    input_make: input.inputMake,
    input_model: input.inputModel ?? null,
    input_trim: input.inputTrim ?? null,
    input_title: input.inputTitle ?? null,
    catalog_row_count: input.catalogRowCount ?? null,
    outcome: input.outcome,
    fallback_reason: input.fallbackReason ?? null,
    proposed_make: input.proposedMake ?? null,
    proposed_model: input.proposedModel ?? null,
    proposed_style: input.proposedStyle ?? null,
    confidence: input.confidence ?? null,
    reasoning: input.reasoning ?? null,
    model: input.model ?? null,
    latency_ms: input.latencyMs ?? null,
    accepted: input.accepted ?? null,
    cache_read_input_tokens: usage?.cacheReadInputTokens ?? null,
    cache_creation_input_tokens: usage?.cacheCreationInputTokens ?? null,
    uncached_input_tokens: usage?.uncachedInputTokens ?? null,
    output_tokens: usage?.outputTokens ?? null,
  });
  if (error) throw error;
}

type LatestDecisionRow = {
  normalized_listing_id: string;
  outcome: string;
  proposed_make: string | null;
  proposed_model: string | null;
  proposed_style: string | null;
  confidence: number | null;
  reasoning: string | null;
  created_at: string;
};

function isPaidOutcome(outcome: string): outcome is PriorPaidYmmsDecision["outcome"] {
  return outcome === "llm_hit" || outcome === "llm_needs_review" || outcome === "llm_invalid_pick";
}

/** One latest paid decision per listing. Empty when the id has never been sent to Claude. */
export async function loadLatestPaidLlmDecisions(
  db: SupabaseClient,
  listingIds: readonly string[],
): Promise<Map<string, PriorPaidYmmsDecision>> {
  const out = new Map<string, PriorPaidYmmsDecision>();
  const unique = [...new Set(listingIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += LISTING_ID_CHUNK) {
    const chunk = unique.slice(i, i + LISTING_ID_CHUNK);
    const { data, error } = await db.rpc("latest_paid_llm_ymms_decisions", { p_ids: chunk });
    if (error) throw error;
    for (const row of (data ?? []) as LatestDecisionRow[]) {
      if (!row.normalized_listing_id || !isPaidOutcome(row.outcome)) continue;
      out.set(row.normalized_listing_id, {
        outcome: row.outcome,
        createdAt: row.created_at,
        proposedMake: row.proposed_make,
        proposedModel: row.proposed_model,
        proposedStyle: row.proposed_style,
        confidence: row.confidence === null ? null : Number(row.confidence),
        reasoning: row.reasoning,
      });
    }
  }
  return out;
}

/** Existing listing ids for this scrape, keyed by listing URL. */
export async function loadListingIdsByUrls(
  db: SupabaseClient,
  source: string,
  listingUrls: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(listingUrls.filter(Boolean))];
  for (let i = 0; i < unique.length; i += LISTING_ID_CHUNK) {
    const chunk = unique.slice(i, i + LISTING_ID_CHUNK);
    const { data, error } = await db
      .from("normalized_listings")
      .select("id, listing_url")
      .eq("source", source)
      .in("listing_url", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id: string; listing_url: string }>) {
      if (row.id && row.listing_url) out.set(row.listing_url, row.id);
    }
  }
  return out;
}
