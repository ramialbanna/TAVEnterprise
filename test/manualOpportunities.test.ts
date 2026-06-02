import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitManualOpportunity } from "../src/persistence/manualOpportunities";
import { getOpportunityDetail } from "../src/persistence/opportunities";
import {
  setNormalizedListingEntryMethod,
  upsertNormalizedListing,
} from "../src/persistence/normalizedListings";
import { getActiveUserById } from "../src/persistence/users";
import {
  findNormalizedListingBySourceUrl,
  recordDuplicateUrlResubmit,
} from "../src/persistence/leadAttribution";

vi.mock("../src/persistence/normalizedListings", () => ({
  upsertNormalizedListing: vi.fn(),
  setNormalizedListingEntryMethod: vi.fn(),
}));

vi.mock("../src/persistence/leadAttribution", () => ({
  findNormalizedListingBySourceUrl: vi.fn(),
  recordDuplicateUrlResubmit: vi.fn(),
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
  vi.mocked(findNormalizedListingBySourceUrl).mockResolvedValue(null);
  vi.mocked(recordDuplicateUrlResubmit).mockResolvedValue(undefined);
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

const CLOSER_ID = "00000000-0000-4000-8000-000000000001";

describe("submitManualOpportunity", () => {
  it("creates a listing + submission and returns the opportunity", async () => {
    vi.mocked(getActiveUserById).mockResolvedValue({
      id: CLOSER_ID,
      email: "closer@texasautovalue.com",
      displayName: "Closer Two",
      role: "closer",
    });

    const result = await submitManualOpportunity(
      makeDb({ id: "submission-1" }) as never,
      submitter,
      {
        listingUrl: "https://facebook.com/marketplace/item/123",
        assignedToUserId: CLOSER_ID,
        region: "dallas_tx",
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
    expect(setNormalizedListingEntryMethod).toHaveBeenCalledWith(
      expect.anything(),
      "listing-1",
      "manual",
    );
  });

  it("blocks duplicate URLs, logs attribution, and does not create a submission", async () => {
    vi.mocked(findNormalizedListingBySourceUrl).mockResolvedValue({ id: "listing-existing" });

    await expect(
      submitManualOpportunity(makeDb({ id: "submission-2" }) as never, submitter, {
        listingUrl: "https://facebook.com/marketplace/item/existing",
        region: "houston_tx",
        year: 2019,
        make: "honda",
        model: "civic",
        price: 12000,
      }),
    ).rejects.toMatchObject({
      code: "duplicate_listing_url",
      details: { normalizedListingId: "listing-existing" },
    });

    expect(recordDuplicateUrlResubmit).toHaveBeenCalledWith(
      expect.anything(),
      "listing-existing",
      submitter.id,
      expect.objectContaining({
        listingUrl: "https://facebook.com/marketplace/item/existing",
        price: 12000,
      }),
    );
    expect(upsertNormalizedListing).not.toHaveBeenCalled();
  });

  it("rejects submissions missing required WF-1 fields", async () => {
    await expect(
      submitManualOpportunity(makeDb({ id: "submission-x" }) as never, submitter, {
        listingUrl: "https://facebook.com/marketplace/item/123",
      } as never),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("adds mileage_unknown when mileage is omitted", async () => {
    const result = await submitManualOpportunity(makeDb({ id: "submission-3" }) as never, submitter, {
      listingUrl: "https://facebook.com/marketplace/item/no-miles",
      region: "austin_tx",
      year: 2021,
      make: "ford",
      model: "f-150",
      price: 34000,
    });

    expect(result.warnings).toContain("mileage_unknown");
  });
});
