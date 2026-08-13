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

function buildAliasLookupKeys(
  make: string,
  model: string,
  trim?: string | null,
  titleTrim?: string | null,
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const push = (t: string | null | undefined) => {
    const key = buildListingStyleAliasKey(make, model, t);
    if (seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };

  const explicitTrim = trim?.trim();
  if (explicitTrim) push(explicitTrim);

  const fromTitle = titleTrim?.trim();
  if (fromTitle && fromTitle !== explicitTrim) push(fromTitle);

  push(null);
  return keys;
}

export async function lookupMmrStyleAliasWithFallback(
  db: SupabaseClient,
  make: string,
  model: string,
  trim?: string | null,
  titleTrim?: string | null,
): Promise<MmrStyleAlias | null> {
  for (const key of buildAliasLookupKeys(make, model, trim, titleTrim)) {
    const hit = await lookupMmrStyleAlias(db, key);
    if (hit) return hit;
  }
  return null;
}

/**
 * Item 72 — drop an alias whose canonical tokens Manheim would not price.
 * Scoped to the one (alias, make, model) row that produced the bad pick, since
 * the primary key allows several canonical mappings per alias key.
 */
export async function deleteMmrStyleAlias(
  db: SupabaseClient,
  input: { aliasKey: string; canonicalMake: string; canonicalModel: string },
): Promise<void> {
  if (!input.aliasKey.replace(/\|/g, "").trim()) return;

  const { error } = await db
    .schema("tav")
    .from("mmr_style_aliases")
    .delete()
    .eq("alias", input.aliasKey)
    .eq("canonical_make", input.canonicalMake)
    .eq("canonical_model", input.canonicalModel);
  if (error) throw error;
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
      canonical_make: input.canonicalMake.trim().toUpperCase(),
      canonical_model: input.canonicalModel.trim(),
      canonical_style: input.canonicalStyle.trim(),
      source: input.source ?? "ingest_learned",
    },
    { onConflict: "alias,canonical_make,canonical_model" },
  );
  if (error) throw error;
}
