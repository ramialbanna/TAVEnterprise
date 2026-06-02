import { z } from "zod";

import { REGION_KEYS } from "../../types/domain";

export const MAXBUY_CONTRACT_VERSION = "1.0.0" as const;

export const MaxbuyEvaluateRequestSchema = z.object({
  contract_version: z.literal(MAXBUY_CONTRACT_VERSION).default(MAXBUY_CONTRACT_VERSION),
  vin: z.string().trim().toUpperCase(),
  mileage: z.number().int().nonnegative().max(2_000_000).optional(),
  asking_price: z.number().nonnegative().optional(),
  region: z.enum(REGION_KEYS).optional(),
  normalized_listing_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
});

export const MaxbuyOverrideRequestSchema = z.object({
  contract_version: z.literal(MAXBUY_CONTRACT_VERSION).default(MAXBUY_CONTRACT_VERSION),
  recommendation_id: z.string().uuid(),
  override_type: z.enum([
    "bought_despite_pass",
    "passed_despite_buy",
    "bid_reduced",
    "title_condition_concern",
    "transport_concern",
    "manager_call",
    "inventory_need",
    "other",
  ]),
  override_note: z.string().trim().max(2000).optional(),
  acted_price: z.number().nonnegative().optional(),
});

export const MaxbuyPassRequestSchema = z.object({
  contract_version: z.literal(MAXBUY_CONTRACT_VERSION).default(MAXBUY_CONTRACT_VERSION),
  vin: z.string().trim().toUpperCase(),
  recommendation_id: z.string().uuid().optional(),
  asking_price: z.number().nonnegative().optional(),
  bid_price: z.number().nonnegative().optional(),
  mmr_value: z.number().nonnegative().optional(),
  pass_reason: z.string().trim().min(1).max(128),
  pass_note: z.string().trim().max(2000).optional(),
});

export type MaxbuyEvaluateRequest = z.infer<typeof MaxbuyEvaluateRequestSchema>;
export type MaxbuyOverrideRequest = z.infer<typeof MaxbuyOverrideRequestSchema>;
export type MaxbuyPassRequest = z.infer<typeof MaxbuyPassRequestSchema>;
