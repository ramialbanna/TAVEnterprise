import { z } from "zod";
import { REGION_KEYS } from "../types/domain";
import { SOURCE_NAMES } from "../validate";

/** WF-1: URL, region, YMM, and price required; mileage optional. */
export const ManualOpportunitySubmissionSchema = z.object({
  listingUrl: z.string().trim().url().max(2048),
  assignedToUserId: z.string().uuid().optional(),
  source: z.enum(SOURCE_NAMES).optional(),
  region: z.enum(REGION_KEYS),
  year: z.number().int().min(1900).max(2100),
  make: z.string().trim().min(1).max(64),
  model: z.string().trim().min(1).max(128),
  style: z.string().trim().min(1).max(128).optional(),
  price: z.number().int().min(1).max(500_000),
  mileage: z.number().int().nonnegative().max(2_000_000).optional(),
  sellerNotes: z.string().trim().max(2000).optional(),
  submitterNotes: z.string().trim().max(2000).optional(),
});

export type ManualOpportunitySubmission = z.infer<typeof ManualOpportunitySubmissionSchema>;
