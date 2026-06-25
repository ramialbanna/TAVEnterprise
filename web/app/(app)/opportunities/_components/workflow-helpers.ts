import type { MutatableWorkflowStatus, OpportunityAction, OpportunityRow } from "@/lib/app-api/schemas";

export const WORKFLOW_STATUS_OPTIONS: readonly {
  value: MutatableWorkflowStatus;
  label: string;
}[] = [
  { value: "reviewed", label: "Reviewed" },
  { value: "contacted", label: "Contacted" },
  { value: "negotiating", label: "Negotiating" },
  { value: "purchased", label: "Bought" },
  { value: "passed", label: "Passed" },
] as const;

type WorkflowActor = {
  id: string;
  displayName: string;
  role: "admin" | "closer" | "viewer";
};

type WorkflowTarget = Pick<
  OpportunityRow,
  | "assignedTo"
  | "claimedBy"
  | "claimExpiresAt"
  | "status"
>;

function isClaimActive(claimExpiresAt: string | null): boolean {
  if (!claimExpiresAt) return false;
  return new Date(claimExpiresAt).getTime() > Date.now();
}

export function canMutateWorkflow(
  actor: WorkflowActor | null,
  opportunity: WorkflowTarget,
): boolean {
  if (!actor) return false;
  if (actor.role === "viewer") return false;
  if (actor.role === "admin") return true;

  const claimActive = isClaimActive(opportunity.claimExpiresAt);
  const isAssignee = opportunity.assignedTo === actor.id;
  const isClaimOwner =
    claimActive &&
    (opportunity.claimedBy === actor.displayName || opportunity.claimedBy === actor.id);

  return isAssignee || isClaimOwner;
}

export function formatWorkflowStatus(status: string | null): string {
  if (!status) return "—";
  const match = WORKFLOW_STATUS_OPTIONS.find((option) => option.value === status);
  if (match) return match.label;
  if (status === "purchased") return "Bought";
  if (status === "new") return "New";
  if (status === "assigned") return "Assigned";
  if (status === "claimed") return "Claimed";
  return status.replace(/_/g, " ");
}

export function describeOpportunityAction(action: OpportunityAction): string {
  switch (action.action) {
    case "submitted":
      return "Listing submitted";
    case "assigned":
      return "Closer assigned";
    case "unassigned":
      return "Assignment cleared";
    case "reassigned":
      return "Closer reassigned";
    case "claimed":
      return "Opportunity claimed";
    case "evaluated":
      return "Opportunity evaluated";
    case "status_changed": {
      const previous = action.metadata.previousStatus;
      const next = action.metadata.newStatus;
      if (typeof previous === "string" && typeof next === "string") {
        return `Status: ${formatWorkflowStatus(previous)} → ${formatWorkflowStatus(next)}`;
      }
      return "Status updated";
    }
    case "note_added":
      return "Note added";
    case "fields_updated": {
      const changes = action.metadata.changes;
      if (changes && typeof changes === "object") {
        const fields = Object.keys(changes as Record<string, unknown>);
        if (fields.length > 0) {
          const labels = fields.map(formatFieldLabel);
          return `Updated ${labels.join(", ")}`;
        }
      }
      return "Fields updated";
    }
  }
}

const FIELD_LABELS: Record<string, string> = {
  vin: "VIN",
  mileage: "odometer",
  year: "year",
  make: "make",
  model: "model",
  style: "series",
  bodyType: "body type",
  engine: "engine",
  transmission: "transmission",
  color: "color",
  contactFirstName: "first name",
  contactLastName: "last name",
  contactHomePhone: "home phone",
  contactEmail: "email",
  contactAddress: "address",
  contactPostalCode: "postal code",
  salesperson: "salesperson",
  appraiser: "appraiser",
  titleOwner: "owner",
  titleStateRegion: "title state/region",
  lienHolder: "lien holder",
  lienAccountNumber: "lien account #",
  lienPayoff: "lien payoff",
  tagOrPlate: "tag/plate",
  tagStateRegion: "tag state/region",
  tagExpiration: "tag expiration",
  certified: "certified",
  extendedWarranty: "extended warranty",
};

function formatFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}
