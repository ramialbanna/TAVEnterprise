/** MaxBuy v1 pinned versions — bump when contract or formula changes. */
export const MAXBUY_SCORING_VERSION = "maxbuy-scoring-v1" as const;
export const MAXBUY_FEATURE_VIEW_VERSION = "fv-v1" as const;
export const MAXBUY_POLICY_VERSION = "global-v1" as const;
export const MAXBUY_INTELLIGENCE_CONTRACT_VERSION = "mmr-v1" as const;
export const MAXBUY_DECAY_HALF_LIFE_DAYS = 180;
export const MAXBUY_DEFAULT_TARGET_NET_GROSS = 800;

export const MAXBUY_SAFE_PERSIST_MMR_FIELDS = [
  "ok",
  "mmr_value",
  "mileage_used",
  "is_inferred_mileage",
  "cache_hit",
  "source",
  "fetched_at",
  "expires_at",
  "error_code",
  "error_message",
] as const;

export const MAXBUY_NEVER_PERSIST_MMR_FIELDS = ["mmr_payload"] as const;
