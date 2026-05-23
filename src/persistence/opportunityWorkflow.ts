import type { AppUser, UserRole } from "./users";
import { getActiveUserById } from "./users";
import type { SupabaseClient } from "./supabase";
import { getOpportunityDetail, type OpportunityDetail } from "./opportunities";

/** Active claim window after POST /app/opportunities/:id/claim. */
export const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;

export type OpportunityActionType =
  | "submitted"
  | "assigned"
  | "unassigned"
  | "reassigned"
  | "claimed"
  | "evaluated";

export interface OpportunityWorkflowRow {
  normalizedListingId: string;
  status: string;
  assignedToUserId: string | null;
  assignedAt: string | null;
  assignedByUserId: string | null;
  claimedByUserId: string | null;
  claimedAt: string | null;
  claimExpiresAt: string | null;
  lastEvaluatedByUserId: string | null;
  lastEvaluatedAt: string | null;
}

export interface WorkflowUserNames {
  assignedCloserName: string | null;
  claimedByName: string | null;
  lastEvaluatedByName: string | null;
}

export interface WorkflowDisplayContext extends OpportunityWorkflowRow, WorkflowUserNames {}

export class OpportunityWorkflowError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "OpportunityWorkflowError";
    this.code = code;
    this.details = details;
  }
}

function mapWorkflowRow(row: Record<string, unknown>): OpportunityWorkflowRow {
  return {
    normalizedListingId: row.normalized_listing_id as string,
    status: row.status as string,
    assignedToUserId: (row.assigned_to_user_id as string | null) ?? null,
    assignedAt: (row.assigned_at as string | null) ?? null,
    assignedByUserId: (row.assigned_by_user_id as string | null) ?? null,
    claimedByUserId: (row.claimed_by_user_id as string | null) ?? null,
    claimedAt: (row.claimed_at as string | null) ?? null,
    claimExpiresAt: (row.claim_expires_at as string | null) ?? null,
    lastEvaluatedByUserId: (row.last_evaluated_by_user_id as string | null) ?? null,
    lastEvaluatedAt: (row.last_evaluated_at as string | null) ?? null,
  };
}

export function isActiveClaim(workflow: Pick<OpportunityWorkflowRow, "claimedByUserId" | "claimExpiresAt">): boolean {
  if (!workflow.claimedByUserId || !workflow.claimExpiresAt) return false;
  return new Date(workflow.claimExpiresAt).getTime() > Date.now();
}

function canMutateWorkflow(role: UserRole): boolean {
  return role === "admin" || role === "closer";
}

async function assertListingExists(db: SupabaseClient, normalizedListingId: string): Promise<void> {
  const { data, error } = await db
    .from("normalized_listings")
    .select("id")
    .eq("id", normalizedListingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new OpportunityWorkflowError("opportunity_not_found", "Opportunity listing not found");
  }
}

async function assertReviewableOpportunity(
  db: SupabaseClient,
  normalizedListingId: string,
): Promise<OpportunityDetail> {
  const opportunity = await getOpportunityDetail(db, normalizedListingId);
  if (!opportunity) {
    throw new OpportunityWorkflowError("opportunity_not_found", "Opportunity is not reviewable");
  }
  return opportunity;
}

async function loadLeadId(db: SupabaseClient, normalizedListingId: string): Promise<string | null> {
  const { data, error } = await db
    .from("leads")
    .select("id")
    .eq("normalized_listing_id", normalizedListingId)
    .maybeSingle();
  if (error) throw error;
  return data ? (data.id as string) : null;
}

