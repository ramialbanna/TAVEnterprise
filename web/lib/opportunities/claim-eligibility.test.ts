import { describe, expect, it } from "vitest";

import { canShowClaimAction } from "./claim-eligibility";

describe("canShowClaimAction", () => {
  const closer = { id: "u1", displayName: "Alex", role: "closer" as const };

  it("allows claim when nothing is active", () => {
    expect(canShowClaimAction(closer, { claimedBy: null, claimExpiresAt: null })).toBe(true);
  });

  it("blocks when another user has an active claim", () => {
    const expires = new Date(Date.now() + 60_000).toISOString();
    expect(
      canShowClaimAction(closer, { claimedBy: "Someone else", claimExpiresAt: expires }),
    ).toBe(false);
  });

  it("allows renew when current user owns the claim", () => {
    const expires = new Date(Date.now() + 60_000).toISOString();
    expect(canShowClaimAction(closer, { claimedBy: "Alex", claimExpiresAt: expires })).toBe(true);
  });

  it("blocks viewers", () => {
    expect(
      canShowClaimAction(
        { id: "v1", displayName: "Viewer", role: "viewer" },
        { claimedBy: null, claimExpiresAt: null },
      ),
    ).toBe(false);
  });
});
