import type { RegionKey, SourceName } from "../types/domain";
import type { AppUser } from "./users";
import { getActiveUserById } from "./users";
import type { SupabaseClient } from "./supabase";
import { upsertNormalizedListing } from "./normalizedListings";
import { getOpportunityDetail, type OpportunityDetail } from "./opportunities";
import {
  initializeWorkflowAssignment,
  recordManualSubmissionAction,
} from "./opportunityWorkflow";
import {
  buildManualListingTitle,
  detectListingSource,
  normalizeListingUrl,
} from "../manual/listingSource";

export interface ManualSubmissionInput {
  listingUrl: string;
  assignedToUserId?: string;
  source?: SourceName;
  region?: RegionKey;
  year?: number;
  make?: string;
  model?: string;
  style?: string;
  price?: number;
  mileage?: number;
  sellerNotes?: string;
  submitterNotes?: string;
}

export interface ManualSubmissionResult {
  submissionId: string;
  normalizedListingId: string;
  isDuplicateUrl: boolean;
  warnings: string[];
  opportunity: OpportunityDetail | null;
}

export class ManualSubmissionValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ManualSubmissionValidationError";
    this.code = code;
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
  let listingUrl: string;
  try {
    listingUrl = normalizeListingUrl(input.listingUrl);
  } catch {
    throw new ManualSubmissionValidationError("invalid_listing_url", "listingUrl must be a valid URL");
  }

  const source = input.source ?? detectListingSource(listingUrl);
  if (!source) {
    throw new ManualSubmissionValidationError(
      "unsupported_listing_url",
      "Could not infer marketplace source from listingUrl; provide source explicitly",
    );
  }

  const region = input.region ?? "dallas_tx";

  if (input.assignedToUserId) {
    const assignee = await getActiveUserById(db, input.assignedToUserId);
    if (!assignee) {
      throw new ManualSubmissionValidationError("invalid_assignee", "assignedToUserId is not an active user");
    }
  }

  const title = buildManualListingTitle({
    listingUrl,
    year: input.year,
    make: input.make,
    model: input.model,
  });

  const upsert = await upsertNormalizedListing(
    db,
    {
      source,
      url: listingUrl,
      title,
      year: input.year,
      make: normalizeVehicleToken(input.make),
      model: normalizeVehicleToken(input.model),
      trim: normalizeVehicleToken(input.style),
      price: input.price,
      mileage: input.mileage,
      region,
      scrapedAt: new Date().toISOString(),
    },
    null,
  );

  const warnings: string[] = [];
  if (!upsert.isNew) warnings.push("listing_already_exists");

  const { data: submissionRow, error: insertErr } = await db
    .from("manual_opportunity_submissions")
    .insert({
      normalized_listing_id: upsert.id,
      submitted_by_user_id: submitter.id,
      assigned_to_user_id: input.assignedToUserId ?? null,
      seller_notes: normalizeOptionalText(input.sellerNotes, 2000),
      submitter_notes: normalizeOptionalText(input.submitterNotes, 2000),
    })
    .select("id")
    .single();

  if (insertErr) throw insertErr;
  if (!submissionRow) throw new Error("submitManualOpportunity: insert returned no row");

  await recordManualSubmissionAction(db, upsert.id, submitter.id, {
    submissionId: submissionRow.id as string,
    assignedToUserId: input.assignedToUserId ?? null,
  });

  if (input.assignedToUserId) {
    await initializeWorkflowAssignment(db, upsert.id, submitter, input.assignedToUserId);
  }

  const opportunity = await getOpportunityDetail(db, upsert.id);

  return {
    submissionId: submissionRow.id as string,
    normalizedListingId: upsert.id,
    isDuplicateUrl: !upsert.isNew,
    warnings,
    opportunity,
  };
}
