import type { SupabaseClient } from "./supabase";

export type LlmYmmsDecisionOutcome = "alias_hit" | "llm_hit" | "llm_needs_review" | "llm_invalid_pick" | "fallback";

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
}

/**
 * Best-effort audit write — item 57. Callers should never let this block or
 * fail the ingest/eval path; wrap in try/catch like every other
 * observability write in this codebase (e.g. writeSchemaDrift, insertBuyBoxScoreAttribution).
 */
export async function insertLlmYmmsDecision(db: SupabaseClient, input: LlmYmmsDecisionInput): Promise<void> {
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
  });
  if (error) throw error;
}
