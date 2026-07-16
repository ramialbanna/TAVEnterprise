import type { SupabaseClient } from "./supabase";

export type MmrStyleAlias = {
  alias: string;
  canonicalMake: string;
  canonicalModel: string;
  canonicalStyle: string;
  source: "manual" | "ingest_learned";
};

export function buildListingStyleAliasKey(
  make: string | null | undefined,
  model: string | null | undefined,
  trim: string | null | undefined,
): string {
  return [make, model, trim].map((part) => (part ?? "").trim().toLowerCase()).join("|");
}

export async function lookupMmrStyleAlias(
  db: SupabaseClient,
  aliasKey: string,
): Promise<MmrStyleAlias | null> {
  if (!aliasKey.replace(/\|/g, "").trim()) return null;

  const { data, error } = await db
    .schema("tav")
    .from("mmr_style_aliases")
    .select("alias, canonical_make, canonical_model, canonical_style, source")
    .eq("alias", aliasKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    alias: data.alias as string,
    canonicalMake: data.canonical_make as string,
    canonicalModel: data.canonical_model as string,
    canonicalStyle: data.canonical_style as string,
    source: data.source as MmrStyleAlias["source"],
  };
}

export async function upsertMmrStyleAlias(
  db: SupabaseClient,
  input: {
    aliasKey: string;
    canonicalMake: string;
    canonicalModel: string;
    canonicalStyle: string;
    source?: MmrStyleAlias["source"];
  },
): Promise<void> {
  if (!input.aliasKey.replace(/\|/g, "").trim()) return;
  if (!input.canonicalMake.trim() || !input.canonicalModel.trim() || !input.canonicalStyle.trim()) {
    return;
  }

  const { error } = await db.schema("tav").from("mmr_style_aliases").upsert(
    {
      alias: input.aliasKey,
      canonical_make: input.canonicalMake,
      canonical_model: input.canonicalModel,
      canonical_style: input.canonicalStyle,
      source: input.source ?? "ingest_learned",
    },
    { onConflict: "alias,canonical_make,canonical_model" },
  );
  if (error) throw error;
}
