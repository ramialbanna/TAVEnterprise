import type { OpportunityRow } from "@/lib/app-api/schemas";

type ClaimActor = {
  id: string;
  displayName: string;
  role: "admin" | "closer" | "viewer";
};

function isClaimActive(claimExpiresAt: string | null): boolean {
  if (!claimExpiresAt) return false;
  return new Date(claimExpiresAt).getTime() > Date.now();
}

/** Whether the quick-action claim button should show for this row. */
export function canShowClaimAction(
  actor: ClaimActor | null,
  row: Pick<OpportunityRow, "claimedBy" | "claimExpiresAt">,
): boolean {
  if (!actor) return false;
  if (actor.role !== "admin" && actor.role !== "closer") return false;

  const claimActive = isClaimActive(row.claimExpiresAt);
  if (!claimActive) return true;
  return row.claimedBy === actor.displayName || row.claimedBy === actor.id;
}
