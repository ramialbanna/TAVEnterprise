import { describe, expect, it } from "vitest";

import {
  canMutateWorkflow,
  describeOpportunityAction,
  formatWorkflowStatus,
} from "./workflow-helpers";

describe("formatWorkflowStatus", () => {
  it("maps purchased to Bought", () => {
    expect(formatWorkflowStatus("purchased")).toBe("Bought");
  });
});

describe("canMutateWorkflow", () => {
  const closer = { id: "closer-1", displayName: "Closer One", role: "closer" as const };
  const admin = { id: "admin-1", displayName: "Admin One", role: "admin" as const };

  it("allows admins regardless of assignment", () => {
    expect(
      canMutateWorkflow(admin, {
        assignedTo: null,
        claimedBy: null,
        claimExpiresAt: null,
        status: "new",
      }),
    ).toBe(true);
  });

  it("allows the active claim owner", () => {
    expect(
      canMutateWorkflow(closer, {
        assignedTo: "closer-1",
        claimedBy: "Closer One",
        claimExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        status: "claimed",
      }),
    ).toBe(true);
  });

  it("blocks viewers", () => {
    expect(
      canMutateWorkflow(
        { id: "viewer-1", displayName: "Viewer", role: "viewer" },
        {
          assignedTo: "viewer-1",
          claimedBy: "Viewer",
          claimExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          status: "claimed",
        },
      ),
    ).toBe(false);
  });
});

describe("describeOpportunityAction", () => {
  it("formats status changes", () => {
    expect(
      describeOpportunityAction({
        id: "action-1",
        normalizedListingId: "listing-1",
        actorUserId: "user-1",
        actorName: "Closer One",
        action: "status_changed",
        notes: null,
        metadata: { previousStatus: "claimed", newStatus: "reviewed" },
        createdAt: "2026-05-23T00:00:00.000Z",
      }),
    ).toBe("Status: Claimed → Reviewed");
  });
});
