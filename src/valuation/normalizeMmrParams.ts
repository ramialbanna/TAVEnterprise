import type { NormalizationConfidence } from "../types/domain";

export type { NormalizationConfidence };

export interface NormalizeInput {
  make?: string | null;
  model?: string | null;
  trim?: string | null;
}

export interface NormalizeResult {
  canonicalMake: string | null;
  canonicalModel: string | null;
  trim: string | null;
  normalizationConfidence: NormalizationConfidence;
}

// In-memory snapshot of the four reference/alias tables.
// Built once per Worker invocation by loadMmrReferenceData (Step 3).
export interface ReferenceData {
  makes: Set<string>;
  // canonical_make → Set<canonical_model>
  models: Map<string, Set<string>>;
  // lowercase_alias → canonical_make
  makeAliases: Map<string, string>;
  // canonical_make → Map<lowercase_alias, canonical_model>
  modelAliases: Map<string, Map<string, string>>;
}

export const EMPTY_REFERENCE: ReferenceData = {
  makes: new Set(),
  models: new Map(),
  makeAliases: new Map(),
  modelAliases: new Map(),
};

function normalizeKey(s: string): string {
  return s.trim().toLowerCase();
}

function findCanonical(input: string, set: Set<string>): string | null {
  const key = normalizeKey(input);
  for (const candidate of set) {
    if (normalizeKey(candidate) === key) return candidate;
  }
  return null;
}

export function normalizeMmrParams(
  input: NormalizeInput,
  ref: ReferenceData,
): NormalizeResult {
  const trim = input.trim?.trim() ?? null;
  const rawMake = input.make?.trim() ?? null;
  const rawModel = input.model?.trim() ?? null;

  // ── Make resolution ────────────────────────────────────────────────────────

  if (!rawMake) {
    return { canonicalMake: null, canonicalModel: null, trim, normalizationConfidence: "none" };
  }

  let canonicalMake: string | null = findCanonical(rawMake, ref.makes);
  let makeWasAlias = false;

  if (!canonicalMake) {
    const aliased = ref.makeAliases.get(normalizeKey(rawMake));
    if (aliased) {
      canonicalMake = aliased;
      makeWasAlias = true;
    }
  }

  if (!canonicalMake) {
    return { canonicalMake: null, canonicalModel: null, trim, normalizationConfidence: "none" };
  }

  // ── Model resolution ───────────────────────────────────────────────────────

  if (!rawModel) {
    return { canonicalMake, canonicalModel: null, trim, normalizationConfidence: "partial" };
  }

  const modelSet = ref.models.get(canonicalMake);
  let canonicalModel: string | null = modelSet ? findCanonical(rawModel, modelSet) : null;
  let modelWasAlias = false;

  if (!canonicalModel) {
    const aliasMap = ref.modelAliases.get(canonicalMake);
    if (aliasMap) {
      const aliased = aliasMap.get(normalizeKey(rawModel));
      if (aliased) {
        canonicalModel = aliased;
        modelWasAlias = true;
      }
    }
  }

  if (!canonicalModel) {
    return { canonicalMake, canonicalModel: null, trim, normalizationConfidence: "partial" };
  }

  // ── Confidence rollup ──────────────────────────────────────────────────────

  const confidence: NormalizationConfidence =
    makeWasAlias || modelWasAlias ? "alias" : "exact";

  return { canonicalMake, canonicalModel, trim, normalizationConfidence: confidence };
}
