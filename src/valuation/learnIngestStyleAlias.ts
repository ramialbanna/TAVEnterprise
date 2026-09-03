/**
 * Item 65 Phase 1 — persist accepted LLM Y/M/M/S picks as ingest-learned aliases
 * so repeat listings skip Claude on the alias fast-path.
 */
import type { SupabaseClient } from "../persistence/supabase";
import { loadCoxCatalogTreeForMake } from "../persistence/coxCatalogTree";
import {
  buildListingStyleAliasKey,
  upsertMmrStyleAlias,
} from "../persistence/mmrStyleAliases";
import type { LlmYmmsResolution } from "./resolveListingWithLLM";
import { isCatalogAliasValid } from "./catalogAliasValidation";
import { extractTitleTrim } from "./extractTitleTrim";
import { extractListingAxisTokens } from "./listingAxisEvidence";
import { log } from "../logging/logger";

export type LearnIngestStyleAliasInput = {
  year: number;
  listingMake: string | null | undefined;
  listingModel: string | null | undefined;
  listingTrim: string | null | undefined;
  listingTitle?: string | null;
  listingDescription?: string | null;
  llmResolution: LlmYmmsResolution | undefined;
};

/**
 * When ingest trusts an `llm_hit` or `offline_hit` and Cox returns MMR, remember the mapping from
 * raw listing identity → Cox catalog tokens for the next scrape of the same combo.
 */
export async function maybeLearnIngestStyleAlias(
  db: SupabaseClient,
  input: LearnIngestStyleAliasInput,
): Promise<boolean> {
  const { llmResolution } = input;
  if (llmResolution?.kind !== "llm_hit" && llmResolution?.kind !== "offline_hit") return false;

  const canonical = {
    make: llmResolution.make,
    model: llmResolution.model,
    style: llmResolution.style,
  };

  const titleTrim =
    extractTitleTrim(input.listingTitle) ?? extractTitleTrim(input.listingDescription);
  const trimForKey = input.listingTrim?.trim() || titleTrim || null;

  // Never learn catch-all empty-trim aliases — they override title trim on later lookups.
  if (!trimForKey) return false;

  const axisTokens = extractListingAxisTokens({
    title: input.listingTitle,
    trim: trimForKey,
    description: input.listingDescription,
  });
  const aliasKey = buildListingStyleAliasKey(
    input.listingMake,
    input.listingModel,
    trimForKey,
    axisTokens,
  );
  if (!aliasKey.replace(/\|/g, "").trim()) return false;

  const treeRows = await loadCoxCatalogTreeForMake(db, input.year, canonical.make);
  if (
    treeRows.length === 0 ||
    !isCatalogAliasValid(treeRows, {
      canonicalMake: canonical.make,
      canonicalModel: canonical.model,
      canonicalStyle: canonical.style,
    })
  ) {
    log("ingest.llm_alias_learn_skipped_invalid_catalog", {
      alias_key: aliasKey,
      canonical_model: canonical.model,
      canonical_style: canonical.style,
    });
    return false;
  }

  await upsertMmrStyleAlias(db, {
    aliasKey,
    canonicalMake: canonical.make,
    canonicalModel: canonical.model,
    canonicalStyle: canonical.style,
    source: "ingest_learned",
  });
  log("ingest.llm_alias_learned", {
    alias_key: aliasKey,
    source: "ingest_learned",
    axis_tokens: axisTokens,
  });
  return true;
}
