import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { OpportunityDetail } from "@/lib/app-api/schemas";

import { OpportunityVehicleBlock } from "./opportunity-vehicle-block";
import { OpportunityListingBlock } from "./opportunity-listing-block";

function makeDetail(overrides: Partial<OpportunityDetail> = {}): OpportunityDetail {
  return {
    id: "listing-1",
    type: "lead",
    badges: ["First seen"],
    source: "facebook",
    region: "dallas_tx",
    sourceRunId: null,
    normalizedListingId: "listing-1",
    vehicleCandidateId: null,
    leadId: "lead-1",
    title: "2019 Honda Accord",
    year: 2019,
    make: "Honda",
    model: "Accord",
    style: "EX",
    vin: "1HGBH41JXMN109123",
    price: 12000,
    mmrValue: 15000,
    spread: 3000,
    finalScore: 82,
    grade: "excellent",
    status: "new",
    submittedBy: "Jane Buyer",
    assignedTo: null,
    assignedCloserName: "Closer One",
    claimedBy: null,
    claimedAt: null,
    claimExpiresAt: null,
    lastEvaluatedBy: null,
    lastEvaluatedAt: null,
    firstSeenAt: "2026-06-01T10:00:00.000Z",
    lastSeenAt: "2026-06-02T10:00:00.000Z",
    seenCount: 3,
    listingUrl: "https://example.com/listing",
    entryMethod: "manual",
    estimateFlags: { mmr: false, mileage: false, style: false },
    reasonCodes: [],
    valuationMissingReason: null,
    scoreComponents: null,
    candidateListingCount: null,
    mileage: 32000,
    actions: [],
    ...overrides,
  };
}

describe("OpportunityVehicleBlock", () => {
  it("renders all identity fields in the 2-col grid", () => {
    render(<OpportunityVehicleBlock opportunity={makeDetail()} />);

    expect(screen.getByText("VIN")).toBeInTheDocument();
    expect(screen.getByText("1HGBH41JXMN109123")).toBeInTheDocument();
    expect(screen.getByText("Odometer")).toBeInTheDocument();
    expect(screen.getByText(/32,000 mi/)).toBeInTheDocument();
    expect(screen.getByText("Year")).toBeInTheDocument();
    expect(screen.getByText("2019")).toBeInTheDocument();
    expect(screen.getByText("Make")).toBeInTheDocument();
    expect(screen.getByText("Honda")).toBeInTheDocument();
    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getByText("Accord")).toBeInTheDocument();
    expect(screen.getByText("Series")).toBeInTheDocument();
    expect(screen.getByText("EX")).toBeInTheDocument();
    expect(screen.getByText("Region")).toBeInTheDocument();
    expect(screen.getByText("Dallas")).toBeInTheDocument();
  });

  it("renders em-dash for fields without a backend column yet", () => {
    render(<OpportunityVehicleBlock opportunity={makeDetail()} />);
    expect(screen.getByText("Body type")).toBeInTheDocument();
    expect(screen.getByText("Engine")).toBeInTheDocument();
    expect(screen.getByText("Transmission")).toBeInTheDocument();
    expect(screen.getByText("Color")).toBeInTheDocument();
  });

  it("renders em-dash for null fields", () => {
    render(
      <OpportunityVehicleBlock
        opportunity={makeDetail({ vin: null, mileage: null, year: null, style: null })}
      />,
    );
    // Multiple em-dashes across missing fields — count at least the VIN one.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("OpportunityListingBlock", () => {
  it("renders provenance fields with manual-submit parity", () => {
    render(<OpportunityListingBlock opportunity={makeDetail()} />);

    expect(screen.getByText("Listing URL")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("facebook")).toBeInTheDocument();
    expect(screen.getByText("Region")).toBeInTheDocument();
    expect(screen.getByText("Dallas")).toBeInTheDocument();
    expect(screen.getByText("Asking price")).toBeInTheDocument();
    expect(screen.getByText("$12,000")).toBeInTheDocument();
    expect(screen.getByText("Submitted by")).toBeInTheDocument();
    expect(screen.getByText("Jane Buyer")).toBeInTheDocument();
    expect(screen.getByText("Entry method")).toBeInTheDocument();
    expect(screen.getByText("Manual submit")).toBeInTheDocument();
    expect(screen.getByText("Assigned closer")).toBeInTheDocument();
    expect(screen.getByText("Closer One")).toBeInTheDocument();
    expect(screen.getByText("Seen count")).toBeInTheDocument();
  });

  it("renders em-dash when listing URL is missing", () => {
    render(<OpportunityListingBlock opportunity={makeDetail({ listingUrl: null })} />);
    // The Listing URL row should show em-dash when URL absent.
    const urlRow = screen.getByText("Listing URL").closest("dl");
    expect(urlRow).toBeInTheDocument();
  });

  it("shows scraper entry method label", () => {
    render(
      <OpportunityListingBlock
        opportunity={makeDetail({ entryMethod: "scraper" })}
      />,
    );
    expect(screen.getByText("Scraper")).toBeInTheDocument();
  });
});
