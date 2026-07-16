import type { SupabaseClient } from "./supabase";
import type { CatalogMatchSuggestion } from "../valuation/resolveListingToCatalog";

export type StoredCatalogMatchSuggestions = {
  suggestions: CatalogMatchSuggestion[];
  bestScore: number | null;
  computedAt: string;
};

export async function upsertCatalogMatchSuggestions(
  db: SupabaseClient,
  normalizedListingId: string,
  suggestions: CatalogMatchSuggestion[],
): Promise<void> {
  if (suggestions.length === 0) return;

  const bestScore = suggestions.reduce(
    (max, row) => (row.score > max ? row.score : max),
    suggestions[0]?.score ?? 0,
  );

  const { error } = await db.schema("tav").from("catalog_match_suggestions").upsert(
    {
      normalized_listing_id: normalizedListingId,
      suggestions,
      best_score: bestScore,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "normalized_listing_id" },
  );
  if (error) throw error;
}

export async function getCatalogMatchSuggestions(
  db: SupabaseClient,
  normalizedListingId: string,
): Promise<StoredCatalogMatchSuggestions | null> {
  const { data, error } = await db
    .schema("tav")
    .from("catalog_match_suggestions")
    .select("suggestions, best_score, computed_at")
    .eq("normalized_listing_id", normalizedListingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const suggestions = Array.isArray(data.suggestions)
    ? (data.suggestions as CatalogMatchSuggestion[])
    : [];

  return {
    suggestions,
    bestScore: typeof data.best_score === "number" ? data.best_score : null,
    computedAt: data.computed_at as string,
  };
}
