import { describe, expect, it } from "vitest";

import {
  formatClaimCountdown,
  getPrimaryWorkflowAction,
  getSecondaryWorkflowActions,
  resolveWorkflowStep,
  workflowStepIndex,
  type WorkflowTarget,
} from "./workflow-steps";

const futureExpiry = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

function target(over: Partial<WorkflowTarget>): WorkflowTarget {
  return {
    status: "new",
    assignedTo: null,
    assignedCloserName: null,
    claimedBy: null,
    claimedAt: null,
    claimExpiresAt: null,
    lastEvaluatedBy: null,
    lastEvaluatedAt: null,
    ...over,
  };
}

describe("resolveWorkflowStep", () => {
  it("maps lifecycle statuses to stepper steps", () => {
    expect(resolveWorkflowStep(target({ status: "new" }))).toBe("found");
    expect(resolveWorkflowStep(target({ status: "assigned", assignedTo: "u1" }))).toBe(
      "assigned",
    );
    expect(
      resolveWorkflowStep(
        target({ status: "claimed", assignedTo: "u1", claimExpiresAt: futureExpiry }),
      ),
    ).toBe("working");
    expect(resolveWorkflowStep(target({ status: "contacted" }))).toBe("contacted");
    expect(resolveWorkflowStep(target({ status: "passed" }))).toBe("outcome");
  });
});

describe("getPrimaryWorkflowAction", () => {
  it("offers claim on found deals", () => {
    expect(
      getPrimaryWorkflowAction({
        opportunity: target({ status: "new" }),
        canClaim: true,
        canMutate: false,
        claimActive: false,
        claimOwnerIsMe: false,
        hasCollision: false,
      }),
    ).toEqual({ kind: "claim", label: "I'm working this" });
  });

  it("offers mark contacted while working", () => {
    expect(
      getPrimaryWorkflowAction({
        opportunity: target({
          status: "claimed",
          assignedTo: "u1",
          claimExpiresAt: futureExpiry,
        }),
        canClaim: true,
        canMutate: true,
        claimActive: true,
        claimOwnerIsMe: true,
        hasCollision: false,
      }),
    ).toEqual({ kind: "status", status: "contacted", label: "Mark contacted" });
  });

  it("blocks actions on collision", () => {
    expect(
      getPrimaryWorkflowAction({
        opportunity: target({ status: "new" }),
        canClaim: true,
        canMutate: true,
        claimActive: false,
        claimOwnerIsMe: false,
        hasCollision: true,
      }),
    ).toEqual({ kind: "none" });
  });
});

describe("getSecondaryWorkflowActions", () => {
  it("offers mark passed while in contacted step", () => {
    expect(
      getSecondaryWorkflowActions({
        opportunity: target({ status: "contacted", assignedTo: "u1" }),
        canMutate: true,
        hasCollision: false,
      }),
    ).toEqual([{ kind: "status", status: "passed", label: "Mark passed" }]);
  });
});

describe("formatClaimCountdown", () => {
  it("formats an active claim window", () => {
    const now = new Date("2030-06-01T10:00:00.000Z");
    const expires = new Date("2030-06-01T18:30:00.000Z").toISOString();
    expect(formatClaimCountdown(expires, now)).toMatch(/Your \d+h window · expires/);
  });
});

describe("workflowStepIndex", () => {
  it("orders steps for the stepper", () => {
    expect(workflowStepIndex("found")).toBe(0);
    expect(workflowStepIndex("outcome")).toBe(4);
  });
});