async function syncLeadFromWorkflow(
  db: SupabaseClient,
  normalizedListingId: string,
  workflow: OpportunityWorkflowRow,
): Promise<void> {
  const leadId = await loadLeadId(db, normalizedListingId);
  if (!leadId) return;

  const ownerId = workflow.claimedByUserId ?? workflow.assignedToUserId;
  const ownerAt = workflow.claimedAt ?? workflow.assignedAt;

  const { error } = await db
    .from("leads")
    .update({
      assigned_to: ownerId,
      assigned_at: ownerAt,
      lock_expires_at: workflow.claimExpiresAt,
      status: workflow.status,
      last_action_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (error) throw error;
}

export async function writeOpportunityAction(
  db: SupabaseClient,
  input: {
    normalizedListingId: string;
    actorUserId: string;
    action: OpportunityActionType;
    notes?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await db.from("opportunity_actions").insert({
    normalized_listing_id: input.normalizedListingId,
    actor_user_id: input.actorUserId,
    action: input.action,
    notes: input.notes ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) throw error;
}

async function getWorkflowRow(
  db: SupabaseClient,
  normalizedListingId: string,
): Promise<OpportunityWorkflowRow | null> {
  const { data, error } = await db
    .from("opportunity_workflow")
    .select("*")
    .eq("normalized_listing_id", normalizedListingId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapWorkflowRow(data as Record<string, unknown>) : null;
}

async function upsertWorkflowRow(
  db: SupabaseClient,
  normalizedListingId: string,
  patch: Record<string, unknown>,
): Promise<OpportunityWorkflowRow> {
  const now = new Date().toISOString();
  const existing = await getWorkflowRow(db, normalizedListingId);

  if (existing) {
    const { data, error } = await db
      .from("opportunity_workflow")
      .update({ ...patch, updated_at: now })
      .eq("normalized_listing_id", normalizedListingId)
      .select("*")
      .single();
    if (error) throw error;
    if (!data) throw new Error("upsertWorkflowRow: update returned no row");
    return mapWorkflowRow(data as Record<string, unknown>);
  }

  const { data, error } = await db
    .from("opportunity_workflow")
    .insert({
      normalized_listing_id: normalizedListingId,
      status: "new",
      ...patch,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("upsertWorkflowRow: insert returned no row");
  return mapWorkflowRow(data as Record<string, unknown>);
}

export async function fetchWorkflowMap(
  db: SupabaseClient,
  listingIds: string[],
): Promise<Map<string, WorkflowDisplayContext>> {
  const out = new Map<string, WorkflowDisplayContext>();
  if (listingIds.length === 0) return out;

  const { data, error } = await db
    .from("opportunity_workflow")
    .select("*")
    .in("normalized_listing_id", listingIds);
  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return out;

  const userIds = new Set<string>();
  for (const row of rows) {
    for (const key of [
      "assigned_to_user_id",
      "claimed_by_user_id",
      "last_evaluated_by_user_id",
    ] as const) {
      const id = row[key] as string | null;
      if (id) userIds.add(id);
    }
  }

  const userNames = new Map<string, string>();
  if (userIds.size > 0) {
    const { data: userRows, error: userErr } = await db
      .from("users")
      .select("id, display_name")
      .in("id", [...userIds]);
    if (userErr) throw userErr;
    for (const row of (userRows ?? []) as Array<Record<string, unknown>>) {
      userNames.set(row.id as string, row.display_name as string);
    }
  }

  for (const row of rows) {
    const workflow = mapWorkflowRow(row);
    const assignedId = workflow.assignedToUserId;
    const claimedId = workflow.claimedByUserId;
    const evaluatedId = workflow.lastEvaluatedByUserId;
    out.set(workflow.normalizedListingId, {
      ...workflow,
      assignedCloserName: assignedId ? (userNames.get(assignedId) ?? assignedId) : null,
      claimedByName: claimedId ? (userNames.get(claimedId) ?? claimedId) : null,
      lastEvaluatedByName: evaluatedId ? (userNames.get(evaluatedId) ?? evaluatedId) : null,
    });
  }

  return out;
}

/**
 * Seed workflow assignment after manual submit (optional closer at submission).
 */
export async function initializeWorkflowAssignment(
  db: SupabaseClient,
  normalizedListingId: string,
  actor: AppUser,
  assignedToUserId: string | null,
): Promise<void> {
  if (!assignedToUserId) return;

  const now = new Date().toISOString();
  const workflow = await upsertWorkflowRow(db, normalizedListingId, {
    status: "assigned",
    assigned_to_user_id: assignedToUserId,
    assigned_at: now,
    assigned_by_user_id: actor.id,
  });

  await syncLeadFromWorkflow(db, normalizedListingId, workflow);
  await writeOpportunityAction(db, {
    normalizedListingId,
    actorUserId: actor.id,
    action: "assigned",
    metadata: { assignedToUserId },
  });
}

export async function assignOpportunity(
  db: SupabaseClient,
  normalizedListingId: string,
  actor: AppUser,
  assignedToUserId: string | null,
): Promise<OpportunityDetail> {
  if (actor.role !== "admin") {
    throw new OpportunityWorkflowError("forbidden", "Only admins can assign opportunities");
  }

  await assertListingExists(db, normalizedListingId);
  await assertReviewableOpportunity(db, normalizedListingId);

  const existing = await getWorkflowRow(db, normalizedListingId);
  const previousAssignee = existing?.assignedToUserId ?? null;

  if (assignedToUserId) {
    const assignee = await getActiveUserById(db, assignedToUserId);
    if (!assignee) {
      throw new OpportunityWorkflowError("invalid_assignee", "assignedToUserId is not an active user");
    }
  }

  const now = new Date().toISOString();
  const patch =
    assignedToUserId === null
      ? {
          status: isActiveClaim(existing ?? { claimedByUserId: null, claimExpiresAt: null })
            ? "claimed"
            : "new",
          assigned_to_user_id: null,
          assigned_at: null,
          assigned_by_user_id: null,
        }
      : {
          status: "assigned",
          assigned_to_user_id: assignedToUserId,
          assigned_at: now,
          assigned_by_user_id: actor.id,
        };

  const workflow = await upsertWorkflowRow(db, normalizedListingId, patch);
  await syncLeadFromWorkflow(db, normalizedListingId, workflow);

  const action: OpportunityActionType =
    assignedToUserId === null
      ? "unassigned"
      : previousAssignee && previousAssignee !== assignedToUserId
        ? "reassigned"
        : "assigned";

  await writeOpportunityAction(db, {
    normalizedListingId,
    actorUserId: actor.id,
    action,
    metadata: {
      previousAssignee,
      assignedToUserId,
    },
  });

  const opportunity = await getOpportunityDetail(db, normalizedListingId);
  if (!opportunity) {
    throw new OpportunityWorkflowError("opportunity_not_found", "Opportunity is not reviewable");
  }
  return opportunity;
}

export async function claimOpportunity(
  db: SupabaseClient,
  normalizedListingId: string,
  actor: AppUser,
): Promise<OpportunityDetail> {
  if (!canMutateWorkflow(actor.role)) {
    throw new OpportunityWorkflowError("forbidden", "Viewers cannot claim opportunities");
  }

  await assertListingExists(db, normalizedListingId);
  await assertReviewableOpportunity(db, normalizedListingId);

  const existing = await getWorkflowRow(db, normalizedListingId);
  const activeClaim = existing ? isActiveClaim(existing) : false;

  if (activeClaim && existing!.claimedByUserId !== actor.id) {
    throw new OpportunityWorkflowError("claim_conflict", "Another user has an active claim", {
      claimedBy: existing!.claimedByUserId,
      claimedAt: existing!.claimedAt,
      claimExpiresAt: existing!.claimExpiresAt,
    });
  }

  if (
    existing?.assignedToUserId &&
    existing.assignedToUserId !== actor.id &&
    actor.role !== "admin"
  ) {
    throw new OpportunityWorkflowError(
      "forbidden",
      "This opportunity is assigned to another closer",
    );
  }

  const now = new Date();
  const claimExpiresAt = new Date(now.getTime() + CLAIM_WINDOW_MS).toISOString();
  const claimedAt = now.toISOString();

  const workflow = await upsertWorkflowRow(db, normalizedListingId, {
    status: "claimed",
    claimed_by_user_id: actor.id,
    claimed_at: claimedAt,
    claim_expires_at: claimExpiresAt,
    assigned_to_user_id: existing?.assignedToUserId ?? actor.id,
    assigned_at: existing?.assignedAt ?? claimedAt,
    assigned_by_user_id: existing?.assignedByUserId ?? actor.id,
  });

  await syncLeadFromWorkflow(db, normalizedListingId, workflow);
  await writeOpportunityAction(db, {
    normalizedListingId,
    actorUserId: actor.id,
    action: "claimed",
    metadata: { claimExpiresAt },
  });

  const opportunity = await getOpportunityDetail(db, normalizedListingId);
  if (!opportunity) {
    throw new OpportunityWorkflowError("opportunity_not_found", "Opportunity is not reviewable");
  }
  return opportunity;
}

export async function recordOpportunityEvaluation(
  db: SupabaseClient,
  normalizedListingId: string,
  actor: AppUser,
): Promise<OpportunityDetail> {
  await assertListingExists(db, normalizedListingId);
  await assertReviewableOpportunity(db, normalizedListingId);

  const now = new Date().toISOString();
  await upsertWorkflowRow(db, normalizedListingId, {
    last_evaluated_by_user_id: actor.id,
    last_evaluated_at: now,
  });

  await writeOpportunityAction(db, {
    normalizedListingId,
    actorUserId: actor.id,
    action: "evaluated",
  });

  const opportunity = await getOpportunityDetail(db, normalizedListingId);
  if (!opportunity) {
    throw new OpportunityWorkflowError("opportunity_not_found", "Opportunity is not reviewable");
  }
  return opportunity;
}

export async function recordManualSubmissionAction(
  db: SupabaseClient,
  normalizedListingId: string,
  actorUserId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await writeOpportunityAction(db, {
    normalizedListingId,
    actorUserId,
    action: "submitted",
    metadata,
  });
}
