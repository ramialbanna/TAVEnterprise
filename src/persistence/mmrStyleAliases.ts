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
  axisTokens?: readonly string[] | null,
): string {
  const base = [make, model, trim].map((part) => (part ?? "").trim().toLowerCase()).join("|");
  const axes = (axisTokens ?? []).map((token) => token.trim().toLowerCase()).filter(Boolean);
  return axes.length > 0 ? `${base}|${axes.join("|")}` : base;
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

/**
 * Lookup keys for one listing. When the listing names drivetrain/engine/cab,
 * only the axis-qualified keys are returned — falling back to make|model|trim
 * is how a cached 2WD pick won on a 4x4 listing (§72 action 5).
 */
export function listListingStyleAliasLookupKeys(
  make: string,
  model: string,
  trim?: string | null,
  titleTrim?: string | null,
  axisTokens?: readonly string[] | null,
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const axes = axisTokens ?? [];
  const push = (t: string | null | undefined) => {
    const key = buildListingStyleAliasKey(make, model, t, axes);
    if (seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };

  const explicitTrim = trim?.trim();
  if (explicitTrim) push(explicitTrim);

  const fromTitle = titleTrim?.trim();
  if (fromTitle && fromTitle !== explicitTrim) push(fromTitle);

  // Empty-trim catch-alls are never learned, and with axis evidence they would
  // also reintroduce the short-key bug. Only try them when no axis is named.
  if (axes.length === 0) push(null);
  return keys;
}

export async function lookupMmrStyleAliasWithFallback(
  db: SupabaseClient,
  make: string,
  model: string,
  trim?: string | null,
  titleTrim?: string | null,
  axisTokens?: readonly string[] | null,
): Promise<MmrStyleAlias | null> {
  for (const key of listListingStyleAliasLookupKeys(make, model, trim, titleTrim, axisTokens)) {
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
