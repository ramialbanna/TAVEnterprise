/**
 * Item 65 Phase 1 — persist accepted LLM Y/M/M/S picks as ingest-learned aliases
 * so repeat listings skip Claude on the alias fast-path.
 */
import type { SupabaseClient } from "../persistence/supabase";
import {
  buildListingStyleAliasKey,
  upsertMmrStyleAlias,
} from "../persistence/mmrStyleAliases";
import type { LlmYmmsResolution } from "./resolveListingWithLLM";

export type LearnIngestStyleAliasInput = {
  listingMake: string | null | undefined;
  listingModel: string | null | undefined;
  listingTrim: string | null | undefined;
  llmResolution: LlmYmmsResolution | undefined;
};

/**
 * When ingest trusts an `llm_hit` and Cox returns MMR, remember the mapping from
 * raw listing identity → Cox catalog tokens for the next scrape of the same combo.
 */
export async function maybeLearnIngestStyleAlias(
  db: SupabaseClient,
  input: LearnIngestStyleAliasInput,
): Promise<boolean> {
  const { llmResolution } = input;
  if (llmResolution?.kind !== "llm_hit") return false;

  const aliasKey = buildListingStyleAliasKey(
    input.listingMake,
    input.listingModel,
    input.listingTrim,
  );
  if (!aliasKey.replace(/\|/g, "").trim()) return false;

  await upsertMmrStyleAlias(db, {
    aliasKey,
    canonicalMake: llmResolution.make,
    canonicalModel: llmResolution.model,
    canonicalStyle: llmResolution.style,
    source: "ingest_learned",
  });
  return true;
}
