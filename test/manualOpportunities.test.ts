import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitManualOpportunity } from "../src/persistence/manualOpportunities";
import { getOpportunityDetail } from "../src/persistence/opportunities";
import { upsertNormalizedListing } from "../src/persistence/normalizedListings";
import { getActiveUserById } from "../src/persistence/users";

vi.mock("../src/persistence/normalizedListings", () => ({
  upsertNormalizedListing: vi.fn(),
}));

vi.mock("../src/persistence/opportunities", () => ({
  getOpportunityDetail: vi.fn(),
}));

vi.mock("../src/persistence/opportunityWorkflow", () => ({
  recordManualSubmissionAction: vi.fn(),
  initializeWorkflowAssignment: vi.fn(),
}));

vi.mock("../src/persistence/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/persistence/users")>();
  return {
    ...actual,
    getActiveUserById: vi.fn(),
  };
});

const submitter = {
  id: "user-submitter",
  email: "finder@texasautovalue.com",
  displayName: "Finder One",
  role: "closer" as const,
  isActive: true,
  createdAt: "2026-05-22T00:00:00.000Z",
  updatedAt: "2026-05-22T00:00:00.000Z",
};

function makeDb(insertResult: { id: string }) {
  return {
    from(table: string) {
      if (table === "manual_opportunity_submissions") {
        return {
          insert(_row: unknown) {
            return {
              select(_cols?: string) {
                return {
                  single: async () => ({ data: insertResult, error: null }),
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(upsertNormalizedListing).mockResolvedValue({
    id: "listing-1",
    isNew: true,
    priceChanged: false,
    mileageChanged: false,
  });
  vi.mocked(getOpportunityDetail).mockResolvedValue({
    id: "listing-1",
    type: "manual_submission",
    badges: ["Manual submission"],
    source: "facebook",
    region: "dallas_tx",
    sourceRunId: null,
    normalizedListingId: "listing-1",
    vehicleCandidateId: null,
    leadId: null,
    title: "2020 toyota camry",
    year: 2020,
    make: "toyota",
    model: "camry",
    style: null,
    vin: null,
    price: 15000,
    mmrValue: null,
    spread: null,
    finalScore: null,
    grade: null,
    status: "new",
    submittedBy: "Finder One",
    assignedTo: "user-closer",
    assignedCloserName: "Closer Two",
    claimedBy: null,
    claimedAt: null,
    claimExpiresAt: null,
    lastEvaluatedBy: null,
    lastEvaluatedAt: null,
    firstSeenAt: "2026-05-22T00:00:00.000Z",
    lastSeenAt: "2026-05-22T00:00:00.000Z",
    seenCount: 1,
    listingUrl: "https://facebook.com/marketplace/item/123",
    estimateFlags: { mileage: false, style: false, mmr: false },
    reasonCodes: [],
    valuationMissingReason: null,
    scoreComponents: null,
    candidateListingCount: null,
    mileage: 50000,
    actions: [],
  });
});

describe("submitManualOpportunity", () => {
  it("creates a listing + submission and returns the opportunity", async () => {
    vi.mocked(getActiveUserById).mockResolvedValue({
      id: "user-closer",
      email: "closer@texasautovalue.com",
      displayName: "Closer Two",
      role: "closer",
    });

    const result = await submitManualOpportunity(
      makeDb({ id: "submission-1" }) as never,
      submitter,
      {
        listingUrl: "https://facebook.com/marketplace/item/123",
        assignedToUserId: "user-closer",
        year: 2020,
        make: "Toyota",
        model: "Camry",
        price: 15000,
        mileage: 50000,
        submitterNotes: "Looks clean",
      },
    );

    expect(result.submissionId).toBe("submission-1");
    expect(result.normalizedListingId).toBe("listing-1");
    expect(result.isDuplicateUrl).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.opportunity?.type).toBe("manual_submission");
    expect(upsertNormalizedListing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "facebook",
        url: "https://facebook.com/marketplace/item/123",
        title: "2020 Toyota Camry",
        make: "toyota",
      }),
      null,
    );
  });

  it("warns when the listing URL already existed", async () => {
    vi.mocked(upsertNormalizedListing).mockResolvedValue({
      id: "listing-existing",
      isNew: false,
      priceChanged: false,
      mileageChanged: false,
    });

    const result = await submitManualOpportunity(
      makeDb({ id: "submission-2" }) as never,
      submitter,
      { listingUrl: "https://facebook.com/marketplace/item/existing" },
    );

    expect(result.isDuplicateUrl).toBe(true);
    expect(result.warnings).toEqual(["listing_already_exists"]);
  });
});
