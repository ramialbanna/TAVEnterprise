import type { SupabaseClient } from "../persistence/supabase";
import { EMPTY_REFERENCE, type ReferenceData } from "./normalizeMmrParams";

const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

let _cached: ReferenceData | null = null;
let _cachedAt = 0;

/** Clears the in-process cache. Intended for tests only. */
export function resetReferenceDataCache(): void {
  _cached = null;
  _cachedAt = 0;
}

export async function loadMmrReferenceData(db: SupabaseClient): Promise<ReferenceData> {
  const now = Date.now();
  if (_cached !== null && now - _cachedAt < CACHE_TTL_MS) {
    return _cached;
  }

  try {
    const [makesRes, modelsRes, makeAliasesRes, modelAliasesRes] = await Promise.all([
      db.schema("tav").from("mmr_reference_makes").select("*"),
      db.schema("tav").from("mmr_reference_models").select("*"),
      db.schema("tav").from("mmr_make_aliases").select("*"),
      db.schema("tav").from("mmr_model_aliases").select("*"),
    ]);

    if (makesRes.error || modelsRes.error || makeAliasesRes.error || modelAliasesRes.error) {
      return EMPTY_REFERENCE;
    }

    // canonical make strings
    const makes = new Set<string>(
      ((makesRes.data ?? []) as { make: string }[]).map((r) => r.make),
    );

    // canonical_make → Set<canonical_model>
    const models = new Map<string, Set<string>>();
    for (const row of (modelsRes.data ?? []) as { make: string; model: string }[]) {
      let set = models.get(row.make);
      if (!set) { set = new Set(); models.set(row.make, set); }
      set.add(row.model);
    }

    // lowercase(alias) → canonical_make
    const makeAliases = new Map<string, string>();
    for (const row of (makeAliasesRes.data ?? []) as { alias: string; canonical_make: string }[]) {
      makeAliases.set(row.alias.trim().toLowerCase(), row.canonical_make);
    }

    // canonical_make → Map<lowercase(alias), canonical_model>
    const modelAliases = new Map<string, Map<string, string>>();
    for (const row of (modelAliasesRes.data ?? []) as {
      alias: string;
      canonical_make: string;
      canonical_model: string;
    }[]) {
      let map = modelAliases.get(row.canonical_make);
      if (!map) { map = new Map(); modelAliases.set(row.canonical_make, map); }
      map.set(row.alias.trim().toLowerCase(), row.canonical_model);
    }

    const ref: ReferenceData = { makes, models, makeAliases, modelAliases };
    _cached = ref;
    _cachedAt = now;
    return ref;
  } catch {
    return EMPTY_REFERENCE;
  }
}
