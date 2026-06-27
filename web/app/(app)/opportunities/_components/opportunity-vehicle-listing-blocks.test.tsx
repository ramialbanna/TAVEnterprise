import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
    bodyType: null,
    engine: null,
    transmission: null,
    color: null,
    contactFirstName: null,
    contactLastName: null,
    contactHomePhone: null,
    contactEmail: null,
    contactAddress: null,
    contactPostalCode: null,
    salesperson: null,
    appraiser: null,
    titleOwner: null,
    titleStateRegion: null,
    lienHolder: null,
    lienAccountNumber: null,
    lienPayoff: null,
    tagOrPlate: null,
    tagStateRegion: null,
    tagExpiration: null,
    certified: false,
    extendedWarranty: false,
    ...overrides,
  };
}

function props(overrides: Partial<Parameters<typeof OpportunityVehicleBlock>[0]> = {}) {
  return {
    opportunity: makeDetail(),
    onSave: vi.fn(),
    pending: false,
    canMutate: true,
    ...overrides,
  };
}

describe("OpportunityVehicleBlock", () => {
  it("renders editable inputs seeded from opportunity", () => {
    render(<OpportunityVehicleBlock {...props()} />);

    expect((screen.getByLabelText("VIN") as HTMLInputElement).value).toBe(
      "1HGBH41JXMN109123",
    );
    expect((screen.getByLabelText("Odometer (mi)") as HTMLInputElement).value).toBe("32000");
    expect((screen.getByLabelText("Make") as HTMLInputElement).value).toBe("Honda");
    expect((screen.getByLabelText("Body type") as HTMLInputElement).value).toBe("");
  });

  it("disables Save until dirty and fires patch on save", () => {
    const onSave = vi.fn();
    render(<OpportunityVehicleBlock {...props({ onSave })} />);

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "Red" } });
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledWith({ color: "Red" });
  });

  it("reset restores initial values", () => {
    render(<OpportunityVehicleBlock {...props()} />);

    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "Red" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect((screen.getByLabelText("Color") as HTMLInputElement).value).toBe("");
  });

  it("hides save controls when canMutate is false", () => {
    render(<OpportunityVehicleBlock {...props({ canMutate: false })} />);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("renders Additional Information with location and source", () => {
    render(
      <OpportunityVehicleBlock
        {...props({
          opportunity: makeDetail({
            region: "dallas_tx",
            source: "facebook",
            contactAddress: null,
          }),
        })}
      />,
    );

    expect(screen.getByRole("heading", { name: "Additional Information" })).toBeInTheDocument();
    expect(screen.getByLabelText("Location")).toHaveTextContent("Dallas");
    expect(screen.getByLabelText("Source")).toHaveTextContent("Facebook");
  });

  it("prefers contact address for location when available", () => {
    render(
      <OpportunityVehicleBlock
        {...props({
          opportunity: makeDetail({
            region: "dallas_tx",
            contactAddress: "123 Main St",
            contactPostalCode: "75201",
          }),
        })}
      />,
    );

    expect(screen.getByLabelText("Location")).toHaveTextContent("123 Main St, 75201");
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
