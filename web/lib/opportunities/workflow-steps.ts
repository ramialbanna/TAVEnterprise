import type { MutatableWorkflowStatus, OpportunityRow } from "@/lib/app-api/schemas";

export type WorkflowStepId = "found" | "assigned" | "working" | "contacted" | "outcome";

export const WORKFLOW_STEPS: readonly { id: WorkflowStepId; label: string }[] = [
  { id: "found", label: "Found" },
  { id: "assigned", label: "Assigned" },
  { id: "working", label: "Working" },
  { id: "contacted", label: "Contacted" },
  { id: "outcome", label: "Bought / Passed" },
] as const;

export type WorkflowTarget = Pick<
  OpportunityRow,
  | "assignedTo"
  | "assignedCloserName"
  | "claimedBy"
  | "claimedAt"
  | "claimExpiresAt"
  | "lastEvaluatedBy"
  | "lastEvaluatedAt"
  | "status"
>;

/** Minimal fields used by {@link resolveWorkflowStep}. */
export type WorkflowStepInput = Pick<WorkflowTarget, "status" | "assignedTo" | "claimExpiresAt">;

export function isClaimActive(claimExpiresAt: string | null): boolean {
  if (!claimExpiresAt) return false;
  return new Date(claimExpiresAt).getTime() > Date.now();
}

export function resolveWorkflowStep(opportunity: WorkflowStepInput): WorkflowStepId {
  const status = opportunity.status ?? "new";
  if (status === "passed" || status === "purchased" || status === "bought") {
    return "outcome";
  }
  if (status === "contacted" || status === "negotiating" || status === "reviewed") {
    return "contacted";
  }
  if (isClaimActive(opportunity.claimExpiresAt) || status === "claimed") {
    return "working";
  }
  if (opportunity.assignedTo) {
    return "assigned";
  }
  return "found";
}

export function workflowStepIndex(step: WorkflowStepId): number {
  return WORKFLOW_STEPS.findIndex((entry) => entry.id === step);
}

export type PrimaryWorkflowAction =
  | { kind: "claim"; label: string }
  | { kind: "status"; status: MutatableWorkflowStatus; label: string }
  | { kind: "none" };

export type SecondaryWorkflowAction = {
  kind: "status";
  status: MutatableWorkflowStatus;
  label: string;
};

export function getPrimaryWorkflowAction(input: {
  opportunity: WorkflowTarget;
  canClaim: boolean;
  canMutate: boolean;
  claimActive: boolean;
  claimOwnerIsMe: boolean;
  hasCollision: boolean;
}): PrimaryWorkflowAction {
  if (input.hasCollision) return { kind: "none" };

  const step = resolveWorkflowStep(input.opportunity);

  if (step === "found" || step === "assigned") {
    if (input.canClaim && (!input.claimActive || input.claimOwnerIsMe)) {
      return {
        kind: "claim",
        label: input.claimActive ? "Renew 24h window" : "I'm working this",
      };
    }
    return { kind: "none" };
  }

  if (!input.canMutate) return { kind: "none" };

  if (step === "working") {
    const status = input.opportunity.status ?? "new";
    if (status !== "contacted" && status !== "negotiating" && status !== "reviewed") {
      return { kind: "status", status: "contacted", label: "Mark contacted" };
    }
    return { kind: "none" };
  }

  if (step === "contacted") {
    const status = input.opportunity.status ?? "new";
    if (status !== "purchased" && status !== "passed" && status !== "bought") {
      return { kind: "status", status: "purchased", label: "Mark bought" };
    }
  }

  return { kind: "none" };
}

export function getSecondaryWorkflowActions(input: {
  opportunity: WorkflowTarget;
  canMutate: boolean;
  hasCollision: boolean;
}): SecondaryWorkflowAction[] {
  if (input.hasCollision || !input.canMutate) return [];

  const step = resolveWorkflowStep(input.opportunity);
  if (step !== "contacted") return [];

  const status = input.opportunity.status ?? "new";
  if (status === "passed" || status === "purchased" || status === "bought") {
    return [];
  }

  return [{ kind: "status", status: "passed", label: "Mark passed" }];
}

/** Buyer-friendly claim window copy for the signed-in claim owner. */
export function formatClaimCountdown(
  claimExpiresAt: string | null,
  now: Date = new Date(),
): string | null {
  if (!claimExpiresAt || !isClaimActive(claimExpiresAt)) return null;

  const expires = new Date(claimExpiresAt);
  if (Number.isNaN(expires.getTime())) return null;

  const msLeft = expires.getTime() - now.getTime();
  const hoursLeft = Math.max(1, Math.ceil(msLeft / (60 * 60 * 1000)));

  const weekday = expires.toLocaleDateString("en-US", { weekday: "short" });
  const time = expires.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `Your ${hoursLeft}h window · expires ${weekday} ${time}`;
}
