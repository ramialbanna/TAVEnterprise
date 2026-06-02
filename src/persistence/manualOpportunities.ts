import type { AppUser } from "./users";
import { getActiveUserById } from "./users";
import type { SupabaseClient } from "./supabase";
import { setNormalizedListingEntryMethod, upsertNormalizedListing } from "./normalizedListings";
import { getOpportunityDetail, type OpportunityDetail } from "./opportunities";
import {
  initializeWorkflowAssignment,
  recordManualSubmissionAction,
} from "./opportunityWorkflow";
import {
  findNormalizedListingBySourceUrl,
  recordDuplicateUrlResubmit,
} from "./leadAttribution";
import {
  buildManualListingTitle,
  detectListingSource,
  normalizeListingUrl,
} from "../manual/listingSource";
import {
  ManualOpportunitySubmissionSchema,
  type ManualOpportunitySubmission,
} from "../manual/manualSubmissionSchema";

export type ManualSubmissionInput = ManualOpportunitySubmission;

export interface ManualSubmissionResult {
  submissionId: string;
  normalizedListingId: string;
  isDuplicateUrl: boolean;
  warnings: string[];
  opportunity: OpportunityDetail | null;
}

export class ManualSubmissionValidationError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ManualSubmissionValidationError";
    this.code = code;
    this.details = details;
  }
}

function normalizeOptionalText(value: string | undefined, maxLen: number): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function normalizeVehicleToken(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Persist a finder-submitted listing URL and return the buyer-facing opportunity.
 */
export async function submitManualOpportunity(
  db: SupabaseClient,
  submitter: AppUser,
  input: ManualSubmissionInput,
): Promise<ManualSubmissionResult> {
  const validated = ManualOpportunitySubmissionSchema.safeParse(input);
  if (!validated.success) {
    throw new ManualSubmissionValidationError(
      "validation_error",
      "Required fields: listingUrl, region, year, make, model, price",
    );
  }
  const fields = validated.data;

  let listingUrl: string;
  try {
    listingUrl = normalizeListingUrl(fields.listingUrl);
  } catch {
    throw new ManualSubmissionValidationError("invalid_listing_url", "listingUrl must be a valid URL");
  }

  const source = fields.source ?? detectListingSource(listingUrl);
  if (!source) {
    throw new ManualSubmissionValidationError(
      "unsupported_listing_url",
      "Could not infer marketplace source from listingUrl; provide source explicitly",
    );
  }

  if (fields.assignedToUserId) {
    const assignee = await getActiveUserById(db, fields.assignedToUserId);
    if (!assignee) {
      throw new ManualSubmissionValidationError("invalid_assignee", "assignedToUserId is not an active user");
    }
  }

  const title = buildManualListingTitle({
    listingUrl,
    year: fields.year,
    make: fields.make,
    model: fields.model,
  });

  const existingListing = await findNormalizedListingBySourceUrl(db, source, listingUrl);
  if (existingListing) {
    await recordDuplicateUrlResubmit(db, existingListing.id, submitter.id, {
      listingUrl,
      source,
      region: fields.region,
      year: fields.year,
      make: normalizeVehicleToken(fields.make) ?? fields.make,
      model: normalizeVehicleToken(fields.model) ?? fields.model,
      price: fields.price,
    });
    throw new ManualSubmissionValidationError(
      "duplicate_listing_url",
      "This listing URL is already in the queue",
      { normalizedListingId: existingListing.id },
    );
  }

  const upsert = await upsertNormalizedListing(
    db,
    {
      source,
      url: listingUrl,
      title,
      year: fields.year,
      make: normalizeVehicleToken(fields.make),
      model: normalizeVehicleToken(fields.model),
      trim: normalizeVehicleToken(fields.style),
      price: fields.price,
      mileage: fields.mileage,
      region: fields.region,
      scrapedAt: new Date().toISOString(),
    },
    null,
  );

  await setNormalizedListingEntryMethod(db, upsert.id, "manual");

  const warnings: string[] = [];
  if (fields.mileage === undefined) warnings.push("mileage_unknown");

  const { data: submissionRow, error: insertErr } = await db
    .from("manual_opportunity_submissions")
    .insert({
      normalized_listing_id: upsert.id,
      submitted_by_user_id: submitter.id,
      assigned_to_user_id: fields.assignedToUserId ?? null,
      seller_notes: normalizeOptionalText(fields.sellerNotes, 2000),
      submitter_notes: normalizeOptionalText(fields.submitterNotes, 2000),
    })
    .select("id")
    .single();

  if (insertErr) throw insertErr;
  if (!submissionRow) throw new Error("submitManualOpportunity: insert returned no row");

  await recordManualSubmissionAction(db, upsert.id, submitter.id, {
    submissionId: submissionRow.id as string,
    assignedToUserId: fields.assignedToUserId ?? null,
  });

  if (fields.assignedToUserId) {
    await initializeWorkflowAssignment(db, upsert.id, submitter, fields.assignedToUserId);
  }

  const opportunity = await getOpportunityDetail(db, upsert.id);

  return {
    submissionId: submissionRow.id as string,
    normalizedListingId: upsert.id,
    isDuplicateUrl: false,
    warnings,
    opportunity,
  };
}
